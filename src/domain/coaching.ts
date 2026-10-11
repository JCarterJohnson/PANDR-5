import { recommendProgression } from './engine';
import { activeCycle, inActiveCycle, materializeCycles, performanceEvidence } from './training';
import { effectivePlan, reviewRecoveryPlan } from './recovery';
import type { AppData, CheckIn, Exercise, Session, SessionProgression, Settings, TrainingPlan } from './types';
import { equipmentForPreset, equipmentLoadAtOrBelow, inferAutomaticEquipment, POUNDS_PER_KG } from './equipment';
import { sameBodyweightSetup } from './bodyweight';
import { selectProgressionLoad } from './strength';
import { isRepsOnly } from './bodyweight';

export function trainingPlan(data: AppData, week: number): TrainingPlan {
  return data.settings.strict && data.settings.adaptiveRecovery !== false ? effectivePlan(data.plan, week, activeCycle(data).id) : data.plan;
}

/** Shared by the UI and simulations: preserve the performed prescription, apply only next-session changes. */
export function completeSession(data: AppData, session: Session, completedAt: string): AppData {
  if (data.sessions.some(s => s.id === session.id)) return data;
  if (session.voidedAt) throw new Error('A voided workout cannot be completed again. Start a new session.');
  if (data.sessions.some(s => !s.voidedAt && s.completedAt && inActiveCycle(data, s) && inActiveCycle(data, session) && s.dayId === session.dayId && s.week === session.week)) throw new Error('This workout is already completed this week. Restart it explicitly before training again.');
  if (session.exercises.some(e => e.unit !== data.settings.unit)) throw new Error('The account unit changed during this workout. Restore the workout unit before finishing.');
  if (data.settings.strict && session.exercises.some(e => !e.actualLoadOverride && e.prescribedLoad !== undefined && (e.load !== e.prescribedLoad || e.loadMode !== e.prescribedLoadMode))) throw new Error('Confirm the actual working load before saving a change to the prescription.');
  const final = { ...structuredClone(session), completedAt };
  const futureSlots=new Map(data.plan.days.flatMap(day=>day.exercises).map(slot=>{
    const log=final.exercises.find(e=>e.slotId===slot.id&&e.exerciseId===slot.exerciseId);
    if(!log?.actualLoadOverride||!log.bodyweight||!slot.bodyweight||isRepsOnly(slot.bodyweight)||!log.sets.some(set=>set.completed)
      ||!sameBodyweightSetup(log.bodyweight,slot.bodyweight,log.unit,data.settings.unit)||log.load<=0
      ||log.loadMode==='bodyweight'||log.loadMode==='assistance'&&log.load>=slot.bodyweight.resistance)return [slot.id,slot] as const;
    // A load actually used confirms that single equipment option, not a guessed stack.
    const key=log.loadMode==='assistance'?'assistanceLoads':'addedLoads';
    const bodyweight={...slot.bodyweight,[key]:[...new Set([...slot.bodyweight[key],log.load])].sort((a,b)=>a-b)};
    return [slot.id,{...slot,bodyweight}] as const;
  }));
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
  const progression: SessionProgression[] = [];
  const plan = { ...data.plan, updatedAt: completedAt, days: data.plan.days.map(day => ({ ...day, exercises: day.exercises.map(originalSlot => {
    const slot=futureSlots.get(originalSlot.id)!;
    const log = final.exercises.find(e => e.slotId === slot.id && e.exerciseId === slot.exerciseId);
    if (!log?.recommendation) return slot;
    if (isRepsOnly(slot.bodyweight) && (log.loadMode !== 'bodyweight' || log.load !== 0)) return slot;
    if (JSON.stringify(log.bodyweight) !== JSON.stringify(slot.bodyweight)) {
      const tracked = slot.bodyweight?.tracking === 'full-body' || slot.bodyweight?.tracking === 'measured';
      const inventoryUnchanged = JSON.stringify([log.bodyweight?.addedLoads,log.bodyweight?.assistanceLoads]) === JSON.stringify([slot.bodyweight?.addedLoads,slot.bodyweight?.assistanceLoads]);
      if (!tracked || !sameBodyweightSetup(log.bodyweight,slot.bodyweight,log.unit,data.settings.unit) || !inventoryUnchanged && !log.actualLoadOverride) return slot;
      try {
        const updated = { ...slot, ...selectProgressionLoad(slot,log,data.settings.unit) };
        progression.push({slotId:slot.id,exerciseId:slot.exerciseId,unit:data.settings.unit,beforeLoad:slot.load,beforeLoadMode:slot.loadMode,afterLoad:updated.load,afterLoadMode:updated.loadMode,...(slot.bodyweight?{bodyweight:structuredClone(slot.bodyweight)}:{})});
        return updated;
      }
      catch { return slot; } // Finish the performed workout; future prescription explains missing equipment.
    }
    const updated = { ...slot, load: log.recommendation.nextLoad, loadMode: log.recommendation.nextLoadMode ?? slot.loadMode };
    progression.push({slotId:slot.id,exerciseId:slot.exerciseId,unit:data.settings.unit,beforeLoad:slot.load,beforeLoadMode:slot.loadMode,afterLoad:updated.load,afterLoadMode:updated.loadMode,...(slot.bodyweight?{bodyweight:structuredClone(slot.bodyweight)}:{})});
    return updated;
  }) })) };
  final.progression = progression;
  const next = { ...data, sessions: [...data.sessions, final], plan };
  delete next.activeSession;
  return next;
}

export function recordCheckIn(data: AppData, input: CheckIn): AppData {
  if (data.checkIns.some(c => c.id === input.id)) return data;
  const next = { ...data }; materializeCycles(next);
  const cycleId = activeCycle(next).id;
  if (next.checkIns.some(c => inActiveCycle(next, c) && c.week === input.week)) throw new Error('This training week already has a check-in.');
  const sessions = next.sessions.filter(s => !s.voidedAt && inActiveCycle(next, s));
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
