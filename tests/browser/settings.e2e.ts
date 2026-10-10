import { test, expect, type Page } from '@playwright/test';
import { accountFixture, trainingReadyData } from './account-fixture';
import { createInitialData } from '../../src/data/seed';
import { beginAssessment, recordAssessment, pauseAssessment } from '../../src/domain/strength';
import { PUBLIC_CLOUD } from '../../src/data/cloud-config';
import { createSession } from '../../src/domain/engine';

async function navigate(page:Page,name:string){
 await expect(page.locator('.app-shell')).toBeVisible();
 const menu=page.getByRole('button',{name:'Open navigation',exact:true});if(await menu.isVisible()){await menu.click();await expect(page.locator('.sidebar')).toHaveClass(/open/);}
 await page.getByRole('button',{name,exact:true}).click();
}
for(const paused of [false,true])test(`preferences and cycles preserve a ${paused?'paused':'live'} assessment`,async({page})=>{
 await page.clock.install({time:new Date('2026-09-18T12:00:00')});await page.setViewportSize({width:390,height:844});
 let d=createInitialData();d.settings.strict=false;d.settings.startDate='2026-09-14';d.plan.days=[{...d.plan.days[0],exercises:d.plan.days[0].exercises.slice(0,2)}];
 d=beginAssessment(d,d.plan.days[0],new Date('2026-09-18T12:00:00'));d=recordAssessment(d,0,{...d.strength!.active!.items[0],load:80,reps:8,setup:'Completed baseline',confirmed:true});
 Object.assign(d.strength!.active!.items[1],{load:35,reps:7,setup:'Unfinished test station'});if(paused)d=pauseAssessment(d);
 const account=await accountFixture(page,d),strength=structuredClone(d.strength);await page.goto('/');await navigate(page,'Settings');
 await page.getByLabel('Your name').fill('Name during assessment');await expect.poll(()=>account.getHead().metadata.settings.name).toBe('Name during assessment');
 await expect(page.getByLabel('Weight unit')).toBeDisabled();await expect(page.getByRole('button',{name:'Save preferences'})).toBeEnabled();
 await page.getByLabel('Rest timer (seconds)').fill('45');await page.getByRole('button',{name:'Save preferences'}).click();
 await expect.poll(()=>account.getHead().metadata.settings.restSeconds).toBe(45);expect(account.getHead().metadata.strength).toEqual(strength);
 await page.getByRole('button',{name:'End current cycle'}).click();await page.getByRole('button',{name:'End cycle',exact:true}).click();
 await expect.poll(()=>account.getHead().metadata.cycles?.[0]?.endedAt).toBe('2026-09-18');expect(account.getHead().metadata.strength).toEqual(strength);
 await page.getByRole('button',{name:'Start a new cycle'}).click();await page.getByLabel('Cycle name').fill('Return after break');await page.getByLabel('New cycle starts').fill('2026-09-21');await page.getByRole('button',{name:'Start cycle',exact:true}).click();
 await expect.poll(()=>account.getHead().metadata.settings.startDate).toBe('2026-09-21');expect(account.getHead().metadata.strength).toEqual(strength);
 await page.reload();if(paused){await expect(page.getByText('Return after break starts on 2026-09-21.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Resume assessment'}).click();}
 await expect(page.getByLabel('Test load (kg)')).toHaveValue('35');await expect(page.getByLabel('Exact setup')).toHaveValue('Unfinished test station');
 expect(account.getHead().metadata.strength.assessments).toEqual(strength!.assessments);expect(account.getHead().metadata.sessions).toBeUndefined();
});

for(const workout of [false,true])test(`name autosaves without applying unrelated drafts ${workout?'during a workout':'in settings'}`,async({page})=>{
 const d=trainingReadyData();if(workout)d.activeSession=createSession(d.plan.days[0],d.exercises,d.settings,1,false);
 const account=await accountFixture(page,d);await page.goto('/');await navigate(page,'Settings');
 const original=structuredClone(account.getHead().metadata);await page.getByLabel('Rest timer (seconds)').fill('61');await page.getByLabel('Your name').fill('Saved new name');
 await expect.poll(()=>account.getHead().metadata.settings.name).toBe('Saved new name');await expect(page.getByText('Name saved to your account.',{exact:true})).toBeVisible();
 expect(account.getHead().metadata.settings.restSeconds).toBe(original.settings.restSeconds);await expect(page.getByLabel('Rest timer (seconds)')).toHaveValue('61');
 expect(account.getHead().metadata.strength).toEqual(original.strength);expect(account.getHead().metadata.plan).toEqual(original.plan);expect(account.getHead().metadata.activeSession).toEqual(original.activeSession);
 await expect(page.getByText(/Account preferences changed while you were editing/)).toHaveCount(0);
 await page.getByLabel('Your name').fill('Final name before leaving');await navigate(page,'History');await expect(page.getByRole('heading',{name:'Your training, over time',exact:true})).toBeVisible();
 expect(account.getHead().metadata.settings.name).toBe('Final name before leaving');await page.reload();await navigate(page,'Settings');await expect(page.getByLabel('Your name')).toHaveValue('Final name before leaving');
});

test('failed name saves retain the edit and block navigation until retry succeeds',async({page})=>{
 const account=await accountFixture(page,trainingReadyData());await page.goto('/');await navigate(page,'Settings');const name=account.getHead().metadata.settings.name;
 account.setFailure(true);await page.getByLabel('Your name').fill('Retry this name');await expect(page.getByRole('button',{name:'Retry saving name'})).toBeVisible();expect(account.getHead().metadata.settings.name).toBe(name);
 // Hold the navigation-triggered retry until its saving state is rendered. The
 // Settings heading was already visible, so it cannot signal a completed save.
 let releaseNavigationSave!:()=>void;const navigationSaveGate=new Promise<void>(resolve=>{releaseNavigationSave=resolve});
 await page.route(`${PUBLIC_CLOUD.url}/rest/v1/pandr_profiles**`,async route=>{await navigationSaveGate;await route.fallback()});
 const attemptedNavigationSave=page.waitForRequest(request=>request.url().startsWith(`${PUBLIC_CLOUD.url}/rest/v1/pandr_profiles`));
 await navigate(page,'History');await attemptedNavigationSave;await expect(page.getByText('Saving name…',{exact:true})).toBeVisible();releaseNavigationSave();
 await expect(page.getByRole('button',{name:'Retry saving name'})).toBeVisible();await expect(page.locator('main')).toHaveAttribute('aria-busy','false');
 await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();await expect(page.getByLabel('Your name')).toHaveValue('Retry this name');
 account.setFailure(false);await page.getByRole('button',{name:'Retry saving name'}).click();await expect.poll(()=>account.getHead().metadata.settings.name).toBe('Retry this name');
 await navigate(page,'History');await expect(page.getByRole('heading',{name:'Your training, over time',exact:true})).toBeVisible();
});

test('typing during a slow name save keeps the latest input and saves it next',async({page})=>{
 const account=await accountFixture(page,trainingReadyData());await page.route(`${PUBLIC_CLOUD.url}/rest/v1/pandr_profiles**`,async route=>{if(route.request().method()==='PATCH')await new Promise(r=>setTimeout(r,1000));await route.fallback()});
 await page.goto('/');await navigate(page,'Settings');const name=page.getByLabel('Your name');await name.fill('First name');await expect(page.getByText('Saving name…',{exact:true})).toBeVisible();
 await name.fill('Latest name');await expect(name).toBeFocused();await expect.poll(()=>account.getHead().metadata.settings.name).toBe('Latest name');await expect(name).toHaveValue('Latest name');await expect(name).toBeFocused();
 await expect(page.getByText(/Account preferences changed while you were editing/)).toHaveCount(0);await expect(page.locator('.busy-indicator')).toHaveCount(0);
});
test('a sign-in change cancels a pending name edit instead of applying it to the next profile',async({page})=>{
 const account=await accountFixture(page,trainingReadyData());await page.goto('/');await navigate(page,'Settings');const before=JSON.stringify(account.getHead());
 await page.getByLabel('Your name').fill('Belongs to the old account');await account.broadcastAuth('SIGNED_OUT');await expect(page.getByText('Unsaved preview.',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Your name')).toHaveValue('');await page.waitForTimeout(900);expect(JSON.stringify(account.getHead())).toBe(before);await expect(page.getByLabel('Your name')).toHaveValue('');
});
