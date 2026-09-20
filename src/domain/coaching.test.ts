import { expect, it } from 'vitest';
import { createInitialData } from '../data/seed';
import { allocateSets, createSession } from './engine';
import { completeSession, recordCheckIn, trainingPlan, convertPlanLoads } from './coaching';
import { activeCycle, completedWeeklyVolume } from './training';
import { exportBackup, parseBackup } from '../services/backup';
import type { CheckIn } from './types';

it('saves bodyweight mode transitions and keeps the completed prescription immutable', () => {
  const data = createInitialData(); const slot = data.plan.days[0].exercises[0];
  slot.load = 0; slot.loadMode = 'bodyweight'; slot.bodyweight = { resistance: 80, addedLoads: [2.5], assistanceLoads: [2] };
  const session = createSession(data.plan.days[0], data.exercises, data.settings, 1, false);
  session.exercises[0].sets.forEach(s => { s.completed = true; s.reps = session.exercises[0].repMax; s.rir = 1; });
  const next = completeSession(data, session, '2026-09-20T12:00:00Z');
  expect(next.plan.days[0].exercises[0]).toMatchObject({ loadMode: 'external', load: 2.5 });
  expect(next.sessions[0].exercises[0]).toMatchObject({ loadMode: 'bodyweight', load: 0 });
  expect(completeSession(next, session, '2026-09-20T12:00:00Z').sessions).toHaveLength(1);
  expect(parseBackup(exportBackup(next))).toEqual(next);
});

it('saves versioned recovery decisions and future-week prescriptions across a backup round trip', () => {
  let data = createInitialData(); data.plan = allocateSets(data.plan, data.exercises).plan;
  const base = structuredClone(data.plan.days);
  const check = (week: number): CheckIn => ({ id: `check-${week}`, week, date: '2026-09-20', poorSleep: true, performanceDip: true, jointPain: false, runDown: false, elevatedHr: false, lingeringSoreness: false, notes: '' });
  data = recordCheckIn(data, check(1)); data = recordCheckIn(data, check(2));
  expect(data.checkIns[1]).toMatchObject({ assessmentVersion: '2', coaching: { action: 'reduce', effectiveWeek: 3 } });
  expect(trainingPlan(data, 2).days).toEqual(base);
  expect(trainingPlan(data, 3).days).not.toEqual(base);
  const restored = parseBackup(exportBackup(data));
  expect(trainingPlan(restored, 3)).toEqual(trainingPlan(data, 3));
  expect(restored.plan.recovery?.cycleId).toBe(activeCycle(restored).id);
  expect(recordCheckIn(restored, check(2))).toEqual(restored);
});

it('converts every resistance option with units and leaves historical workouts unchanged', () => {
  const data = createInitialData(); const slot = data.plan.days[0].exercises[0];
  slot.load = 2; slot.bodyweight = { resistance: 80, addedLoads: [2, 4], assistanceLoads: [2, 4] };
  data.plan.days[0].exercises[1].availableLoads = [10, 10.25, 12.5];
  data.sessions = [createSession(data.plan.days[0], data.exercises, data.settings, 1, false)];
  const converted = convertPlanLoads(data.plan, 2.20462262185);
  expect(converted.days[0].exercises[0].bodyweight?.resistance).toBeCloseTo(176.3698, 4);
  expect(converted.days[0].exercises[1].availableLoads?.[1]).toBeCloseTo(22.5974, 4);
  expect(convertPlanLoads(converted, 1 / 2.20462262185).days[0].exercises[0].bodyweight?.resistance).toBeCloseTo(80, 4);
  expect(data.sessions[0].exercises[0]).toMatchObject({ unit: 'kg', load: 2, bodyweight: { resistance: 80 } });
});

it('uses the adjusted prescription for weekly completion and switches back only when disabled', () => {
  let data = createInitialData(); data.plan = allocateSets(data.plan, data.exercises).plan;
  for (const week of [1, 2]) data = recordCheckIn(data, { id: `dose-${week}`, week, date: '2026-09-20', poorSleep: true, performanceDip: true, jointPain: false, runDown: false, elevatedHr: false, lingeringSoreness: false, notes: '' });
  const base = trainingPlan(data, 4); const rows = completedWeeklyVolume(data, 4);
  expect(base.days).not.toEqual(data.plan.days);
  expect(rows.filter(v => v.target !== undefined).every(v => v.target! >= 10 && v.target! <= 20)).toBe(true);
  data.settings.adaptiveRecovery = false;
  expect(trainingPlan(data, 4)).toBe(data.plan);
});
