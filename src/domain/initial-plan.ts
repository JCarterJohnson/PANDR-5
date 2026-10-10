import { allocateSets, calculateVolume } from './engine';
import type { Exercise, TrainingPlan } from './types';

/** Preserve the authored template. Bootstrap only targets outside the strict range;
 * full redistribution belongs to the user's reviewed allocation flow. */
export function initializeDefaultPlan(plan: TrainingPlan, exercises: Exercise[]): TrainingPlan {
  const targets = Object.fromEntries(calculateVolume(plan, exercises)
    .filter(row => row.target !== undefined && (row.total < 10 || row.total > 20))
    .map(row => [row.muscle, row.target!]));
  if (!Object.keys(targets).length) return structuredClone(plan);
  const fitted = allocateSets({ ...plan, targets }, exercises).plan;
  return { ...fitted, targets: { ...plan.targets } };
}
