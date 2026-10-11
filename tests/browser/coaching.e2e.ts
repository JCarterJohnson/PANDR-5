import { test, expect } from '@playwright/test';
import { accountFixture, trainingReadyData } from './account-fixture';
import { readFile } from 'node:fs/promises';

const chin='Close-Grip Chinups (Assisted, BW, or Weighted)';
test('saved bodyweight setup stays intact and progresses, saves modes and exports complete resistance data',async({page})=>{
 const data=trainingReadyData();const observations=structuredClone(data.strength!.assessments);
 const account=await accountFixture(page,data);await page.goto('/');
 await page.getByRole('button',{name:'Your plan',exact:true}).click();
 await page.getByRole('button',{name:chin,exact:true}).click();
 await page.getByText('Equipment options',{exact:true}).click();
 await expect(page.getByText('Using your saved setup. Your previous test is unchanged.',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Set up bodyweight resistance')).toHaveCount(0);
 await expect(page.getByLabel('Bodyweight resistance (kg)',{exact:true})).toHaveCount(0);
 await expect(page.getByLabel(/Supported load/)).toHaveCount(0);
 await page.getByRole('button',{name:'Apply exercise'}).click();await page.getByRole('button',{name:'Save plan',exact:true}).click();
 await expect.poll(()=>account.getHead()?.metadata.plan.days[0].exercises.find((s:any)=>s.bodyweight)?.bodyweight.resistance).toBe(80);
 expect(account.getHead().metadata.strength.assessments).toEqual(observations);
 expect(account.getHead().metadata.plan.days[0].exercises.find((s:any)=>s.bodyweight)?.bodyweight).toEqual({resistance:80,addedLoads:[2.5,5],assistanceLoads:[2,4]});
 await page.reload();await page.getByRole('button',{name:'Start session',exact:true}).click();
 await page.locator('.exercise-picker').getByRole('button',{name:new RegExp('Chinups')}).click();
 const repCount=await page.getByLabel(/Set \d+ reps/).count();
 for(let i=1;i<=repCount;i++){await page.getByLabel(`Set ${i} reps`,{exact:true}).fill('30');await page.getByLabel(`Set ${i} actual RIR`,{exact:true}).selectOption('1');await page.getByRole('button',{name:`Log set ${i}`,exact:true}).click();}
 await expect(page.getByText('Ready to progress',{exact:true})).toBeVisible();await expect(page.getByText(/Use 2.5 kg added load next time/)).toBeVisible();
 await page.screenshot({path:'/tmp/pandr-saved-bodyweight-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Finish session',exact:true}).click();await page.getByRole('button',{name:/Finish with .* unlogged sets/}).click();
 await expect.poll(()=>account.getHead()?.metadata.plan.days[0].exercises.find((s:any)=>s.bodyweight)?.loadMode).toBe('external');
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByLabel('Weight unit').selectOption('lb');await page.getByRole('button',{name:'Save preferences'}).click();
 await expect.poll(()=>account.getHead()?.metadata.plan.days[0].exercises.find((s:any)=>s.bodyweight)?.bodyweight.resistance).toBeCloseTo(176.3698,4);
 const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Download complete backup'}).click();
 const backup=JSON.parse(await readFile((await (await waiting).path())!,'utf8'));
 expect(backup.sessions[0].exercises.find((e:any)=>e.bodyweight)).toMatchObject({unit:'kg',loadMode:'bodyweight',load:0,recommendation:{nextLoadMode:'external',nextLoad:2.5}});
 const converted=backup.plan.days[0].exercises.find((e:any)=>e.bodyweight);
 expect(converted.loadMode).toBe('external');
 // This confirmed bodyweight inventory is converted faithfully, rather than snapped to a default grid.
 expect(converted.load).toBeCloseTo(2.5*2.2046226218,7);
 expect(converted.bodyweight.resistance).toBeCloseTo(80*2.2046226218,7);
});

test('exact equipment lists survive reload and stay usable on a phone',async({page})=>{
 await page.setViewportSize({width:390,height:844});const account=await accountFixture(page);await page.goto('/');
 await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('button',{name:'Your plan',exact:true}).click();
 await page.getByRole('button',{name:'Bench Press',exact:true}).click();
 await page.getByText('Equipment options',{exact:true}).click();
 await page.getByLabel('List available weights').check();
 await page.getByLabel(/^Available weights \(kg\)/).fill('10, 10.25, 12.5');
 await expect(page.getByLabel('Working load',{exact:true})).toBeDisabled();await page.screenshot({path:'/tmp/pandr-equipment-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Apply exercise'}).click();await page.getByRole('button',{name:'Save plan',exact:true}).click();
 await expect.poll(()=>account.getHead()?.metadata.plan.days[0].exercises[0].availableLoads).toEqual([10,10.25,12.5]);
 await page.reload();await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('button',{name:'Your plan',exact:true}).click();await page.getByRole('button',{name:'Bench Press',exact:true}).click();
 await page.getByText('Equipment options',{exact:true}).click();
 await expect(page.getByLabel(/^Available weights \(kg\)/)).toHaveValue('10, 10.25, 12.5');
});

test('repeated recovery trouble changes next week only and keeps the pivot rule',async({page})=>{
 await page.clock.install({time:new Date('2026-09-07T12:00:00')});const account=await accountFixture(page);await page.goto('/');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Check-in weekday').selectOption('0');await page.getByRole('button',{name:'Save preferences'}).click();await expect.poll(()=>account.getHead()?.metadata.settings.startDate).toBe('2026-09-07');await page.getByRole('button',{name:'Train',exact:true}).click();
 for(const day of [13,20]){
  await page.clock.setSystemTime(new Date(`2026-09-${day}T12:00:00`));await page.clock.runFor(1100);
  await page.getByRole('button',{name:'Check in',exact:true}).click();await page.getByLabel('Repeated poor sleep this week compared with your usual sleep').check();await page.getByLabel('Performance has declined across comparable workouts').check();await page.getByRole('button',{name:'Save check-in'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 }
 await expect.poll(()=>account.getHead()?.metadata.plan.recovery?.adjustments[0].effectiveWeek).toBe(3);
 const state=account.getHead().metadata.plan;expect(state.recovery.adjustments[0].reviewedWeek).toBe(2);
 await page.clock.setSystemTime(new Date('2026-09-21T12:00:00'));await page.clock.runFor(1100);
 await expect(page.getByText('Pivot week.',{exact:true})).toBeVisible();await expect(page.getByText(/normal weekly working sets from/)).toBeVisible();
 await page.reload();await expect(page.getByText('Pivot week.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('switch',{name:'Automatic recovery volume',exact:true})).toBeChecked();
 await page.getByRole('switch',{name:'Automatic recovery volume',exact:true}).uncheck();await page.getByRole('button',{name:'Save preferences'}).click();await expect.poll(()=>account.getHead()?.metadata.settings.adaptiveRecovery).toBe(false);
});
