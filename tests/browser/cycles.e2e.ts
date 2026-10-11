import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createSession } from '../../src/domain/engine';
import { activeCycle, cyclesFor, localDate, startCycle } from '../../src/domain/training';
import { PUBLIC_CLOUD } from '../../src/data/cloud-config';
import { accountFixture, trainingReadyData } from './account-fixture';

function canonical(value: any): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
async function fixture(page: Page) {
  const now = new Date(); let seed = trainingReadyData(); seed.settings.startDate = '2026-09-01';
  const old = createSession(seed.plan.days[0], seed.exercises, seed.settings, 1, false); old.completedAt = old.startedAt; old.dayName = 'Old saved workout';
  seed.sessions = [old];
  seed.checkIns = [{ id: crypto.randomUUID(), date: '2026-09-07', week: 1, poorSleep: true, runDown: false, elevatedHr: false, lingeringSoreness: false, performanceDip: false, jointPain: false, notes: 'Old cycle recovery' }];
  seed = startCycle(seed, 'Current cycle', localDate(now), now);
  const current = createSession(seed.plan.days[0], seed.exercises, seed.settings, 1, false); current.cycleId = activeCycle(seed).id; current.completedAt = current.startedAt; current.dayName = 'Current saved workout'; seed.sessions.push(current);
  const account = await accountFixture(page, seed), head = account.getHead();
  for (const [kind, logs] of [['session', seed.sessions], ['checkIn', seed.checkIns]] as const) for (const log of logs) {
    const version = crypto.randomUUID(), fingerprint = createHash('sha256').update(canonical(log)).digest('hex');
    head.records.push({ kind, id: log.id, version, fingerprint });
    account.records.set(version, { user_id: account.userId, version, kind, record_id: log.id, payload: log });
  }
  let calls = 0, fail = false;
  await page.route(`${PUBLIC_CLOUD.url}/rest/v1/rpc/pandr_delete_closed_cycle`, async route => {
    calls++;
    if (fail) { await route.fulfill({ status: 400, json: { message: 'Test deletion connection unavailable' } }); return; }
    const args = route.request().postDataJSON(), remote = account.getHead();
    if (args.expected_revision !== remote.revision) { await route.fulfill({ status: 409, json: { code: '40001', message: 'Account changed' } }); return; }
    const first = remote.metadata.cycles[0].id, removed = new Set<string>();
    for (const row of account.records.values()) if ((row.payload.cycleId ?? first) === args.cycle_id) removed.add(row.version);
    for (const version of removed) account.records.delete(version);
    remote.records = remote.records.filter((r: any) => !removed.has(r.version));
    remote.metadata.cycles = remote.metadata.cycles.filter((c: any) => c.id !== args.cycle_id);
    remote.metadata.updatedAt = new Date().toISOString(); remote.revision = crypto.randomUUID();
    await route.fulfill({ json: remote });
  });
  return { account, seed, oldId: cyclesFor(seed)[0].id, calls: () => calls, fail: (value: boolean) => { fail = value; } };
}
async function history(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your training, over time' })).toBeVisible();
}

test('previous-cycle deletion requires both confirmations, survives cancel, and preserves strength/current records on reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const f = await fixture(page), strength = structuredClone(f.seed.strength), currentRecord = structuredClone(f.seed.sessions[1]); await history(page);
  await expect(page.getByRole('button', { name: 'Delete Current cycle', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete Cycle 1', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('1 workout and 1 recovery check-in');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); expect(f.calls()).toBe(0);
  await page.getByRole('button', { name: 'Delete Cycle 1', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to final confirmation' }).click();
  await expect(page.getByRole('heading', { name: 'Are you really sure?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); expect(f.calls()).toBe(0);
  await page.getByRole('button', { name: 'Delete Cycle 1', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to final confirmation' }).click(); await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Cycle 1', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Old saved workout/ })).toHaveCount(0);
  expect(f.calls()).toBe(1); expect(f.account.getHead().metadata.strength).toEqual(strength);
  expect([...f.account.records.values()].map(r => r.payload)).toEqual([currentRecord]);
  await page.reload(); await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('button', { name: /Current saved workout/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Old saved workout/ })).toHaveCount(0);
  expect(f.account.getHead().metadata.strength).toEqual(strength); expect(errors).toEqual([]);
});

test('failed deletion keeps the cycle and both history records saved', async ({ page }) => {
  const f = await fixture(page), before = structuredClone(f.account.getHead()); f.fail(true); await history(page);
  await page.getByRole('button', { name: 'Delete Cycle 1', exact: true }).click(); await page.getByRole('button', { name: 'Continue to final confirmation' }).click(); await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Test deletion connection unavailable');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(f.account.getHead()).toEqual(before); await expect(page.getByRole('button', { name: /Old saved workout/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Current saved workout/ })).toBeVisible();
});
