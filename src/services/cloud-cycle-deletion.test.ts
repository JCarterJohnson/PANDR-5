import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialData } from '../data/seed';
import { createSession } from '../domain/engine';
import { beginAssessment, recordAssessment } from '../domain/strength';
import { activeCycle, cyclesFor, startCycle } from '../domain/training';
import { createMemoryPersistence } from './memory';
import type { AppData } from '../domain/types';

const fake = vi.hoisted(() => ({ user: '', profiles: new Map<string, any>(), records: new Map<string, any>(), rpcCalls: [] as any[], rpcError: null as any, corrupt: false }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: fake.user } }, error: null }) },
  from: (table: string) => {
    const q: any = { op: 'select', filters: [], payload: undefined, versions: undefined };
    const run = async () => {
      const user = q.filters.find((x: any) => x[0] === 'user_id')?.[1] || q.payload?.user_id;
      if (q.op === 'select') return { data: table === 'pandr_profiles' ? structuredClone(fake.profiles.get(user) || null) : [...fake.records.values()].filter(r => r.user_id === user && (!q.versions || q.versions.includes(r.version))), error: null };
      if (q.op === 'insert') {
        if (table === 'pandr_profiles') fake.profiles.set(user, structuredClone(q.payload));
        else for (const row of q.payload) fake.records.set(row.version, structuredClone(row));
        return { data: null, error: null };
      }
      const remote = fake.profiles.get(user), revision = q.filters.find((x: any) => x[0] === 'revision')?.[1];
      if (remote?.revision !== revision) return { data: [], error: null };
      fake.profiles.set(user, { ...remote, ...structuredClone(q.payload) });
      return { data: [{ revision: q.payload.revision }], error: null };
    };
    const builder: any = { select() { return builder; }, eq(k: string, v: unknown) { q.filters.push([k, v]); return builder; }, in(_k: string, v: string[]) { q.versions = v; return builder; }, maybeSingle: run, insert(v: any) { q.op = 'insert'; q.payload = v; return builder; }, update(v: any) { q.op = 'update'; q.payload = v; return builder; }, then(resolve: any, reject: any) { return run().then(resolve, reject); } };
    return builder;
  },
  rpc: async (name: string, args: any) => {
    fake.rpcCalls.push({ name, args });
    if (fake.rpcError) return { data: null, error: fake.rpcError };
    const head = structuredClone(fake.profiles.get(fake.user));
    if (head.revision !== args.expected_revision) return { data: null, error: { code: '40001', message: 'Account changed' } };
    const first = head.metadata.cycles[0].id, id = args.cycle_id;
    const doomed = [...fake.records.values()].filter(r => r.user_id === fake.user && (r.payload.cycleId ?? first) === id);
    const versions = new Set(doomed.map(r => r.version));
    head.records = head.records.filter((r: any) => !versions.has(r.version));
    for (const r of doomed) fake.records.delete(r.version);
    head.metadata.cycles = head.metadata.cycles.filter((c: any) => c.id !== id);
    head.revision = crypto.randomUUID(); head.metadata.updatedAt = new Date().toISOString();
    if (fake.corrupt) head.metadata.settings.name = 'Unexpected change';
    fake.profiles.set(fake.user, head);
    return { data: head, error: null };
  },
}) }));
import { deleteClosedCycle, readCloudData, syncData } from './cloud';

function fixture(): AppData {
  const now = new Date('2026-09-18T12:00:00Z');
  let d = createInitialData(); d.settings.startDate = '2026-09-01';
  d = beginAssessment(d, d.plan.days[0], now);
  d = recordAssessment(d, 0, { ...d.strength!.active!.items[0], load: 80, reps: 8, setup: 'Keep this assessment', confirmed: true }, now);
  d.sessions = [createSession(d.plan.days[0], d.exercises, d.settings, 1, false)];
  d = startCycle(d, 'Current cycle', '2026-09-18', now);
  const current = createSession(d.plan.days[0], d.exercises, d.settings, 1, false); current.cycleId = activeCycle(d).id; d.sessions.push(current);
  return d;
}
beforeEach(() => {
  fake.user = crypto.randomUUID(); fake.profiles.clear(); fake.records.clear(); fake.rpcCalls = []; fake.rpcError = null; fake.corrupt = false;
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co'); vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test'); vi.stubEnv('VITE_ENABLE_CLOUD_SYNC', 'true');
});

describe('acknowledged account cycle deletion', () => {
  it('deletes only the chosen cycle, preserves assessments and other accounts, and hydrates on a fresh device', async () => {
    const memory = createMemoryPersistence(), saved = (await syncData(fake.user, fixture(), memory)).data;
    const other = crypto.randomUUID(); fake.profiles.set(other, { marker: 'Untouched' });
    const otherVersion = crypto.randomUUID(); fake.records.set(otherVersion, { user_id: other, version: otherVersion, payload: { cycleId: cyclesFor(saved)[0].id } });
    const otherRecords = structuredClone(fake.records.get(otherVersion));
    const next = await deleteClosedCycle(fake.user, saved, cyclesFor(saved)[0].id, memory);
    expect(next.sessions).toEqual([saved.sessions[1]]); expect(next.strength).toEqual(saved.strength);
    expect(next.plan).toEqual(saved.plan); expect(next.activeCycleId).toBe(saved.activeCycleId);
    expect(fake.profiles.get(other)).toEqual({ marker: 'Untouched' }); expect(fake.records.get(otherVersion)).toEqual(otherRecords);
    expect(await readCloudData(fake.user, createMemoryPersistence())).toEqual(next);
    expect((await syncData(fake.user, next, memory)).data.sessions).toEqual(next.sessions);
  });
  it('does not silently resurrect deleted history from a stale device', async () => {
    const memory = createMemoryPersistence(), saved = (await syncData(fake.user, fixture(), memory)).data;
    const stale = createMemoryPersistence(); await readCloudData(fake.user, stale);
    await deleteClosedCycle(fake.user, saved, cyclesFor(saved)[0].id, memory);
    await expect(syncData(fake.user, saved, stale)).rejects.toThrow('missing cloud session');
    expect(fake.profiles.get(fake.user).records).toHaveLength(1);
  });
  it('blocks pending local metadata/history edits and the current cycle before any RPC', async () => {
    const memory = createMemoryPersistence(), saved = (await syncData(fake.user, fixture(), memory)).data, id = cyclesFor(saved)[0].id;
    const edited = structuredClone(saved); edited.settings.name = 'Pending name';
    await expect(deleteClosedCycle(fake.user, edited, id, memory)).rejects.toThrow('pending changes');
    const editedHistory = structuredClone(saved); editedHistory.sessions[0].notes = 'Pending session';
    await expect(deleteClosedCycle(fake.user, editedHistory, id, memory)).rejects.toThrow('pending history');
    await expect(deleteClosedCycle(fake.user, saved, saved.activeCycleId!, memory)).rejects.toThrow('previous, ended');
    expect(fake.rpcCalls).toHaveLength(0);
  });
  it('requires a matching signed-in account and stops revision conflicts before deleting anything', async () => {
    const memory = createMemoryPersistence(), owner = fake.user, saved = (await syncData(owner, fixture(), memory)).data, id = cyclesFor(saved)[0].id;
    fake.user = crypto.randomUUID(); await expect(deleteClosedCycle(owner, saved, id, memory)).rejects.toThrow('signed-in account changed');
    expect(fake.rpcCalls).toHaveLength(0); fake.user = owner;
    fake.profiles.get(owner).revision = crypto.randomUUID(); const before = structuredClone(fake.profiles.get(owner));
    await expect(deleteClosedCycle(owner, saved, id, memory)).rejects.toThrow('Nothing was deleted');
    expect(fake.profiles.get(owner)).toEqual(before); expect(fake.records.size).toBe(2);
  });
  it('keeps the acknowledged snapshot on a network error and rejects unexpected server changes', async () => {
    const memory = createMemoryPersistence(), saved = (await syncData(fake.user, fixture(), memory)).data, id = cyclesFor(saved)[0].id;
    fake.rpcError = { message: 'Network unavailable' }; await expect(deleteClosedCycle(fake.user, saved, id, memory)).rejects.toThrow('Network unavailable');
    expect(await memory.loadData(fake.user)).toEqual(saved);
    fake.rpcError = null; fake.corrupt = true; await expect(deleteClosedCycle(fake.user, saved, id, memory)).rejects.toThrow('unexpected history change');
    expect(await memory.loadData(fake.user)).toEqual(saved);
  });
});
