import { describe, expect, it } from 'vitest';
import sourceText from '../../source/live-sheet.json?raw';
import { allocateSets, calculateVolume, createSession, getDayIndex, getWeek, isPivotWeek, makeRir, recommendProgression, recoveryAdvice, validatePlan } from './engine';
import { createInitialData, DEFAULT_EXERCISES, DEFAULT_PLAN, MUSCLES, SOURCE_TOTALS } from '../data/seed';
import type { CheckIn, ExerciseLog, Settings } from './types';

const settings: Settings = { name: '', strict: true, unit: 'kg', startDate: '2026-09-15', increasePercent: 2.5, decreasePercent: 2.5, restSeconds: 120 };
const check = (patch: Partial<CheckIn> = {}): CheckIn => ({ id: 'check', date: '2026-09-20', week: 1, poorSleep: false, runDown: false, elevatedHr: false, lingeringSoreness: false, performanceDip: false, jointPain: false, notes: '', ...patch });
const log = (patch: Partial<ExerciseLog> = {}): ExerciseLog => ({ slotId: 'slot-5', exerciseId: 'source-5', name: 'Bench Press', load: 100, increment: 0.5, unit: 'kg', loadMode: 'external', repMin: 5, repMax: 8, targetRir: [3, 2, 1, '0-1'], contributions: [], sets: [{ index: 0, reps: 8, rir: 3, completed: true }, { index: 1, reps: 7, rir: 2, completed: true }, { index: 2, reps: 6, rir: 1, completed: true }, { index: 3, reps: 8, rir: 1, completed: true }], notes: '', ...patch });

function anchor(reps: number, rir: number, completed = true) {
  return log({ sets: [{ index: 3, reps, rir, completed }] });
}

describe('source parity', () => {
  it('reproduces every Guide Sheet direct, fractional, and total value', () => {
    const rows = calculateVolume(DEFAULT_PLAN, DEFAULT_EXERCISES);
    expect(rows).toHaveLength(19);
    for (const [muscle, totals] of Object.entries(SOURCE_TOTALS)) expect(rows.find(row => row.muscle === muscle)).toMatchObject(totals);
    const source = JSON.parse(sourceText);
    const guide = source.sheets.find((sheet: { properties: { title: string } }) => sheet.properties.title === 'Guide Sheet');
    MUSCLES.forEach((muscle, i) => {
      const cells = guide.data[0].rowData[i + 4].values;
      expect(rows.find(row => row.muscle === muscle.id)).toMatchObject({ direct: Number(cells[9].formattedValue), fractional: Number(cells[10].formattedValue), total: Number(cells[11].formattedValue) });
    });
  });
  it('preserves original schedule, source prescriptions, and the source lateral-delt shortfall', () => {
    expect(DEFAULT_PLAN.days.map(day => day.kind)).toEqual(['training', 'training', 'training', 'rest', 'training', 'training', 'rest']);
    expect(DEFAULT_PLAN.days.flatMap(day => day.exercises)).toHaveLength(35);
    expect(DEFAULT_EXERCISES).toHaveLength(26);
    expect(DEFAULT_PLAN.days[0]!.exercises[2]!.rir).toEqual([1, 0, '<0']);
    expect(calculateVolume(DEFAULT_PLAN, DEFAULT_EXERCISES).find(row => row.muscle === 'lateral-delts')!.total).toBe(9);
    expect(DEFAULT_PLAN.targets['lateral-delts']).toBe(10);
  });
  it('retains every contributor on compound exercises', () => {
    const lunges = DEFAULT_EXERCISES.find(exercise => exercise.name === 'Lunges')!;
    expect(lunges.contributions.filter(c => c.coefficient === 1).map(c => c.muscle)).toEqual(['quads', 'glute-max']);
    expect(lunges.contributions.filter(c => c.coefficient === 0.5).map(c => c.muscle)).toEqual(['hamstrings', 'glute-med-min']);
    expect(lunges.contributions).toContainEqual({ muscle: 'adductors', coefficient: 0.25 });
  });
  it('returns independent mutable initial data', () => {
    const one = createInitialData(); const two = createInitialData();
    one.plan.days[0]!.exercises[0]!.sets = 99;
    one.exercises[0]!.contributions[0]!.coefficient = 0.5;
    expect(two.plan.days[0]!.exercises[0]!.sets).toBe(4);
    expect(DEFAULT_EXERCISES[0]!.contributions[0]!.coefficient).toBe(1);
  });
});

describe('double progression', () => {
  it.each([8, 9, 12])('increases at or above cap (%i) at prescribed RIR', reps => {
    expect(recommendProgression(anchor(reps, 1), settings)).toMatchObject({ action: 'increase', nextLoad: 102.5, targetReps: 5, anchorIndex: 3 });
  });
  it.each([0, 1])('accepts both endpoints of 0–1 RIR (%i)', rir => expect(recommendProgression(anchor(8, rir), settings).action).toBe('increase'));
  it.each([-1, 1.5, 2])('holds when achieved RIR is outside prescribed interval (%i)', rir => expect(recommendProgression(anchor(8, rir), settings).action).toBe('hold'));
  it('reduces below floor, holds at floor and inside the range', () => {
    expect(recommendProgression(anchor(4, 0), settings)).toMatchObject({ action: 'decrease', nextLoad: 97.5, targetReps: 5 });
    expect(recommendProgression(anchor(5, 0), settings)).toMatchObject({ action: 'hold', nextLoad: 100, targetReps: 6 });
    expect(recommendProgression(anchor(7, 1), settings)).toMatchObject({ action: 'hold', targetReps: 8 });
    expect(recommendProgression(anchor(4, 2), settings).action).toBe('hold');
  });
  it('uses only the penultimate set before a beyond-failure finisher', () => {
    const result = recommendProgression(log({ targetRir: [2, 0, '<0'], sets: [{ index: 1, reps: 8, rir: 0, completed: true }, { index: 2, reps: 2, rir: -2, completed: true }] }), settings);
    expect(result).toMatchObject({ action: 'increase', nextLoad: 102.5, anchorIndex: 1 });
    expect(recommendProgression(log({ targetRir: [2, 0, '<0'], sets: [{ index: 1, reps: 8, rir: 1, completed: true }, { index: 2, reps: 20, rir: -2, completed: true }] }), settings).action).toBe('hold');
  });
  it('requires a completed, valid anchor and does not fall back to another set', () => {
    expect(recommendProgression(anchor(8, 1, false), settings).action).toBe('hold');
    expect(recommendProgression(log({ sets: [] }), settings).action).toBe('hold');
    expect(recommendProgression(anchor(Number.NaN, 1), settings).action).toBe('hold');
    expect(recommendProgression(log({ targetRir: ['<0'], sets: [{ index: 0, reps: 8, rir: -1, completed: true }] }), settings).action).toBe('hold');
  });
  it('holds during pivots even when the anchor reaches the cap', () => {
    expect(recommendProgression(log(), settings, true)).toMatchObject({ action: 'hold', nextLoad: 100 });
  });
  it('inverts assisted load direction, including below-floor reductions in difficulty', () => {
    expect(recommendProgression(log({ loadMode: 'assistance' }), settings)).toMatchObject({ action: 'increase', nextLoad: 97.5 });
    expect(recommendProgression({ ...anchor(4, 1), loadMode: 'assistance' }, settings)).toMatchObject({ action: 'decrease', nextLoad: 102.5 });
  });
  it('does not invent a load for bodyweight or unset external load', () => {
    expect(recommendProgression(log({ loadMode: 'bodyweight', load: 0 }), settings)).toMatchObject({ action: 'hold', nextLoad: 0 });
    expect(recommendProgression(log({ load: 0 }), settings)).toMatchObject({ action: 'hold', nextLoad: 0 });
  });
  it('selects an attainable rounded load inside the model range', () => {
    expect(recommendProgression(log({ load: 30, increment: 1 }), settings)).toMatchObject({ action: 'increase', nextLoad: 31 });
    expect(recommendProgression(log({ load: 100, increment: 5 }), settings)).toMatchObject({ action: 'increase', nextLoad: 105 });
    expect(recommendProgression({ ...anchor(4, 0), increment: 1 }, { ...settings, decreasePercent: 10 })).toMatchObject({ action: 'decrease', nextLoad: 97 });
  });
  it('explicitly holds when equipment cannot realize the allowed percentage', () => {
    const result = recommendProgression(log({ load: 10, increment: 2.5 }), settings);
    expect(result).toMatchObject({ action: 'hold', nextLoad: 10 });
    expect(result.reason).toContain('No available');
    expect(recommendProgression({ ...anchor(4, 1), load: 30, increment: 1 }, settings).action).toBe('hold');
  });
  it('clamps settings to source ranges and never exceeds bounds over many load/increment pairs', () => {
    for (const load of [10, 21, 30, 37.5, 100, 145]) for (const increment of [0.25, 0.5, 1, 2.5, 5]) for (const loadMode of ['external', 'assistance'] as const) for (const reps of [4, 8]) {
      const result = recommendProgression({ ...anchor(reps, 1), load, increment, loadMode }, { ...settings, increasePercent: 99, decreasePercent: 99 });
      if (result.action !== 'hold') {
        const percent = Math.abs(result.nextLoad - load) / load * 100;
        expect(percent).toBeGreaterThanOrEqual(2 - 1e-8);
        expect(percent).toBeLessThanOrEqual((reps === 4 ? 3 : 5) + 1e-8);
        expect(Math.abs(result.nextLoad / increment - Math.round(result.nextLoad / increment))).toBeLessThan(1e-8);
      }
    }
  });
});

describe('constraints and allocation', () => {
  it('rejects the unadjusted source template in strict mode and reports custom warning', () => {
    expect(validatePlan(DEFAULT_PLAN, DEFAULT_EXERCISES, true)).toEqual([expect.objectContaining({ code: 'volume-bounds', severity: 'error' })]);
    expect(validatePlan(DEFAULT_PLAN, DEFAULT_EXERCISES, false)).toEqual([expect.objectContaining({ code: 'volume-bounds', severity: 'warning' })]);
  });
  it('allocates one extra lateral set without altering source data or exercise order', () => {
    const result = allocateSets(DEFAULT_PLAN, DEFAULT_EXERCISES);
    expect(result.issues).toEqual([]);
    expect(calculateVolume(result.plan, DEFAULT_EXERCISES).find(row => row.muscle === 'lateral-delts')!.total).toBe(10);
    expect(result.plan.days.map(day => day.exercises.map(slot => slot.exerciseId))).toEqual(DEFAULT_PLAN.days.map(day => day.exercises.map(slot => slot.exerciseId)));
    expect(DEFAULT_PLAN.days[0]!.exercises.at(-1)!.sets).toBe(3);
    for (const row of calculateVolume(result.plan, DEFAULT_EXERCISES).filter(row => row.target !== undefined)) expect(row.total).toBe(row.target);
  });
  it('rejects a changed rest order and two-day-frequency violations', () => {
    const plan = structuredClone(DEFAULT_PLAN);
    [plan.days[2], plan.days[3]] = [plan.days[3]!, plan.days[2]!];
    expect(validatePlan(plan, DEFAULT_EXERCISES, true).map(issue => issue.code)).toContain('schedule');
    const limited = structuredClone(DEFAULT_PLAN); limited.targets = { 'upper-traps': 10 };
    const result = allocateSets(limited, DEFAULT_EXERCISES);
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['allocation-infeasible', 'frequency', 'volume-bounds']));
  });
  it('refuses invalid requested targets and impossible coupled constraints', () => {
    const plan = structuredClone(DEFAULT_PLAN); plan.targets.chest = 21;
    expect(allocateSets(plan, DEFAULT_EXERCISES).issues.map(issue => issue.code)).toContain('target-bounds');
    const coupled = structuredClone(DEFAULT_PLAN); coupled.targets = { chest: 10, 'anterior-delts': 10 };
    // Anterior delts receive .5 pressing credit. The two retained fly slots make
    // 10 anterior sets require more than 20 chest sets, even with one set per fly.
    const result = allocateSets(coupled, DEFAULT_EXERCISES);
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['allocation-infeasible', 'volume-bounds']));
  });
  it('finds a strict valid allocation after reducing selected targets', () => {
    const plan = structuredClone(DEFAULT_PLAN);
    Object.keys(plan.targets).forEach(muscle => { plan.targets[muscle] = 10; });
    const result = allocateSets(plan, DEFAULT_EXERCISES);
    expect(result.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    const totals = calculateVolume(result.plan, DEFAULT_EXERCISES).filter(row => row.target !== undefined);
    expect(totals.every(row => row.total >= 10 && row.total <= 20)).toBe(true);
  });
  it('protects non-competing source roles and their order, including source chinups', () => {
    const base = allocateSets(DEFAULT_PLAN, DEFAULT_EXERCISES).plan;
    expect(validatePlan(base, DEFAULT_EXERCISES, true)).toEqual([]);
    const competing = structuredClone(base);
    competing.days[0]!.exercises[3]!.exerciseId = 'source-16';
    expect(validatePlan(competing, DEFAULT_EXERCISES, true).map(issue => issue.code)).toContain('split-role');
    expect(validatePlan(competing, DEFAULT_EXERCISES, false).find(issue => issue.code === 'split-role')!.severity).toBe('warning');
    const reordered = structuredClone(base);
    [reordered.days[0]!.exercises[0], reordered.days[0]!.exercises[3]] = [reordered.days[0]!.exercises[3]!, reordered.days[0]!.exercises[0]!];
    expect(validatePlan(reordered, DEFAULT_EXERCISES, true).map(issue => issue.code)).toContain('split-order');
  });
  it('rejects malformed sets, RIR counts, unsupported finishers and invalid contributions', () => {
    const plan = structuredClone(DEFAULT_PLAN);
    plan.days[0]!.exercises[0]!.rir = [3, 2, 1, '<0'];
    expect(validatePlan(plan, DEFAULT_EXERCISES, true).map(issue => issue.code)).toContain('finisher-unsupported');
    plan.days[0]!.exercises[0]!.sets = 1.5;
    expect(validatePlan(plan, DEFAULT_EXERCISES, false).map(issue => issue.code)).toEqual(expect.arrayContaining(['sets', 'rir-count']));
  });
});

describe('sessions and recovery', () => {
  it('creates independent incomplete session logs with source RIR and fixed load', () => {
    const session = createSession(DEFAULT_PLAN.days[0]!, DEFAULT_EXERCISES, settings, 1, false);
    expect(session.exercises[0]!.targetRir).toEqual([3, 2, 1, '0-1']);
    expect(session.exercises.every(exercise => exercise.sets.every(set => !set.completed))).toBe(true);
    session.exercises[0]!.contributions[0]!.coefficient = 0.5;
    expect(DEFAULT_EXERCISES[0]!.contributions[0]!.coefficient).toBe(1);
    expect(() => createSession(DEFAULT_PLAN.days[3]!, DEFAULT_EXERCISES, settings, 1, false)).toThrow('Rest');
  });
  it('halves pivot sets with upward rounding and keeps original early RIR/load', () => {
    const session = createSession(DEFAULT_PLAN.days[2]!, DEFAULT_EXERCISES, settings, 2, true);
    session.exercises.forEach((exercise, i) => {
      const source = DEFAULT_PLAN.days[2]!.exercises[i]!;
      expect(exercise.sets).toHaveLength(Math.ceil(source.sets / 2));
      expect(exercise.targetRir).toEqual(source.rir.slice(0, Math.ceil(source.sets / 2)));
      expect(exercise.load).toBe(source.load);
    });
  });
  it('requires two specified flags on the same previous-week check-in', () => {
    expect(isPivotWeek([check({ performanceDip: true }), check({ poorSleep: true })], 2)).toBe(false);
    expect(isPivotWeek([check({ performanceDip: true, jointPain: true })], 2)).toBe(true);
    expect(isPivotWeek([check({ poorSleep: true, runDown: true, elevatedHr: true })], 2)).toBe(false);
    expect(isPivotWeek([check({ performanceDip: true, poorSleep: true })], 3)).toBe(false);
    expect(isPivotWeek([check({ performanceDip: true, poorSleep: true })], 1)).toBe(false);
  });
  it('selects passive rest from any source recovery flag', () => {
    for (const flag of ['poorSleep', 'runDown', 'elevatedHr', 'lingeringSoreness']) expect(recoveryAdvice(check({ [flag]: true }))).toContain('Passive rest');
    expect(recoveryAdvice(check())).toContain('20–30 minutes');
  });
  it('builds valid abating RIR staircases for edited counts', () => {
    expect(makeRir(4)).toEqual([3, 2, 1, '0-1']);
    expect(makeRir(3, true)).toEqual([1, '0-1', '<0']);
    expect(makeRir(1, true)).toEqual(['0-1']);
    expect(makeRir(0)).toEqual([]);
  });
});

describe('calendar schedule', () => {
  it('uses one-based weeks and zero-based days with calendar-date boundaries', () => {
    expect(getWeek('2026-09-15', '2026-09-15')).toBe(1);
    expect(getDayIndex('2026-09-15', '2026-09-21')).toBe(6);
    expect(getWeek('2026-09-15', '2026-09-22')).toBe(2);
    expect(getDayIndex('2026-09-15', '2026-09-22')).toBe(0);
    expect(getWeek('2026-09-15', '2026-09-14')).toBe(1);
    expect(getDayIndex('2026-09-15', '2026-09-14')).toBe(0);
  });
  it('handles US daylight saving spring-forward and fall-back dates', () => {
    expect(getWeek('2026-03-02', '2026-03-09')).toBe(2);
    expect(getDayIndex('2026-03-02', '2026-03-09')).toBe(0);
    expect(getWeek('2026-10-26', '2026-11-02')).toBe(2);
    expect(getDayIndex('2026-10-26', '2026-11-02')).toBe(0);
    expect(getDayIndex('2026-03-07', new Date(2026, 2, 9, 0, 1))).toBe(2);
  });
  it('rejects impossible calendar input', () => {
    expect(() => getWeek('2026-02-30', '2026-03-01')).toThrow('Invalid');
    expect(() => getDayIndex('bad-date')).toThrow('Invalid');
  });
});

it('fits custom-mode low-volume targets without reimposing strict volume bounds',()=>{
 const plan=structuredClone(DEFAULT_PLAN);
 plan.targets={chest:5};
 const result=allocateSets(plan,DEFAULT_EXERCISES,false);
 expect(result.issues.filter(i=>i.severity==='error')).toEqual([]);
 expect(calculateVolume(result.plan,DEFAULT_EXERCISES).find(v=>v.muscle==='chest')!.total).toBeLessThan(10);
});
