import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData } from './domain/types';
import { validateAppData } from './domain/validation';
import { createInitialData } from './data/seed';
import { allocateSets } from './domain/engine';
import { getCloudClient, readCloudData, syncData } from './services/cloud';
import { createMemoryPersistence } from './services/memory';

export function useStore() {
 const [data, setData] = useState<AppData>();
 const [profile, setProfile] = useState('local');
 const [email, setEmail] = useState('');
 const [error, setError] = useState('');
 const [status, setStatus] = useState('Opening your training log…');
 const [ready, setReady] = useState(false);
 const [busy, setBusy] = useState(false);
 const [pending, setPending] = useState(false);
 const [interrupted, setInterrupted] = useState(false);
 const suspended = useRef(new Map<string, {data:AppData;persistence:ReturnType<typeof createMemoryPersistence>}>());
 const current = useRef<AppData | undefined>(undefined);
 const profileRef = useRef('local');
 const generation = useRef(0);
 const queue = useRef(Promise.resolve());
 const dirty = useRef(false);
 const client = useRef(getCloudClient()).current;
 const persistence = useRef(createMemoryPersistence());

 const openProfile = useCallback(async (id: string, address = '') => {
  const gen = ++generation.current;
  setReady(false); setBusy(true);
  await queue.current;
  if (gen !== generation.current) return;
  if (dirty.current && current.current && profileRef.current !== 'local') suspended.current.set(profileRef.current, {data:structuredClone(current.current),persistence:persistence.current});
  const resume = suspended.current.get(id);
  suspended.current.delete(id);
  setInterrupted(suspended.current.size > 0);
  profileRef.current = id; setProfile(id); setEmail(address);
  // No training snapshot or merge baseline is written to browser storage.
  persistence.current = resume?.persistence ?? createMemoryPersistence();
  current.current = undefined;
  dirty.current = false; setPending(false);
  try {
   let loaded = resume?.data ?? (id === 'local' ? undefined : await readCloudData(id, persistence.current));
   if (!loaded) { loaded = createInitialData(); loaded.plan = allocateSets(loaded.plan, loaded.exercises).plan; }
   if (gen !== generation.current) return;
   current.current = loaded; setData(loaded); setReady(true); setError('');
   dirty.current = !!resume; setPending(!!resume);
   setStatus(resume ? 'Not saved · keep this tab open' : id === 'local' ? 'Preview · not saved' : 'Saved to your account');
  } catch (e) { if (gen === generation.current) setError((e as Error).message); }
  finally { if (gen === generation.current) setBusy(false); }
 }, []);

 useEffect(() => {
  let alive = true;
  if (!client) { void openProfile('local'); return; }
  const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
   if (!alive || (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT')) return;
   const id = session?.user.id ?? 'local';
   // Leave the synchronous auth callback before making authenticated requests.
   if (id !== profileRef.current) setTimeout(() => { if (alive) void openProfile(id, session?.user.email); }, 0);
  });
  void (async () => {
   const initialized = await client.auth.initialize();
   if (initialized.error) throw initialized.error;
   const { data: auth, error: sessionError } = await client.auth.getSession();
   if (sessionError) throw sessionError;
   if (alive && generation.current === 0) await openProfile(auth.session?.user.id ?? 'local', auth.session?.user.email);
  })().catch(e => { if (alive) { setError(e.message); setBusy(false); } });
  return () => { alive = false; subscription.subscription.unsubscribe(); };
 }, [client, openProfile]);

 const publish = useCallback(async (id: string, next: AppData, gen: number) => {
  if (id === 'local') { setStatus('Preview · not saved'); return; }
  dirty.current = true; setPending(true); setStatus('Saving to your account…');
  try {
   const result = await syncData(id, next, persistence.current);
   if (gen !== generation.current) return;
   current.current = result.data; setData(result.data);
   dirty.current = false; setPending(false); setStatus('Saved to your account'); setError('');
  } catch (e) {
   if (gen === generation.current) { setStatus('Not saved · keep this tab open'); setError(`${(e as Error).message} Retry saving or download a backup before closing.`); }
   throw e;
  }
 }, []);
 const update = useCallback((change: (data: AppData) => AppData): Promise<void> => {
  const gen = generation.current, id = profileRef.current;
  const work = async () => {
   if (!current.current || gen !== generation.current) throw new Error('Your account changed. Reopen the page before saving.');
   const next = change(structuredClone(current.current)); next.updatedAt = new Date().toISOString();
   validateAppData(next); current.current = next; setData(next);
   await publish(id, next, gen);
  };
  const task = queue.current.then(work); queue.current = task.catch(() => {}); return task;
 }, [publish]);
 const sync = useCallback(async () => {
  const gen = generation.current, id = profileRef.current;
  if (id === 'local') return;
  const task = queue.current.then(async () => { if (current.current && gen === generation.current) await publish(id, current.current, gen); });
  queue.current = task.catch(() => {}); await task;
 }, [publish]);
 const signOut = useCallback(async () => {
  await queue.current;
  if (dirty.current) throw new Error('Save your pending changes before signing out.');
  const result = await client?.auth.signOut({ scope: 'local' });
  if (result?.error) throw result.error;
 }, [client]);
 useEffect(() => {
  const online = () => { if (dirty.current) void sync().catch(() => {}); };
  const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current || suspended.current.size > 0) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('online', online); window.addEventListener('beforeunload', beforeUnload);
  return () => { window.removeEventListener('online', online); window.removeEventListener('beforeunload', beforeUnload); };
 }, [sync]);
 return { data, update, error, setError, status, busy, ready, pending, interrupted, profile, email, client, sync, openProfile, signOut };
}
