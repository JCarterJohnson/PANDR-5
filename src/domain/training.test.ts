import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/seed';
import { createSession, getWeek, isPivotWeek, recoveryAdvice } from './engine';
import { activeCycle, checkInDue, completedWeeklyVolume, cyclesFor, endCycle, inActiveCycle, materializeCycles, performanceEvidence, recoveryTrend, scheduledCheckInDay, startCycle } from './training';
import { validateAppData } from './validation';
import { exportBackup, exportCsv, parseBackup } from '../services/backup';
import type { CheckIn } from './types';
const now = new Date('2026-09-18T12:00:00');
const setup = () => { const data=createInitialData();data.settings.startDate='2026-09-14';return data; };
const check = (fields: Partial<CheckIn> = {}): CheckIn => ({id:crypto.randomUUID(),date:'2026-09-20',week:1,poorSleep:false,runDown:false,elevatedHr:false,lingeringSoreness:false,performanceDip:false,jointPain:false,notes:'',...fields});

describe('cycles and portable history', () => {
 it('treats legacy data as one cycle without changing its records', () => { const data=setup();const before=structuredClone(data);expect(activeCycle(data).startDate).toBe(data.settings.startDate);expect(inActiveCycle(data,check())).toBe(true);expect(data).toEqual(before); });
 it('archives the old plan and resets Week 1 without reusing old-week sessions or flags', () => {
  const data=setup();data.sessions.push(createSession(data.plan.days[0],data.exercises,data.settings,1,false));data.checkIns.push(check({poorSleep:true,jointPain:true}));
  const next=startCycle(data,'Return','2026-09-18',now);
  expect(getWeek(activeCycle(next).startDate,now)).toBe(1);expect(cyclesFor(next)).toHaveLength(2);expect(next.cycles![0].plan).toEqual(data.plan);
  expect(next.sessions).toEqual(data.sessions);expect(inActiveCycle(next,next.sessions[0])).toBe(false);expect(next.checkIns.filter(c=>inActiveCycle(next,c))).toHaveLength(0);
  expect(parseBackup(exportBackup(next))).toEqual(next);expect(exportCsv(next)).toContain('"cycle"');validateAppData(next);
 });
 it('ends a cycle, suppresses check-ins, and preserves the original end on later return', () => {
  const ended=endCycle(setup(),now);expect(activeCycle(ended).endedAt).toBe('2026-09-18');expect(checkInDue(ended,new Date('2026-09-20T12:00:00'))).toBe(false);
  const resumed=startCycle(ended,'Return','2028-01-02',new Date('2028-01-02T12:00:00'));expect(resumed.cycles![0].endedAt).toBe('2026-09-18');
 });
 it('blocks a restart during a workout and invalid dates', () => {const data=setup();expect(()=>startCycle(data,'Old','2026-09-17',now)).toThrow('today');data.activeSession=createSession(data.plan.days[0],data.exercises,data.settings,1,false);expect(()=>startCycle(data,'Return','2026-09-18',now)).toThrow('workout');expect(()=>endCycle(data,now)).toThrow('workout');});
 it('rejects missing cycle references and inconsistent start dates in imports',()=>{const d=startCycle(setup(),'Return','2026-09-18',now);d.settings.startDate='2026-09-19';expect(()=>validateAppData(d)).toThrow('Start date');d.settings.startDate='2026-09-18';d.checkIns=[check({cycleId:'missing'})];expect(()=>validateAppData(d)).toThrow('unknown cycle');});
});

describe('device calendar scheduling', () => {
 it('defaults to the final rest day, not both rest days', () => {const d=setup();expect(scheduledCheckInDay(d)).toBe(0);expect(checkInDue(d,new Date('2026-09-17T12:00:00'))).toBe(false);expect(checkInDue(d,new Date('2026-09-20T12:00:00'))).toBe(true);});
 it('respects a configured weekday across midnight', () => {const d=setup();d.settings.checkInDay=5;expect(checkInDue(d,new Date('2026-09-17T23:59:59'))).toBe(false);expect(checkInDue(d,new Date('2026-09-18T00:00:00'))).toBe(true);expect(checkInDue(d,new Date('2026-09-19T00:00:00'))).toBe(false);});
 it('limits to one check-in per cycle week even if the schedule changes', () => {const d=setup();d.checkIns=[check({date:'2026-09-18'})];expect(checkInDue(d,new Date('2026-09-20T12:00:00'))).toBe(false);expect(checkInDue(d,new Date('2026-09-27T12:00:00'))).toBe(true);});
 it('does not prompt before a future cycle or backfill missed dates', () => {const d=setup();d.settings.startDate='2026-09-21';expect(checkInDue(d,new Date('2026-09-20T12:00:00'))).toBe(false);expect(checkInDue(setup(),new Date('2026-09-21T12:00:00'))).toBe(false);});
 it('uses calendar weeks across DST', () => {const d=setup();d.settings.startDate='2026-03-02';expect(getWeek(d.settings.startDate,new Date('2026-03-09T00:00:00'))).toBe(2);});
});

describe('completed weekly effective sets', () => {
 it('starts with zero completed sets and preserves targets', () => {const rows=completedWeeklyVolume(setup(),1);expect(rows.every(r=>r.total===0)).toBe(true);expect(rows.find(r=>r.muscle==='chest')?.target).toBe(20);});
 it('counts only logged sets with frozen credits, including an active session', () => {const d=setup();d.activeSession=createSession(d.plan.days[0],d.exercises,d.settings,1,false);const e=d.activeSession.exercises[0];e.contributions=[{muscle:'chest',coefficient:1},{muscle:'triceps',coefficient:0.5}];e.sets[0]={index:0,reps:8,rir:3,completed:true};const rows=completedWeeklyVolume(d,1);expect(rows.find(r=>r.muscle==='chest')?.total).toBe(1);expect(rows.find(r=>r.muscle==='triceps')?.total).toBe(0.5);expect(completedWeeklyVolume(d,2).every(r=>r.total===0)).toBe(true);});
 it('excludes sessions from previous cycles with the same week number', () => {const d=setup();const s=createSession(d.plan.days[0],d.exercises,d.settings,1,false);s.exercises[0].sets[0]={index:0,reps:5,rir:2,completed:true};d.sessions=[s];const next=startCycle(d,'New','2026-09-18',now);expect(completedWeeklyVolume(next,1).every(r=>r.total===0)).toBe(true);});
});

describe('recovery decisions', () => {
 function exposures(){const d=setup();const a=createSession(d.plan.days[0],d.exercises,d.settings,1,false);a.startedAt='2026-09-14T12:00:00Z';a.completedAt=a.startedAt;for(const e of a.exercises){e.load=100;for(const s of e.sets){s.completed=true;s.reps=8;}}
 const b=structuredClone(a);b.id=crypto.randomUUID();b.week=2;b.startedAt='2026-09-21T12:00:00Z';b.completedAt=b.startedAt;for(const e of b.exercises.slice(0,2))e.sets.at(-1)!.reps=7;return [a,b];}
 it('corroborates declines on comparable logged anchors',()=>{expect(performanceEvidence(exposures(),2)).toHaveLength(2);});
 it('excludes changed loads, incomplete anchors, easier effort and pivot workouts',()=>{const [a,b]=exposures();b.exercises[0].load=110;b.exercises[1].sets.at(-1)!.completed=false;expect(performanceEvidence([a,b],2)).toHaveLength(0);const [c,d]=exposures();d.exercises[0].sets.at(-1)!.rir=9;d.pivot=true;expect(performanceEvidence([c,d],2)).toHaveLength(0);});
 it('does not double-count subjective and measured performance',()=>{expect(isPivotWeek([check({performanceDip:true,measuredPerformanceDip:true})],2)).toBe(false);expect(isPivotWeek([check({measuredPerformanceDip:true,poorSleep:true})],2)).toBe(true);expect(isPivotWeek([check({jointPain:true,poorSleep:true})],2)).toBe(true);});
 it('gives joint pain guidance even when there are no other flags',()=>{expect(recoveryAdvice(check({jointPain:true}))).toContain('Avoid exercises that provoke joint pain');});
 it('requires two earlier optional measurements and leaves missing measurements unknown',()=>{const c=check({sleepHours:6,fatigue:4});expect(recoveryTrend(c,[check({date:'2026-09-06',sleepHours:8})])).toEqual([]);expect(recoveryTrend(c,[check({date:'2026-09-06',sleepHours:8}),check({date:'2026-09-13',sleepHours:7})])).toEqual(['Sleep hours: 6 now; 7.5 average over 2 previous check-ins.']);});
 it('preserves measurement snapshots and cycle IDs in backups and CSV',()=>{const d=setup();materializeCycles(d);d.checkIns=[check({cycleId:activeCycle(d).id,sleepHours:6.5,fatigue:4,soreness:3,stress:2,measuredPerformanceDip:true,performanceEvidence:['Bench: 8 → 7'],assessmentVersion:'1'})];expect(parseBackup(exportBackup(d))).toEqual(d);expect(exportCsv(d)).toContain('measured_performance_dip');});
});

it('a repeated cycle-start save does not create a second cycle',()=>{const id=crypto.randomUUID();const first=startCycle(setup(),'Return','2026-09-18',now,id);const retry=startCycle(first,'Return','2026-09-18',now,id);expect(retry.cycles).toHaveLength(2);expect(retry.activeCycleId).toBe(id);});
it('uses the reduced prescription as the completion target during a pivot week',()=>{const d=setup();d.checkIns=[check({poorSleep:true,jointPain:true})];const full=completedWeeklyVolume(d,1).find(r=>r.muscle==='chest')!;const pivot=completedWeeklyVolume(d,2).find(r=>r.muscle==='chest')!;expect(pivot.total).toBe(0);expect(pivot.target).toBeLessThan(full.target!);expect(pivot.target).toBeGreaterThan(0);});
