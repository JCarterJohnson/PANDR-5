import { test, expect, type Page } from '@playwright/test';
import { createInitialData } from '../../src/data/seed';
import { beginAssessment, recordAssessment } from '../../src/domain/strength';
import { accountFixture } from './account-fixture';

async function goPlan(page:Page,mobile=false){
  if(mobile)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await page.getByRole('button',{name:'Your plan',exact:true}).click();
}

test('add opens a searchable picker and cancel leaves the plan untouched',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  const d=createInitialData();d.settings.strict=false;const account=await accountFixture(page,d);await page.goto('/');await goPlan(page,true);
  const count=d.plan.days[0]!.exercises.length;
  await page.getByRole('button',{name:'Add exercise',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Choose an exercise'})).toBeVisible();
  await expect(page.locator('.plan-row')).toHaveCount(count);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(page.locator('.plan-row')).toHaveCount(count);
  await page.getByRole('button',{name:'Add exercise',exact:true}).click();
  await page.getByRole('combobox',{name:'Find an exercise',exact:true}).fill('lying ham');
  await expect(page.getByRole('listbox',{name:'Matching exercises'})).toBeVisible();
  await page.getByRole('dialog').screenshot({path:info.outputPath('exercise-picker-mobile.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('option',{name:/^Lying Hamstring Curls ·/}).click();
  await expect(page.getByRole('dialog',{name:'Add exercise prescription'})).toBeVisible();
  await expect(page.locator('.plan-row')).toHaveCount(count);
  await page.getByRole('button',{name:'Apply exercise',exact:true}).click();await expect(page.locator('.plan-row')).toHaveCount(count+1);
  await expect(page.locator('.plan-row').last()).toContainText('Lying Hamstring Curls');
  await page.getByRole('button',{name:'Save plan',exact:true}).click();
  await expect.poll(()=>account.getHead()?.metadata.plan.days[0].exercises.at(-1)?.exerciseId).toBe(d.exercises.find(e=>e.name==='Lying Hamstring Curls')!.id);
});

for(const mobile of [false,true])test(`exercise order supports ${mobile?'touch':'mouse'} dragging and the same handle supports keyboard moves`,async({page},info)=>{
  if(mobile)await page.setViewportSize({width:390,height:844});
  const d=createInitialData();d.settings.strict=false;d.plan.days[0]!.exercises=d.plan.days[0]!.exercises.slice(0,3);
  const ids=d.plan.days[0]!.exercises.map(s=>s.id),names=d.plan.days[0]!.exercises.map(s=>d.exercises.find(e=>e.id===s.exerciseId)!.name);
  const account=await accountFixture(page,d);await page.goto('/');await goPlan(page,mobile);
  await expect(page.getByRole('button',{name:/Move exercise \d+ (up|down)/})).toHaveCount(0);
  const handle=page.getByRole('button',{name:`Reorder ${names[0]}`,exact:true});
  await page.locator('.plan-exercises').scrollIntoViewIfNeeded();
  const from=(await handle.boundingBox())!,to=(await page.locator('.plan-row').last().boundingBox())!;
  if(mobile){
    const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x+from.width/2,y:from.y+from.height/2}]});
    for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+from.width/2,y:from.y+from.height/2+(to.y+to.height/2-from.y-from.height/2)*step/8}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(from.x+from.width/2,to.y+to.height/2,{steps:8});await page.mouse.up();
  }
  await expect(page.locator('.plan-row .exercise-name')).toHaveText([names[1]!,names[2]!,names[0]!]);
  await handle.focus();await handle.press('ArrowUp');await expect(page.locator('.plan-row .exercise-name')).toHaveText([names[1]!,names[0]!,names[2]!]);
  if(mobile)await page.locator('.plan-exercises').screenshot({path:info.outputPath('exercise-order-mobile.png')});
  await page.getByRole('button',{name:'Save plan',exact:true}).click();
  await expect.poll(()=>account.getHead()?.metadata.plan.days[0].exercises.map((s:any)=>s.id)).toEqual([ids[1],ids[0],ids[2]]);
  await page.reload();await goPlan(page,mobile);await expect(page.locator('.plan-row .exercise-name')).toHaveText([names[1]!,names[0]!,names[2]!]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

function partial(){
  let d=createInitialData();d.settings.strict=false;d.settings.startDate='2026-10-08';
  d.plan.days=[{...d.plan.days[0]!,exercises:[d.plan.days[0]!.exercises[0]!]},{...d.plan.days[2]!,exercises:[d.plan.days[2]!.exercises.find(s=>d.exercises.find(e=>e.id===s.exerciseId)?.name==='Leg Press')!]}];
  const now=new Date('2026-10-08T12:00:00');d=beginAssessment(d,d.plan.days[0]!,now);d=beginAssessment(d,d.plan.days[1]!,now);
  const index=d.strength!.active!.items.findIndex(i=>i.exerciseId===d.plan.days[0]!.exercises[0]!.exerciseId);
  d=recordAssessment(d,index,{...d.strength!.active!.items[index]!,load:80,reps:8,setup:'Saved bench baseline',confirmed:true},now);
  d.strength!.active!.paused=true;return d;
}

test('changing exercises mid-assessment updates the saved queue and keeps completed baselines',async({page})=>{
  await page.clock.install({time:new Date('2026-10-08T12:00:00')});const d=partial(),history=structuredClone(d.strength!.assessments);
  const account=await accountFixture(page,d);await page.goto('/');await goPlan(page);await page.getByRole('button',{name:'Day 2 Legs',exact:true}).click();
  await page.getByRole('button',{name:'Leg Press',exact:true}).click();await page.getByRole('combobox',{name:'Find an exercise',exact:true}).fill('leg ext');
  await page.getByRole('option',{name:/^Leg Extension ·/}).click();await page.getByRole('button',{name:'Apply exercise',exact:true}).click();
  await page.getByRole('button',{name:'Save plan',exact:true}).click();
  const extension=d.exercises.find(e=>e.name==='Leg Extension')!.id;
  await expect.poll(()=>account.getHead()?.metadata.strength.active.items.some((i:any)=>i.exerciseId===extension)).toBe(true);
  expect(account.getHead().metadata.strength.assessments).toEqual(history);
  await page.reload();await page.getByRole('button',{name:'Day 2 Legs',exact:true}).click();await page.getByRole('button',{name:'Resume assessment',exact:true}).click();
  await expect(page.locator('.exercise-picker')).toContainText('Leg Extension');await expect(page.locator('.exercise-picker')).not.toContainText('Leg Press');
  await expect(page.getByRole('heading',{name:'Leg Extension',exact:true})).toBeVisible();
  await page.getByLabel('Test load (kg)').fill('25');await page.getByLabel('Clean repetitions',{exact:true}).fill('8');await page.getByLabel('Exact setup').fill('New leg extension station');
  await page.getByRole('checkbox',{name:/next clean rep was impossible/}).check();await page.getByRole('button',{name:'Save test result',exact:true}).click();
  await expect.poll(()=>account.getHead()?.metadata.strength.assessments.length).toBe(2);
  expect(account.getHead().metadata.strength.assessments[0]).toEqual(history[0]);
});

test('an existing stale assessment reflects a replacement as soon as the account opens',async({page})=>{
  await page.clock.install({time:new Date('2026-10-08T12:00:00')});const d=partial();
  d.plan.days[1]!.exercises[0]!.exerciseId=d.exercises.find(e=>e.name==='Leg Extension')!.id;d.strength!.active!.paused=false;
  await accountFixture(page,d);await page.goto('/');await expect(page.locator('.exercise-picker')).toContainText('Leg Extension');
  await expect(page.locator('.exercise-picker')).not.toContainText('Leg Press');await expect(page.getByRole('heading',{name:'Leg Extension',exact:true})).toBeVisible();
});

test('applying a replacement during an open assessment saves before navigating away without Save plan',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  const d=partial();d.strength!.active!.paused=false;
  const history=structuredClone(d.strength!.assessments),account=await accountFixture(page,d);
  await page.goto('/');await expect(page.getByRole('heading',{name:'Strength assessment',exact:true})).toBeVisible();
  await goPlan(page,true);await page.getByRole('button',{name:'Day 2 Legs',exact:true}).click();
  await page.getByRole('button',{name:'Leg Press',exact:true}).click();
  await page.getByRole('combobox',{name:'Find an exercise',exact:true}).fill('leg ext');
  await page.getByRole('option',{name:/^Leg Extension ·/}).click();await page.getByRole('button',{name:'Apply exercise',exact:true}).click();
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Train',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Leg Extension',exact:true})).toBeVisible();
  expect(account.getHead().metadata.plan.days[1].exercises[0].exerciseId).toBe(d.exercises.find(e=>e.name==='Leg Extension')!.id);
  expect(account.getHead().metadata.strength.assessments).toEqual(history);
  await page.reload();await expect(page.locator('.exercise-picker')).not.toContainText('Leg Press');
  await expect(page.getByRole('heading',{name:'Leg Extension',exact:true})).toBeVisible();
  await page.locator('.exercise-picker').screenshot({path:info.outputPath('grouped-assessment-mobile.png')});
});

test('automatic plan saves report failures and retain edits until retry succeeds',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  const d=createInitialData();d.settings.strict=false;
  const account=await accountFixture(page,d);await page.goto('/');await goPlan(page,true);
  account.setFailure(true);await page.getByLabel('Day name',{exact:true}).fill('My push day');
  await expect(page.locator('.plan-save-status')).toContainText('Plan changes not saved');
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'History',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your plan',exact:true})).toBeVisible();
  await expect(page.getByLabel('Day name',{exact:true})).toHaveValue('My push day');
  expect(account.getHead().metadata.plan.days[0].name).toBe(d.plan.days[0]!.name);
  await page.locator('.plan-save-status').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('plan-save-status-mobile.png')});
  account.setFailure(false);await page.getByRole('button',{name:'Retry plan save',exact:true}).click();
  await expect(page.locator('.plan-save-status')).toContainText('All plan changes saved');
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'History',exact:true}).click();await expect(page.getByRole('heading',{name:'Your training, over time',exact:true})).toBeVisible();
  await page.reload();await goPlan(page,true);await expect(page.getByLabel('Day name',{exact:true})).toHaveValue('My push day');
});

test('invalid edits stay in the editor with a visible explanation instead of disappearing on navigation',async({page})=>{
  const d=createInitialData();d.settings.strict=false;
  const account=await accountFixture(page,d);await page.goto('/');await goPlan(page);
  await page.getByLabel('Quads target',{exact:true}).fill('-1');
  await page.getByRole('button',{name:'Train',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your plan',exact:true})).toBeVisible();
  await expect(page.getByText('Your changes are still here. Fix the plan checks below before they can be saved or you leave this page.')).toBeVisible();
  await expect(page.getByLabel('Quads target',{exact:true})).toHaveValue('-1');
  expect(account.getHead().metadata.plan.targets.quads).toBe(d.plan.targets.quads);
  await page.getByLabel('Quads target',{exact:true}).fill('12');await page.getByRole('button',{name:'Train',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your plan',exact:true})).toHaveCount(0);
  expect(account.getHead().metadata.plan.targets.quads).toBe(12);
});

test('assessment groups follow first program appearances and keep later upper body work before legs',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  let d=createInitialData();d.settings.strict=false;
  const names=['Bench Press','Incline Curls','Wide-Grip Seated Cable Rows','Seated Hamstring Curls','Incline Dumbbell Press','Lying Hamstring Curls','Leg Extension','Standing Calf Raise (Machine)'];
  const slots=names.map((name,i)=>({...d.plan.days[0]!.exercises[0]!,id:`group-${i}`,exerciseId:d.exercises.find(e=>e.name===name)!.id}));
  d.plan.days=[{...d.plan.days[0]!,exercises:slots.slice(0,4)},{...d.plan.days[2]!,exercises:slots.slice(4)}];
  d=beginAssessment(d,d.plan.days[0]!);d=beginAssessment(d,d.plan.days[1]!);
  const curl=d.strength!.active!.items.find(i=>i.exerciseId===slots[5]!.exerciseId)!;Object.assign(curl,{load:22,reps:5,setup:'Saved curl station'});
  const account=await accountFixture(page,d);await page.goto('/');
  await expect(page.locator('.assessment-group')).toHaveText(['Chest','Chest','Biceps','Back','Legs','Legs','Legs','Legs']);
  const ordered=[0,4,1,2,3,5,6,7];
  for(const [i,n] of ordered.entries())await expect(page.locator('.exercise-picker button').nth(i)).toContainText(names[n]!);
  await page.locator('.exercise-picker').screenshot({path:info.outputPath('assessment-muscle-groups-mobile.png')});
  await page.locator('.exercise-picker button').filter({hasText:'Lying Hamstring Curls'}).click();
  await expect(page.getByLabel('Test load (kg)')).toHaveValue('22');await expect(page.getByLabel('Exact setup')).toHaveValue('Saved curl station');
  await page.getByRole('button',{name:'Save and exit',exact:true}).click();await expect.poll(()=>account.getHead().metadata.strength.active.paused).toBe(true);await page.reload();
  await page.getByRole('button',{name:'Resume assessment',exact:true}).click();
  await expect(page.locator('.assessment-group')).toHaveText(['Chest','Chest','Biceps','Back','Legs','Legs','Legs','Legs']);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('a strict-mode target outside the framework can switch to custom mode without losing the edit',async({page})=>{
  const account=await accountFixture(page);await page.goto('/');await goPlan(page);
  await page.getByLabel('Quads target',{exact:true}).fill('8');
  await expect(page.getByRole('button',{name:'Save plan',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Use custom mode and save',exact:true}).click();
  await expect.poll(()=>account.getHead()?.metadata.settings.strict).toBe(false);
  expect(account.getHead().metadata.plan.targets.quads).toBe(8);
  await page.reload();await goPlan(page);await expect(page.getByLabel('Quads target',{exact:true})).toHaveValue('8');
});
