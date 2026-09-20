import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/seed';
import { allocateSets, calculateVolume, createSession, isPivotWeek, validatePlan } from './engine';
import { effectivePlan, reviewRecoveryPlan } from './recovery';
import type { CheckIn, Session } from './types';

const checks = (week: number, bad = true): CheckIn => ({ id: `check-${week}`, cycleId: 'cycle', date: `2026-01-${String(week).padStart(2, '0')}`, week, poorSleep: bad, performanceDip: bad, jointPain: false, runDown: false, elevatedHr: false, lingeringSoreness: false, notes: '' });
function setup() { const data = createInitialData(); data.plan = allocateSets(data.plan, data.exercises).plan; return data; }
const sets = (plan: ReturnType<typeof setup>['plan']) => plan.days.flatMap(d => d.exercises).reduce((n, e) => n + e.sets, 0);

describe('bounded recovery volume', () => {
  it('reduces a repeatedly intolerable dose next week, keeping every source constraint', () => {
    const d = setup(), original = structuredClone(d.plan);
    const result = reviewRecoveryPlan(d.plan, d.exercises, [checks(1), checks(2)], [], 'cycle', 2, true);
    expect(result.decision.action).toBe('reduce');
    expect(effectivePlan(result.plan, 2, 'cycle').days).toEqual(original.days);
    const next = effectivePlan(result.plan, 3, 'cycle');
    expect(sets(next)).toBeLessThan(sets(original));
    expect(sets(next)).toBeGreaterThanOrEqual(sets(original) * 0.9);
    expect(validatePlan(next, d.exercises, true).filter(i => i.severity === 'error')).toEqual([]);
    expect(next.targets).toEqual(original.targets);
    expect(next.days.map(day => day.exercises.map(e => [e.id, e.exerciseId, e.load, e.repMin, e.repMax]))).toEqual(original.days.map(day => day.exercises.map(e => [e.id, e.exerciseId, e.load, e.repMin, e.repMax])));
    expect(d.plan).toEqual(original);
    expect(isPivotWeek([checks(1), checks(2)], 3)).toBe(true);
  });
  it('does not change the plan for sleep alone, one bad week, or custom mode', () => {
    const d = setup();
    for (const history of [[checks(1)], [1, 2, 3, 4].map(w => ({ ...checks(w), performanceDip: false }))]) {
      expect(reviewRecoveryPlan(d.plan, d.exercises, history, [], 'cycle', history.length, true).decision.action).toBe('hold');
    }
    expect(reviewRecoveryPlan(d.plan, d.exercises, [checks(1), checks(2)], [], 'cycle', 2, false).plan).toEqual(d.plan);
  });
  it('does not stack another reduction immediately or apply it to another cycle', () => {
    const d = setup();
    const first = reviewRecoveryPlan(d.plan, d.exercises, [checks(1), checks(2)], [], 'cycle', 2, true);
    const second = reviewRecoveryPlan(first.plan, d.exercises, [checks(1), checks(2), checks(3)], [], 'cycle', 3, true);
    expect(second.plan.recovery?.adjustments).toHaveLength(1);
    expect(effectivePlan(first.plan, 10, 'other').days).toEqual(d.plan.days);
  });
  it('preserves the floor under months of ongoing symptoms and keeps required pivots', () => {
    const d = setup(), history: CheckIn[] = [];
    for (let week = 1; week <= 24; week++) {
      history.push(checks(week));
      d.plan = reviewRecoveryPlan(d.plan, d.exercises, history, [], 'cycle', week, true).plan;
      const plan = effectivePlan(d.plan, week + 1, 'cycle');
      for (const row of calculateVolume(plan, d.exercises).filter(r => r.target !== undefined)) {
        expect(row.total).toBeGreaterThanOrEqual(10); expect(row.total).toBeLessThanOrEqual(20);
      }
      expect(isPivotWeek(history, week + 1)).toBe(true);
    }
  });
  it('restores slowly after three recovered, attended normal weeks without exceeding the original plan', () => {
    const d = setup(), history = [checks(1), checks(2)];
    const reduced = reviewRecoveryPlan(d.plan, d.exercises, history, [], 'cycle', 2, true).plan;
    const sessions: Session[] = [];
    for (let week = 3; week <= 6; week++) {
      history.push(checks(week, false));
      for (const day of effectivePlan(reduced, week, 'cycle').days.filter(d => d.kind === 'training')) {
        const s = createSession(day, d.exercises, d.settings, week, isPivotWeek(history, week));
        s.completedAt = s.startedAt; s.cycleId = 'cycle';
        s.exercises.forEach(e => e.sets.forEach(set => { set.reps = 8; set.completed = true; })); sessions.push(s);
      }
    }
    expect(reviewRecoveryPlan(reduced, d.exercises, history, [], 'cycle', 6, true).decision.action).toBe('hold');
    const restored = reviewRecoveryPlan(reduced, d.exercises, history, sessions, 'cycle', 6, true);
    expect(restored.decision.action).toBe('restore');
    const before = sets(effectivePlan(reduced, 6, 'cycle')), after = sets(effectivePlan(restored.plan, 7, 'cycle'));
    expect(after).toBeGreaterThan(before); expect(after).toBeLessThanOrEqual(before * 1.05);
    expect(after).toBeLessThanOrEqual(sets(d.plan));
  });
  it('invalidates adjustments when the user edits the base prescription', () => {
    const d = setup();
    const reduced = reviewRecoveryPlan(d.plan, d.exercises, [checks(1), checks(2)], [], 'cycle', 2, true).plan;
    reduced.days[0].exercises[0].repMax += 1;
    expect(effectivePlan(reduced, 5, 'cycle').days).toEqual(reduced.days);
  });
});
