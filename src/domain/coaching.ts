import { recommendProgression } from './engine';
import { activeCycle, inActiveCycle, materializeCycles, performanceEvidence } from './training';
import { effectivePlan, reviewRecoveryPlan } from './recovery';
import type { AppData, CheckIn, Exercise, Session, Settings, TrainingPlan } from './types';
import { equipmentForPreset, equipmentLoadAtOrBelow, inferAutomaticEquipment, POUNDS_PER_KG } from './equipment';
import { sameBodyweightSetup } from './bodyweight';
import { selectProgressionLoad } from './strength';

export function trainingPlan(data: AppData, week: number): TrainingPlan {
  return data.settings.strict && data.settings.adaptiveRecovery !== false ? effectivePlan(data.plan, week, activeCycle(data).id) : data.plan;
}

/** Shared by the UI and simulations: preserve the performed prescription, apply only next-session changes. */
export function completeSession(data: AppData, session: Session, completedAt: string): AppData {
  if (data.sessions.some(s => s.id === session.id)) return data;
  if (session.exercises.some(e => e.unit !== data.settings.unit)) throw new Error('The account unit changed during this workout. Restore the workout unit before finishing.');
  if (data.settings.strict && session.exercises.some(e => e.prescribedLoad !== undefined && (e.load !== e.prescribedLoad || e.loadMode !== e.prescribedLoadMode))) throw new Error('Constrained mode requires the prescribed working load. Switch to custom mode before overriding it.');
  const final = { ...structuredClone(session), completedAt };
  const futureSlots=new Map(data.plan.days.flatMap(day=>day.exercises).map(slot=>[slot.id,slot]));
  final.exercises.forEach(e => {
    const slot=futureSlots.get(e.slotId);
    const sameMovement=slot?.exerciseId===e.exerciseId;
    const future=sameMovement?{...e,increment:slot.increment,availableLoads:slot.availableLoads,...(e.bodyweight&&slot.bodyweight?{bodyweight:{...e.bodyweight,addedLoads:slot.bodyweight.addedLoads,assistanceLoads:slot.bodyweight.assistanceLoads}}:{})}:e;
    let recommendation=recommendProgression(future,data.settings,session.pivot);
    if(sameMovement&&slot.equipmentPreset&&slot.equipmentPreset!=='custom'&&!e.bodyweight){
      const available=equipmentLoadAtOrBelow(slot,recommendation.nextLoad);
      if(available!==undefined&&Math.abs(available-recommendation.nextLoad)>.001)recommendation={action:'hold',nextLoad:available,targetReps:recommendation.targetReps,anchorIndex:recommendation.anchorIndex,reason:`Equipment options have changed. Use ${available} ${e.unit} next time; this workout keeps its recorded working weight.`};
    }
    e.recommendation=recommendation;
  });
  const plan = { ...data.plan, updatedAt: completedAt, days: data.plan.days.map(day => ({ ...day, exercises: day.exercises.map(slot => {
    const log = final.exercises.find(e => e.slotId === slot.id && e.exerciseId === slot.exerciseId);
    if (!log?.recommendation) return slot;
    if (JSON.stringify(log.bodyweight) !== JSON.stringify(slot.bodyweight)) {
      const tracked = slot.bodyweight?.tracking === 'full-body' || slot.bodyweight?.tracking === 'measured';
      const inventoryUnchanged = JSON.stringify([log.bodyweight?.addedLoads,log.bodyweight?.assistanceLoads]) === JSON.stringify([slot.bodyweight?.addedLoads,slot.bodyweight?.assistanceLoads]);
      if (!tracked || !sameBodyweightSetup(log.bodyweight,slot.bodyweight,log.unit,data.settings.unit) || !inventoryUnchanged) return slot;
      try { return { ...slot, ...selectProgressionLoad(slot,log,data.settings.unit) }; }
      catch { return slot; } // Finish the performed workout; future prescription explains missing equipment.
    }
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

export function convertPlanLoads(plan: TrainingPlan, factor: number, targetUnit?: Settings['unit'], exercises?: Exercise[]): TrainingPlan {
  const convert = (value: number) => Math.round(value * factor * 1e8) / 1e8;
  const unit=targetUnit??(Math.abs(factor-POUNDS_PER_KG)<1e-6?'lb':Math.abs(factor-1/POUNDS_PER_KG)<1e-6?'kg':undefined);
  const oldUnit=unit==='lb'?'kg':'lb',catalog=new Map(exercises?.map(e=>[e.id,e]));
  return { ...plan, days: plan.days.map(day => ({ ...day, exercises: day.exercises.map(slot => {
    const converted={ ...slot,load:convert(slot.load),increment:convert(slot.increment),
      ...(slot.availableLoads?{availableLoads:slot.availableLoads.map(convert)}:{}),
      ...(slot.bodyweight?{bodyweight:{...slot.bodyweight,resistance:convert(slot.bodyweight.resistance),addedLoads:slot.bodyweight.addedLoads.map(convert),assistanceLoads:slot.bodyweight.assistanceLoads.map(convert)}}:{}),
    };
    if(unit&&slot.equipmentPreset&&slot.equipmentPreset!=='custom'&&!slot.bodyweight){
      Object.assign(converted,equipmentForPreset(catalog.get(slot.exerciseId)??inferAutomaticEquipment(slot,oldUnit),unit,slot.equipmentPreset));
      if(slot.loadMode==='external'&&slot.load>0)converted.load=equipmentLoadAtOrBelow(converted,converted.load)??0;
    }else if(unit&&slot.bodyweight&&slot.equipmentPreset==='auto')converted.increment=unit==='lb'?5:2.5;
    return converted;
  }) })) };
}
