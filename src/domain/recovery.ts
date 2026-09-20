import { calculateVolume, isPivotWeek, makeRir, validatePlan } from './engine';
import type { CheckIn, Exercise, RecoveryDecision, Session, TrainingPlan } from './types';

export function planPrescriptionSignature(plan: TrainingPlan): string {
  return JSON.stringify({ targets: Object.entries(plan.targets).sort(([a], [b]) => a.localeCompare(b)), days: plan.days.map(d => ({ id: d.id, kind: d.kind, exercises: d.exercises.map(e => ({ id: e.id, exerciseId: e.exerciseId, sets: e.sets, rir: e.rir, repMin: e.repMin, repMax: e.repMax })) })) });
}

/** Loads stay current; only set counts/RIR are adjusted. The user's base plan is retained. */
export function effectivePlan(plan: TrainingPlan, week: number, cycleId: string): TrainingPlan {
  const state = plan.recovery;
  if (!state || state.cycleId !== cycleId || state.signature !== planPrescriptionSignature(plan)) return plan;
  const adjustment = state.adjustments.filter(a => a.effectiveWeek <= week).at(-1);
  if (!adjustment) return plan;
  return { ...plan, days: plan.days.map(day => ({ ...day, exercises: day.exercises.map(slot => {
    const sets = adjustment.counts[slot.id];
    if (sets === undefined || !Number.isInteger(sets) || sets < 1 || sets >= slot.sets) return slot;
    return { ...slot, sets, rir: makeRir(sets, slot.rir.at(-1) === '<0') };
  }) })) };
}

const totalSets = (plan: TrainingPlan) => plan.days.flatMap(d => d.exercises).reduce((sum, e) => sum + e.sets, 0);
const clearRecovery = (c: CheckIn) => !c.poorSleep && !c.performanceDip && !c.measuredPerformanceDip && !c.jointPain && !c.runDown && !c.elevatedHr && !c.lingeringSoreness && [c.fatigue, c.soreness, c.stress].every(v => v === undefined || v < 4);

/** Bounded policy, not a calibrated physiological dose-response equation. */
export function reviewRecoveryPlan(plan: TrainingPlan, exercises: Exercise[], checks: CheckIn[], sessions: Session[], cycleId: string, week: number, enabled: boolean): { plan: TrainingPlan; decision: RecoveryDecision } {
  const current = effectivePlan(plan, week, cycleId), beforeSets = totalSets(current);
  const decision = (action: RecoveryDecision['action'], reason: string, afterSets = beforeSets): RecoveryDecision => ({ action, reason, effectiveWeek: week + 1, beforeSets, afterSets });
  const hold = (reason: string) => ({ plan, decision: decision('hold', reason) });
  if (!enabled) return hold('Automatic volume adjustment is off. Your selected set counts are kept.');
  if (validatePlan(current, exercises, true).some(i => i.severity === 'error')) return hold('Review the plan before automatic volume changes; the constrained plan must pass every check.');
  const recent = checks.filter(c => c.week <= week && (!c.cycleId || c.cycleId === cycleId));
  const check = recent.find(c => c.week === week);
  if (!check) return hold('A current weekly check-in is required before changing the training dose.');
  const signature = planPrescriptionSignature(plan);
  const adjustments = plan.recovery?.cycleId === cycleId && plan.recovery.signature === signature ? plan.recovery.adjustments : [];
  const last = adjustments.at(-1);
  if (last && last.reviewedWeek >= week) return hold('This check-in already has a scheduled adjustment.');
  const qualifying = recent.filter(c => c.week >= week - 3 && isPivotWeek([c], c.week + 1));
  const reduce = isPivotWeek([check], week + 1) && new Set(qualifying.map(c => c.week)).size >= 2 && (!last || week - last.reviewedWeek >= 2);
  const scheduled = new Set(plan.days.filter(d => d.kind === 'training').map(d => d.id));
  const attended = (w: number) => {
    const days = new Set(sessions.filter(s => s.week === w && (!s.cycleId || s.cycleId === cycleId) && s.completedAt && !s.pivot && scheduled.has(s.dayId) && s.exercises.length > 0 && s.exercises.every(e => e.sets.filter(set => set.completed).length >= Math.ceil(e.sets.length * 0.8))).map(s => s.dayId));
    return days.size >= Math.ceil(scheduled.size * 0.8);
  };
  const restore = !reduce && beforeSets < totalSets(plan) && (!last || week - last.reviewedWeek >= 3)
    && [week - 2, week - 1, week].every(w => w > 0 && !isPivotWeek(recent, w) && recent.some(c => c.week === w && clearRecovery(c)) && attended(w));
  if (!reduce && !restore) return hold('Keep the current dose. Further changes need persistent recovery trouble or three recovered, attended normal weeks.');

  const next = structuredClone(current), originalSlots = new Map(plan.days.flatMap(d => d.exercises).map(s => [s.id, s]));
  const slots = next.days.flatMap(d => d.exercises), catalog = new Map(exercises.map(e => [e.id, e]));
  const changed = new Set<string>();
  const limit = Math.floor(beforeSets * (reduce ? 0.1 : 0.05));
  for (let count = 0; count < limit; count++) {
    const volumes = new Map(calculateVolume(next, exercises).map(v => [v.muscle, v.total]));
    const choices = slots.filter(s => !changed.has(s.id) && (reduce ? s.sets > 1 : s.sets < originalSlots.get(s.id)!.sets));
    choices.sort((a, b) => {
      const score = (slot: typeof a) => (catalog.get(slot.exerciseId)?.contributions ?? []).reduce((sum, c) => sum + (plan.targets[c.muscle] === undefined ? 0 : c.coefficient * (reduce ? (volumes.get(c.muscle) ?? 10) - 10 : plan.targets[c.muscle] - (volumes.get(c.muscle) ?? 0))), 0);
      return score(b) - score(a) || a.id.localeCompare(b.id);
    });
    let accepted = false;
    for (const slot of choices) {
      const oldSets = slot.sets, oldRir = slot.rir;
      slot.sets += reduce ? -1 : 1;
      const original = originalSlots.get(slot.id)!;
      slot.rir = slot.sets === original.sets ? [...original.rir] : makeRir(slot.sets, original.rir.at(-1) === '<0');
      if (!validatePlan(next, exercises, true).some(i => i.severity === 'error')) { changed.add(slot.id); accepted = true; break; }
      slot.sets = oldSets; slot.rir = oldRir;
    }
    if (!accepted) break;
  }
  const afterSets = totalSets(next);
  if (afterSets === beforeSets) return { plan, decision: decision(reduce ? 'minimum' : 'hold', reduce ? 'No further whole-set reduction fits this exercise selection and the 10–20-set bounds. Ongoing sleep problems or joint pain need attention; the app will not suppress a qualifying pivot or push below the model’s minimum.' : 'No safe whole-set restoration fits yet; keep the current dose.') };
  const action = reduce ? 'reduce' : 'restore';
  return {
    plan: { ...plan, recovery: { cycleId, signature, adjustments: [...adjustments, { checkInId: check.id, reviewedWeek: week, effectiveWeek: week + 1, action, counts: Object.fromEntries(slots.map(s => [s.id, s.sets])) }] } },
    decision: decision(action, `${reduce ? 'Repeated recovery flags: reduce' : 'Three recovered, attended normal weeks: restore'} normal weekly working sets from ${beforeSets} to ${afterSets} starting in week ${week + 1}. Your original plan remains the ceiling; every selected muscle stays within 10–20 effective sets. ${reduce ? 'Any qualifying pivot still halves these adjusted counts temporarily.' : 'No extra exercises or load jumps are added.'}`, afterSets),
  };
}
