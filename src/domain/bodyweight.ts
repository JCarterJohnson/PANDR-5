import type { AppData, BodyweightResistance, PlanExercise, Settings } from './types';

const KG_TO_LB = 2.2046226218;
const fromKg = (value: number, unit: Settings['unit']) => unit === 'kg' ? value : value * KG_TO_LB;
const toKg = (value: number, unit: Settings['unit']) => unit === 'kg' ? value : value / KG_TO_LB;
export const isRepsOnly = (bodyweight?: BodyweightResistance) => bodyweight?.tracking === 'reps-only';

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
  if (isRepsOnly(a)) return a.bodyMassKg === b.bodyMassKg;
  if (a.tracking === 'full-body') return true;
  if (a.fraction !== undefined || b.fraction !== undefined) return a.fraction !== undefined && b.fraction !== undefined && Math.abs(a.fraction-b.fraction) < 1e-8;
  // Manual/legacy supported loads identify the measured setup. Recalibration
  // needs a new test; changing display units does not change that observation.
  return Math.abs(toKg(a.resistance,aUnit)-toKg(b.resistance,bUnit)) < .001;
}
