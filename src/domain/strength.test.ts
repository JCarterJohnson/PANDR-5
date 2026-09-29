import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/seed';
import { assessmentDue, assessmentEstimate, beginAssessment, estimatedCapacity, finishAssessment, fractionAt, needsOnboarding, prescribedSlot, recordAssessment, selectLoad, startTraining, suggestedReps, pauseAssessment } from './strength';
import { completeSession, convertPlanLoads } from './coaching';
import { completedWeeklyVolume } from './training';
import { exportBackup, exportCsv, parseBackup, restoreBackup } from '../services/backup';
import { validateAppData } from './validation';
const now=new Date('2026-09-01T12:00:00');
function base() {const d=createInitialData();d.settings.startDate='2026-09-01';d.plan.days=[{...d.plan.days[0],exercises:[{...d.plan.days[0].exercises[0],sets:3,rir:[2,1,'0-1'],repMin:8,repMax:12,increment:.5}]}];return d;}
function assessed() {let d=base();d=beginAssessment(d,d.plan.days[0],now);d=recordAssessment(d,0,{...d.strength!.active!.items[0],load:80,reps:8,confirmed:true,setup:'Rack A, flat bench, full ROM, total bar weight'},now);return finishAssessment(d,now);}
function firstWorkout(d=assessed()) {return startTraining(d,d.plan.days[0],false,new Date('2026-09-02T12:00:00'));}
describe('exercise-specific strength baseline',()=>{
 it('requires onboarding in both modes and de-duplicates repeated exercise slots',()=>{
  const d=base();d.plan.days[0].exercises.push({...d.plan.days[0].exercises[0],id:'duplicate-slot'});d.settings.strict=false;
  expect(assessmentDue(d,d.plan.days[0],now)).toHaveLength(1);
  expect(()=>startTraining(d,d.plan.days[0],true,now)).toThrow('initial strength');
  expect(needsOnboarding(assessed())).toBe(false);
 });
 it('anchors the measured point, is monotone, separates exercises, and refuses extrapolation',()=>{
  const d=assessed(),a=d.strength!.assessments[0];
  expect(assessmentEstimate(a)*fractionAt(8,'bench')).toBeCloseTo(80);
  for(const curve of ['general','bench','leg-press'] as const){expect(fractionAt(1,curve)).toBe(1);for(let r=2;r<=30;r++)expect(fractionAt(r,curve)).toBeLessThan(fractionAt(r-1,curve));}
  expect(fractionAt(10,'bench')).toBeLessThan(fractionAt(10,'leg-press'));
  expect(()=>fractionAt(31,'general')).toThrow();expect(()=>fractionAt(NaN,'general')).toThrow();
 });
 it('keeps assessment separate from volume and permits same-day training',()=>{
  const d=assessed();expect(d.sessions).toHaveLength(0);expect(d.settings.startDate).toBe('2026-09-01');expect(completedWeeklyVolume(d,1).every(r=>r.total===0)).toBe(true);
  expect(startTraining(d,d.plan.days[0],false,now).activeSession).toBeTruthy();
  expect(firstWorkout(d).activeSession!.exercises[0].load).toBeGreaterThan(0);
 });
 it('rejects unconfirmed, painful/invalid, zero-load and out-of-range test records',()=>{
  const d=beginAssessment(base(),base().plan.days[0],now),draft={...d.strength!.active!.items[0],load:80,reps:8,confirmed:true,setup:'Rack A'};
  for(const edit of [{confirmed:false},{setup:''},{load:0},{load:NaN},{reps:16},{reps:2.5},{method:'1rm' as const,reps:2}])expect(()=>recordAssessment(d,0,{...draft,...edit},now)).toThrow();
  const single=recordAssessment(d,0,{...draft,method:'1rm',reps:1},now);expect(assessmentEstimate(single.strength!.assessments[0])).toBe(80);
  expect(recordAssessment(single,0,draft,now)).toEqual(single);
 });
 it('triggers at exactly 14 calendar days and only counts actually completed exposures',()=>{
  let d=assessed();expect(assessmentDue(d,d.plan.days[0],new Date('2026-09-14T23:59:00'))).toHaveLength(0);
  expect(assessmentDue(d,d.plan.days[0],new Date('2026-09-15T00:00:00'))[0].reason).toBe('stale');
  d=firstWorkout(d);const s=d.activeSession!;s.exercises[0].sets[0]={index:0,reps:8,rir:2,completed:true};s.date='2026-09-10';d=completeSession(d,s,'2026-09-10T12:00:00Z');
  expect(assessmentDue(d,d.plan.days[0],new Date('2026-09-23T12:00:00'))).toHaveLength(0);
  expect(assessmentDue(d,d.plan.days[0],new Date('2026-09-24T12:00:00'))[0].reason).toBe('stale');
  d.sessions[0].exercises[0].sets[0].completed=false;expect(assessmentDue(d,d.plan.days[0],new Date('2026-09-15T12:00:00'))).toHaveLength(1);
 });
 it('limits bypass to later assessments in custom mode and records the decision',()=>{
  const d=assessed(),later=new Date('2026-09-15T12:00:00');
  expect(()=>startTraining(d,d.plan.days[0],true,later)).toThrow('required assessment');
  d.settings.strict=false;expect(()=>startTraining(d,d.plan.days[0],false,later)).toThrow('required assessment');
  expect(startTraining(d,d.plan.days[0],true,later).activeSession!.assessmentBypassed).toBe(true);
 });
 it('rounds down to available resistance and refuses to invent equipment',()=>{
  const slot=base().plan.days[0].exercises[0];expect(selectLoad({...slot,availableLoads:[20,25,30]},28).load).toBe(25);
  expect(()=>selectLoad({...slot,availableLoads:[30]},28)).toThrow('No available');
  expect(()=>selectLoad({...slot,loadMode:'assistance'},28)).toThrow('measured');
  const bw={...slot,bodyweight:{resistance:80,addedLoads:[5],assistanceLoads:[10,20]}};
  expect(selectLoad(bw,72)).toMatchObject({load:10,loadMode:'assistance'});
  expect(selectLoad(bw,84)).toMatchObject({load:0,loadMode:'bodyweight'});
  expect(selectLoad(bw,86)).toMatchObject({load:5,loadMode:'external'});
 });
 it('uses total resistance for assisted tests and preserves equipment across all slots',()=>{
  const d=base();d.plan.days[0].exercises.push({...d.plan.days[0].exercises[0],id:'second'});const started=beginAssessment(d,d.plan.days[0],now),item=started.strength!.active!.items[0];
  const recorded=recordAssessment(started,0,{...item,loadMode:'assistance',load:20,reps:8,setup:'80 kg whole body, 20 kg measured assistance',confirmed:true,slot:{...item.slot,bodyweight:{resistance:80,addedLoads:[2.5],assistanceLoads:[20,30,40]}}},now);
  expect(assessmentEstimate(recorded.strength!.assessments[0])*fractionAt(8,'bench')).toBeCloseTo(60);
  expect(recorded.plan.days[0].exercises.every(s=>s.bodyweight?.resistance===80)).toBe(true);expect(()=>validateAppData(finishAssessment(recorded,now))).not.toThrow();
 });
 it('normalizes units without mutating baseline observations',()=>{
  const d=assessed(),before=prescribedSlot(d,d.plan.days[0].exercises[0]);d.plan=convertPlanLoads(d.plan,2.2046226218);d.settings.unit='lb';
  const after=prescribedSlot(d,d.plan.days[0].exercises[0]);expect(after.load/2.2046226218).toBeCloseTo(before.load,2);expect(d.strength!.assessments[0].unit).toBe('kg');
 });
 it('retains baselines outside the plan, restores them, and exports them independently of workouts',()=>{
  const d=assessed();const restored=parseBackup(exportBackup(d));expect(restored).toEqual(d);
  const csv=exportCsv(d);expect(csv).toContain('strength_assessment');expect(csv).toContain('estimated_1rm_kg');
  const old=base();const merged=restoreBackup(d,old);expect(merged.strength!.assessments).toEqual(d.strength!.assessments);
  d.plan.days[0].exercises=[];expect(parseBackup(exportBackup(d)).strength!.assessments).toHaveLength(1);
 });
 it('keeps double progression authoritative and rejects constrained overrides',()=>{
  let d=firstWorkout();let s=d.activeSession!;const e=s.exercises[0];e.sets.forEach(r=>{r.reps=12;r.rir=1;r.completed=true});
  e.load+=1;expect(()=>completeSession(d,s,'2026-09-02T13:00:00Z')).toThrow('prescribed');e.load-=1;
  d=completeSession(d,s,'2026-09-02T13:00:00Z');expect(prescribedSlot(d,d.plan.days[0].exercises[0]).load).toBe(d.sessions[0].exercises[0].recommendation!.nextLoad);
  s=structuredClone(s);s.id='custom-override';s.exercises[0].load=50;d.settings.strict=false;const custom=completeSession(d,s,'2026-09-03T13:00:00Z');expect(custom.sessions.at(-1)!.exercises[0].load).toBe(50);expect(exportCsv(custom)).toContain('prescribed_load');
 });
 it('excludes finishers and pivot sessions from capacity updates and adapts RIR guidance',()=>{
  const d=firstWorkout(),slot=d.plan.days[0].exercises[0],kg=estimatedCapacity(d,slot)!.kg,s=d.activeSession!;
  expect(suggestedReps(d,s,0)[0]).toBeGreaterThanOrEqual(8);
  s.exercises[0].sets[0]={index:0,reps:7,rir:1,completed:true};expect(suggestedReps(d,s,0)[1]).toBeLessThanOrEqual(7);
  s.pivot=true;s.exercises[0].sets[2]={index:2,reps:15,rir:0,completed:true};const next=completeSession(d,s,'2026-09-02T13:00:00Z');expect(estimatedCapacity(next,slot)!.kg).toBe(kg);
 });
 it('validates assessment structures at import boundaries',()=>{
  const d=assessed();const invalid=structuredClone(d);invalid.strength!.assessments[0].reps=0;expect(()=>validateAppData(invalid)).toThrow();
  const unfinished=beginAssessment(d,d.plan.days[0],new Date('2026-09-15T12:00:00'));expect(()=>finishAssessment(unfinished)).toThrow('at least one');
 });
});

it('uses an exact 185 lb tested 1RM for the first load and preserves first-occurrence order',()=>{
 let d=base();d.settings.unit='lb';const slot=d.plan.days[0].exercises[0];slot.increment=5;
 d.plan.days.push({id:'other-day',name:'Upper',kind:'training',exercises:[{...slot,id:'later-bench',repMin:12}]});
 d=beginAssessment(d,d.plan.days[0],now);expect(d.strength!.active!.items[0].slot.id).toBe(slot.id);
 d=recordAssessment(d,0,{...d.strength!.active!.items[0],method:'1rm',load:185,reps:1,setup:'Barbell total 185 lb',confirmed:true},now);
 d=finishAssessment(d,now);const first=startTraining(d,d.plan.days[0],false,new Date('2026-09-02T12:00:00'));
 expect(assessmentEstimate(d.strength!.assessments[0])*2.2046226218).toBeCloseTo(185,10);
 expect(first.activeSession!.exercises[0].load).toBe(Math.floor(185*fractionAt(10,'bench')/5)*5);
 expect(first.activeSession!.exercises.map(e=>e.exerciseId)).toEqual(d.plan.days[0].exercises.map(e=>e.exerciseId));
});
it('does not drift the baseline or override progression after extreme completed training results',()=>{
 let d=firstWorkout();const baseline=estimatedCapacity(d,d.plan.days[0].exercises[0])!.kg;
 const s=d.activeSession!;s.exercises[0].sets.forEach(set=>{set.completed=true;set.reps=25;set.rir=1});
 d=completeSession(d,s,'2026-09-02T13:00:00Z');
 expect(estimatedCapacity(d,d.plan.days[0].exercises[0])!.kg).toBe(baseline);
 expect(prescribedSlot(d,d.plan.days[0].exercises[0]).load).toBe(s.exercises[0].load===d.plan.days[0].exercises[0].load?s.exercises[0].load:d.sessions[0].exercises[0].recommendation!.nextLoad);
});
it('orders imported observations by instant rather than timezone spelling',()=>{
 const d=assessed();const a=d.strength!.assessments[0];a.completedAt='2026-09-01T12:00:00Z';
 d.strength!.assessments.push({...a,id:'later-observation',load:100,completedAt:'2026-09-01T06:00:00-07:00'});
 expect(estimatedCapacity(d,d.plan.days[0].exercises[0])!.source).toBe('later-observation');
});

for (const strict of [false,true]) it(`unlocks only assessed days and retains initial gating after training (strict=${strict})`,()=>{
 let d=base();d.settings.strict=strict;
 const other=createInitialData().plan.days[1];
 d.plan.days.push({...other,exercises:[{...other.exercises[0],sets:3,rir:[2,1,'0-1'],loadMode:'external',increment:.5}]});
 d=beginAssessment(d,d.plan.days[0],now);
 expect(d.strength!.active!.items).toHaveLength(1);
 d=recordAssessment(d,0,{...d.strength!.active!.items[0],load:80,reps:8,confirmed:true,setup:'Rack A'},now);
 d=pauseAssessment(d);const observation=d.strength!.assessments[0];
 expect(assessmentDue(d,d.plan.days[0],now)).toEqual([]);
 expect(()=>startTraining(d,d.plan.days[1],true,now)).toThrow('initial strength');
 d=startTraining(d,d.plan.days[0],false,now);
 expect(d.activeSession!.exercises[0].load).toBe(prescribedSlot(d,d.plan.days[0].exercises[0]).load);
 expect(()=>validateAppData(d)).not.toThrow();
 d.activeSession!.exercises[0].sets[0]={index:0,reps:8,rir:2,completed:true};
 d=completeSession(d,d.activeSession!,'2026-09-01T13:00:00Z');
 expect(needsOnboarding(d)).toBe(true);
 expect(()=>startTraining(d,d.plan.days[1],true,now)).toThrow('initial strength');
 d=beginAssessment(d,d.plan.days[1],now);
 expect(d.strength!.active!.items[0].exerciseId).toBe(other.exercises[0].exerciseId);
 expect(d.strength!.assessments[0]).toEqual(observation);
});
it('pauses and finishes a partially completed legacy whole-program assessment without losing drafts',()=>{
 let d=base();const slot=d.plan.days[0].exercises[0];
 const other=createInitialData().plan.days[1].exercises[0];
 d.plan.days.push({id:'later-day',name:'Later',kind:'training',exercises:[{...other,loadMode:'external'}]});
 d=beginAssessment(d,d.plan.days[0],now);
 d.strength!.active!.items.push({...d.strength!.active!.items[0],slot:other,exerciseId:other.exerciseId,load:45,setup:'Saved partial draft'});
 delete d.strength!.onboardingStartedAt;
 d=recordAssessment(d,0,{...d.strength!.active!.items[0],load:80,reps:8,confirmed:true,setup:'Rack A'},now);
 d=finishAssessment(d,now);
 expect(d.strength!.active!.paused).toBe(true);
 expect(d.strength!.active!.items[1].setup).toBe('Saved partial draft');
 expect(parseBackup(exportBackup(d))).toEqual(d);
 expect(startTraining(d,d.plan.days[0],false,now).activeSession!.exercises[0].exerciseId).toBe(slot.exerciseId);
 expect(()=>startTraining(d,d.plan.days[1],true,now)).toThrow('initial strength');
});

it('retains partial onboarding when restoring an older backup with workout history',()=>{
 let d=base();d=beginAssessment(d,d.plan.days[0],now);
 const restored=base();const session=firstWorkout().activeSession!;session.exercises[0].sets[0]={index:0,reps:8,rir:2,completed:true};session.completedAt='2026-09-02T13:00:00Z';delete session.cycleId;restored.sessions=[session];
 const merged=restoreBackup(d,restored);
 expect(merged.strength!.onboardingStartedAt).toBe(d.strength!.onboardingStartedAt);
 expect(needsOnboarding(merged)).toBe(true);
 expect(()=>startTraining(merged,merged.plan.days[0],true,new Date('2026-09-02T14:00:00Z'))).toThrow('initial strength');
});
it('rejects test recording while a workout is active',()=>{
 let d=base();d=beginAssessment(d,d.plan.days[0],now);const draft={...d.strength!.active!.items[0],load:80,reps:8,confirmed:true,setup:'Rack A'};
 d=recordAssessment(d,0,draft,now);d=startTraining(d,d.plan.days[0],false,now);
 expect(()=>recordAssessment(d,0,draft,now)).toThrow('current workout');
});
