import { test, expect } from '@playwright/test';
import { accountFixture } from './account-fixture';
import { createInitialData } from '../../src/data/seed';
import { readFileSync } from 'node:fs';
import type { Exercise } from '../../src/domain/types';
const BUILTIN_EXERCISES:Exercise[]=JSON.parse(readFileSync(new URL('../../src/data/catalog/master-catalog.json',import.meta.url),'utf8')).exercises;
import { createSession } from '../../src/domain/engine';
import { standardEquipment } from '../../src/domain/equipment';
import { localDate } from '../../src/domain/training';

function oneBench() {
 const data = createInitialData();
 data.settings.strict = false;
 data.settings.unit = 'lb';
 data.plan.days = [{ ...data.plan.days[0]!, exercises: [{ ...data.plan.days[0]!.exercises[0]! }] }];
 const slot = data.plan.days[0]!.exercises[0]!;
 slot.sets = 2; slot.rir = [2, 1];
 return data;
}

test('existing pound plans get practical defaults without resetting assessments; equipment choices stay tucked away', async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 844 });
 const data = oneBench(), slot = data.plan.days[0]!.exercises[0]!;
 slot.load = 202.8232; slot.increment = 1.1023; delete slot.availableLoads; delete slot.equipmentPreset;
 const now = new Date();
 data.strength = { onboardingCompletedAt: now.toISOString(), assessments: [{ id: crypto.randomUUID(), exerciseId: slot.exerciseId, name: 'Bench Press', date: localDate(now), completedAt: now.toISOString(), method: 'failure', reps: 8, load: 10.25, loadMode: 'external', unit: 'lb', setup: 'Old microload observation', curve: 'bench', version: 1 }] };
 const observations = structuredClone(data.strength.assessments);
 const account = await accountFixture(page, data);
 await page.goto('/');
 await expect.poll(() => account.getHead().metadata.plan.days[0].exercises[0].load).toBe(195);
 expect(account.getHead().metadata.strength.assessments).toEqual(observations);
 await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
 await page.getByRole('button', { name: 'Your plan', exact: true }).click();
 await page.getByRole('button', { name: 'Bench Press', exact: true }).click();
 await expect(page.getByLabel('Working load', { exact: true })).toHaveValue('195');
 await expect(page.getByLabel('Working load', { exact: true })).toHaveAttribute('step', '10');
 await expect(page.locator('.equipment-summary')).toHaveText('10 lb weight steps');
 await expect(page.getByLabel('Weight increment (lb)')).toBeHidden();
 await expect(page.getByLabel('Available weights (lb)')).toHaveCount(0);
 await expect(page.getByLabel('Smallest load increment', { exact: true })).toHaveCount(0);
 // The total-load grid starts at the bar, so browser arrow controls must use that origin.
 await page.getByLabel('Working load', { exact: true }).focus();
 await page.keyboard.press('ArrowUp');
 await expect(page.getByLabel('Working load', { exact: true })).toHaveValue('205');
 await page.getByText('Equipment options', { exact: true }).click();
 await expect(page.getByRole('combobox', { name: 'Equipment preset', exact: true })).toHaveValue('auto');
 await expect(page.getByLabel('List available weights', { exact: true })).not.toBeChecked();
 await page.getByLabel('Weight increment (lb)').fill('0');
 await expect(page.getByText('Enter a positive weight increment.', { exact: true })).toBeVisible();
 await page.getByRole('button', { name: 'Apply exercise', exact: true }).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByLabel('Weight increment (lb)').fill('0.25');
 await expect(page.getByRole('combobox', { name: 'Equipment preset', exact: true })).toHaveValue('custom');
 await page.getByLabel('Working load', { exact: true }).fill('10.25');
 await expect(page.getByLabel('Working load', { exact: true })).toHaveValue('10.25');
 await page.getByRole('button', { name: 'Apply exercise', exact: true }).click();
 await expect.poll(() => account.getHead().metadata.plan.days[0].exercises[0]).toMatchObject({ equipmentPreset: 'custom', increment: 0.25, load: 10.25 });
 await page.reload();
 await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
 await page.getByRole('button', { name: 'Your plan', exact: true }).click();
 await page.getByRole('button', { name: 'Bench Press', exact: true }).click();
 await expect(page.getByLabel('Working load', { exact: true })).toHaveValue('10.25');
 await page.getByText('Equipment options', { exact: true }).click();
 await expect(page.getByLabel('Weight increment (lb)')).toHaveValue('0.25');
 await page.getByLabel('List available weights', { exact: true }).check();
 await page.getByLabel('Available weights (lb)').fill('10, 10.25, 12.5');
 await expect(page.getByLabel('Available weights (lb)')).toHaveValue('10, 10.25, 12.5');
 await page.getByRole('button', { name: 'Apply exercise', exact: true }).click();
 await expect.poll(() => account.getHead().metadata.plan.days[0].exercises[0].availableLoads).toEqual([10, 10.25, 12.5]);
 expect(account.getHead().metadata.strength.assessments).toEqual(observations);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('workout weight controls follow the configured bar grid and historical microloads keep their precision', async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 844 });
 const data = oneBench(), slot = data.plan.days[0]!.exercises[0]!, exercise = data.exercises.find(e => e.id === slot.exerciseId)!;
 Object.assign(slot, standardEquipment(exercise, 'lb'), { load: 195 });
 const now = new Date();
 data.strength = { onboardingCompletedAt: now.toISOString(), assessments: [{ id: crypto.randomUUID(), exerciseId: slot.exerciseId, name: exercise.name, date: localDate(now), completedAt: now.toISOString(), method: 'failure', reps: 8, load: 10.25, loadMode: 'external', unit: 'lb', setup: 'Microload original', curve: 'bench', version: 1 }] };
 data.activeSession = createSession(data.plan.days[0]!, data.exercises, data.settings, 1, false);
 const account = await accountFixture(page, data);
 await page.goto('/');
 await expect(page.getByLabel('Working load', { exact: true })).toHaveValue('195');
 await expect(page.getByLabel('Working load', { exact: true })).toHaveAttribute('step', '10');
 await page.getByLabel('Working load', { exact: true }).focus();
 await page.keyboard.press('ArrowUp');
 await expect(page.getByLabel('Working load', { exact: true })).toHaveValue('205');
 await page.getByLabel('Exercise notes', { exact: true }).click();
 await expect.poll(() => account.getHead().metadata.activeSession.exercises[0].load).toBe(205);
 await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
 await page.getByRole('button', { name: 'History', exact: true }).click();
 await expect(page.getByText(/10\.25 lb external × 8 reps/)).toBeVisible();
 expect(account.getHead().metadata.strength.assessments[0].load).toBe(10.25);
});

for (const [name, increment, hint] of [
 ['Converging Chest Press', 5, 'Smallest weight change on one side.'],
 ['Horizontal Lever Leg Press', 10, 'Smallest total weight change. Count plates on both sides.'],
] as const) test(`${name} uses its loading convention for future equipment steps`, async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 844 });
 const data = oneBench(), exercise = BUILTIN_EXERCISES.find(e => e.name === name)!;
 if (!data.exercises.some(saved => saved.id === exercise.id)) data.exercises.push(structuredClone(exercise));
 const slot = data.plan.days[0]!.exercises[0]!;
 Object.assign(slot, { exerciseId: exercise.id, load: 100 }, standardEquipment(exercise, 'lb'));
 const account = await accountFixture(page, data);
 await page.goto('/');
 await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
 await page.getByRole('button', { name: 'Your plan', exact: true }).click();
 await page.getByRole('button', { name, exact: true }).click();
 await expect(page.getByLabel('Working load', { exact: true })).toHaveAttribute('step', String(increment));
 await expect(page.locator('.equipment-summary')).toHaveText(`${increment} lb weight steps`);
 await page.getByText('Equipment options', { exact: true }).click();
 await expect(page.getByText(hint, { exact: true })).toBeVisible();
 await page.getByRole('button', { name: 'Apply exercise', exact: true }).click();
 await expect.poll(() => account.getHead().metadata.plan.days[0].exercises[0].increment).toBe(increment);
});
