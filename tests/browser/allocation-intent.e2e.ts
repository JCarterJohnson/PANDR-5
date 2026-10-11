import { test, expect, type Page } from '@playwright/test';
import { createInitialData } from '../../src/data/seed';
import { createSession, makeRir } from '../../src/domain/engine';
import { accountFixture, trainingReadyData } from './account-fixture';
import { materializeCycles } from '../../src/domain/training';

async function goPlan(page:Page,mobile=false) {
  await expect(page.locator('.app-shell')).toBeVisible();
  if(mobile||await page.locator('.app-shell.workout-focus').count())await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  await page.getByRole('button',{name:'Your plan',exact:true}).click();
}

function screenshotPlan() {
  const data=trainingReadyData();data.settings.strict=false;materializeCycles(data);
  const counts=[[2,2,4,4,4,1,3],[3,2,1,3,3,3],undefined,undefined,[4,1,1,5,1,4,4,4]];
  data.plan.days.forEach((day,i)=>day.exercises.forEach((slot,j)=>{
    const count=counts[i]?.[j];if(count!==undefined){slot.sets=count;slot.rir=makeRir(count,slot.rir.at(-1)==='<0')}
  }));
  Object.assign(data.plan.targets,{chest:15,lats:15,biceps:15,triceps:18.5});
  data.cycles!.push({...data.cycles![0]!,id:'older-plan',name:'Earlier plan',startDate:'2026-08-01',endedAt:'2026-09-01',plan:structuredClone(data.plan)});
  return data;
}

for(const mobile of [false,true])test(`set allocation review is transparent and cancellation preserves the ${mobile?'mobile':'desktop'} plan`,async({page})=>{
  await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1000});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  const data=screenshotPlan(),original=structuredClone(data.plan),cycles=structuredClone(data.cycles),strength=structuredClone(data.strength);
  const account=await accountFixture(page,data);await page.goto('/');await goPlan(page,mobile);
  expect(new URL(page.url()).pathname).toBe('/');await expect(page).toHaveTitle(/PANDR/);
  await expect(page.getByRole('heading',{name:'Your plan',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Day 5 Upper',exact:true}).click();
  await expect(page.locator('.plan-row').filter({hasText:'Machine Chest Flyes'})).toContainText('5 sets');
  await expect(page.locator('.plan-row').filter({hasText:'Incline/Elevated Pushups'})).toContainText('1 set ·');
  await page.getByRole('button',{name:'Adjust exercise sets to targets',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Review set allocation',exact:true});await expect(dialog).toBeVisible();
  await expect(dialog.getByText('How this proposal was chosen',{exact:true})).toBeVisible();
  await expect(dialog.getByText(/Total weekly working sets:/)).toBeVisible();
  await expect(dialog.locator('[data-allocation-muscle="chest"]')).toContainText('Direct');
  await expect(dialog.locator('[data-allocation-muscle="chest"]')).toContainText('Supporting');
  await expect(dialog.locator('[data-allocation-slot="slot-34"]')).toContainText('1 →');
  await expect(dialog.locator('[data-allocation-slot="slot-30"]')).toContainText('Horizontal pull');
  expect(account.getHead().metadata.plan).toEqual(original);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await dialog.screenshot({path:mobile?'/tmp/pandr-allocation-mobile.png':'/tmp/pandr-allocation-desktop.png'});
  await dialog.locator('.allocation-day:has([data-allocation-slot="slot-30"])').screenshot({path:mobile?'/tmp/pandr-allocation-mobile-exercises.png':'/tmp/pandr-allocation-desktop-exercises.png'});
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).not.toBeVisible();
  await expect(page.locator('.plan-row').filter({hasText:'Machine Chest Flyes'})).toContainText('5 sets');
  expect(account.getHead().metadata.plan).toEqual(original);
  await page.getByRole('button',{name:'Adjust exercise sets to targets',exact:true}).click();
  await page.getByRole('button',{name:'Apply set allocation',exact:true}).click();
  await expect.poll(()=>account.getHead().metadata.plan.days[4].exercises.filter((slot:any)=>slot.sets===1).length).toBe(0);
  expect(account.getHead().metadata.cycles).toEqual(cycles);expect(account.getHead().metadata.strength).toEqual(strength);expect(account.getHead().records).toEqual([]);
  await page.reload();await goPlan(page,mobile);await page.getByRole('button',{name:'Day 5 Upper',exact:true}).click();
  await expect(page.locator('.plan-row').filter({hasText:'Incline/Elevated Pushups'})).not.toContainText('1 set ·');
  await page.locator('.plan-exercises').screenshot({path:mobile?'/tmp/pandr-allocation-mobile-after.png':'/tmp/pandr-allocation-desktop-after.png'});
  expect(errors).toEqual([]);await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});

test('a saved exercise priority receives a larger relative share and survives reload',async({page})=>{
  const data=createInitialData();data.settings.strict=false;
  data.plan.days=[{...data.plan.days[0]!,exercises:[data.plan.days[0]!.exercises[0]!,data.plan.days[0]!.exercises[2]!]}];
  data.plan.targets={chest:8};const account=await accountFixture(page,data);await page.goto('/');await goPlan(page);
  await page.getByRole('button',{name:'Bench Press',exact:true}).click();
  await page.getByLabel('Automatic set allocation priority',{exact:true}).selectOption('priority');
  await page.getByRole('button',{name:'Apply exercise',exact:true}).click();
  await expect.poll(()=>account.getHead().metadata.plan.days[0].exercises[0].allocationPriority).toBe('priority');
  await expect(page.locator('.plan-row').first()).toContainText('Priority');
  await page.getByRole('button',{name:'Adjust exercise sets to targets',exact:true}).click();
  await expect(page.locator('[data-allocation-slot="slot-5"]')).toContainText('Priority');
  await page.getByRole('button',{name:'Apply set allocation',exact:true}).click();
  await expect.poll(()=>account.getHead().metadata.plan.days[0].exercises[0].sets>account.getHead().metadata.plan.days[0].exercises[1].sets).toBe(true);
  await page.reload();await goPlan(page);await page.getByRole('button',{name:'Bench Press',exact:true}).click();
  await expect(page.getByLabel('Automatic set allocation priority',{exact:true})).toHaveValue('priority');
  await page.getByRole('combobox',{name:'Find an exercise',exact:true}).fill('Incline Dumbbell Press');
  await page.getByRole('option',{name:/^Incline Dumbbell Press ·/}).click();
  await expect(page.getByLabel('Automatic set allocation priority',{exact:true})).toHaveValue('standard');
  await page.getByRole('button',{name:'Apply exercise',exact:true}).click();
  await expect.poll(()=>account.getHead().metadata.plan.days[0].exercises[0].exerciseId).toBe(data.exercises.find(e=>e.name==='Incline Dumbbell Press')!.id);
  expect(account.getHead().metadata.plan.days[0].exercises[0].allocationPriority).toBeUndefined();
});

test('active workouts block redistribution and stale allocation inputs block applying a preview',async({page})=>{
  const data=trainingReadyData();data.settings.strict=false;data.activeSession=createSession(data.plan.days[0]!,data.exercises,data.settings,1,false);
  await accountFixture(page,data);await page.goto('/');await goPlan(page);
  await expect(page.getByRole('button',{name:'Adjust exercise sets to targets',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Train',exact:true}).click();await page.getByRole('button',{name:'Discard session',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Discard this session',exact:true}).click();
  await expect(page.getByRole('button',{name:'Discard session',exact:true})).not.toBeVisible();await goPlan(page);
  await page.getByRole('button',{name:'Adjust exercise sets to targets',exact:true}).click();
  // Simulate an input refresh while the dialog owns focus. A stale proposal must
  // never overwrite the current draft, even if an external update changes it.
  await page.getByLabel('Automatic set limit per exercise',{exact:true}).evaluate(input=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'4');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await expect(page.getByText('The plan or allocation inputs changed while this preview was open. Close it and review a fresh proposal.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Apply set allocation',exact:true})).toBeDisabled();
});
