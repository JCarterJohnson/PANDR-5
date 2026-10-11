import type { AppData, TrainingPlan } from '../domain/types';
import { migratePracticalEquipment } from '../domain/equipment';
import { reconcileAssessment } from '../domain/strength';
import { syncData, type SyncPersistence } from './cloud';

/** Upgrade the current plan only, after preserving the live assessment queue. */
export function prepareCurrentEquipment(data: AppData, previousPlan?: TrainingPlan): AppData {
  return migratePracticalEquipment(reconcileAssessment(data, previousPlan));
}

/** The first write may already have acknowledged changes from another device. */
export class PracticalSyncError extends Error {
  constructor(public readonly data: AppData, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), {cause});
    this.name='PracticalSyncError';
  }
}

/** Keep the normal revision/merge guards when another device supplies an old plan. */
export async function syncPracticalData(userId: string, data: AppData, persistence: SyncPersistence) {
  const result = await syncData(userId, data, persistence);
  const prepared = prepareCurrentEquipment(result.data);
  if (prepared === result.data) return result;
  prepared.updatedAt = new Date().toISOString();
  try { return await syncData(userId, prepared, persistence); }
  catch (error) { throw new PracticalSyncError(prepared,error); }
}
