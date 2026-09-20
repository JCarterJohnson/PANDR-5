import { recommendProgression } from './engine';
import { activeCycle, inActiveCycle, materializeCycles, performanceEvidence } from './training';
import { effectivePlan, reviewRecoveryPlan } from './recovery';
import type { AppData, CheckIn, Session, TrainingPlan } from './types';

export function trainingPlan(data: AppData, week: number): TrainingPlan {
  return data.settings.strict && data.settings.adaptiveRecovery !== false ? effectivePlan(data.plan, week, activeCycle(data).id) : data.plan;
}

/** Shared by the UI and simulations: preserve the performed prescription, apply only next-session changes. */
export function completeSession(data: AppData, session: Session, completedAt: string): AppData {
  if (data.sessions.some(s => s.id === session.id)) return data;
  if (session.exercises.some(e => e.unit !== data.settings.unit)) throw new Error('The account unit changed during this workout. Restore the workout unit before finishing.');
  const final = { ...structuredClone(session), completedAt };
  final.exercises.forEach(e => { e.recommendation = recommendProgression(e, data.settings, session.pivot); });
  const plan = { ...data.plan, updatedAt: completedAt, days: data.plan.days.map(day => ({ ...day, exercises: day.exercises.map(slot => {
    const log = final.exercises.find(e => e.slotId === slot.id && e.exerciseId === slot.exerciseId);
    if (!log?.recommendation || JSON.stringify(log.bodyweight) !== JSON.stringify(slot.bodyweight)) return slot;
    return { ...slot, load: log.recommendation.nextLoad, loadMode: log.recommendation.nextLoadMode ?? slot.loadMode };
  }) })) };
  const next = { ...data, sessions: [...data.sessions, final], plan };
  delete next.activeSession;
  return next;
}

export function recordCheckIn(data: AppData, input: CheckIn): AppData {
  if (data.checkIns.some(c => c.id === input.id)) return data;
  const next = { ...data }; materializeCycles(next);
  const cycleId = activeCycle(next).id;
  if (next.checkIns.some(c => inActiveCycle(next, c) && c.week === input.week)) throw new Error('This training week already has a check-in.');
  const sessions = next.sessions.filter(s => inActiveCycle(next, s));
  const proof = performanceEvidence(sessions, input.week);
  const check: CheckIn = { ...input, cycleId, measuredPerformanceDip: proof.length >= 2, performanceEvidence: proof, assessmentVersion: '2' };
  const checks = [...next.checkIns.filter(c => inActiveCycle(next, c)), check];
  const reviewed = reviewRecoveryPlan(next.plan, next.exercises, checks, sessions, cycleId, input.week, next.settings.strict && next.settings.adaptiveRecovery !== false && !next.activeSession);
  check.coaching = reviewed.decision;
  return { ...next, plan: reviewed.plan, checkIns: [...next.checkIns, check] };
}

export function convertPlanLoads(plan: TrainingPlan, factor: number): TrainingPlan {
  const convert = (value: number) => Math.round(value * factor * 10000) / 10000;
  return { ...plan, days: plan.days.map(day => ({ ...day, exercises: day.exercises.map(slot => ({ ...slot,
    load: convert(slot.load), increment: convert(slot.increment),
    ...(slot.availableLoads ? { availableLoads: slot.availableLoads.map(convert) } : {}),
    ...(slot.bodyweight ? { bodyweight: { resistance: convert(slot.bodyweight.resistance), addedLoads: slot.bodyweight.addedLoads.map(convert), assistanceLoads: slot.bodyweight.assistanceLoads.map(convert) } } : {}),
  })) })) };
}
