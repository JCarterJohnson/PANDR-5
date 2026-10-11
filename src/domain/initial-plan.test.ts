import { expect, it } from 'vitest';
import { DEFAULT_EXERCISES, DEFAULT_PLAN } from '../data/seed';
import { calculateVolume, validatePlan } from './engine';
import { initializeDefaultPlan } from './initial-plan';

it('starts with the authored set split and corrects only the source lateral-delt shortfall', () => {
  const before = structuredClone(DEFAULT_PLAN);
  const next = initializeDefaultPlan(DEFAULT_PLAN, DEFAULT_EXERCISES);
  const catalog = new Map(DEFAULT_EXERCISES.map(e => [e.id, e]));
  let added = 0;
  next.days.forEach((day, d) => day.exercises.forEach((slot, i) => {
    const original = DEFAULT_PLAN.days[d]!.exercises[i]!;
    const lateral = catalog.get(slot.exerciseId)!.contributions.some(c => c.muscle === 'lateral-delts');
    if (!lateral) expect(slot).toEqual(original);
    added += slot.sets - original.sets;
  }));
  expect(added).toBe(1);
  expect(next.targets).toEqual(DEFAULT_PLAN.targets);
  expect(calculateVolume(next, DEFAULT_EXERCISES).find(row => row.muscle === 'lateral-delts')!.total).toBe(10);
  expect(validatePlan(next, DEFAULT_EXERCISES, true)).toEqual([]);
  expect(DEFAULT_PLAN).toEqual(before);
});
