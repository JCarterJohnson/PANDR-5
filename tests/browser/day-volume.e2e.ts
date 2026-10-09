import { test, expect } from '@playwright/test';
import { accountFixture } from './account-fixture';
import { createInitialData } from '../../src/data/seed';
import { makeRir } from '../../src/domain/engine';

test('scale both leg days on a phone, preview totals without compounding, and save affected targets',async({page})=>{
  const data=createInitialData();data.settings.strict=false;
  const slot=(id:string,exerciseId:string,sets:number)=>({...data.plan.days[2]!.exercises[0]!,id,exerciseId,sets,rir:makeRir(sets)});
  const find=(name:string)=>data.exercises.find(e=>e.name===name)!.id;
  for(const index of [2,5])data.plan.days[index]!.exercises=[slot(`quad-${index}`,find('Leg Extension'),10),slot(`ham-${index}`,find('Lying Hamstring Curls'),10),slot(`delt-${index}`,find('Lateral Raise'),5)];
  data.plan.targets={quads:20,hamstrings:20,'lateral-delts':20,chest:20};
  const account=await accountFixture(page,data);await page.setViewportSize({width:390,height:844});await page.goto('/');
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Your plan',exact:true}).click();
  await page.getByRole('button',{name:'Day 3 Legs',exact:true}).click();await page.getByRole('button',{name:'Scale day volume',exact:true}).click();
  await page.getByRole('button',{name:'Legs + Lower',exact:true}).click();
  await expect(page.getByRole('slider',{name:'Day volume percentage'})).toBeVisible();
  await page.getByLabel('Volume percentage',{exact:true}).fill('50');
  await page.getByLabel('Desired weekly sets for Quads',{exact:true}).fill('12');
  await expect(page.getByRole('slider',{name:'Day volume percentage'})).toHaveValue('60');
  await expect(page.locator('[data-muscle="quads"]')).toContainText('20 → 12');
  await expect(page.locator('[data-muscle="lateral-delts"]')).toContainText('13 → 9');
  expect(account.getHead().metadata.plan.targets.quads).toBe(20);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Apply day volume',exact:true}).click();
  await expect(page.getByLabel('Quads target')).toHaveValue('12');await expect(page.getByLabel('Hamstrings target')).toHaveValue('12');
  await expect(page.locator('.plan-row').filter({hasText:'Leg Extension'})).toContainText('6 sets');
  await page.getByRole('button',{name:'Day 6 Lower',exact:true}).click();await expect(page.locator('.plan-row').filter({hasText:'Leg Extension'})).toContainText('6 sets');
  await page.getByRole('button',{name:'Save plan',exact:true}).click();await expect.poll(()=>account.getHead().metadata.plan.targets.quads).toBe(12);
  await page.reload();await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Your plan',exact:true}).click();await expect(page.getByLabel('Quads target')).toHaveValue('12');
});

test('standard and optional small-plate presets remain selectable without changing progression rates',async({page})=>{
  const account=await accountFixture(page);await page.goto('/');await page.getByRole('button',{name:'Your plan',exact:true}).click();await page.getByRole('button',{name:'Bench Press',exact:true}).click();
  await expect(page.getByLabel('Smallest load increment')).toHaveValue('4.535924');
  await page.getByLabel('Equipment preset').selectOption('barbell-2.5');
  await expect(page.getByLabel('Smallest load increment')).toHaveValue('2.267962');
  await page.getByRole('button',{name:'Apply exercise'}).click();await page.getByRole('button',{name:'Save plan',exact:true}).click();
  await expect.poll(()=>account.getHead()?.metadata.plan.days[0].exercises[0].increment).toBe(2.267962);
  expect(account.getHead().metadata.settings.increasePercent).toBe(2.5);expect(account.getHead().metadata.settings.decreasePercent).toBe(2.5);
  await page.getByRole('button',{name:'Bench Press',exact:true}).click();await page.getByLabel('Equipment preset').selectOption('barbell-standard');
  await expect(page.getByLabel('Smallest load increment')).toHaveValue('4.535924');
});
