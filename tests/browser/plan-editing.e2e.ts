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
  expect(account.getHead().metadata.plan.days[0].exercises.map((s:any)=>s.id)).toEqual(ids);
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
