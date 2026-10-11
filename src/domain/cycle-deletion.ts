import { activeCycle, cyclesFor, recordCycleId } from './training';
import type { AppData, TrainingCycle } from './types';
import { validateAppData } from './validation';

export interface CycleDeletionSummary {
  cycle: TrainingCycle;
  sessions: number;
  checkIns: number;
}

/** An old cycle can be removed without changing any strength assessment or current training. */
export function cycleDeletionSummary(data: AppData, cycleId: string): CycleDeletionSummary {
  const cycle = cyclesFor(data).find(c => c.id === cycleId);
  if (!cycle) throw new Error('This cycle no longer exists. Reopen History.');
  if (!cycle.endedAt || activeCycle(data).id === cycleId) throw new Error('Only a previous, ended cycle can be deleted.');
  if (data.activeSession && recordCycleId(data, data.activeSession) === cycleId) throw new Error('This cycle still has a workout in progress.');
  return {
    cycle,
    sessions: data.sessions.filter(s => recordCycleId(data, s) === cycleId).length,
    checkIns: data.checkIns.filter(c => recordCycleId(data, c) === cycleId).length,
  };
}

/** Uses original cycle ownership before removing the first (legacy fallback) cycle. */
export function removeClosedCycle(data: AppData, cycleId: string): AppData {
  cycleDeletionSummary(data, cycleId);
  const next = structuredClone(data);
  next.cycles = cyclesFor(data).filter(c => c.id !== cycleId).map(c => structuredClone(c));
  next.sessions = data.sessions.filter(s => recordCycleId(data, s) !== cycleId).map(s => structuredClone(s));
  next.checkIns = data.checkIns.filter(c => recordCycleId(data, c) !== cycleId).map(c => structuredClone(c));
  return validateAppData(next);
}
