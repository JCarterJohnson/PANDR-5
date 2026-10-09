import { test, expect } from '@playwright/test';
import { createInitialData } from '../../src/data/seed';
import { accountFixture } from './account-fixture';
import { readFileSync } from 'node:fs';
const {version}=JSON.parse(readFileSync('package.json','utf8'));

test('plan autosaves preserve the viewport, input focus and the next click on a phone',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  const d=createInitialData();d.settings.strict=false;const account=await accountFixture(page,d);
  await page.goto('/');await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Your plan',exact:true}).click();
  const target=page.getByLabel('Quads target',{exact:true});await target.fill('12');
  const initial=await page.evaluate(()=>scrollY),box=(await target.boundingBox())!;
  await expect.poll(()=>account.getHead().metadata.plan.targets.quads).toBe(12);
  await expect(page.locator('.plan-save-status')).toContainText('All plan changes saved');
  expect(Math.abs(await page.evaluate(()=>scrollY)-initial)).toBeLessThan(2);
  expect(Math.abs((await target.boundingBox())!.y-box.y)).toBeLessThan(2);
  await expect(target).toBeFocused();
  await expect(page.locator('.busy-indicator')).toHaveCount(0);
  // Keep editing at the original screen coordinate after another automatic save.
  await target.fill('11');const second=await page.evaluate(()=>scrollY);
  await expect.poll(()=>account.getHead().metadata.plan.targets.quads).toBe(11);
  await expect(page.locator('.plan-save-status')).toContainText('All plan changes saved');
  expect(Math.abs(await page.evaluate(()=>scrollY)-second)).toBeLessThan(2);
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await expect(target).toBeFocused();await target.fill('10');
  await expect.poll(()=>account.getHead().metadata.plan.targets.quads).toBe(10);
  await expect(page.locator('.plan-save-status')).toContainText('All plan changes saved');
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('quiet-save-header-mobile.png')});
});

for(const mobile of [false,true])test(`a quick ${mobile?'touch':'mouse'} drag does not reorder before a deliberate hold`,async({page})=>{
  if(mobile)await page.setViewportSize({width:390,height:844});
  const d=createInitialData();d.settings.strict=false;d.plan.days[0]!.exercises=d.plan.days[0]!.exercises.slice(0,3);
  await accountFixture(page,d);await page.goto('/');if(mobile)await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Your plan',exact:true}).click();
  const names=d.plan.days[0]!.exercises.map(s=>d.exercises.find(e=>e.id===s.exerciseId)!.name);
  await page.locator('.plan-exercises').scrollIntoViewIfNeeded();
  const handle=page.getByRole('button',{name:`Reorder ${names[0]}`,exact:true});
  const from=(await handle.boundingBox())!,to=(await page.locator('.plan-row').last().boundingBox())!;
  const x=from.x+from.width/2,y=from.y+from.height/2,end=to.y+to.height/2;
  if(mobile){
    const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:end}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect(page.locator('.plan-row .exercise-name')).toHaveText(names);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await expect(handle).toHaveAttribute('aria-pressed','true');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:end}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,end,{steps:3});await page.mouse.up();
    await expect(page.locator('.plan-row .exercise-name')).toHaveText(names);
    await page.mouse.move(x,y);await page.mouse.down();await expect(handle).toHaveAttribute('aria-pressed','true');await page.mouse.move(x,end,{steps:3});await page.mouse.up();
  }
  await expect(page.locator('.plan-row .exercise-name')).toHaveText([names[1]!,names[2]!,names[0]!]);
});

test('Settings shows the installed build version on a phone',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await accountFixture(page);await page.goto('/');
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.getByText(`App version ${version}`,{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('settings-version-mobile.png')});
});

test('typing during a delayed autosave keeps focus and persists the latest edit',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const d=createInitialData();d.settings.strict=false;const account=await accountFixture(page,d);
  await page.goto('/');await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Your plan',exact:true}).click();
  let release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve}),waiting=new Promise<void>(resolve=>{started=resolve});let hold=true;
  await page.route('**/rest/v1/pandr_profiles*',async route=>{if(hold&&route.request().method()==='PATCH'){hold=false;started();await gate}await route.fallback()});
  const target=page.getByLabel('Quads target',{exact:true});await target.fill('12');const y=await page.evaluate(()=>scrollY),box=(await target.boundingBox())!;
  await waiting;
  await expect(page.locator('.plan-save-status')).toContainText('Saving plan changes');
  await expect(page.locator('.busy-indicator')).toHaveCount(0);await expect(target).toBeFocused();
  expect(Math.abs((await target.boundingBox())!.y-box.y)).toBeLessThan(2);
  await target.fill('11');expect(Math.abs(await page.evaluate(()=>scrollY)-y)).toBeLessThan(2);
  release();await expect.poll(()=>account.getHead().metadata.plan.targets.quads).toBe(11);
  await expect(page.locator('.plan-save-status')).toContainText('All plan changes saved');await expect(target).toBeFocused();await expect(target).toHaveValue('11');
  await page.reload();await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Your plan',exact:true}).click();await expect(page.getByLabel('Quads target',{exact:true})).toHaveValue('11');
});
