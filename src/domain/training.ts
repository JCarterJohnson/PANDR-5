import type { AppData, CheckIn, Session, TrainingCycle, VolumeRow } from './types';
import { calculateVolume, getWeek, isPivotWeek } from './engine';

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
  for (const session of sessions.filter(s => inActiveCycle(data, s) && s.week === week)) {
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
  const plan = pivot ? {...data.plan, days:data.plan.days.map(day=>({...day,exercises:day.exercises.map(e=>({...e,sets:Math.max(1,Math.ceil(e.sets/2))}))}))} : data.plan;
  return calculateVolume(plan, data.exercises).map(row => {
    const value = totals.get(row.muscle) ?? { direct: 0, fractional: 0 };
    return { muscle: row.muscle, target: row.target === undefined ? undefined : pivot ? row.total : row.target, ...value, total: value.direct + value.fractional };
  });
}
/** A transparent comparison, not an estimated 1RM or a calibrated fatigue score. */
export function performanceEvidence(sessions: Session[], week: number): string[] {
  const ordered = sessions.filter(s => s.completedAt && !s.pivot && s.week <= week).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const evidence = new Map<string, string>();
  const previous = new Map<string, Session['exercises'][number]>();
  for (const session of ordered) for (const exercise of session.exercises) {
    const key = `${exercise.slotId}:${exercise.exerciseId}`;
    const before = previous.get(key);
    const anchor = (e: typeof exercise) => e.sets[e.targetRir.at(-1) === '<0' ? e.sets.length - 2 : e.sets.length - 1];
    const a = anchor(exercise), b = before && anchor(before);
    if (session.week === week) {
      evidence.delete(exercise.exerciseId);
      if (before && a?.completed && b?.completed && exercise.load === before.load && exercise.unit === before.unit && exercise.loadMode === before.loadMode && exercise.sets.length === before.sets.length && JSON.stringify(exercise.targetRir) === JSON.stringify(before.targetRir) && exercise.repMin === before.repMin && exercise.repMax === before.repMax && a.reps < b.reps && a.rir <= b.rir) {
        evidence.set(exercise.exerciseId, `${exercise.name}: ${b.reps} → ${a.reps} anchor reps at ${exercise.load} ${exercise.unit}, with equal or greater reported effort.`);
      }
    }
    if (a?.completed) previous.set(key, exercise);
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
