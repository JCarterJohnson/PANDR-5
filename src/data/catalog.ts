import type { Exercise, TrainingPlan } from '../domain/types';
import master from './catalog/master-catalog.json';
import metadata from './catalog/metadata.json';
import sources from './catalog/sources.json';

export const BUILTIN_EXERCISES: Exercise[] = master.exercises;
export const CATALOG_SOURCES = sources;
export interface ExerciseResearch {
  id: string; aliases: string[]; category: string; laterality: string; loading: string;
  setup: string; primaryMuscle: string; primaryMuscles: string[]; secondaryMuscles: string[];
  tertiaryMuscles: string[]; rationale: string; confidence: string; sourceIds: string[];
  limitations: string; evidenceScope: string; reviewVersion: string; reviewedOn: string;
  allocationEvidence: { muscle: string; coefficient: number; confidence: string; basis: string }[];
}
const research: Record<string, ExerciseResearch> = metadata;
const builtinsById = new Map(BUILTIN_EXERCISES.map(e => [e.id, e]));
const nameKey = (e: Exercise) => `${e.name.trim().toLocaleLowerCase()}\0${e.equipment.trim().toLocaleLowerCase()}`;

/** Catalog additions are a view, not an account migration. Saved records always win. */
export function availableExercises(saved: Exercise[]): Exercise[] {
  const ids = new Set(saved.map(e => e.id));
  const names = new Set(saved.map(nameKey));
  return [...saved, ...BUILTIN_EXERCISES.filter(e => !ids.has(e.id) && !names.has(nameKey(e)))];
}

/** Never award a custom allocation citations merely because its ID matches a built-in. */
export function exerciseResearch(exercise: Exercise): ExerciseResearch | undefined {
  const canonical = builtinsById.get(exercise.id);
  if (!canonical || canonical.name !== exercise.name || canonical.equipment !== exercise.equipment || canonical.source !== exercise.source || canonical.beyondFailureAllowed !== exercise.beyondFailureAllowed || canonical.contributions.length !== exercise.contributions.length || canonical.contributions.some(c => !exercise.contributions.some(v => v.muscle === c.muscle && v.coefficient === c.coefficient))) return undefined;
  return research[exercise.id];
}
export function exerciseOrigin(exercise: Exercise): string {
  return !exerciseResearch(exercise) ? 'Custom / imported' : exercise.id.startsWith('source-') ? 'Original PANDR-5' : 'Built-in · researched';
}
function searchText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function matchesExercise(exercise: Exercise, query: string): boolean {
  const tokens = searchText(query).split(' ').filter(Boolean);
  const detail = exerciseResearch(exercise);
  const haystack = searchText([exercise.name, exercise.equipment, ...(detail?.aliases ?? [])].join(' '));
  const words = haystack.split(' ');
  return tokens.every(token => words.some(word => word.startsWith(token)));
}

/** Persist only selected built-ins, so old clients/backups have complete exercise records. */
export function catalogForPlan(saved: Exercise[], plan: TrainingPlan): Exercise[] {
  const resolved = new Map(availableExercises(saved).map(e => [e.id, e]));
  const ids = new Set(saved.map(e => e.id));
  const result = [...saved];
  for (const day of plan.days) for (const slot of day.exercises) {
    if (ids.has(slot.exerciseId)) continue;
    const exercise = resolved.get(slot.exerciseId);
    if (!exercise) throw new Error(`Unknown exercise: ${slot.exerciseId}`);
    result.push(structuredClone(exercise)); ids.add(exercise.id);
  }
  if (result.length > 20_000) throw new Error('The combined catalog exceeds 20,000 exercises.');
  return result;
}
