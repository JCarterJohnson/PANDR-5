import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/seed';
import { completeSession, convertPlanLoads } from './coaching';
import { createSession } from './engine';
import { completedSessionForDay, completedWeeklyVolume, performanceEvidence, restartTrainingFromSession, startCycle } from './training';
import { baselineFromPerformance, latestAssessment, prescribedSlot, startTraining } from './strength';
import { exportBackup, exportCsv, parseBackup, restoreBackup } from '../services/backup';
import type { AppData, Session } from './types';
import { validateAppData } from './validation';

const now = new Date('2026-09-23T12:00:00Z');
function setup(): AppData {
  const data = createInitialData();
  data.settings.startDate = '2026-09-14'; data.settings.strict = false;
  data.plan.days = data.plan.days.filter(d => d.kind === 'training').slice(0, 2).map(day => ({...day, exercises:[{...day.exercises[0],load:100,increment:2.5,availableLoads:[100,102.5,105,107.5],equipmentPreset:'custom'}]}));
  return data;
}
function workout(data: AppData, dayIndex: number, week: number, date: string): Session {
  const session = createSession(data.plan.days[dayIndex], data.exercises, data.settings, week, false);
  session.date = date; session.startedAt = `${date}T12:00:00Z`;
  session.exercises.forEach(log => log.sets.forEach(set => Object.assign(set,{completed:true,reps:log.repMax + 1,rir:0})));
  return session;
}
function finish(data: AppData, dayIndex: number, week: number, date: string): AppData {
  return completeSession(data,workout(data,dayIndex,week,date),`${date}T13:00:00Z`);
}

describe('completed workouts and explicit restart', () => {
  it.each([false,true])('locks a completed day in mode %s and unlocks it in the next training week', strict => {
    let data = setup(); data.settings.strict = strict;
    data = finish(data,0,1,'2026-09-14'); const session = data.sessions[0];
    expect(completedSessionForDay(data,session.dayId,new Date('2026-09-18T12:00:00Z'))?.id).toBe(session.id);
    expect(completedSessionForDay(data,session.dayId,now)).toBeUndefined();
    expect(() => startTraining(data,data.plan.days[0],false,new Date('2026-09-18T12:00:00Z'))).toThrow('completed');
    expect(() => completeSession(data,workout(data,0,1,'2026-09-15'),'2026-09-15T13:00:00Z')).toThrow('completed');
    const next = startCycle(data,'Return','2026-09-18',new Date('2026-09-18T12:00:00Z'));
    expect(completedSessionForDay(next,session.dayId,new Date('2026-09-18T12:00:00Z'))).toBeUndefined();
  });

  it('voids the selected workout and later workouts, reverses their progression and excludes their sourced strength baseline', () => {
    let data = finish(setup(),1,1,'2026-09-14'); const earlier = data.sessions[0];
    data = finish(data,0,1,'2026-09-15'); const chosen = data.sessions[1];
    data = finish(data,0,2,'2026-09-21'); data = finish(data,1,2,'2026-09-22');
    const loadBefore = setup().plan.days[0].exercises[0].load;
    data.plan.name = 'My edited plan'; data.plan.days[0].name = 'Edited training day'; data.plan.days[1].exercises[0].load = 71;
    const exercise = chosen.exercises[0];
    data.strength={assessments:[{id:'sourced',sourceSessionId:chosen.id,sourceSetIndex:0,actualRir:0,method:'performance',exerciseId:exercise.exerciseId,name:exercise.name,date:chosen.date,completedAt:chosen.completedAt!,reps:9,load:100,loadMode:'external',unit:data.settings.unit,setup:'Recorded setup',curve:'general',version:1}]};
    const before = structuredClone(data), next = restartTrainingFromSession(data,chosen.id,now);
    expect(data).toEqual(before);
    expect(next.sessions[0]).toEqual(earlier); expect(next.sessions.slice(1).every(s=>s.voidedAt===now.toISOString()&&s.voidedFromSessionId===chosen.id)).toBe(true);
    expect(next.sessions[1].exercises).toEqual(chosen.exercises);
    expect(next.plan.days[0].exercises[0].load).toBe(loadBefore);
    expect(next.plan.days[1].exercises[0].load).toBe(71);
    expect(next.plan).toMatchObject({name:'My edited plan',days:[{name:'Edited training day'},{}]});
    expect(completedWeeklyVolume(next,2).every(row=>row.total===0)).toBe(true);
    expect(latestAssessment(next,exercise.exerciseId)).toBeUndefined(); expect(next.strength?.assessments[0]).toEqual({...data.strength.assessments[0],voidedAt:now.toISOString()});
    expect(completedSessionForDay(next,next.plan.days[0].id,now)).toBeUndefined();
    expect(parseBackup(exportBackup(next))).toEqual(next); expect(exportCsv(next)).toContain('voided_at');
  });

  it('can reverse recorded recommendations from older workouts without a progression snapshot', () => {
    const data=finish(setup(),0,1,'2026-09-14'), session=data.sessions[0]; delete session.progression;
    expect(data.plan.days[0].exercises[0].load).toBe(102.5);
    expect(restartTrainingFromSession(data,session.id,now).plan.days[0].exercises[0].load).toBe(100);
  });

  it('converts saved load deltas across unit changes while keeping observed loads untouched', () => {
    const data=finish(setup(),0,1,'2026-09-14'), session=data.sessions[0];
    data.plan=convertPlanLoads(data.plan,2.2046226218,'lb',data.exercises); data.settings.unit='lb';
    const next=restartTrainingFromSession(data,session.id,now);
    expect(next.plan.days[0].exercises[0].load).toBeCloseTo(220.46226218,7);
    expect(next.sessions[0].exercises[0]).toMatchObject({load:100,unit:'kg'});
  });

  it('rebuilds derived recovery evidence while retaining subjective check-in observations', () => {
    const data=finish(setup(),0,1,'2026-09-14'), session=data.sessions[0];
    data.checkIns=[{id:'recovery',week:1,date:'2026-09-20',poorSleep:true,performanceDip:false,jointPain:false,runDown:false,elevatedHr:false,lingeringSoreness:false,notes:'Saved report',measuredPerformanceDip:true,performanceEvidence:['Old strength evidence']}];
    const next=restartTrainingFromSession(data,session.id,now);
    expect(next.checkIns[0]).toMatchObject({poorSleep:true,notes:'Saved report',measuredPerformanceDip:false,performanceEvidence:[],coaching:{action:'hold'}});
    expect(performanceEvidence(next.sessions,1)).toEqual([]);
  });

  it('requires a saved active-cycle workout and protects an in-progress session', () => {
    const data=finish(setup(),0,1,'2026-09-14'), id=data.sessions[0].id;
    data.activeSession=workout(data,1,1,'2026-09-15'); expect(()=>restartTrainingFromSession(data,id,now)).toThrow('current workout'); delete data.activeSession;
    expect(()=>restartTrainingFromSession(data,'missing',now)).toThrow('completed');
    const next=restartTrainingFromSession(data,id,now); expect(()=>restartTrainingFromSession(next,id,now)).toThrow('completed');
  });

  it('keeps a voided record voided when restoring an older backup', () => {
    const completed=finish(setup(),0,1,'2026-09-14');
    const data=baselineFromPerformance(completed,completed.sessions[0].id,0,'Saved machine',now), backup=structuredClone(data);
    const current=restartTrainingFromSession(data,data.sessions[0].id,now), restored=restoreBackup(current,backup);
    expect(restored.sessions[0].voidedAt).toBe(now.toISOString()); expect(completedWeeklyVolume(restored,1).every(row=>row.total===0)).toBe(true);
    expect(restored.strength?.assessments[0].voidedAt).toBe(now.toISOString());
    expect(latestAssessment(restored,data.sessions[0].exercises[0].exerciseId)).toBeUndefined();
  });

  it('orders restart boundaries by actual instants when saved dates use different UTC offsets', () => {
    let data=finish(setup(),0,1,'2026-09-14'); data.sessions[0].startedAt='2026-09-14T10:00:00-07:00'; data.sessions[0].completedAt='2026-09-14T10:30:00-07:00';
    data=finish(data,1,1,'2026-09-14'); const chosen=data.sessions[1]; chosen.startedAt='2026-09-14T12:00:00-05:00'; chosen.completedAt='2026-09-14T13:00:00-05:00';
    // Both starts are 17:00 UTC; the earlier finish identifies the prior saved visit.
    const next=restartTrainingFromSession(data,chosen.id,now);
    expect(next.sessions[0].voidedAt).toBeUndefined(); expect(next.sessions[1].voidedAt).toBe(now.toISOString());
  });
});

it('requires an explicit actual-load confirmation to save a constrained workout override', () => {
  const data=setup(); data.settings.strict=true;
  const session=workout(data,0,1,'2026-09-14'), log=session.exercises[0];
  log.prescribedLoad=100; log.prescribedLoadMode='external'; log.load=80;
  expect(()=>completeSession(data,session,'2026-09-14T13:00:00Z')).toThrow('Confirm the actual');
  log.actualLoadOverride=true; const saved=completeSession(data,session,'2026-09-14T13:00:00Z');
  expect(saved.sessions[0].exercises[0]).toMatchObject({load:80,prescribedLoad:100,actualLoadOverride:true}); validateAppData(saved);
});

it('defaults the observed RIR to zero for a beyond-failure target while preserving the target', () => {
  const data=setup(), slot=data.plan.days[0].exercises[0]; slot.rir[slot.rir.length-1]='<0';
  const log=createSession(data.plan.days[0],data.exercises,data.settings,1,false).exercises[0];
  expect(log.targetRir.at(-1)).toBe('<0'); expect(log.sets.at(-1)?.rir).toBe(0);
});

it('confirms only a completed measured assistance load and keeps it available for the next constrained workout', () => {
  const data=setup(), slot=data.plan.days[0].exercises[0];
  slot.load=0;slot.loadMode='bodyweight';slot.bodyweight={tracking:'full-body',resistance:180,bodyMassKg:180,addedLoads:[],assistanceLoads:[]};
  const session=workout(data,0,1,'2026-09-14'), log=session.exercises[0]; log.load=80;log.loadMode='assistance';log.actualLoadOverride=true;
  let next=completeSession(data,session,'2026-09-14T13:00:00Z');
  next=baselineFromPerformance(next,session.id,0,'Assistance machine',now);next.settings.strict=true;
  expect(next.plan.days[0].exercises[0]).toMatchObject({load:80,loadMode:'assistance',bodyweight:{assistanceLoads:[80],addedLoads:[]}});
  expect(prescribedSlot(next,next.plan.days[0].exercises[0])).toMatchObject({load:80,loadMode:'assistance'});
  expect(next.sessions[0].exercises[0].bodyweight?.assistanceLoads).toEqual([]); validateAppData(next);
});

it('saves assistance with unknown bodyweight resistance without inventing a measured future prescription', () => {
  const data=setup(), slot=data.plan.days[0].exercises[0];
  slot.load=0;slot.loadMode='bodyweight';slot.bodyweight={tracking:'reps-only',resistance:0,addedLoads:[],assistanceLoads:[]};
  const session=workout(data,0,1,'2026-09-14'), log=session.exercises[0];log.load=80;log.loadMode='assistance';log.actualLoadOverride=true;
  const next=completeSession(data,session,'2026-09-14T13:00:00Z');
  expect(next.sessions[0].exercises[0]).toMatchObject({load:80,loadMode:'assistance',bodyweight:{tracking:'reps-only',resistance:0}});
  expect(next.plan.days[0].exercises[0]).toEqual(slot); validateAppData(next);
});
