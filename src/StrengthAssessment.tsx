import { useEffect, useRef, useState } from 'react';
import { Check, ArrowRight, Clock3, X } from 'lucide-react';
import type { AppData, PlanExercise, StrengthDraft } from './domain/types';
import type { Update } from './Train';
import { assessmentEstimate, finishAssessment, fractionAt, fromKg, prescribedSlot, recordAssessment, pauseAssessment, toKg } from './domain/strength';
import { bodyweightMovement, defaultBodyweightSlot, resolveBodyweight } from './domain/bodyweight';
import { EquipmentSetup } from './EquipmentSetup';
import { LoadInput } from './LoadInput';
import { formatEstimate, formatWeight } from './domain/weight-format';
import { BodyMassField } from './BodyMassField';
import { assessmentGroup } from './domain/assessment-order';
import { Button, Field, Notice } from './components';

function newWholeBodyTest(data: AppData, item: StrengthDraft): boolean {
 const exercise=data.exercises.find(e=>e.id===item.exerciseId);
 return !item.resultId && bodyweightMovement(exercise)==='full-body' && item.slot.bodyweight?.tracking!=='full-body';
}

function testDraft(data: AppData, item: StrengthDraft, infer = true): StrengthDraft {
 const draft=structuredClone(item);
 if(draft.resultId)return draft;
 const exercise=data.exercises.find(e=>e.id===item.exerciseId);
 if(infer && !draft.slot.bodyweight && draft.load===0) {
  draft.slot=defaultBodyweightSlot(draft.slot,exercise,data.settings);
  if(draft.slot.bodyweight){draft.load=draft.slot.load;draft.loadMode=draft.slot.loadMode;}
 }
 // An unfinished first push-up test keeps its entered reps and notes. It no
 // longer asks for a mechanical measurement; recorded baselines are untouched.
 if(infer && bodyweightMovement(exercise)==='partial-body' && draft.slot.bodyweight?.tracking!=='reps-only') {
  const oldOffset=draft.load;
  draft.slot={...draft.slot,bodyweight:{tracking:'reps-only',resistance:0,addedLoads:[],assistanceLoads:[],...(data.settings.bodyMass?{bodyMassKg:data.settings.bodyMass.kg}:{})}};
  draft.load=0;draft.loadMode='bodyweight';draft.method='failure';draft.confirmed=false;
  if(oldOffset!==0)draft.reps=0;
 }
 if(infer && newWholeBodyTest(data,draft) && data.settings.bodyMass) {
  draft.slot={...draft.slot,bodyweight:{tracking:'full-body',resistance:fromKg(data.settings.bodyMass.kg,draft.unit),bodyMassKg:data.settings.bodyMass.kg,addedLoads:[],assistanceLoads:[]}};
  draft.load=0;draft.loadMode='bodyweight';
  draft.reps=draft.method==='1rm'?1:0;draft.confirmed=false;
 }
 const before=draft.slot.bodyweight;
 draft.slot=resolveBodyweight({...draft.slot,load:draft.load,loadMode:draft.loadMode},data.settings);
 const after=draft.slot.bodyweight;
 if(before&&(before.resistance!==after?.resistance||before.tracking==='reps-only'&&before.bodyMassKg!==after?.bodyMassKg)){draft.reps=draft.method==='1rm'?1:0;draft.confirmed=false;}
 draft.load=draft.slot.load;draft.loadMode=draft.slot.loadMode;
 return draft;
}

export function StrengthAssessment({data,update}:{data:AppData;update:Update}) {
 const active = data.strength!.active!;
 const [index,setIndex] = useState(() => Math.max(0,active.items.findIndex(i => !i.resultId)));
 const [draft,setDraft] = useState<StrengthDraft>(() => testDraft(data,active.items[index]));
 const [error,setError] = useState(''); const [busy,setBusy] = useState(false);
 const [restUntil,setRestUntil] = useState(0); const [now,setNow] = useState(Date.now());
 const mass = useRef(data.settings.bodyMass?.kg);
 const automaticWholeBody = useRef(newWholeBodyTest(data,active.items[index]));
 useEffect(() => {const t=setInterval(() => setNow(Date.now()),1000);return () => clearInterval(t)},[]);
 useEffect(() => {
  if(mass.current === data.settings.bodyMass?.kg)return;
  mass.current = data.settings.bodyMass?.kg;
  setDraft(previous => {
   if(previous.resultId)return previous;
   let slot={...previous.slot,load:previous.load,loadMode:previous.loadMode};
   if(automaticWholeBody.current&&data.settings.bodyMass&&slot.bodyweight?.tracking==='reps-only'){slot={...slot,bodyweight:{...slot.bodyweight,tracking:'full-body',resistance:fromKg(data.settings.bodyMass.kg,previous.unit),bodyMassKg:data.settings.bodyMass.kg}};}
   slot=resolveBodyweight(slot,data.settings);
   const changed=slot.bodyweight?.resistance!==previous.slot.bodyweight?.resistance || slot.bodyweight?.tracking==='reps-only' && slot.bodyweight.bodyMassKg!==previous.slot.bodyweight?.bodyMassKg;
   return changed?{...previous,slot,load:slot.load,loadMode:slot.loadMode,confirmed:false,reps:previous.method==='1rm'?1:0}:previous;
  });
 },[data.settings.bodyMass?.kg,data.settings.unit]);
 const saved = active.items[index].resultId;
 const result = data.strength!.assessments.find(a => a.id === saved);
 const completed = active.items.filter(i => i.resultId).length;
 const exercise = data.exercises.find(e => e.id === draft.exerciseId);
 const name = exercise?.name ?? draft.exerciseId;
 const bodyweight = draft.slot.bodyweight;
 const repsOnly = bodyweight?.tracking === 'reps-only';
 const movementKind=bodyweightMovement(exercise);
 const needsBodyMass=automaticWholeBody.current && movementKind==='full-body' && !data.settings.bodyMass;
 const partialBody=!!bodyweight && !repsOnly && bodyweight.tracking!=='full-body' && movementKind!=='full-body';
 const additionalWeight=bodyweight?.additionalWeightKg;
 const weightText=(kg:number,unit=draft.unit,observed=false)=>`${formatWeight(fromKg(kg,unit),{observed})} ${unit}`;
 const maxReps = repsOnly ? 100 : 15;
 const repError = draft.reps && draft.method === 'failure' && (!Number.isInteger(draft.reps) || draft.reps < 2 || draft.reps > maxReps)
  ? repsOnly ? 'Enter 2–100 clean reps.' : 'Enter 2–15 clean reps for this test. Use a heavier weight if you can do more.' : '';
 function equipment(slot: PlanExercise) {
  automaticWholeBody.current=false;
  const only = slot.bodyweight?.tracking === 'reps-only';
  setDraft({...draft,slot,loadMode:only?'bodyweight':slot.loadMode,load:only?0:slot.load,method:only?'failure':draft.method,confirmed:false});
 }
 async function saveDraft() {
  if(saved)return true;
  try{await update(d => {if(d.strength?.active?.id!==active.id||d.strength.active.items[index]?.exerciseId!==draft.exerciseId)throw new Error('Assessment changed. Reopen Train.');d.strength.active.items[index]=testDraft(d,draft,false);return d});setError('');return true}
  catch(e){setError((e as Error).message);return false}
 }
 async function select(i:number) {setBusy(true);if(await saveDraft()){setIndex(i);automaticWholeBody.current=newWholeBodyTest(data,active.items[i]);setDraft(testDraft(data,active.items[i]));setError('')}setBusy(false)}
 async function record() {setBusy(true);try{if(needsBodyMass)throw new Error('Save your bodyweight before testing this exercise.');await update(d => recordAssessment(d,index,draft));setNow(Date.now());setRestUntil(Date.now()+300000);setError('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const remaining = Math.max(0,Math.ceil((restUntil-now)/1000));
 return <>
  <header className="page-heading"><div><h1>Strength assessment</h1><p>{active.initial?'Initial baseline · required in every mode':'Exercise reassessment'} · {completed} of {active.items.length} exercises tested</p></div><div className="actions">
   <Button disabled={busy} onClick={async()=>{setBusy(true);try{if(await saveDraft())await update(d=>pauseAssessment(d));}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}><X size={18}/> Save and exit</Button>
   <Button disabled={busy||completed===0} primary onClick={async()=>{setBusy(true);try{if(await saveDraft())await update(d=>finishAssessment(d));else setBusy(false);}catch(e){setError((e as Error).message);setBusy(false)}}}>Finish assessment <Check size={18}/></Button>
  </div></header>
  <div className="session-progress"><i style={{width:`${completed/active.items.length*100}%`}}/></div>
  <Notice><strong>This visit is for assessment.</strong><p>Warm up and use the setup you will use in training. Count clean reps until the next clean rep is impossible: that is 0 RIR. Stop for pain or technique breakdown.</p><details><summary>Test tips</summary><p>For weighted lifts, aim for 3–10 reps; 2–15 are accepted. Push-ups and similar movements can use 2–100 reps. Rest 3–5 minutes between attempts, longer if needed. Save and exit to continue another day. These tests do not count as workout sets.</p></details></Notice>
  {error&&<Notice tone="error">{error}</Notice>}
  <p className="assessment-order-note">Exercises stay together by primary muscle group, in the order each group first appears in your plan. Save and exit to split testing across visits.</p>
  <div className="logging-grid"><aside className="exercise-picker">{active.items.map((item,i)=>{const movement=data.exercises.find(e=>e.id===item.exerciseId);return <button disabled={busy} className={i===index?'selected':''} key={item.exerciseId} onClick={()=>void select(i)}><span>{String(i+1).padStart(2,'0')}</span><strong><small className="assessment-group">{assessmentGroup(movement)}</small>{movement?.name??item.exerciseId}</strong><small>{item.resultId?'Tested':item.reason==='stale'?'14+ days':item.reason==='setup'?'Setup changed':'Baseline needed'}</small></button>})}</aside>
   <section className="panel log-panel assessment-panel"><h2>{name}</h2>
    {result ? <>
     <Notice tone="success"><strong>Baseline saved</strong><p>{result.bodyweight?.tracking==='reps-only'?'Reps-only bodyweight':result.loadMode==='bodyweight'?'Bodyweight only':`${formatWeight(result.load,{observed:true})} ${result.unit} ${result.loadMode==='assistance'?'assistance':result.bodyweight?'added weight':'test load'}`} · {result.reps} clean rep{result.reps===1?'':'s'} · {result.method==='1rm'?'tested 1RM':'failure set'}</p>{result.bodyweight?.additionalWeightKg!==undefined&&result.bodyweight.additionalWeightKg>0&&<p>Additional weight: {weightText(result.bodyweight.additionalWeightKg,result.unit,true)}.</p>}{result.bodyweight?.bodyMassKg&&<p>Your weight at this test: {formatEstimate(fromKg(result.bodyweight.bodyMassKg,result.unit))} {result.unit}. This observation keeps its original weight.</p>}</Notice>
     <h3>Your starting workout loads</h3>
     {data.plan.days.flatMap(day=>day.exercises.filter(slot=>slot.exerciseId===result.exerciseId).map(slot=>{try{const prescription=prescribedSlot(data,slot);return <p key={slot.id}><strong>{day.name}: {prescription.loadMode==='bodyweight'?(prescription.bodyweight?.additionalWeightKg?`${weightText(prescription.bodyweight.additionalWeightKg,data.settings.unit,true)} additional weight`:'Bodyweight only'):`${formatWeight(prescription.load,{preset:prescription.equipmentPreset})} ${data.settings.unit} ${prescription.loadMode==='assistance'?'assistance':prescription.bodyweight?'added weight':'load'}`}</strong> · {slot.repMin}–{slot.repMax} reps · RIR {slot.rir.join(' → ')}</p>}catch(e){return <Notice key={slot.id} tone="error">{day.name}: {(e as Error).message}</Notice>}}))}
     <p className="muted">These loads seed the first workout. After that, PANDR-5 uses your completed anchor set to choose the next load.</p>
     <p>{result.setup}</p>
     {result.bodyweight?.tracking==='reps-only' ? <p className="muted">Keep the same setup and additional weight to compare your reps. Retest after changing them or your bodyweight.</p> : <>
      <h3>Estimated fresh-set capacity</h3><p>Estimates at 0 RIR before equipment rounding. Training allows for your prescribed RIR. For bodyweight movements, these numbers are total resistance, including added weight or subtracting assistance.</p>
      <div className="strength-estimates">{[1,3,5,8,10,12,15,20].map(reps=><div key={reps}><small>{reps} reps</small><strong>{formatEstimate(fromKg(assessmentEstimate(result),result.unit)*fractionAt(reps,result.curve))} {result.unit}</strong></div>)}</div>
      <p className="muted">{result.method==='1rm'?'The single was measured; higher-rep capacities use a population curve.':'One measured point anchors a population curve; predictions farther from the test are less certain.'} {result.curve==='general'?'General':result.curve==='bench'?'Bench press':'Leg press'} curve.</p>
     </>}
    </> : <>
     {needsBodyMass?<BodyMassField data={data} update={update} compact/>:bodyweight&&data.settings.bodyMass?<><p className="muted">Your bodyweight: {weightText(data.settings.bodyMass.kg)}</p><details><summary>Update bodyweight</summary><BodyMassField data={data} update={update} compact/></details></>:null}
     {bodyweight&&<p className="muted">{repsOnly?'Keep the same setup each time. PANDR tracks your reps and how many more you could do.':'Your bodyweight is included automatically.'}</p>}
     <div className="form-grid">
      {!bodyweight&&<Field label="Test method"><select value={draft.method} onChange={e=>setDraft({...draft,method:e.target.value as StrengthDraft['method'],reps:e.target.value==='1rm'?1:0,confirmed:false})}><option value="failure">Reps until you cannot do another</option><option value="1rm">One-rep maximum</option></select></Field>}
      {bodyweight&&!partialBody&&<>
       <label className="check-row"><span>Use additional weight</span><input type="checkbox" disabled={needsBodyMass} checked={repsOnly?additionalWeight!==undefined:draft.loadMode==='external'} onChange={e=>setDraft(repsOnly?{...draft,slot:{...draft.slot,bodyweight:{...bodyweight,additionalWeightKg:e.target.checked?0:undefined}},confirmed:false}:{...draft,loadMode:e.target.checked?'external':'bodyweight',load:0,confirmed:false})}/></label>
       {((repsOnly&&additionalWeight!==undefined)||(!repsOnly&&draft.loadMode==='external'))&&<Field label={`Additional weight (${draft.unit})`} hint="The weight of your vest, belt, or added plates."><LoadInput key={`${draft.exerciseId}:added`} min="0" step={draft.slot.increment} value={repsOnly?fromKg(additionalWeight??0,draft.unit):draft.load} observed emptyZero onChange={load=>setDraft(repsOnly?{...draft,slot:{...draft.slot,bodyweight:{...bodyweight,additionalWeightKg:toKg(load,draft.unit)}},confirmed:false}:{...draft,load,confirmed:false})}/></Field>}
       {!repsOnly&&<><label className="check-row"><span>Use assistance</span><input type="checkbox" checked={draft.loadMode==='assistance'} onChange={e=>setDraft({...draft,loadMode:e.target.checked?'assistance':'bodyweight',load:0,confirmed:false})}/></label>{draft.loadMode==='assistance'&&<Field label={`Assistance (${draft.unit})`} hint="The assistance setting on your machine."><LoadInput key={`${draft.exerciseId}:assistance`} min="0" step={draft.slot.increment} value={draft.load} observed emptyZero onChange={load=>setDraft({...draft,load,confirmed:false})}/></Field>}</>}
      </>}
      {!bodyweight&&<Field label={`Weight used (${draft.unit})`} hint="For dumbbells, enter the weight of one dumbbell."><LoadInput key={`${draft.exerciseId}:test`} min={draft.slot.availableLoads?.[0]??0} step={draft.slot.increment} value={draft.load} observed emptyZero onChange={load=>setDraft({...draft,load,confirmed:false})}/></Field>}
      <Field label="Clean repetitions" hint={draft.method==='failure'?repsOnly?'2–100 reps.':'2–15 reps.':undefined}><input aria-label="Clean repetitions" type="number" min={draft.method==='1rm'?1:2} max={draft.method==='1rm'?1:maxReps} disabled={draft.method==='1rm'} value={draft.reps||''} onChange={e=>setDraft({...draft,reps:Number(e.target.value),confirmed:false})}/></Field>
     </div>
     {repError&&<Notice tone="error">{repError}</Notice>}
     <Field label="Exact setup" hint={bodyweight?'Describe the variation so you can repeat it. A bench or plates under your hands go here.':'Machine, seat setting, grip, or anything you need to repeat the test.'}><textarea maxLength={300} value={draft.setup} onChange={e=>setDraft({...draft,setup:e.target.value,confirmed:false})}/></Field>
     {bodyweight&&!repsOnly&&!partialBody&&<details><summary>More test options</summary><Field label="Test method"><select value={draft.method} onChange={event=>setDraft({...draft,method:event.target.value as StrengthDraft['method'],reps:event.target.value==='1rm'?1:0,confirmed:false})}><option value="failure">Reps until you cannot do another</option><option value="1rm">One-rep maximum</option></select></Field></details>}
     <EquipmentSetup key={draft.exerciseId} slot={{...draft.slot,loadMode:draft.loadMode,load:draft.load}} unit={draft.unit} exercise={exercise} exerciseName={name} movementKind={movementKind} bodyMass={data.settings.bodyMass} onChange={equipment}/>
     <label className="check-row"><span>{draft.method==='1rm'?'I completed one clean maximum rep.':'I could not do another clean rep.'}</span><input type="checkbox" checked={draft.confirmed} onChange={e=>setDraft({...draft,confirmed:e.target.checked})}/></label>
     <div className="actions"><Button disabled={busy} onClick={()=>void saveDraft()}>Save assessment progress</Button><Button primary disabled={busy||needsBodyMass||!draft.confirmed||!!repError} onClick={()=>void record()}>Save test result <Check size={17}/></Button></div>
    </>}
    <div className="assessment-rest"><Clock3 size={18}/><span>{remaining?`Rest guide: ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`:'Rest until fully recovered before testing.'}</span></div>
    <div className="actions"><Button disabled={busy||index===0} onClick={()=>void select(index-1)}>Previous</Button><Button disabled={busy||index===active.items.length-1} onClick={()=>void select(index+1)}>Next exercise <ArrowRight size={17}/></Button></div>
    <p className="muted">Your progress is saved to your account. You can train once every exercise in that workout has a baseline. Past tests keep their original results.</p>
   </section>
  </div>
 </>;
}
