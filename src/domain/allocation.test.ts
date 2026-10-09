import { describe, expect, it } from 'vitest';
import { DEFAULT_EXERCISES, DEFAULT_PLAN } from '../data/seed';
import { allocateSets, calculateVolume, makeRir } from './engine';
import type { Exercise, TrainingPlan } from './types';

// The screenshot's edited leg days, including its existing 11/1 split.
function editedLegPlan(extension = true): TrainingPlan {
  const plan = structuredClone(DEFAULT_PLAN);
  const slot = (name: string, sets: number, id: string) => ({
    ...plan.days[2]!.exercises[0]!, id,
    exerciseId: DEFAULT_EXERCISES.find(e => e.name === name)!.id,
    sets, rir: makeRir(sets),
  });
  plan.days[2]!.exercises = [slot('Seated Hamstring Curls', 2, 'seated'), slot('Lying Hamstring Curls', 3, 'lying-a'), slot(extension ? 'Leg Extension' : 'Leg Press', 11, 'quad-a'), slot('Standing Calf Raise (Machine)', 5, 'calf-a'), slot('Lateral Raise', 3, 'delt-a')];
  plan.days[5]!.exercises = [slot('Lying Hamstring Curls', 1, 'lying-b'), slot('Leg Extension', 1, 'quad-b'), slot('Standing Calf Raise (Machine)', 5, 'calf-b'), slot('Lateral Raise', 3, 'delt-b')];
  plan.targets = { quads: 12, hamstrings: 12, gastrocnemius: 10 };
  return plan;
}

describe('balanced set allocation', () => {
  it('reconciles all attainable combinations of independent leg targets without favoring the first day', () => {
    for (const q of [2, 4, 6, 8, 10, 12]) for (const h of [4, 6, 8, 10, 12]) for (const calf of [2, 6, 10, 12]) {
      const plan = editedLegPlan(); plan.targets = { quads:q,hamstrings:h,gastrocnemius:calf };
      const next = allocateSets(plan, DEFAULT_EXERCISES, false).plan;
      const totals = calculateVolume(next, DEFAULT_EXERCISES);
      expect(totals.find(r=>r.muscle==='quads')!.total).toBe(q);
      expect(totals.find(r=>r.muscle==='hamstrings')!.total).toBe(h);
      expect(totals.find(r=>r.muscle==='gastrocnemius')!.total).toBe(calf);
      const a = next.days[2]!.exercises, b = next.days[5]!.exercises;
      expect(a[2]!.sets).toBe(b[1]!.sets);
      expect(a[3]!.sets).toBe(b[2]!.sets);
      expect(a[0]!.sets+a[1]!.sets).toBe(b[0]!.sets);
    }
  });
  it('repairs 11/1 into 6/6 and balances hamstring volume across days', () => {
    const plan = editedLegPlan();
    const before = structuredClone(plan);
    const { plan: next } = allocateSets(plan, DEFAULT_EXERCISES, false);
    expect(next.days[2]!.exercises.map(s => s.sets)).toEqual([3, 3, 6, 5, 3]);
    expect(next.days[5]!.exercises.map(s => s.sets)).toEqual([6, 6, 5, 3]);
    expect(plan).toEqual(before);
    expect(next.days.map(d => d.exercises.map(s => [s.id, s.exerciseId, s.load]))).toEqual(plan.days.map(d => d.exercises.map(s => [s.id, s.exerciseId, s.load])));
    expect(allocateSets(next, DEFAULT_EXERCISES, false).plan.days).toEqual(next.days);
  });

  it.each([2, 4, 6, 8, 10, 12])('fits %i weekly quad sets evenly without changing unchecked exercises', target => {
    const plan = editedLegPlan(); plan.targets = { quads: target };
    const next = allocateSets(plan, DEFAULT_EXERCISES, false).plan;
    expect(next.days[2]!.exercises[2]!.sets).toBe(target / 2);
    expect(next.days[5]!.exercises[1]!.sets).toBe(target / 2);
    expect(next.days[2]!.exercises.slice(0, 2)).toEqual(plan.days[2]!.exercises.slice(0, 2));
  });

  it('reports a high target shortfall instead of concentrating automatic volume', () => {
    const plan = editedLegPlan(); plan.targets = { quads: 20 };
    const result = allocateSets(plan, DEFAULT_EXERCISES, false);
    expect(result.plan.days[2]!.exercises[2]!.sets).toBe(6);
    expect(result.plan.days[5]!.exercises[1]!.sets).toBe(6);
    expect(result.issues.some(i => i.code === 'target-approximation' && i.message.includes('12/20'))).toBe(true);
  });

  it('accounts for fractional compound credit and reports an unattainable half-set target', () => {
    const plan = editedLegPlan(false); plan.targets = { quads: 12, hamstrings: 11.5 };
    const result = allocateSets(plan, DEFAULT_EXERCISES, false);
    const totals = calculateVolume(result.plan, DEFAULT_EXERCISES);
    expect(totals.find(r => r.muscle === 'quads')!.total).toBe(12);
    // Six leg-press sets supply 3 hamstring credits. Curl counts are whole,
    // so 11.5 cannot be exact while preserving 12 quads under this cap.
    expect(totals.find(r => r.muscle === 'hamstrings')!.total).toBe(12);
    expect(result.plan.targets.hamstrings).toBe(11.5);
    expect(result.issues.some(i => i.code === 'target-approximation')).toBe(true);
    expect(result.plan.days[2]!.exercises[2]!.sets).toBeLessThanOrEqual(6);
  });

  it('uses an explicitly chosen automatic cap', () => {
    const plan = editedLegPlan(); plan.targets = { quads: 20 };
    const next = allocateSets(plan, DEFAULT_EXERCISES, false, 10).plan;
    expect(next.days[2]!.exercises[2]!.sets).toBe(10);
    expect(next.days[5]!.exercises[1]!.sets).toBe(10);
  });

  it.each([NaN, Infinity, -1])('rejects malformed custom targets without changing sets: %s', target => {
    const plan = editedLegPlan(); plan.targets = { quads: target };
    const result = allocateSets(plan, DEFAULT_EXERCISES, false);
    expect(result.plan).toEqual(plan);
    expect(result.issues.some(i => i.severity === 'error')).toBe(true);
  });

  it('reports zero targets blocked by retained exercises, and leaves no-target plans unchanged', () => {
    const plan = editedLegPlan(); plan.targets = { quads: 0 };
    const result = allocateSets(plan, DEFAULT_EXERCISES, false);
    expect(calculateVolume(result.plan, DEFAULT_EXERCISES).find(r => r.muscle === 'quads')!.total).toBe(2);
    expect(result.issues.some(i => i.code === 'target-approximation')).toBe(true);
    plan.targets = {};
    expect(allocateSets(plan, DEFAULT_EXERCISES, false).plan).toEqual(plan);
  });

  it('finds the closest attainable coupled totals rather than claiming an exact fit', () => {
    const plan = editedLegPlan(); plan.targets = { quads: 5.25 };
    const result = allocateSets(plan, DEFAULT_EXERCISES, false);
    expect(calculateVolume(result.plan, DEFAULT_EXERCISES).find(r => r.muscle === 'quads')!.total).toBe(5);
    expect(result.issues.some(i => i.code === 'target-approximation')).toBe(true);
  });

  it('does not rebuild a manually customized RIR prescription when its set count stays unchanged', () => {
    const plan = editedLegPlan(); plan.targets = { gastrocnemius: 10 };
    plan.days[2]!.exercises[3]!.rir = [3, 3, 2, 1, 1];
    expect(allocateSets(plan, DEFAULT_EXERCISES, false).plan.days[2]!.exercises[3]!.rir).toEqual([3, 3, 2, 1, 1]);
  });

  it('matches the global best target error on a small coupled exercise selection', () => {
    const exercises: Exercise[] = [
      { ...DEFAULT_EXERCISES[0]!, id: 'a', contributions: [{muscle:'quads',coefficient:1},{muscle:'hamstrings',coefficient:0.5}] },
      { ...DEFAULT_EXERCISES[0]!, id: 'b', contributions: [{muscle:'quads',coefficient:0.25},{muscle:'hamstrings',coefficient:1}] },
      { ...DEFAULT_EXERCISES[0]!, id: 'c', contributions: [{muscle:'quads',coefficient:0.5},{muscle:'hamstrings',coefficient:0.25}] },
    ];
    for (const [q,h] of [[4,6],[7.25,5],[2,2],[9,8.5]]) {
      const plan = editedLegPlan();
      plan.days = [{ ...plan.days[2]!, exercises: exercises.map((e,i) => ({...plan.days[2]!.exercises[i]!,exerciseId:e.id,sets:1,rir:[1]})) }];
      plan.targets = { quads:q!,hamstrings:h! };
      let best = Infinity;
      for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)for(let c=1;c<=6;c++) best=Math.min(best,(a+b*.25+c*.5-q!)**2+(a*.5+b+c*.25-h!)**2);
      const totals = calculateVolume(allocateSets(plan,exercises,false).plan,exercises);
      expect((totals.find(r=>r.muscle==='quads')!.total-q!)**2+(totals.find(r=>r.muscle==='hamstrings')!.total-h!)**2).toBe(best);
    }
  });
});
