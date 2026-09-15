import 'fake-indexeddb/auto';
import { describe,it,expect } from 'vitest';
import { createInitialData } from '../data/seed';
import { loadData,saveData,saveSyncedData,loadSyncState } from './storage';
describe('durable profile storage',()=>{
 it('round trips a complete profile and separates identities',async()=>{const a=createInitialData(),b=createInitialData();a.settings.name='A';b.settings.name='B';await saveData('test-a',a);await saveData('test-b',b);expect((await loadData('test-a'))?.settings.name).toBe('A');expect((await loadData('test-b'))?.settings.name).toBe('B');expect(await loadData('never-created')).toBeUndefined()});
 it('refuses corrupt data without replacing the saved profile',async()=>{const a=createInitialData();await saveData('test-atomic',a);await expect(saveData('test-atomic',{...a,schemaVersion:9} as never)).rejects.toThrow('Invalid PANDR-5');expect(await loadData('test-atomic')).toEqual(a)});
 it('preserves a newer local edit during cloud sync',async()=>{const original=createInitialData();await saveData('test-race',original);const newer=structuredClone(original);newer.settings.name='Newer';await saveData('test-race',newer);await expect(saveSyncedData('test-race',original,{revision:'test'},original)).rejects.toThrow('changed on this device');expect((await loadData('test-race'))?.settings.name).toBe('Newer');expect(await loadSyncState('test-race')).toEqual({revision:'test'})});
});
