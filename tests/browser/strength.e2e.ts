import { test, expect } from '@playwright/test';
import { accountFixture, trainingReadyData } from './account-fixture';
import { createInitialData } from '../../src/data/seed';
import { beginAssessment, recordAssessment, finishAssessment } from '../../src/domain/strength';
import { allocateSets, createSession } from '../../src/domain/engine';
function smallPlan(){const d=createInitialData();d.settings.strict=false;d.settings.startDate='2026-09-01';d.plan.days=[{...d.plan.days[0],exercises:[{...d.plan.days[0].exercises[0],sets:3,rir:[2,1,'0-1'],repMin:8,repMax:12}]}];return d;}
test('mandatory onboarding, persisted draft, test result, same-day training and custom override',async({page})=>{
 await page.clock.install({time:new Date('2026-09-01T12:00:00')});const account=await accountFixture(page,smallPlan());const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await expect(page).toHaveTitle(/PANDR/);await expect(page.getByRole('heading',{name:'Your next session'})).toBeVisible();
 await page.getByRole('button',{name:'Begin initial assessment'}).click();await expect(page.getByRole('button',{name:/Bypass assessment/})).toHaveCount(0);await page.getByRole('button',{name:'Start assessment',exact:true}).click();
 await page.getByLabel('Test load (kg)').fill('80');await page.getByLabel('Clean repetitions',{exact:true}).fill('8');await page.getByLabel('Exact setup').fill('Rack 1, full ROM, total barbell load');await page.getByRole('button',{name:'Save assessment progress'}).click();
 await expect.poll(()=>account.getHead().metadata.strength.active.items[0].load).toBe(80);await page.reload();await expect(page.getByLabel('Test load (kg)')).toHaveValue('80');
 await page.getByRole('checkbox',{name:/next clean rep was impossible/}).check();await page.getByRole('button',{name:'Save test result'}).click();await expect(page.getByText('Baseline saved',{exact:true})).toBeVisible();
 await page.screenshot({path:'/tmp/pandr-strength-desktop.png',fullPage:true,animations:'disabled'});await page.getByRole('button',{name:'Finish assessment',exact:true}).click();
 await expect.poll(()=>account.getHead().metadata.strength.onboardingCompletedAt).toBeTruthy();await expect(page.getByRole('button',{name:'Start session',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Start session',exact:true}).click();await expect(page.getByLabel('Working load',{exact:true})).toBeEnabled();
 await page.getByLabel('Working load',{exact:true}).fill('50');await page.getByLabel('Set 3 reps',{exact:true}).fill('12');await page.getByRole('button',{name:'Log set 3',exact:true}).click();await page.getByRole('button',{name:'Finish session',exact:true}).click();await page.getByRole('button',{name:'Finish with 2 unlogged sets'}).click();
 await expect.poll(()=>account.records.size).toBe(1);expect([...account.records.values()][0].payload.exercises[0].load).toBe(50);expect(errors).toEqual([]);
});
test('phone assessment and 14-day custom bypass stay usable after reload',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.clock.install({time:new Date('2026-09-01T12:00:00')});const account=await accountFixture(page,smallPlan());await page.goto('/');await page.getByRole('button',{name:'Begin initial assessment'}).click();await page.getByRole('button',{name:'Start assessment',exact:true}).click();
 await page.screenshot({path:'/tmp/pandr-strength-mobile.png',fullPage:true,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByLabel('Test load (kg)').fill('70');await page.getByLabel('Test method').selectOption('1rm');await page.getByLabel('Exact setup').fill('Flat bench, safeties, full ROM');await page.getByRole('checkbox',{name:/one clean maximum rep/}).check();await page.getByRole('button',{name:'Save test result'}).click();await page.getByRole('button',{name:'Finish assessment',exact:true}).click();
 await expect.poll(()=>account.getHead().metadata.strength.onboardingCompletedAt).toBeTruthy();await expect(page.getByRole('heading',{name:'Your next session'})).toBeVisible();
 await page.clock.setSystemTime(new Date('2026-09-15T12:00:00'));await page.clock.runFor(1100);await page.reload();await page.getByRole('button',{name:'Start session',exact:true}).click();await expect(page.getByText(/14\+ days without training/)).toBeVisible();await page.getByRole('button',{name:'Bypass assessment for this workout'}).click();await expect(page.getByLabel('Working load',{exact:true})).toBeVisible();
});
test('constrained prescribed loads are locked and can be unlocked explicitly mid-workout',async({page})=>{
 const now=new Date('2026-09-01T12:00:00');let d=createInitialData();d.settings.startDate='2026-09-01';d.plan=allocateSets(d.plan,d.exercises).plan;
 d=beginAssessment(d,d.plan.days[0],now);
 for(let i=0;i<d.strength!.active!.items.length;i++){
  const item=d.strength!.active!.items[i];
  // This fixture uses measured external loads for each exercise to isolate UI gating.
  item.slot.loadMode='external';item.slot.bodyweight=undefined;
  d=recordAssessment(d,i,{...item,loadMode:'external',load:80,reps:8,setup:'Same station and full range',confirmed:true},now);
 }
 d=finishAssessment(d,now);await page.clock.install({time:new Date('2026-09-01T12:00:00')});await accountFixture(page,d);await page.goto('/');await page.getByRole('button',{name:'Start session',exact:true}).click();await expect(page.getByLabel('Working load',{exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('switch',{name:/constrained/i}).uncheck();await page.getByRole('button',{name:'Save preferences'}).click();await page.getByRole('button',{name:'Train',exact:true}).click();await expect(page.getByLabel('Working load',{exact:true})).toBeEnabled();
});

test('an abandoned workout cannot bypass reassessment by resuming stale loads',async({page})=>{
 const d=trainingReadyData();const session=createSession(d.plan.days[0],d.exercises,d.settings,1,false);
 session.date='2026-09-01';session.startedAt='2026-09-01T12:00:00Z';session.exercises[0].sets[0]={index:0,reps:8,rir:2,completed:true};d.activeSession=session;
 await page.clock.install({time:new Date('2026-09-15T12:00:00')});await accountFixture(page,d);await page.goto('/');
 await expect(page.getByText(/This unfinished workout is at least 14 days old/)).toBeVisible();await expect(page.getByLabel('Set 2 reps',{exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Finish session',exact:true})).toBeEnabled();
});

test('save and exit preserves drafts, unlocks one day, and keeps the next day mandatory',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.clock.install({time:new Date('2026-09-01T12:00:00')});
 const d=smallPlan();const other=createInitialData().plan.days[1];d.plan.days.push({...other,exercises:[other.exercises[0]]});
 const account=await accountFixture(page,d);await page.goto('/');
 await page.getByRole('button',{name:'Begin initial assessment'}).click();await page.getByRole('button',{name:'Start assessment',exact:true}).click();
 await page.getByLabel('Test load (kg)').fill('80');await page.getByLabel('Clean repetitions',{exact:true}).fill('8');await page.getByLabel('Exact setup').fill('Rack A');
 await page.getByRole('button',{name:'Save and exit'}).click();
 await expect(page.getByRole('heading',{name:'Your next session'})).toBeVisible();
 await expect.poll(()=>account.getHead().metadata.strength.active.paused).toBe(true);
 await page.reload();await expect(page.getByRole('heading',{name:'Your next session'})).toBeVisible();
 await page.getByRole('button',{name:'Resume assessment'}).click();await expect(page.getByLabel('Test load (kg)')).toHaveValue('80');await expect(page.getByLabel('Exact setup')).toHaveValue('Rack A');
 await page.getByRole('checkbox',{name:/next clean rep was impossible/}).check();await page.getByRole('button',{name:'Save test result'}).click();
 await page.getByRole('button',{name:'Save and exit'}).click();
 await page.getByRole('button',{name:new RegExp('Day 2')}).click();await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.getByRole('button',{name:/Bypass assessment/})).toHaveCount(0);
 await page.getByRole('button',{name:'Close dialog'}).click();
 await page.getByRole('button',{name:new RegExp('Day 1')}).click();await page.getByRole('button',{name:'Start session',exact:true}).click();
 await expect(page.getByLabel('Working load',{exact:true})).toBeVisible();
 expect(account.getHead().metadata.strength.active.paused).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
