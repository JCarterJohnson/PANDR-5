import type { Exercise, PlanExercise, Settings, TrainingPlan } from './types';

export const POUNDS_PER_KG = 2.2046226218;
const inUnit = (pounds: number, unit: Settings['unit']) => Math.round((unit === 'lb' ? pounds : pounds / POUNDS_PER_KG) * 1e6) / 1e6;

/** Total external loads for a 45 lb bar, with equal plates on both sides.
 * Standard 5/10/25/45 lb plates share a 10 lb total-load grid. The optional
 * smaller plate presets must be chosen explicitly. This is a loading grid,
 * not an inventory guarantee; users can supply their exact available loads.
 */
export function barbellEquipment(unit: Settings['unit'], smallestPlate = 5): Pick<PlanExercise, 'increment' | 'availableLoads'> {
  const step = smallestPlate * 2;
  return { increment: inUnit(step, unit), availableLoads: Array.from({length:Math.floor(960 / step) + 1}, (_,i) => inUnit(45 + i * step, unit)) };
}

/** Per-dumbbell rack loads, with a configurable exact list after applying the preset.
 * The 50 lb cutoff is a default assumption, not a claim about a particular gym.
 */
export function dumbbellEquipment(unit: Settings['unit']): Pick<PlanExercise, 'increment' | 'availableLoads'> {
  const pounds = [
    ...Array.from({length:19}, (_,i) => 5 + i * 2.5),
    ...Array.from({length:30}, (_,i) => 55 + i * 5),
  ];
  return {increment:inUnit(2.5,unit),availableLoads:pounds.map(n=>inUnit(n,unit))};
}

export function standardEquipment(exercise: Exercise, unit: Settings['unit']): Pick<PlanExercise, 'increment' | 'availableLoads'> {
  // Smith machines can have different bar resistance; do not assume a 45 lb bar.
  if (/barbell/i.test(exercise.equipment)) return barbellEquipment(unit);
  if (/dumbbell/i.test(exercise.equipment)) return dumbbellEquipment(unit);
  return { increment: inUnit(5, unit), availableLoads: undefined };
}

/** New-plan defaults only. Loading an existing account never invokes this helper. */
export function withStandardEquipment(plan: TrainingPlan, exercises: Exercise[], unit: Settings['unit']): TrainingPlan {
  const next = structuredClone(plan);
  const catalog = new Map(exercises.map(e=>[e.id,e]));
  for (const day of next.days) for (const slot of day.exercises) {
    const exercise = catalog.get(slot.exerciseId);
    if (exercise) Object.assign(slot, standardEquipment(exercise, unit));
  }
  return next;
}

export const defaultLoadIncrement = (unit: Settings['unit']) => inUnit(5, unit);
