import { Button, Modal, Notice } from './components';
import { MUSCLES } from './data/seed';
import { exerciseResearch } from './data/catalog';
import { calculateVolume } from './domain/engine';
import type { ConstraintIssue, Exercise, TrainingPlan } from './domain/types';

export function SetAllocationPreview({before,after,exercises,issues,maximum,stale,activeWorkout,onClose,onApply}:{before:TrainingPlan;after:TrainingPlan;exercises:Exercise[];issues:ConstraintIssue[];maximum:number;stale:boolean;activeWorkout:boolean;onClose:()=>void;onApply:()=>void}) {
  const catalog=new Map(exercises.map(e=>[e.id,e]));
  const categories=new Map(exercises.map(e=>[e.id,exerciseResearch(e)?.category??'Custom / unclassified']));
  const previous=new Map(before.days.flatMap(day=>day.exercises).map(slot=>[slot.id,slot]));
  const previousVolume=new Map(calculateVolume(before,exercises).map(row=>[row.muscle,row]));
  const volumes=calculateVolume(after,exercises).filter(row=>row.target!==undefined);
  const selected=new Set(Object.keys(after.targets));
  const contributes=(id:string)=>(catalog.get(id)?.contributions??[]).some(c=>selected.has(c.muscle)&&c.coefficient>0);
  const singleSets=after.days.flatMap(day=>day.exercises.filter(slot=>slot.sets===1&&contributes(slot.exerciseId)).map(slot=>`${day.name}: ${catalog.get(slot.exerciseId)?.name??'Unknown exercise'}`));
  const changed=after.days.flatMap(day=>day.exercises).filter(slot=>previous.get(slot.id)?.sets!==slot.sets).length;
  const beforeWorking=before.days.flatMap(day=>day.exercises).reduce((sum,slot)=>sum+slot.sets,0);
  const afterWorking=after.days.flatMap(day=>day.exercises).reduce((sum,slot)=>sum+slot.sets,0);
  const previousDays=new Map(before.days.map(day=>[day.id,day.exercises.reduce((sum,slot)=>sum+slot.sets,0)]));
  const hasErrors=issues.some(issue=>issue.severity==='error');
  const number=(value:number)=>Number(value.toFixed(2));
  return <Modal title="Review set allocation" onClose={onClose}><div className="allocation-preview">
    <p>Review the whole week before applying. {changed} exercise{changed===1?'':'s'} would change. Your exercise choices, loads, targets and logged history are kept.</p><p className="allocation-working-total"><strong>Total weekly working sets: {beforeWorking} → {afterWorking}</strong></p>
    <details className="allocation-policy"><summary>How this proposal was chosen</summary><p>In constrained mode, valid proposals keep selected muscles within the weekly bounds. Your {maximum}-set limit applies to exercises being adjusted; exercises outside the selected targets stay unchanged. Targets counted entirely in full sets retain exact budgets when attainable. For targets with fractional supporting credits, it aims for differences within one effective set when attainable instead of chasing approximate credits; larger gaps are shown. This tolerance is a programming policy, not a measured biological equivalence. It prefers at least two sets for exercises being adjusted when the budget allows, balances primary work across days, and spreads work across exercises. Supporting-muscle overlap counts toward weekly volume; it does not force every training day to match.</p><p>Priority exercises receive a larger share when the goals allow it. Priority is your programming preference, not a claim that one movement is better or a guarantee of twice as many sets. Equal priority gives no automatic preference to compounds or isolation movements. A remaining one-set exercise needs review; you can remove it, change its priority, or adjust the weekly budget.</p></details>
    {stale&&<Notice tone="error">The plan or allocation inputs changed while this preview was open. Close it and review a fresh proposal.</Notice>}
    {activeWorkout&&<Notice tone="error">Finish your active workout before applying set changes.</Notice>}
    {issues.map((issue,i)=><Notice key={`${issue.code}-${i}`} tone={issue.severity==='error'?'error':undefined}>{issue.message}</Notice>)}
    {singleSets.length>0&&<Notice><strong>Review {singleSets.length} remaining one-set exercise{singleSets.length===1?'':'s'}</strong><p>{singleSets.join('; ')}.</p><p>Retained exercises cannot receive zero sets. This is a budget trade-off to inspect, not a recommended minimum dose for each movement.</p></Notice>}
    <h3>Weekly muscle volume</h3><p className="muted">Direct = full set credits; supporting = fractional credits from your saved exercise definitions. These are approximate accounting weights.</p>
    <div className="allocation-muscles">{volumes.map(row=>{const old=previousVolume.get(row.muscle);const label=MUSCLES.find(m=>m.id===row.muscle)?.name??row.muscle;return <div className="allocation-muscle" key={row.muscle} data-allocation-muscle={row.muscle}><div><strong>{label}</strong><span>{number(old?.total??0)} → {number(row.total)} <small>/ {row.target} target</small></span></div><small>Direct {number(old?.direct??0)} → {number(row.direct)} · Supporting {number(old?.fractional??0)} → {number(row.fractional)}</small></div>})}</div>
    <h3>Exercise sets across the week</h3><p className="muted">Current → proposed working sets. Exercises that contribute to none of your selected targets keep their counts.</p>
    <div className="allocation-days">{after.days.filter(day=>day.kind==='training').map(day=><section className="allocation-day" key={day.id}><h4>{day.name}<span>{previousDays.get(day.id)??0} → {day.exercises.reduce((sum,slot)=>sum+slot.sets,0)} working sets</span></h4>{day.exercises.map(slot=>{const old=previous.get(slot.id);const changed=old?.sets!==slot.sets;return <div className={`allocation-exercise ${changed?'changed':''}`} key={slot.id} data-allocation-slot={slot.id}><div><strong>{catalog.get(slot.exerciseId)?.name??'Unknown exercise'}</strong><small>{categories.get(slot.exerciseId)}</small>{slot.allocationPriority==='priority'&&<small className="allocation-priority">Priority</small>}{!contributes(slot.exerciseId)&&<small>Outside selected targets · unchanged</small>}</div><span>{old?.sets??slot.sets} → {slot.sets} <small>{slot.sets===1?'set':'sets'}</small></span></div>})}</section>)}</div>
    <div className="actions allocation-actions"><Button onClick={onClose}>Cancel</Button><Button primary disabled={hasErrors||stale||activeWorkout} onClick={onApply}>Apply set allocation</Button></div><p className="muted">Only Apply changes your draft. Valid applied changes then save automatically.</p>
  </div></Modal>;
}
