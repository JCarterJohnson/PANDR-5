import type { AppData, BodyweightResistance, Exercise, ExerciseLog, PlanExercise, Settings } from './types';

const KG_TO_LB = 2.2046226218;
const fromKg = (value: number, unit: Settings['unit']) => unit === 'kg' ? value : value * KG_TO_LB;
const toKg = (value: number, unit: Settings['unit']) => unit === 'kg' ? value : value / KG_TO_LB;
export const isRepsOnly = (bodyweight?: BodyweightResistance) => bodyweight?.tracking === 'reps-only';

/** Record an observed offset against this workout's frozen setup, without inventing equipment options. */
export function withObservedBodyweightLoad(log: ExerciseLog, loadMode: ExerciseLog['loadMode'], load: number): ExerciseLog {
  if (!log.bodyweight) throw new Error('This exercise has no bodyweight setup to adjust.');
  if (!Number.isFinite(load) || load < 0) throw new Error('Enter a nonnegative assistance or added resistance.');
  const observedLoad = loadMode === 'bodyweight' ? 0 : load;
  if (!isRepsOnly(log.bodyweight) && loadMode === 'assistance' && observedLoad >= log.bodyweight.resistance) throw new Error('Assistance must be less than the bodyweight resistance recorded for this workout.');
  const next = structuredClone(log);
  next.loadMode = loadMode;
  next.load = observedLoad;
  next.actualLoadOverride = true;
  // Legacy reps-only added weight lived in setup context. A manual offset now
  // uses the same observed load field as assistance, so never count it twice.
  if (isRepsOnly(next.bodyweight)) delete next.bodyweight!.additionalWeightKg;
  return next;
}

/** Catalog-informed defaults. Machine dip presses and band exercises never imply whole-body load. */
export function bodyweightMovement(exercise?: Pick<Exercise, 'name' | 'equipment'>): 'full-body' | 'partial-body' | undefined {
  if (!exercise) return;
  const whole = /\b(?:pull[\s-]?ups?|chin[\s-]?ups?|dips?)\b/i.test(exercise.name);
  const partial = /\bpush[\s-]?ups?\b|\b(?:inverted|ring)\b.*\brows?\b/i.test(exercise.name);
  const bodyweight = /\bbody[\s-]?weight\b/i.test(exercise.equipment);
  const band = /\b(?:resistance[\s-]?bands?|bands?)\b/i.test(exercise.equipment) || /\bband[\s-]?assisted\b/i.test(exercise.name);
  if (!bodyweight && (!band || (!whole && !partial))) return;
  if (whole && bodyweight && !band && !/\bbench\b/i.test(exercise.name)) return 'full-body';
  return 'partial-body';
}

/** Used only for a new, unconfigured movement; existing measurements are never inferred or rewritten. */
export function defaultBodyweightSlot(slot: PlanExercise, exercise: Pick<Exercise, 'name' | 'equipment'> | undefined, settings: Settings): PlanExercise {
  if (slot.bodyweight) return slot;
  const movement = bodyweightMovement(exercise);
  if (!movement) return slot;
  const mass = settings.bodyMass?.kg;
  const fullBody = movement === 'full-body' && !!mass;
  return { ...slot, load: 0, loadMode: 'bodyweight', availableLoads: undefined, bodyweight: {
    tracking: fullBody ? 'full-body' : 'reps-only',
    resistance: fullBody ? fromKg(mass!, settings.unit) : 0,
    addedLoads: [], assistanceLoads: [], ...(mass ? { bodyMassKg: mass } : {}),
  } };
}

/** Resolve only explicitly tracked setups. Old numeric profiles remain measured constants. */
export function resolveBodyweight(slot: PlanExercise, settings: Settings): PlanExercise {
  const profile = slot.bodyweight;
  if (!profile?.tracking) return slot;
  const mass = settings.bodyMass?.kg;
  if (isRepsOnly(profile)) return { ...slot, load: 0, loadMode: 'bodyweight', bodyweight: { ...profile, resistance: 0, addedLoads: [], assistanceLoads: [], ...(mass ? { bodyMassKg: mass } : {}) } };
  if (!mass) return slot;
  if (profile.tracking === 'measured' && profile.fraction === undefined && profile.bodyMassKg === undefined) return slot;
  const fraction = profile.tracking === 'full-body' ? 1 : profile.fraction ?? (profile.resistance > 0 ? toKg(profile.resistance, settings.unit) / (profile.bodyMassKg ?? mass) : undefined);
  if (fraction === undefined || !Number.isFinite(fraction) || fraction <= 0 || fraction > 1) return slot;
  const resistance = fromKg(mass * fraction, settings.unit);
  const bodyweight: BodyweightResistance = { ...profile, resistance, bodyMassKg: mass, ...(profile.tracking === 'measured' ? { fraction } : {}) };
  const impossibleAssistance = slot.loadMode === 'assistance' && slot.load >= resistance;
  return { ...slot, bodyweight, ...(impossibleAssistance ? { load: 0, loadMode: 'bodyweight' as const } : {}) };
}

/** Future prescriptions change; observations and the workout already in progress keep their snapshots. */
export function updateBodyMass(data: AppData, value: number, unit: Settings['unit'], now = new Date()): AppData {
  const kg = toKg(value, unit);
  if (!Number.isFinite(kg) || kg <= 0 || kg > 500 || !Number.isFinite(now.getTime())) throw new Error('Enter a body weight greater than zero and at most 500 kg (1,102 lb), with a valid measurement date.');
  const next = structuredClone(data);
  next.settings.bodyMass = { kg, recordedAt: now.toISOString() };
  next.plan.days.forEach(day => { day.exercises = day.exercises.map(slot => resolveBodyweight(slot, next.settings)); });
  if (next.strength?.active) next.strength.active.items = next.strength.active.items.map(draft => {
    if (draft.resultId) return draft;
    const slot = resolveBodyweight({ ...draft.slot, load: draft.load, loadMode: draft.loadMode }, next.settings);
    const changed = slot.bodyweight?.resistance !== draft.slot.bodyweight?.resistance || isRepsOnly(slot.bodyweight) && slot.bodyweight?.bodyMassKg !== draft.slot.bodyweight?.bodyMassKg;
    return { ...draft, slot, load: slot.load, loadMode: slot.loadMode, ...(changed ? { reps: draft.method === '1rm' ? 1 : 0, confirmed: false } : {}) };
  });
  return next;
}

/** Mass changes preserve numeric strength; calibration/variation changes need a new test. */
export function sameBodyweightSetup(a?: BodyweightResistance, b?: BodyweightResistance, aUnit: Settings['unit'] = 'kg', bUnit: Settings['unit'] = aUnit): boolean {
  if (!a || !b) return !a && !b;
  if (a.tracking !== b.tracking) return false;
  if (isRepsOnly(a)) return a.bodyMassKg === b.bodyMassKg && (a.additionalWeightKg ?? 0) === (b.additionalWeightKg ?? 0);
  if (a.tracking === 'full-body') return true;
  if (a.fraction !== undefined || b.fraction !== undefined) return a.fraction !== undefined && b.fraction !== undefined && Math.abs(a.fraction-b.fraction) < 1e-8;
  // Manual/legacy supported loads identify the measured setup. Recalibration
  // needs a new test; changing display units does not change that observation.
  return Math.abs(toKg(a.resistance,aUnit)-toKg(b.resistance,bUnit)) < .001;
}
