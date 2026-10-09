import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/seed';
import { beginAssessment, recordAssessment, reconcileAssessment } from './strength';
import { makeRir } from './engine';
import { validateAppData } from './validation';

const now=new Date('2026-10-08T12:00:00Z');
function partialAssessment() {
  let d=createInitialData();d.settings.strict=false;
  const slot=(name:string,id:string)=>({...d.plan.days[0]!.exercises[0]!,id,exerciseId:d.exercises.find(e=>e.name===name)!.id,sets:3,rir:makeRir(3),increment:.5,availableLoads:undefined});
  d.plan.days=[{...d.plan.days[0]!,exercises:[slot('Bench Press','bench')]},{...d.plan.days[2]!,exercises:[slot('RDL (Barbell or Dumbell)','hinge'),slot('Leg Press','press'),slot('Lying Hamstring Curls','curl')]}];
  d=beginAssessment(d,d.plan.days[0]!,now);d=beginAssessment(d,d.plan.days[1]!,now);
  const bench=d.strength!.active!.items.findIndex(i=>i.slot.id==='bench');
  d=recordAssessment(d,bench,{...d.strength!.active!.items[bench]!,load:80,reps:8,setup:'Saved bench test',confirmed:true},now);
  const curl=d.strength!.active!.items.find(i=>i.slot.id==='curl')!;
  Object.assign(curl,{load:22,reps:5,setup:'Saved curl station',confirmed:false});
  d.strength!.active!.paused=true;
  return d;
}

describe('assessment queue follows the live plan',()=>{
  it('groups later exercises with their first primary muscle group while preserving order within groups',()=>{
    let d=createInitialData();d.settings.strict=false;
    const names=['Bench Press','Incline Curls','Wide-Grip Seated Cable Rows','Seated Hamstring Curls','Incline Dumbbell Press','Lying Hamstring Curls','Leg Extension','Standing Calf Raise (Machine)'];
    const slots=names.map((name,i)=>({...d.plan.days[0]!.exercises[0]!,id:`group-${i}`,exerciseId:d.exercises.find(e=>e.name===name)!.id}));
    d.plan.days=[{...d.plan.days[0]!,exercises:slots.slice(0,4)},{...d.plan.days[2]!,exercises:slots.slice(4)}];
    d=beginAssessment(d,d.plan.days[0]!,now);d=beginAssessment(d,d.plan.days[1]!,now);
    const next=reconcileAssessment(d,undefined,now);
    expect(next.strength!.active!.items.map(i=>i.slot.id)).toEqual(['group-0','group-4','group-1','group-2','group-3','group-5','group-6','group-7']);
    expect(reconcileAssessment(next,undefined,now)).toEqual(next);
  });
  it('replaces removed movements, follows order and preserves observations and unchanged drafts',()=>{
    const d=partialAssessment(),old=structuredClone(d.plan),before=structuredClone(d);
    const leg=d.plan.days[1]!;const press=leg.exercises[1]!;
    leg.exercises=[{...leg.exercises[2]!,sets:4,rir:makeRir(4)},{...press,exerciseId:d.exercises.find(e=>e.name==='Leg Extension')!.id}];
    const next=reconcileAssessment(d,old,now),items=next.strength!.active!.items;
    expect(items.map(i=>i.slot.id)).toEqual(['bench','curl','press']);
    expect(items[1]).toMatchObject({load:22,reps:5,setup:'Saved curl station',slot:{sets:4}});
    expect(items[2]).toMatchObject({exerciseId:leg.exercises[1]!.exerciseId,reps:0,setup:'',confirmed:false});
    expect(items[2]!.resultId).toBeUndefined();expect(next.strength!.active!.paused).toBe(true);
    expect(next.strength!.assessments).toEqual(before.strength!.assessments);
    expect(next.sessions).toEqual(before.sessions);expect(next.cycles).toEqual(before.cycles);
    expect(d.strength).toEqual(before.strength);expect(()=>validateAppData(next)).not.toThrow();
  });
  it('repairs an already-stale persisted queue without needing its old plan',()=>{
    const d=partialAssessment();d.plan.days[1]!.exercises.splice(0,1);
    d.plan.days[1]!.exercises[0]!.exerciseId=d.exercises.find(e=>e.name==='Leg Extension')!.id;
    d.plan.days[1]!.exercises[0]!.id='new-extension-slot';
    const next=reconcileAssessment(d,undefined,now);
    expect(next.strength!.active!.items.map(i=>i.exerciseId)).toEqual(d.plan.days.flatMap(day=>day.exercises.map(s=>s.exerciseId)));
    expect(next.strength!.active!.items.find(i=>i.slot.id==='curl')!.setup).toBe('Saved curl station');
    expect(reconcileAssessment(next,undefined,now)).toEqual(next);
  });
  it('adds new unassessed selections outside the active day but does not queue unrelated existing days',()=>{
    const d=partialAssessment();const base=d.plan.days[0]!.exercises[0]!;
    const lateral=d.exercises.find(e=>e.name==='Lateral Raise')!;
    d.plan.days.push({id:'other',name:'Upper',kind:'training',exercises:[{...base,id:'lateral',exerciseId:lateral.id}]});
    const old=structuredClone(d.plan);
    const newExercise=d.exercises.find(e=>e.name==='Seated Hamstring Curls')!;
    d.plan.days[2]!.exercises.push({...base,id:'new',exerciseId:newExercise.id});
    const next=reconcileAssessment(d,old,now);
    expect(next.strength!.active!.items.some(i=>i.exerciseId===newExercise.id)).toBe(true);
    expect(next.strength!.active!.items.some(i=>i.exerciseId===lateral.id)).toBe(false);
  });
  it('keeps completed results in history when their exercise leaves the plan and de-duplicates repeated slots',()=>{
    const d=partialAssessment(),old=structuredClone(d.plan),observations=structuredClone(d.strength!.assessments);
    d.plan.days[0]!.exercises=[];
    d.plan.days[1]!.exercises.push({...d.plan.days[1]!.exercises[2]!,id:'duplicate'});
    const next=reconcileAssessment(d,old,now);
    expect(next.strength!.active!.items.filter(i=>i.exerciseId===d.plan.days[1]!.exercises[2]!.exerciseId)).toHaveLength(1);
    expect(next.strength!.active!.items.some(i=>i.slot.id==='bench')).toBe(false);
    expect(next.strength!.assessments).toEqual(observations);
  });
  it('refreshes changed resistance setup without retaining an old confirmation',()=>{
    const d=partialAssessment(),old=structuredClone(d.plan);
    d.plan.days[1]!.exercises[2]!.bodyweight={resistance:80,addedLoads:[5],assistanceLoads:[10]};
    const next=reconcileAssessment(d,old,now),curl=next.strength!.active!.items.find(i=>i.slot.id==='curl')!;
    expect(curl).toMatchObject({setup:'',confirmed:false,reps:0,slot:{bodyweight:{resistance:80}}});
  });
  it('clears an empty pending queue while retaining all historical tests',()=>{
    const d=partialAssessment(),old=structuredClone(d.plan),history=structuredClone(d.strength!.assessments);
    d.plan.days.forEach(day=>{day.exercises=[];day.kind='rest'});
    const next=reconcileAssessment(d,old,now);
    expect(next.strength!.active).toBeUndefined();expect(next.strength!.assessments).toEqual(history);
    expect(()=>validateAppData(next)).not.toThrow();
  });
  it('keeps inline assessment equipment through reloads and saves unrelated to the plan',()=>{
    const d=partialAssessment(),item=d.strength!.active!.items.find(i=>i.slot.id==='curl')!;
    item.slot.bodyweight={resistance:80,addedLoads:[5],assistanceLoads:[10]};item.slot.availableLoads=[20,25];
    const reloaded=reconcileAssessment(d,undefined,now);
    const updated=reconcileAssessment(reloaded,structuredClone(d.plan),now);
    expect(updated.strength!.active!.items.find(i=>i.slot.id==='curl')).toEqual(item);
  });
  it('retains a completed movement still selected elsewhere when its original slot is replaced',()=>{
    const d=partialAssessment(),old=structuredClone(d.plan),bench=d.plan.days[0]!.exercises[0]!;
    d.plan.days[1]!.exercises.push({...bench,id:'moved-bench'});
    d.plan.days[0]!.exercises[0]={...bench,exerciseId:d.exercises.find(e=>e.name==='Incline Dumbbell Press')!.id};
    const next=reconcileAssessment(d,old,now);
    expect(next.strength!.active!.items.find(i=>i.exerciseId===bench.exerciseId)).toMatchObject({resultId:d.strength!.assessments[0]!.id,slot:{id:'moved-bench'}});
    expect(next.strength!.active!.items.find(i=>i.slot.id==='bench')!.resultId).toBeUndefined();
  });
});
