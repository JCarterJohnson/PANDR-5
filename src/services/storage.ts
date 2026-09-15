import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AppData } from '../domain/types';
import { validateAppData } from '../domain/validation';

interface LocalDatabase extends DBSchema {
  profiles: { key: string; value: AppData };
  sync: { key: string; value: unknown };
}
let database: Promise<IDBPDatabase<LocalDatabase>> | undefined;
const DB_NAME = 'pandr5';
function profileKey(profileId: string): string {
  if (!profileId || profileId.length > 200 || /[\x00-\x1f]/.test(profileId)) throw new Error('Invalid local profile.');
  return `profile:${profileId}`;
}
function db() {
  if (!globalThis.indexedDB) throw new Error('Local storage is unavailable. Enable browser storage before logging a workout.');
  if (!database) database = openDB<LocalDatabase>(DB_NAME, 1, {
    upgrade(d) { d.createObjectStore('profiles'); d.createObjectStore('sync'); },
    blocking() { database?.then(d => d.close()); database = undefined; },
    terminated() { database = undefined; },
  }).catch(error => { database = undefined; throw error; });
  return database;
}
export async function loadData(profileId: string): Promise<AppData | undefined> {
  const key = profileKey(profileId);
  const data = await (await db()).get('profiles', key);
  return data === undefined ? undefined : validateAppData(data);
}
export async function saveData(profileId: string, data: AppData): Promise<void> {
  const key = profileKey(profileId);
  const validated = validateAppData(data);
  const tx = (await db()).transaction('profiles', 'readwrite', { durability: 'strict' });
  await tx.store.put(validated, key);
  await tx.done;
}
export async function requestPersistence(): Promise<boolean> {
  return typeof globalThis.navigator?.storage?.persist === 'function' ? navigator.storage.persist() : false;
}
/** Internal sync metadata is isolated using exactly the same account key as data. */
export async function loadSyncState(profileId: string): Promise<unknown> {
  return (await db()).get('sync', profileKey(profileId));
}
/** Commit the downloaded data and its merge baseline together, or neither. */
export async function saveSyncedData(profileId: string, data: AppData, state: unknown, expected?: AppData): Promise<void> {
  const key = profileKey(profileId);
  const validated = validateAppData(data);
  const tx = (await db()).transaction(['profiles', 'sync'], 'readwrite', { durability: 'strict' });
  const current = expected ? await tx.objectStore('profiles').get(key) : undefined;
  const changed = current !== undefined && JSON.stringify(validateAppData(current)) !== JSON.stringify(validateAppData(expected));
  await tx.objectStore('sync').put(state, key);
  if (!changed) await tx.objectStore('profiles').put(validated, key);
  await tx.done;
  if (changed) throw new Error('Your workout changed on this device while syncing. Local changes are preserved; sync again to send them.');
}
