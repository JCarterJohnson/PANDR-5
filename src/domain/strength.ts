import type { AppData, Exercise, PlanDay, PlanExercise, Rir, Session, StrengthAssessment, StrengthDraft, StrengthState, TrainingPlan } from './types';
import { createSession, getWeek, isPivotWeek } from './engine';
import { activeCycle, inActiveCycle, localDate, materializeCycles } from './training';
import { workingResistance } from './resistance';

export type Curve = 'general' | 'bench' | 'leg-press';
// Nuzzo et al., Sports Medicine 2024, Figs 2–4. Mean reps at 95…45% 1RM.
// The 1 rep / 100% endpoint and linear interpolation are explicit app policies.
const means: Record<Curve, number[]> = {
  general: [3.28, 4.94, 7.15, 9.75, 12.37, 14.80, 17.11, 19.53, 22.43, 25.99, 30.37],
  bench: [2.59, 4.11, 6.23, 8.82, 11.51, 14.08, 16.59, 19.34, 22.79, 27.25, 33.01],
  'leg-press': [7.04, 8.69, 10.69, 13.05, 15.79, 18.96, 22.59, 26.74, 31.47, 36.86, 42.96],
};
export function curveFor(exercise: Exercise): Curve {
  if (/leg press/i.test(exercise.name) && !/single|one[- ]leg|unilateral/i.test(exercise.name)) return 'leg-press';
  // Do not extend the bench evidence to all pressing movements or dumbbell variants.
  if (/bench press/i.test(exercise.name) && /barbell|smith/i.test(exercise.equipment) && !/incline|decline|dumbbell/i.test(exercise.name)) return 'bench';
  return 'general';
}
export function fractionAt(reps: number, curve: Curve): number {
  if (!Number.isFinite(reps) || reps < 1 || reps > 30) throw new Error('Load estimates support 1–30 repetitions including RIR.');
  const points = [[1, 1], ...means[curve].map((r, i) => [r, .95 - i * .05])];
  for (let i = 1; i < points.length; i++) {
    const [r, f] = points[i], [prevR, prevF] = points[i - 1];
    if (reps <= r) return prevF + (f - prevF) * (reps - prevR) / (r - prevR);
  }
  throw new Error('Target outside the supported load–repetition curve.');
}
export const rirValue = (rir: Rir) => rir === '<0' ? 0 : rir === '0-1' ? .5 : rir;
export const toKg = (value: number, unit: 'kg' | 'lb') => unit === 'kg' ? value : value / 2.2046226218;
export const fromKg = (value: number, unit: 'kg' | 'lb') => unit === 'kg' ? value : value * 2.2046226218;
const state = (data: AppData): StrengthState => data.strength ?? { assessments: [] };
export const needsOnboarding = (data: AppData) => !state(data).onboardingCompletedAt && (!!state(data).onboardingStartedAt || !!state(data).active?.initial || !data.sessions.some(s => s.completedAt && s.exercises.some(e => e.sets.some(r => r.completed))));
export function latestAssessment(data: AppData, exerciseId: string): StrengthAssessment | undefined {
  return [...state(data).assessments].reverse().filter(a => a.exerciseId === exerciseId).sort((a,b) => Date.parse(b.completedAt)-Date.parse(a.completedAt)).at(0);
}
function compatible(a: { bodyweight?: {resistance: number}; loadMode: string }, b: {bodyweight?: {resistance: number}; loadMode: string}) {
  return Boolean(a.bodyweight) === Boolean(b.bodyweight) && (a.bodyweight || (a.loadMode === 'external' && b.loadMode === 'external'));
}
export function assessmentDue(data: AppData, day: PlanDay, now = new Date()): { slot: PlanExercise; reason: 'initial' | 'new' | 'stale' | 'setup' }[] {
  const initial = needsOnboarding(data);
  const slots = day.exercises;
  return slots.filter((slot,index)=>slots.findIndex(s=>s.exerciseId===slot.exerciseId)===index).flatMap<{slot: PlanExercise; reason: 'initial' | 'new' | 'stale' | 'setup'}>(slot => {
    const baseline = latestAssessment(data, slot.exerciseId);
    if (!baseline) return [{slot, reason: initial ? 'initial' as const : 'new' as const}];
    if (!compatible(baseline,slot)) return [{slot,reason:'setup' as const}];
    const exposures = data.sessions.filter(s => s.completedAt && s.exercises.some(e => e.exerciseId === slot.exerciseId && compatible(e,slot) && e.sets.some(r => r.completed && r.reps > 0))).map(s => s.date);
    const last = [baseline.date, ...exposures].sort().at(-1)!;
    // Calendar days, independent of DST or local clock time.
    const age = (Date.parse(localDate(now)) - Date.parse(last)) / 86400000;
    return age >= 14 ? [{slot,reason:'stale' as const}] : [];
  });
}

/** Rebuild only the live assessment queue; historical observations remain immutable.
 * Slot IDs identify replacements in old persisted drafts. Existing day-scoped visits
 * stay scoped, while newly selected, unassessed movements join an ongoing visit.
 */
export function reconcileAssessment(data: AppData, previousPlan?: TrainingPlan, now = new Date()): AppData {
  const active=state(data).active;
  if(!active)return data;
  const days=data.plan.days.filter(day=>day.kind==='training');
  const entries=days.flatMap(day=>day.exercises.map(slot=>({day,slot})));
  const due=new Map(days.flatMap(day=>assessmentDue(data,day,now)).map(item=>[item.slot.exerciseId,item]));
  const prior=new Map(active.items.map(item=>[item.exerciseId,item]));
  const wanted=new Set<string>();
  const scope=new Set([active.dayId]);
  for(const item of active.items){
    const current=entries.find(e=>e.slot.id===item.slot.id)??entries.find(e=>e.slot.exerciseId===item.exerciseId);
    if(entries.some(e=>e.slot.exerciseId===item.exerciseId))wanted.add(item.exerciseId);
    if(current){scope.add(current.day.id);if(due.has(current.slot.exerciseId))wanted.add(current.slot.exerciseId)}
  }
  const focus=days.find(day=>day.id===active.dayId);
  for(const day of days.filter(day=>scope.has(day.id)))for(const item of assessmentDue(data,day,now))wanted.add(item.slot.exerciseId);
  if(previousPlan){
    const oldIds=new Set(previousPlan.days.flatMap(day=>day.exercises.map(slot=>slot.exerciseId)));
    for(const {slot} of entries)if(!oldIds.has(slot.exerciseId)&&due.has(slot.exerciseId))wanted.add(slot.exerciseId);
  }
  const items:StrengthDraft[]=[];
  for(const {slot} of entries){
    if(!wanted.has(slot.exerciseId)||items.some(item=>item.exerciseId===slot.exerciseId))continue;
    const saved=prior.get(slot.exerciseId);
    const previousSlot=previousPlan?.days.flatMap(day=>day.exercises).find(s=>s.id===slot.id);
    const setupChanged=!saved||!!saved.resultId&&!compatible(saved.slot,slot)||!!previousSlot&&JSON.stringify([previousSlot.bodyweight,previousSlot.loadMode])!==JSON.stringify([slot.bodyweight,slot.loadMode]);
    if(saved&&(!setupChanged||saved.resultId&&compatible(saved.slot,slot))){
      // Keep an unfinished test's measured inputs and inline equipment setup.
      // A deliberate plan edit refreshes its snapshot; a reload alone does not
      // erase equipment entered in the assessment but not yet recorded.
      const snapshot=previousSlot&&JSON.stringify(previousSlot)!==JSON.stringify(slot)?structuredClone(slot):{...structuredClone(saved.slot),id:slot.id,sets:slot.sets,repMin:slot.repMin,repMax:slot.repMax,rir:[...slot.rir]};
      items.push({...structuredClone(saved),slot:snapshot});
    }else items.push({exerciseId:slot.exerciseId,slot:structuredClone(slot),reason:due.get(slot.exerciseId)?.reason??'setup',method:'failure',reps:0,load:slot.load,loadMode:slot.loadMode,unit:data.settings.unit,setup:'',confirmed:false});
  }
  const dayId=focus?.id??entries.find(e=>e.slot.exerciseId===items[0]?.exerciseId)?.day.id;
  if(items.length&&active.dayId===dayId&&JSON.stringify(active.items)===JSON.stringify(items))return data;
  const next=structuredClone(data);
  if(items.length)next.strength!.active={...active,dayId:dayId!,items};
  else delete next.strength!.active;
  return next;
}
export function assessmentEstimate(a: StrengthAssessment): number {
  return toKg(workingResistance(a), a.unit) / fractionAt(a.reps, a.curve);
}
export function estimatedCapacity(data: AppData, slot: PlanExercise): { kg: number; curve: Curve; source: string } | undefined {
  const a = latestAssessment(data,slot.exerciseId);
  if (!a || !compatible(a,slot)) return;
  // Immutable assessment capacity. It is used to initialize a prescription only;
  // completed-workout recommendations, not a second estimator, own progression.
  return {kg:assessmentEstimate(a),curve:a.curve,source:a.id};
}
export function selectLoad(slot: PlanExercise, resistance: number): { load: number; loadMode: PlanExercise['loadMode'] } {
  if (!Number.isFinite(resistance) || resistance <= 0) throw new Error('A positive resistance estimate is required.');
  let choices: { load: number; loadMode: PlanExercise['loadMode']; resistance: number }[];
  if (slot.bodyweight) {
    const base = slot.bodyweight.resistance;
    choices = [{load:0,loadMode:'bodyweight',resistance:base}, ...slot.bodyweight.addedLoads.map(load => ({load,loadMode:'external' as const,resistance:base+load})), ...slot.bodyweight.assistanceLoads.map(load => ({load,loadMode:'assistance' as const,resistance:base-load}))];
  } else {
    if (slot.loadMode !== 'external') throw new Error('Configure measured bodyweight resistance before estimating assisted or bodyweight loads.');
    const loads = slot.availableLoads ?? [Math.floor((resistance+1e-8)/slot.increment)*slot.increment];
    choices = loads.map(load => ({load,loadMode:'external',resistance:load}));
  }
  const selected = choices.filter(c => c.resistance > 0 && c.resistance <= resistance+1e-6).sort((a,b) => b.resistance-a.resistance)[0];
  if (!selected) throw new Error('No available resistance is light enough for this target. Add a lighter load or measured assistance in your plan.');
  return {load:Math.round(selected.load*1e6)/1e6,loadMode:selected.loadMode};
}
export function prescribedSlot(data: AppData, slot: PlanExercise): PlanExercise {
  const capacity = estimatedCapacity(data,slot);
  if (!capacity) throw new Error('Complete an assessment for this exact exercise first.');
  // Same prescription: preserve double progression exactly, including equipment holds.
  const a = latestAssessment(data,slot.exerciseId)!;
  const completed = data.sessions.filter(s => s.completedAt && Date.parse(s.completedAt) > Date.parse(a.completedAt) && !s.pivot).sort((x,y) => Date.parse(y.completedAt!)-Date.parse(x.completedAt!)).flatMap(s => s.exercises).filter(e => e.exerciseId === slot.exerciseId && e.recommendation && e.sets.some(set=>set.completed) && compatible(e,slot));
  const previous = completed.find(e => e.slotId === slot.id) ?? completed[0];
  if (previous) {
    const next = { ...slot, load: fromKg(toKg(previous.recommendation!.nextLoad,previous.unit),data.settings.unit), loadMode: previous.recommendation!.nextLoadMode ?? previous.loadMode };
    const sameRange = previous.repMin === slot.repMin && previous.repMax === slot.repMax;
    if(sameRange) {
      const epsilon=.001;
      const available = next.bodyweight ? next.loadMode==='bodyweight' || (next.loadMode==='assistance'?next.bodyweight.assistanceLoads:next.bodyweight.addedLoads).some(n=>Math.abs(n-next.load)<epsilon)
        : next.availableLoads ? next.availableLoads.some(n=>Math.abs(n-next.load)<epsilon)
        : previous.increment !== undefined && Math.abs(fromKg(toKg(previous.increment,previous.unit),data.settings.unit)-next.increment)<epsilon || Math.abs(next.load/next.increment-Math.round(next.load/next.increment))<epsilon;
      if(!available) throw new Error('The prescribed progression load is unavailable with this equipment. Restore the required load option or reassess this exercise.');
      return next;
    }
    // A changed rep/RIR prescription is translated from the last prescribed
    // progression load, never re-estimated from arbitrary training sets.
    const oldReps = previous.repMin + Math.max(0,...previous.targetRir.filter(r=>r!=='<0').map(rirValue));
    const newReps = slot.repMin + Math.max(0,...slot.rir.filter(r=>r!=='<0').map(rirValue));
    return {...slot,...selectLoad(slot,workingResistance(next)*fractionAt(newReps,capacity.curve)/fractionAt(oldReps,capacity.curve))};
  }
  const effortReps = slot.repMin + Math.max(0,...slot.rir.filter(r => r !== '<0').map(rirValue));
  return {...slot,...selectLoad(slot,fromKg(capacity.kg,data.settings.unit)*fractionAt(effortReps,capacity.curve))};
}
export function beginAssessment(data: AppData, day: PlanDay, now = new Date(), force = false): AppData {
  if (data.activeSession) throw new Error('Finish the current workout first.');
  data=reconcileAssessment(data,undefined,now);
  const due = force && !needsOnboarding(data) ? [...new Map(day.exercises.map(slot => [slot.exerciseId,slot])).values()].map(slot => ({slot,reason:'setup' as const})) : assessmentDue(data,day,now);
  if (!due.length && !state(data).active) throw new Error('No exercises require assessment.');
  const next = structuredClone(data);
  const prior = state(next).active;
  const initial = needsOnboarding(data);
  const items = due.map(({slot,reason}) => {
    const draft = prior?.items.find(i => i.exerciseId === slot.exerciseId && !i.resultId);
    return draft ?? {exerciseId:slot.exerciseId,slot:structuredClone(slot),reason,method:'failure' as const,reps:0,load:slot.load,loadMode:slot.loadMode,unit:data.settings.unit,setup:'',confirmed:false};
  });
  next.strength = {...state(next), ...(initial ? {onboardingStartedAt:state(next).onboardingStartedAt ?? now.toISOString()} : {}), active:{id:crypto.randomUUID(),initial,paused:false,startedAt:prior?.startedAt ?? now.toISOString(),dayId:day.id,items:[...items,...(prior?.items.filter(i=>!items.some(item=>item.exerciseId===i.exerciseId)) ?? [])]}};
  return next;
}
export function recordAssessment(data: AppData, index: number, draft: StrengthDraft, now = new Date()): AppData {
  if (data.activeSession) throw new Error('Finish the current workout before recording an assessment.');
  const active = state(data).active;
  if (!active || active.items[index]?.exerciseId !== draft.exerciseId) throw new Error('This assessment is no longer active.');
  if (active.items[index].resultId) return data;
  if (draft.unit !== data.settings.unit) throw new Error('The weight unit changed during assessment. Restore the test unit before saving.');
  if (!draft.confirmed || !draft.setup.trim()) throw new Error('Record the exact setup and confirm a clean, pain-free maximum effort.');
  if (!Number.isInteger(draft.reps) || (draft.method === '1rm' ? draft.reps !== 1 : draft.reps < 2 || draft.reps > 15)) throw new Error('Record one successful rep for a 1RM, or 2–15 clean reps to failure.');
  if (!Number.isFinite(draft.load) || draft.load < 0 || (draft.loadMode === 'bodyweight' && draft.load !== 0)) throw new Error('Enter a valid test load.');
  const bodyweight = draft.slot.bodyweight;
  if ((draft.loadMode !== 'external' && !bodyweight) || (bodyweight && (bodyweight.resistance <= 0 || (draft.loadMode === 'assistance' && draft.load >= bodyweight.resistance)))) throw new Error('Record measured bodyweight resistance; assistance must be less than it.');
  if (workingResistance({...draft,bodyweight}) <= 0) throw new Error('Test resistance must be positive.');
  const exercise = data.exercises.find(e => e.id === draft.exerciseId);
  if (!exercise) throw new Error('Exercise is missing from the library.');
  const result: StrengthAssessment = {id:crypto.randomUUID(),exerciseId:draft.exerciseId,name:exercise.name,date:localDate(now),completedAt:now.toISOString(),method:draft.method,reps:draft.reps,load:draft.load,loadMode:draft.loadMode,unit:draft.unit,...(bodyweight?{bodyweight:structuredClone(bodyweight)}:{}),setup:draft.setup.trim(),curve:curveFor(exercise),version:1};
  const next = structuredClone(data);
  next.strength!.assessments.push(result);
  // Preserve the measured resistance setup in every current slot of this movement.
  next.plan.days.forEach(day => day.exercises.forEach(slot => {
    if(slot.exerciseId !== draft.exerciseId) return;
    slot.bodyweight = bodyweight ? structuredClone(bodyweight) : undefined;
    slot.availableLoads = draft.slot.availableLoads;
    slot.increment = draft.slot.increment;
    slot.loadMode = draft.loadMode; slot.load = draft.load;
  }));
  next.strength!.active!.items[index] = {...draft,resultId:result.id};
  return next;
}
export function pauseAssessment(data: AppData): AppData {
  const next = structuredClone(data);
  if (next.strength?.active) next.strength.active.paused = true;
  return next;
}
export function finishAssessment(data: AppData, now = new Date()): AppData {
  const current = state(data).active;
  if (!current || !current.items.some(i => i.resultId)) throw new Error('Save at least one test result before finishing the assessment.');
  const next = pauseAssessment(data);
  // A visit may end with untested movements. They remain saved for another visit.
  if (current.initial) {
    next.strength!.onboardingStartedAt ??= current.startedAt;
    const missing = next.plan.days.filter(d=>d.kind==='training').flatMap(d=>d.exercises).some(slot=>!estimatedCapacity(next,slot));
    if (!missing) next.strength!.onboardingCompletedAt = now.toISOString();
  }
  if (current.items.every(i=>i.resultId)) delete next.strength!.active;
  return next;
}
export function startTraining(data: AppData, day: PlanDay, bypass = false, now = new Date()): AppData {
  if (data.activeSession) throw new Error('A workout is already active.');
  const initial = needsOnboarding(data);
  if (initial && day.exercises.some(slot=>!estimatedCapacity(data,slot))) throw new Error('Complete the initial strength assessment for every exercise in this workout before training.');
  const cycle = activeCycle(data);
  if (cycle.endedAt || localDate(now) < cycle.startDate) throw new Error('Your training cycle is not active today.');
  if (assessmentDue(data,day,now).length && (data.settings.strict || !bypass)) throw new Error('Complete the required assessment, or explicitly bypass it in custom mode.');
  const week = getWeek(cycle.startDate,now);
  if (data.settings.strict && data.sessions.some(s => inActiveCycle(data,s) && s.week === week && s.dayId === day.id)) throw new Error('This session is already completed this week.');
  const prescribed = {...day,exercises:day.exercises.map(slot => {
    const baseline = latestAssessment(data,slot.exerciseId);
    const trained = baseline && data.sessions.some(s=>s.completedAt && Date.parse(s.completedAt)>Date.parse(baseline.completedAt) && s.exercises.some(e=>e.exerciseId===slot.exerciseId && e.sets.some(r=>r.completed)));
    if (!data.settings.strict && (!baseline || trained || (bypass && assessmentDue(data,day,now).some(d=>d.slot.exerciseId===slot.exerciseId)))) return slot;
    return prescribedSlot(data,slot);
  })};
  const session = createSession(prescribed,data.exercises,data.settings,week,isPivotWeek(data.checkIns.filter(c => inActiveCycle(data,c)),week));
  session.date=localDate(now); session.startedAt=now.toISOString(); session.assessmentBypassed = bypass && assessmentDue(data,day,now).length > 0;
  const next = pauseAssessment(data); materializeCycles(next); session.cycleId=activeCycle(next).id;
  if (initial) {
    next.strength = {...state(next),onboardingStartedAt:state(next).onboardingStartedAt ?? now.toISOString()};
    if (next.plan.days.filter(d=>d.kind==='training').every(d=>d.exercises.every(slot=>!!estimatedCapacity(next,slot)))) next.strength.onboardingCompletedAt = now.toISOString();
  }
  session.exercises.forEach(e => { e.strengthAssessmentId=latestAssessment(data,e.exerciseId)?.id; e.prescribedLoad=e.load; e.prescribedLoadMode=e.loadMode; });
  next.activeSession=session;
  return next;
}
export function suggestedReps(data: AppData, session: Session, index: number): (number | undefined)[] {
  const log = session.exercises[index];
  const slot = data.plan.days.flatMap(d => d.exercises).find(s => s.id === log.slotId);
  const capacity = slot && estimatedCapacity(data,slot);
  if (!capacity) return log.sets.map(() => undefined);
  const baseline=latestAssessment(data,log.exerciseId)!;
  const previous=data.sessions.filter(s=>s.completedAt && Date.parse(s.completedAt)>Date.parse(baseline.completedAt) && !s.pivot).sort((a,b)=>Date.parse(b.completedAt!)-Date.parse(a.completedAt!)).flatMap(s=>s.exercises).find(e=>e.exerciseId===log.exerciseId && e.slotId===log.slotId && e.recommendation && e.sets.some(set=>set.completed));
  // After initialization use the existing progression target; do not keep comparing
  // a stronger lifter with their old fresh-set maximum.
  if(previous && previous.repMin===log.repMin && previous.repMax===log.repMax) {
    return log.sets.map((_,i)=>log.targetRir[i]==='<0'?undefined:Math.max(log.repMin,Math.min(log.repMax,previous.recommendation!.targetReps)));
  }
  const ratio=toKg(workingResistance(log),log.unit)/capacity.kg;
  let failureReps=1;
  for(let r=1;r<=30;r+=.1) { if(fractionAt(r,capacity.curve)>=ratio) failureReps=r; }
  return log.sets.map((_,i) => {
    if(log.targetRir[i]==='<0') return undefined;
    const prior=log.sets.slice(0,i).filter(s=>s.completed && s.rir>=0).at(-1);
    const available=prior ? Math.min(failureReps,prior.reps+prior.rir) : failureReps;
    return Math.max(1,Math.min(log.repMax,Math.floor(available-rirValue(log.targetRir[i]))));
  });
}
