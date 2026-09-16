import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { AppData, CheckIn, Session } from '../domain/types';
import { checkInSchema, exerciseSchema, idSchema, planSchema, sessionSchema, settingsSchema, validateAppData } from '../domain/validation';
import { loadData, loadSyncState, saveSyncedData } from './storage';
import { PUBLIC_CLOUD } from '../data/cloud-config';

let client: SupabaseClient | undefined;
export function getCloudClient(): SupabaseClient | null {
  if (import.meta.env.VITE_ENABLE_CLOUD_SYNC === 'false') return null;
  const overrideUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const overrideKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  const override = Boolean(overrideUrl || overrideKey);
  const url = override ? overrideUrl : PUBLIC_CLOUD.url;
  const key = override ? overrideKey : PUBLIC_CLOUD.publishableKey;
  if (!url && !key) return null;
  if (!url || !key) throw new Error('Account setup needs both the Supabase URL and publishable key.');
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:' && !(parsedUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsedUrl.hostname))) throw new Error('The cloud URL must use HTTPS.');
  let isPublic = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (!isPublic && key.split('.').length === 3) {
    try { isPublic = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; } catch { isPublic = false; }
  }
  if (!isPublic) throw new Error('Use a Supabase publishable key (or legacy anon key). Secret and service-role keys cannot be used in this app.');
  client ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
  return client;
}

const metaSchema = z.strictObject({ schemaVersion: z.literal(1), id: idSchema, updatedAt: z.iso.datetime({ offset: true }), settings: settingsSchema, plan: planSchema, exercises: z.array(exerciseSchema).min(1).max(20_000), activeSession: sessionSchema.optional() });
type Meta = z.infer<typeof metaSchema>;
const recordRefSchema = z.strictObject({ kind: z.enum(['session', 'checkIn']), id: idSchema, version: z.uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) });
type RecordRef = z.infer<typeof recordRefSchema>;
const headSchema = z.object({ user_id: z.uuid(), revision: z.uuid(), metadata: metaSchema, records: z.array(recordRefSchema).max(200_000) }).refine(h => new Set(h.records.map(r => `${r.kind}:${r.id}`)).size === h.records.length, 'Duplicate cloud record IDs');
type Head = z.infer<typeof headSchema>;
const metadataFields = ['settings', 'plan', 'exercises', 'activeSession'] as const;
type Field = typeof metadataFields[number];
const baselineSchema = z.strictObject({ revision: z.uuid(), metadata: z.record(z.string(), z.string()), records: z.array(recordRefSchema).max(200_000) });
type Baseline = z.infer<typeof baselineSchema>;
type Log = Session | CheckIn;
const recordKey = (r: Pick<RecordRef, 'kind' | 'id'>) => `${r.kind}:${r.id}`;

function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
async function fingerprint(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}
function metadata(d: AppData): Meta {
  return metaSchema.parse({ schemaVersion: d.schemaVersion, id: d.id, updatedAt: d.updatedAt, settings: d.settings, plan: d.plan, exercises: d.exercises, ...(d.activeSession ? { activeSession: d.activeSession } : {}) });
}
async function makeBaseline(head: Head): Promise<Baseline> {
  return { revision: head.revision, metadata: Object.fromEntries(await Promise.all(metadataFields.map(async key => [key, await fingerprint(head.metadata[key])]))), records: head.records };
}
export class SyncConflictError extends Error {
  constructor(public readonly conflicts: string[]) { super(`Sync stopped because both devices changed ${conflicts.join(', ')}. Both copies are preserved. Export a backup before resolving the conflict.`); this.name = 'SyncConflictError'; }
}
async function authenticated(userId: string): Promise<SupabaseClient> {
  if (!z.uuid().safeParse(userId).success) throw new Error('Invalid account ID.');
  const api = getCloudClient();
  if (!api) throw new Error('Cloud accounts are not configured. Local logging and backups remain available.');
  const { data, error } = await api.auth.getUser();
  if (error || data.user?.id !== userId) throw new Error('The signed-in account changed. Sign in again before syncing.');
  return api;
}
function cloudError(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}. Local data is preserved.`);
}
async function getHead(api: SupabaseClient, userId: string): Promise<Head | undefined> {
  const { data, error } = await api.from('pandr_profiles').select('user_id,revision,metadata,records').eq('user_id', userId).maybeSingle();
  cloudError(error, 'Could not read cloud profile');
  return data ? headSchema.parse(data) : undefined;
}
function localLogs(data?: AppData) {
  const result = new Map<string, Log>();
  for (const s of data?.sessions ?? []) result.set(`session:${s.id}`, s);
  for (const c of data?.checkIns ?? []) result.set(`checkIn:${c.id}`, c);
  return result;
}
async function hydrate(api: SupabaseClient, head: Head, local?: AppData): Promise<AppData> {
  const available = localLogs(local);
  const logs = new Map<string, Log>();
  const missing: RecordRef[] = [];
  for (const ref of head.records) {
    const existing = available.get(recordKey(ref));
    if (existing && await fingerprint(existing) === ref.fingerprint) logs.set(recordKey(ref), existing);
    else missing.push(ref);
  }
  // Fetch only changed/missing records, in bounded batches below the Data API row cap.
  for (let start = 0; start < missing.length; start += 100) {
    const batch = missing.slice(start, start + 100);
    const { data, error } = await api.from('pandr_records').select('version,kind,record_id,payload').eq('user_id', head.user_id).in('version', batch.map(r => r.version));
    cloudError(error, 'Could not download workout records');
    for (const ref of batch) {
      const row = data?.find(r => r.version === ref.version && r.kind === ref.kind && r.record_id === ref.id);
      if (!row) throw new Error('Cloud history is incomplete. Nothing was replaced locally; retry sync.');
      const parsed = ref.kind === 'session' ? sessionSchema.parse(row.payload) : checkInSchema.parse(row.payload);
      if (parsed.id !== ref.id || await fingerprint(parsed) !== ref.fingerprint) throw new Error('Cloud record failed validation. Local data is preserved.');
      logs.set(recordKey(ref), parsed);
    }
  }
  return validateAppData({ ...head.metadata, sessions: head.records.filter(r => r.kind === 'session').map(r => logs.get(recordKey(r))), checkIns: head.records.filter(r => r.kind === 'checkIn').map(r => logs.get(recordKey(r))) });
}

/** Initial account hydration. Never call for a profile containing unsynced local edits. */
export async function readCloudData(userId: string): Promise<AppData | undefined> {
  const api = await authenticated(userId);
  const head = await getHead(api, userId);
  if (!head) return undefined;
  const existing = await loadData(userId);
  if (existing) throw new Error('This account already has local data. Sync it to preserve pending edits.');
  const data = await hydrate(api, head);
  await saveSyncedData(userId, data, await makeBaseline(head));
  return data;
}

const running = new Set<string>();
export async function syncData(userId: string, input: AppData): Promise<{ data: AppData; status: string }> {
  if (running.has(userId)) throw new Error('This account is already syncing.');
  running.add(userId);
  try {
    const local = validateAppData(input);
    const api = await authenticated(userId);
    const baselineInput = await loadSyncState(userId);
    const baseline = baselineInput === undefined ? undefined : baselineSchema.parse(baselineInput);
    const remote = await getHead(api, userId);
    const mergedMeta = metadata(local);
    const conflicts: string[] = [];
    if (remote) {
      mergedMeta.id = remote.metadata.id;
      for (const key of metadataFields) {
        const localHash = await fingerprint(mergedMeta[key]);
        const remoteHash = await fingerprint(remote.metadata[key]);
        if (localHash === remoteHash) continue;
        const baseHash = baseline?.metadata[key];
        if (baseHash === localHash) Object.assign(mergedMeta, { [key]: remote.metadata[key] });
        else if (baseHash !== remoteHash) conflicts.push(key === 'activeSession' ? 'the current workout' : key);
      }
    } else if (baseline) throw new Error('The cloud profile is missing after a previous sync. Local data is preserved; restore the cloud profile before syncing.');
    const refs = new Map((remote?.records ?? []).map(r => [recordKey(r), r]));
    const baseRefs = new Map((baseline?.records ?? []).map(r => [recordKey(r), r]));
    const uploads: { user_id: string; version: string; kind: RecordRef['kind']; record_id: string; payload: Log }[] = [];
    for (const [key, log] of localLogs(local)) {
      const kind: RecordRef['kind'] = key.startsWith('session:') ? 'session' : 'checkIn';
      const hash = await fingerprint(log);
      const remoteRef = refs.get(key);
      if (remoteRef?.fingerprint === hash) continue;
      const baseRef = baseRefs.get(key);
      if (remoteRef && baseRef?.fingerprint === hash) continue;
      if (remoteRef && baseRef?.fingerprint !== remoteRef.fingerprint) { conflicts.push(`${kind} ${log.id}`); continue; }
      if (!remoteRef && baseRef) { conflicts.push(`missing cloud ${kind} ${log.id}`); continue; }
      const version = crypto.randomUUID();
      refs.set(key, { kind, id: log.id, version, fingerprint: hash });
      uploads.push({ user_id: userId, version, kind, record_id: log.id, payload: log });
    }
    if (conflicts.length) throw new SyncConflictError(conflicts);
    mergedMeta.updatedAt = new Date().toISOString();
    const next: Head = { user_id: userId, revision: crypto.randomUUID(), metadata: mergedMeta, records: [...refs.values()] };
    // Validate the merged view before committing. Newly authored records are supplied locally.
    // Remote records retain immutable versions while a competing device is writing.
    const merged = await hydrate(api, next, local);
    for (let start = 0; start < uploads.length; start += 100) {
      const { error } = await api.from('pandr_records').insert(uploads.slice(start, start + 100));
      cloudError(error, 'Could not upload workout records');
    }
    await authenticated(userId);
    if (remote) {
      const { data, error } = await api.from('pandr_profiles').update({ revision: next.revision, metadata: next.metadata, records: next.records }).eq('user_id', userId).eq('revision', remote.revision).select('revision');
      cloudError(error, 'Could not save cloud profile');
      if (data?.length !== 1) throw new SyncConflictError(['the cloud profile during this sync']);
    } else {
      const { error } = await api.from('pandr_profiles').insert(next);
      if (error?.code === '23505') throw new SyncConflictError(['a newly created cloud profile']);
      cloudError(error, 'Could not create cloud profile');
    }
    await saveSyncedData(userId, merged, await makeBaseline(next), local);
    return { data: merged, status: `Synced ${merged.sessions.length} workouts and ${merged.checkIns.length} recovery check-ins.` };
  } finally { running.delete(userId); }
}
