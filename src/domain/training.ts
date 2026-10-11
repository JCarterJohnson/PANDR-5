import { effectivePlan, planPrescriptionSignature, reviewRecoveryPlan } from './recovery';
import type { AppData, CheckIn, Session, SessionProgression, TrainingCycle, VolumeRow } from './types';
import { calculateVolume, getWeek, isPivotWeek } from './engine';
import { sameBodyweightSetup } from './bodyweight';
import { workingResistance } from './resistance';
import { POUNDS_PER_KG } from './equipment';

export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function cyclesFor(data: AppData): TrainingCycle[] {
  return data.cycles ?? [{ id: `cycle-${data.id}`, name: 'Cycle 1', startDate: data.settings.startDate }];
}
export function activeCycle(data: AppData): TrainingCycle {
  const cycles = cyclesFor(data);
  return cycles.find(c => c.id === data.activeCycleId) ?? cycles[0];
}
export function recordCycleId(data: AppData, record: { cycleId?: string }): string {
  return record.cycleId ?? cyclesFor(data)[0].id;
}
export function inActiveCycle(data: AppData, record: { cycleId?: string }): boolean {
  return recordCycleId(data, record) === activeCycle(data).id;
}
/** Completion belongs to a cycle and its training week, in either account mode. */
export function completedSessionForDay(data: AppData, dayId: string, now = new Date()): Session | undefined {
  const week = getWeek(activeCycle(data).startDate, now);
  return data.sessions.filter(s => s.completedAt && !s.voidedAt && inActiveCycle(data, s) && s.week === week && s.dayId === dayId)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).at(0);
}

/** Explicit restart preserves observations for audit and removes their training effects.
 * Stored load deltas can be undone without restoring a stale copy of the user's plan.
 * Older workouts fall back to their recorded prescription and recommendation.
 */
export function restartTrainingFromSession(data: AppData, sessionId: string, now = new Date()): AppData {
  if (data.activeSession) throw new Error('Finish or discard your current workout before restarting a completed day.');
  const target = data.sessions.find(s => s.id === sessionId);
  if (!target?.completedAt || target.voidedAt || !inActiveCycle(data, target)) throw new Error('Choose a completed workout from the current cycle to restart.');
  const next = structuredClone(data), timestamp = now.toISOString();
  const ordered = next.sessions.filter(s => s.completedAt && !s.voidedAt && inActiveCycle(next, s))
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || Date.parse(a.completedAt!) - Date.parse(b.completedAt!));
  const voided = ordered.slice(ordered.findIndex(s => s.id === sessionId));
  const slots = new Map(next.plan.days.flatMap(day => day.exercises).map(slot => [slot.id, slot]));
  const convert = (load: number, unit: AppData['settings']['unit']) => unit === next.settings.unit ? load : unit === 'kg' ? load * POUNDS_PER_KG : load / POUNDS_PER_KG;
  for (const session of [...voided].reverse()) {
    const changes: SessionProgression[] = session.progression ?? session.exercises.flatMap(log => log.recommendation ? [{
      slotId:log.slotId,exerciseId:log.exerciseId,unit:log.unit,
      beforeLoad:log.prescribedLoad ?? log.load,beforeLoadMode:log.prescribedLoadMode ?? log.loadMode,
      afterLoad:log.recommendation.nextLoad,afterLoadMode:log.recommendation.nextLoadMode ?? log.loadMode,
      ...(log.bodyweight ? {bodyweight:log.bodyweight} : {}),
    }] : []);
    for (const change of changes) {
      const slot = slots.get(change.slotId);
      if (!slot || slot.exerciseId !== change.exerciseId || slot.loadMode !== change.afterLoadMode
        || Math.abs(slot.load - convert(change.afterLoad, change.unit)) > .001
        || !sameBodyweightSetup(change.bodyweight, slot.bodyweight, change.unit, next.settings.unit)) continue;
      const before = convert(change.beforeLoad, change.unit);
      if (change.beforeLoadMode === 'assistance' && slot.bodyweight && before >= slot.bodyweight.resistance) continue;
      slot.load = before; slot.loadMode = change.beforeLoadMode;
    }
    session.voidedAt = timestamp;
    session.voidedFromSessionId = sessionId;
  }
  const voidedIds = new Set(voided.map(s => s.id));
  for (const assessment of next.strength?.assessments ?? []) if (assessment.sourceSessionId && voidedIds.has(assessment.sourceSessionId)) assessment.voidedAt = timestamp;
  // Subjective check-in observations remain; computed evidence and future dose are rebuilt.
  const sessions = next.sessions.filter(s => !s.voidedAt && inActiveCycle(next, s));
  const cycleId = activeCycle(next).id, signature = planPrescriptionSignature(next.plan);
  if (next.plan.recovery?.cycleId === cycleId && next.plan.recovery.signature === signature) {
    next.plan.recovery.adjustments = next.plan.recovery.adjustments.filter(a => a.reviewedWeek < target.week);
  } else delete next.plan.recovery;
  const checks = next.checkIns.filter(c => inActiveCycle(next, c)).sort((a, b) => a.week - b.week);
  for (const check of checks.filter(c => c.week >= target.week)) {
    const proof = performanceEvidence(sessions, check.week);
    check.performanceEvidence = proof;
    check.measuredPerformanceDip = proof.length >= 2;
    check.assessmentVersion = '2';
    const reviewed = reviewRecoveryPlan(next.plan, next.exercises, checks, sessions, cycleId, check.week, next.settings.strict && next.settings.adaptiveRecovery !== false);
    next.plan = reviewed.plan; check.coaching = reviewed.decision;
  }
  next.plan.updatedAt = timestamp; next.updatedAt = timestamp;
  return next;
}
export function materializeCycles(data: AppData): void {
  data.cycles = cyclesFor(data);
  data.activeCycleId = activeCycle(data).id;
}
export function startCycle(data: AppData, name: string, startDate: string, now = new Date(), cycleId = crypto.randomUUID()): AppData {
  if (data.cycles?.some(c => c.id === cycleId)) return data;
  if (data.activeSession) throw new Error('Finish or discard the current workout before starting a cycle.');
  const next = structuredClone(data);
  materializeCycles(next);
  const old = activeCycle(next);
  if (!name.trim()) throw new Error('Give this cycle a name.');
  if (startDate < localDate(now) || startDate < old.startDate || (old.endedAt && startDate < old.endedAt)) throw new Error('Start the new cycle today or on a future date after the previous cycle.');
  if (!old.endedAt) { old.endedAt = localDate(now); old.plan = structuredClone(next.plan); }
  const cycle = { id: cycleId, name: name.trim(), startDate };
  next.cycles!.push(cycle);
  next.activeCycleId = cycle.id;
  next.settings.startDate = startDate;
  return next;
}
export function endCycle(data: AppData, now = new Date()): AppData {
  if (data.activeSession) throw new Error('Finish or discard the current workout before ending this cycle.');
  const next = structuredClone(data);
  materializeCycles(next);
  const cycle = activeCycle(next);
  if (cycle.startDate > localDate(now)) throw new Error('This cycle has not started yet.');
  cycle.endedAt = localDate(now);
  cycle.plan = structuredClone(next.plan);
  return next;
}
export function scheduledCheckInDay(data: AppData): number {
  if (data.settings.checkInDay !== undefined) return data.settings.checkInDay;
  const lastRest = data.plan.days.reduce((last, day, i) => day.kind === 'rest' ? i : last, -1);
  return (new Date(`${activeCycle(data).startDate}T12:00:00`).getDay() + (lastRest < 0 ? 6 : lastRest)) % 7;
}
export function checkInDue(data: AppData, now = new Date()): boolean {
  const cycle = activeCycle(data);
  const today = localDate(now);
  return !cycle.endedAt && today >= cycle.startDate && now.getDay() === scheduledCheckInDay(data)
    && !data.checkIns.some(c => inActiveCycle(data, c) && c.week === getWeek(cycle.startDate, now));
}
/** Uses each historical exercise's recorded credits, never today's edited catalog. */
export function completedWeeklyVolume(data: AppData, week: number): VolumeRow[] {
  const totals = new Map<string, { direct: number; fractional: number }>();
  const sessions = [...data.sessions, ...(data.activeSession ? [data.activeSession] : [])];
  for (const session of sessions.filter(s => !s.voidedAt && inActiveCycle(data, s) && s.week === week)) {
    for (const exercise of session.exercises) {
      const count = exercise.sets.filter(s => s.completed).length;
      for (const c of exercise.contributions) {
        const value = totals.get(c.muscle) ?? { direct: 0, fractional: 0 };
        if (c.coefficient === 1) value.direct += count; else value.fractional += count * c.coefficient;
        totals.set(c.muscle, value);
      }
    }
  }
  const pivot = isPivotWeek(data.checkIns.filter(c => inActiveCycle(data, c)), week);
  const base = data.settings.strict && data.settings.adaptiveRecovery !== false ? effectivePlan(data.plan, week, activeCycle(data).id) : data.plan;
  const plan = pivot ? {...base, days:base.days.map(day=>({...day,exercises:day.exercises.map(e=>({...e,sets:Math.max(1,Math.ceil(e.sets/2))}))}))} : base;
  return calculateVolume(plan, data.exercises).map(row => {
    const value = totals.get(row.muscle) ?? { direct: 0, fractional: 0 };
    return { muscle: row.muscle, target: row.target === undefined ? undefined : pivot || base !== data.plan ? row.total : row.target, ...value, total: value.direct + value.fractional };
  });
}
/** A conservative trend check, not a diagnostic or an estimated 1RM.
 * Three comparable baseline anchors followed by two confirmed low anchors.
 * Policy thresholds are documented in docs/coaching-refinements.md.
 */
export function performanceEvidence(sessions: Session[], week: number): string[] {
  const ordered = sessions.filter(s => s.completedAt && !s.voidedAt && !s.pivot && s.week <= week).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  type Exposure = { log: Session['exercises'][number]; reps: number; rir: number; time: number; week: number };
  const windows = new Map<string, Exposure[]>();
  const comparable = (a: Exposure['log'], b: Exposure['log']) => a.load === b.load && a.unit === b.unit && a.loadMode === b.loadMode
    && a.sets.length === b.sets.length && JSON.stringify(a.targetRir) === JSON.stringify(b.targetRir)
    && a.repMin === b.repMin && a.repMax === b.repMax && sameBodyweightSetup(a.bodyweight,b.bodyweight) && Math.abs(workingResistance(a)-workingResistance(b)) < 1e-6;
  for (const session of ordered) for (const log of session.exercises) {
    const key = `${session.cycleId ?? 'legacy'}:${log.slotId}:${log.exerciseId}`;
    const anchor = log.sets[log.targetRir.at(-1) === '<0' ? log.sets.length - 2 : log.sets.length - 1];
    const time = Date.parse(session.startedAt);
    if (!anchor?.completed || !Number.isFinite(anchor.reps) || !Number.isFinite(anchor.rir) || !Number.isFinite(time)) {
      windows.delete(key); continue;
    }
    let window = windows.get(key) ?? [];
    const previous = window.at(-1);
    if (previous && (!comparable(previous.log, log) || time - previous.time > 14 * 86400000)) window = [];
    window.push({ log, reps: anchor.reps, rir: anchor.rir, time, week: session.week });
    windows.set(key, window.slice(-5));
  }
  const evidence = new Map<string, string>();
  for (const window of windows.values()) {
    if (window.length < 5) continue;
    const last = window[4];
    if (last.week !== week || last.time - window[0].time > 42 * 86400000) continue;
    const baseline = window.slice(0, 3), recent = window.slice(3);
    const floor = Math.min(...baseline.map(e => e.reps));
    const effort = Math.min(...baseline.map(e => e.rir));
    const falls = window.slice(1).map((e, i) => window[i].reps - e.reps);
    const gradual = falls.every(n => n >= 0) && falls.filter(n => n > 0).length >= 3 && window[0].reps - last.reps >= 3
      && window.slice(1).every((e, i) => e.rir <= window[i].rir);
    if (recent.every(e => e.reps <= floor - 2 && e.rir <= effort)) {
      evidence.set(last.log.exerciseId, `${last.log.name}: ${recent.map(e => e.reps).join(' and ')} anchor reps on two successive comparable exposures, at least 2 below each of the prior three (${baseline.map(e => e.reps).join(', ')}), at the same or greater reported effort.`);
    } else if (gradual) {
      evidence.set(last.log.exerciseId, `${last.log.name}: anchor reps fell across at least three intervals in five comparable exposures (${window.map(e => e.reps).join(', ')}), losing at least 3 reps overall without an intervening rebound or easier reported effort.`);
    }
  }
  return [...evidence.values()];
}
export function recoveryTrend(check: CheckIn, previous: CheckIn[]): string[] {
  const recent = previous.filter(c => c.date < check.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const result: string[] = [];
  for (const [key, label] of [['sleepHours', 'Sleep hours'], ['fatigue', 'Fatigue'], ['soreness', 'Soreness'], ['stress', 'Stress']] as const) {
    const values = recent.map(c => c[key]).filter((n): n is number => n !== undefined);
    if (check[key] !== undefined && values.length >= 2) result.push(`${label}: ${check[key]} now; ${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)} average over ${values.length} previous check-ins.`);
  }
  return result;
}
