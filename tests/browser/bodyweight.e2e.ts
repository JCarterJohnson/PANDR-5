import { createHash } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { createInitialData } from '../../src/data/seed';
import { PUBLIC_CLOUD } from '../../src/data/cloud-config';
import { createSession } from '../../src/domain/engine';
import { beginAssessment, curveFor } from '../../src/domain/strength';
import type { AppData, PlanExercise, Session } from '../../src/domain/types';
import { accountFixture } from './account-fixture';

const now = new Date('2026-09-01T19:00:00.000Z');
const poundsPerKg = 2.2046226218;

function smallBodyweightPlan(): AppData {
  const data = createInitialData();
  data.settings = { ...data.settings, strict: false, startDate: '2026-09-01', unit: 'lb' };
  data.plan.days = [{ id: 'bodyweight-day', name: 'Bodyweight practice', kind: 'training', exercises: [{
    id: 'incline-test', exerciseId: 'source-34', sets: 3, repMin: 8, repMax: 12,
    rir: [2, 1, '0-1'], load: 0, increment: 1, loadMode: 'bodyweight',
  }] }];
  data.plan.targets = {};
  return data;
}

function linkedBodyweightPlan(): AppData {
  const data = smallBodyweightPlan();
  data.settings.bodyMass = { kg: 80, recordedAt: '2026-08-31T19:00:00.000Z' };
  const base = data.plan.days[0].exercises[0];
  const full: PlanExercise = { ...base, id: 'chinup-one', exerciseId: 'source-8', bodyweight: { tracking: 'full-body', resistance: 80 * poundsPerKg, bodyMassKg: 80, addedLoads: [2.5, 5], assistanceLoads: [5, 10] } };
  const measured: PlanExercise = { ...base, id: 'incline-one', bodyweight: { tracking: 'measured', resistance: 48 * poundsPerKg, bodyMassKg: 80, fraction: 0.6, addedLoads: [2.5, 5], assistanceLoads: [] } };
  data.plan.days[0].exercises = [full, measured];
  data.plan.days.push({ id: 'repeat-bodyweight-day', name: 'Repeat bodyweight', kind: 'training', exercises: [{ ...structuredClone(full), id: 'chinup-two' }, { ...structuredClone(measured), id: 'incline-two' }] });
  data.strength = {
    onboardingCompletedAt: '2026-08-31T19:00:00.000Z',
    assessments: [full, measured].map(slot => {
      const exercise = data.exercises.find(item => item.id === slot.exerciseId)!;
      return { id: `baseline-${slot.id}`, exerciseId: slot.exerciseId, name: exercise.name, date: '2026-08-31', completedAt: '2026-08-31T19:00:00.000Z', method: 'failure', reps: 8, load: 0, loadMode: 'bodyweight', unit: 'lb', bodyweight: structuredClone(slot.bodyweight), setup: 'Same hand height, grip and full range of motion', curve: curveFor(exercise), version: 1 };
    }),
  };
  return data;
}

// Store an observed workout in the isolated account fixture with the same immutable
// record contract used by cloud.ts. This avoids seeding history into metadata.
function addHistory(account: Awaited<ReturnType<typeof accountFixture>>, session: Session) {
  function canonical(value: unknown): string {
    if (value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
    return JSON.stringify(value);
  }
  const version = crypto.randomUUID();
  const fingerprint = createHash('sha256').update(canonical(session)).digest('hex');
  account.records.set(version, { user_id: account.userId, version, kind: 'session', record_id: session.id, payload: structuredClone(session) });
  account.getHead().records.push({ kind: 'session', id: session.id, version, fingerprint });
}

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name, exact: true }).click();
}

function browserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

test('phone incline push-ups accept 16 reps with a clear reps-only setup and no invented load', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: now });
  const account = await accountFixture(page, smallBodyweightPlan());
  const errors = browserErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Begin initial assessment' }).click();
  await page.getByRole('button', { name: 'Start assessment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Incline/Elevated Pushups', exact: true })).toBeVisible();
  await expect(page.getByLabel('How much of your body moves?')).toHaveValue('reps-only');
  await expect(page.getByLabel('Test load (lb)')).toHaveCount(0);
  await expect(page.getByLabel('Added weight used (lb)')).toHaveCount(0);
  await expect(page.getByText(/Plates under your hands are a platform, neither added weight nor assistance/)).toBeVisible();
  await page.getByLabel(/^Clean repetitions/).fill('16');
  await page.getByRole('textbox', { name: /^Exact setup/ }).fill('Three 5 lb plates used as platforms under each hand; same feet and hand height.');
  await page.getByRole('checkbox', { name: /next clean rep was impossible/ }).check();
  await expect(page.getByRole('button', { name: 'Save test result' })).toBeEnabled();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/pandr-bodyweight-mobile.png', fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Save test result' }).click();
  await expect(page.getByText('Baseline saved', { exact: true })).toBeVisible();
  await expect.poll(() => account.getHead().metadata.strength.assessments[0]?.reps).toBe(16);
  expect(account.getHead().metadata.strength.assessments[0].bodyweight.tracking).toBe('reps-only');
  expect(account.getHead().metadata.strength.assessments[0].load).toBe(0);
  expect(account.records.size).toBe(0);
  await page.getByRole('button', { name: 'Finish assessment', exact: true }).click();
  await page.getByRole('button', { name: 'Start session', exact: true }).click();
  await expect(page.getByText('Bodyweight only · no added load', { exact: true })).toBeVisible();
  await expect(page.getByText('Reps-only tracking for this setup.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Working load', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Set 1 reps', { exact: true })).toBeEnabled();
  await expect.poll(() => account.getHead().metadata.activeSession?.exercises[0]?.bodyweight?.tracking).toBe('reps-only');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('saving scale weight during a new chin-up assessment supplies whole-body resistance', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: now });
  const data = smallBodyweightPlan();
  data.plan.days[0].exercises[0].exerciseId = 'source-8';
  const account = await accountFixture(page, data);
  const errors = browserErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Begin initial assessment' }).click();
  await page.getByRole('button', { name: 'Start assessment', exact: true }).click();
  await page.getByLabel('Current bodyweight (lb)').fill('235');
  await page.getByRole('button', { name: 'Save bodyweight', exact: true }).click();
  await expect.poll(() => account.getHead().metadata.settings.bodyMass?.kg).toBeCloseTo(235 / poundsPerKg, 8);
  await expect(page.getByLabel('How much of your body moves?')).toHaveValue('full-body');
  await expect(page.getByText('Bodyweight used: 235 lb', { exact: true })).toBeVisible();
  await page.getByLabel('How much of your body moves?').selectOption('reps-only');
  await page.getByLabel('How much of your body moves?').selectOption('full-body');
  await expect(page.getByText('Bodyweight used: 235 lb', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Test load (lb)')).toHaveCount(0);
  await page.getByLabel('Clean repetitions', { exact: true }).fill('15');
  await page.getByRole('textbox', { name: /^Exact setup/ }).fill('Chin-up bar; full range of motion; no weight carried or counterweight.');
  await page.getByRole('checkbox', { name: /next clean rep was impossible/ }).check();
  await page.getByRole('button', { name: 'Save test result' }).click();
  await expect(page.getByText('Baseline saved', { exact: true })).toBeVisible();
  await expect.poll(() => account.getHead().metadata.strength.assessments.length).toBe(1);
  const result = account.getHead().metadata.strength.assessments[0];
  expect(result.bodyweight.tracking).toBe('full-body');
  expect(result.bodyweight.resistance).toBeCloseTo(235, 8);
  expect(result.bodyweight.bodyMassKg).toBeCloseTo(235 / poundsPerKg, 8);
  expect(result.bodyweight.fraction).toBeUndefined();
  expect(errors).toEqual([]);
});

test('one settings weight updates every linked future slot while preserving observations and other preference drafts', async ({ page }) => {
  await page.clock.install({ time: now });
  const data = linkedBodyweightPlan();
  const observed = createSession(data.plan.days[0], data.exercises, data.settings, 1, false);
  observed.date = '2026-08-31'; observed.startedAt = '2026-08-31T19:00:00.000Z'; observed.completedAt = '2026-08-31T20:00:00.000Z';
  observed.exercises.forEach(exercise => { exercise.sets[0] = { index: 0, reps: 8, rir: 2, completed: true }; });
  const account = await accountFixture(page, data);
  addHistory(account, observed);
  const baseline = structuredClone(data.strength!.assessments);
  const errors = browserErrors(page);
  await page.goto('/');
  await navigate(page, 'Settings');
  await expect(page.getByLabel('Current bodyweight (lb)')).toHaveValue('176.37');
  await page.getByLabel('Rest timer (seconds)').fill('61');
  await page.getByLabel('Current bodyweight (lb)').fill('235');
  await page.getByRole('button', { name: 'Save bodyweight', exact: true }).click();
  await expect.poll(() => account.getHead().metadata.settings.bodyMass.kg).toBeCloseTo(235 / poundsPerKg, 8);
  const savedMass = structuredClone(account.getHead().metadata.settings.bodyMass);
  expect(Date.parse(savedMass.recordedAt)).toBeGreaterThanOrEqual(now.getTime());
  expect(Date.parse(savedMass.recordedAt)).toBeLessThan(now.getTime() + 60_000);
  for (const slot of account.getHead().metadata.plan.days.flatMap((day: { exercises: PlanExercise[] }) => day.exercises)) {
    expect(slot.bodyweight.bodyMassKg).toBeCloseTo(235 / poundsPerKg, 8);
    expect(slot.bodyweight.resistance).toBeCloseTo(slot.bodyweight.tracking === 'full-body' ? 235 : 141, 8);
  }
  expect(account.getHead().metadata.strength.assessments).toEqual(baseline);
  expect([...account.records.values()][0].payload).toEqual(observed);
  await expect(page.getByLabel('Rest timer (seconds)')).toHaveValue('61');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect.poll(() => account.getHead().metadata.settings.restSeconds).toBe(61);
  expect(account.getHead().metadata.settings.bodyMass).toEqual(savedMass);
  expect(account.getHead().metadata.strength.assessments).toEqual(baseline);
  expect([...account.records.values()][0].payload).toEqual(observed);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/pandr-bodyweight-settings-desktop.png', fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await navigate(page, 'Settings');
  await expect(page.getByLabel('Current bodyweight (lb)')).toHaveValue('235');
  expect(account.getHead().metadata.settings.bodyMass).toEqual(savedMass);
  expect(errors).toEqual([]);
});

test('a Shortcut hash stages a measurement without writes and saves its date only after review', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: now });
  const data = smallBodyweightPlan();
  const account = await accountFixture(page, data);
  const before = structuredClone(account.getHead());
  const writes: string[] = [];
  const errors = browserErrors(page);
  page.on('request', request => {
    if (request.url().startsWith(`${PUBLIC_CLOUD.url}/rest/v1/`) && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method()) && !request.url().includes('/rpc/')) writes.push(request.method());
  });
  const date = '2026-09-01T08:00:00-07:00';
  await page.goto(`/#bodyweight=235&unit=lb&measuredAt=${encodeURIComponent(date)}`);
  await expect(page.getByRole('heading', { name: 'Review imported bodyweight', exact: true })).toBeVisible();
  await expect(page.getByText(/Nothing has been saved yet/)).toBeVisible();
  expect(account.getHead()).toEqual(before);
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => location.hash)).toContain('bodyweight=235');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Use imported bodyweight' }).click();
  await expect(page.getByText('Imported bodyweight saved to your account.', { exact: true })).toBeVisible();
  await expect.poll(() => account.getHead().metadata.settings.bodyMass?.recordedAt).toBe('2026-09-01T15:00:00.000Z');
  expect(account.getHead().metadata.settings.bodyMass.kg).toBeCloseTo(235 / poundsPerKg, 8);
  expect(await page.evaluate(() => location.hash)).toBe('');
  expect(writes).toEqual(['PATCH']);
  expect(errors).toEqual([]);
});

test('a resumed test clears stale reps and confirmation when current bodyweight changes while preserving its setup', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: now });
  let data = smallBodyweightPlan();
  data.settings.unit = 'kg';
  data.settings.bodyMass = { kg: 80, recordedAt: '2026-08-31T19:00:00.000Z' };
  const slot = data.plan.days[0].exercises[0];
  slot.exerciseId = 'source-8';
  slot.bodyweight = { tracking: 'full-body', resistance: 80, bodyMassKg: 80, addedLoads: [], assistanceLoads: [] };
  data = beginAssessment(data, data.plan.days[0], now);
  const draft = data.strength!.active!.items[0];
  const setup = 'Same chin-up bar, close grip, full range; no added weight or counterweight.';
  draft.reps = 8; draft.confirmed = true; draft.setup = setup;
  // The account's current weight/plan are newer than the persisted unfinished test.
  data.settings.bodyMass = { kg: 90, recordedAt: '2026-09-01T18:00:00.000Z' };
  data.plan.days[0].exercises[0].bodyweight = { ...data.plan.days[0].exercises[0].bodyweight!, resistance: 90, bodyMassKg: 90 };
  const account = await accountFixture(page, data);
  const errors = browserErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Strength assessment', exact: true })).toBeVisible();
  await expect(page.getByText('Bodyweight used: 90 kg', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Clean repetitions', { exact: true })).toHaveValue('');
  await expect(page.getByRole('checkbox', { name: /next clean rep was impossible/ })).not.toBeChecked();
  await expect(page.getByRole('textbox', { name: /^Exact setup/ })).toHaveValue(setup);
  await page.getByLabel('Clean repetitions', { exact: true }).fill('8');
  await page.getByRole('checkbox', { name: /next clean rep was impossible/ }).check();
  await page.getByLabel('Current bodyweight (kg)').fill('95');
  await page.getByRole('button', { name: 'Save bodyweight', exact: true }).click();
  await expect.poll(() => account.getHead().metadata.settings.bodyMass.kg).toBe(95);
  await expect(page.getByText('Bodyweight used: 95 kg', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Clean repetitions', { exact: true })).toHaveValue('');
  await expect(page.getByRole('checkbox', { name: /next clean rep was impossible/ })).not.toBeChecked();
  await expect(page.getByRole('textbox', { name: /^Exact setup/ })).toHaveValue(setup);
  await page.getByRole('button', { name: 'Save assessment progress', exact: true }).click();
  await expect.poll(() => account.getHead().metadata.strength.active.items[0].slot.bodyweight.resistance).toBe(95);
  expect(account.getHead().metadata.strength.active.items[0]).toMatchObject({ reps: 0, confirmed: false, setup });
  await page.reload();
  await expect(page.getByText('Bodyweight used: 95 kg', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Clean repetitions', { exact: true })).toHaveValue('');
  await expect(page.getByRole('checkbox', { name: /next clean rep was impossible/ })).not.toBeChecked();
  await expect(page.getByRole('textbox', { name: /^Exact setup/ })).toHaveValue(setup);
  await expect(page.getByRole('button', { name: 'Save test result', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});
