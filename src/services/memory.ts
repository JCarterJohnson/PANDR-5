import type { AppData } from '../domain/types';
import { validateAppData } from '../domain/validation';
import type { SyncPersistence } from './cloud';

/** Training data lives only in this tab until Supabase acknowledges a write. */
export function createMemoryPersistence(): SyncPersistence {
  const snapshots = new Map<string, AppData>();
  const baselines = new Map<string, unknown>();
  return {
    async loadData(id) { const data = snapshots.get(id); return data && structuredClone(data); },
    async loadSyncState(id) { return structuredClone(baselines.get(id)); },
    async saveSyncedData(id, data, baseline) {
      snapshots.set(id, validateAppData(structuredClone(data)));
      baselines.set(id, structuredClone(baseline));
    },
  };
}
