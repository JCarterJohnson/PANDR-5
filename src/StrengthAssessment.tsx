import { useEffect, useRef, useState } from 'react';
import { Check, ArrowRight, Clock3, X } from 'lucide-react';
import type { AppData, PlanExercise, StrengthDraft } from './domain/types';
import type { Update } from './Train';
import { assessmentEstimate, finishAssessment, fractionAt, fromKg, prescribedSlot, recordAssessment, pauseAssessment } from './domain/strength';
import { resolveBodyweight } from './domain/bodyweight';
import { workingResistance } from './domain/resistance';
import { EquipmentSetup } from './EquipmentSetup';
import { BodyMassField } from './BodyMassField';
import { assessmentGroup } from './domain/assessment-order';
import { Button, Field, Notice } from './components';

function testDraft(data: AppData, item: StrengthDraft, infer = true): StrengthDraft {
 const draft = structuredClone(item);
 const exercise = data.exercises.find(e => e.id === item.exerciseId);
 if (infer && !draft.slot.bodyweight && !draft.resultId && (draft.loadMode === 'bodyweight' || /bodyweight/i.test(exercise?.equipment ?? '') && !draft.setup.trim() && draft.reps===0 && draft.load===0)) {
  const full = /pull[- ]?ups?|chin[- ]?ups?|\bdips?\b/i.test(exercise?.name ?? '');
  const mass = data.settings.bodyMass?.kg;
  draft.slot.bodyweight = {tracking: full && mass ? 'full-body' : 'reps-only', resistance: full && mass ? fromKg(mass, draft.unit) : 0, addedLoads: [], assistanceLoads: [], ...(mass ? {bodyMassKg: mass} : {})};
  draft.loadMode = 'bodyweight'; draft.load = 0;
 }
 const before=draft.slot.bodyweight;
 draft.slot = resolveBodyweight({...draft.slot,load:draft.load,loadMode:draft.loadMode}, data.settings);
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
 const automaticWholeBody = useRef(!active.items[index].slot.bodyweight && /pull[- ]?ups?|chin[- ]?ups?|\bdips?\b/i.test(data.exercises.find(e=>e.id===active.items[index].exerciseId)?.name??''));
 useEffect(() => {const t=setInterval(() => setNow(Date.now()),1000);return () => clearInterval(t)},[]);
 useEffect(() => {
  if(mass.current === data.settings.bodyMass?.kg)return;
  mass.current = data.settings.bodyMass?.kg;
  setDraft(previous => {
   if(previous.resultId)return previous;
   let slot={...previous.slot,load:previous.load,loadMode:previous.loadMode};
   if(automaticWholeBody.current&&data.settings.bodyMass&&slot.bodyweight?.tracking==='reps-only'){slot={...slot,bodyweight:{...slot.bodyweight,tracking:'full-body',resistance:fromKg(data.settings.bodyMass.kg,previous.unit),bodyMassKg:data.settings.bodyMass.kg}};}
   slot=resolveBodyweight(slot,data.settings);
   return {...previous,slot,load:slot.load,loadMode:slot.loadMode,confirmed:false,reps:previous.method==='1rm'?1:0};
  });
 },[data.settings.bodyMass?.kg,data.settings.unit]);
 const saved = active.items[index].resultId;
 const result = data.strength!.assessments.find(a => a.id === saved);
 const completed = active.items.filter(i => i.resultId).length;
 const exercise = data.exercises.find(e => e.id === draft.exerciseId);
 const name = exercise?.name ?? draft.exerciseId;
 const bodyweight = draft.slot.bodyweight;
 const repsOnly = bodyweight?.tracking === 'reps-only';
 const partialBody = !!bodyweight && !repsOnly && bodyweight.tracking!=='full-body';
 const maxReps = repsOnly ? 100 : 15;
 const repError = draft.reps && draft.method === 'failure' && (!Number.isInteger(draft.reps) || draft.reps < 2 || draft.reps > maxReps)
  ? repsOnly ? 'Enter 2–100 whole clean repetitions for a reps-only test.' : 'Load estimates accept 2–15 clean reps. Use a harder measured setup and retest, or choose reps-only tracking for an unmeasured bodyweight movement.' : '';
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
 async function select(i:number) {setBusy(true);if(await saveDraft()){setIndex(i);automaticWholeBody.current=!active.items[i].slot.bodyweight&&/pull[- ]?ups?|chin[- ]?ups?|\bdips?\b/i.test(data.exercises.find(e=>e.id===active.items[i].exerciseId)?.name??'');setDraft(testDraft(data,active.items[i]));setError('')}setBusy(false)}
 async function record() {setBusy(true);try{await update(d => recordAssessment(d,index,draft));setNow(Date.now());setRestUntil(Date.now()+300000);setError('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const remaining = Math.max(0,Math.ceil((restUntil-now)/1000));
 return <>
  <header className="page-heading"><div><h1>Strength assessment</h1><p>{active.initial?'Initial baseline · required in every mode':'Exercise reassessment'} · {completed} of {active.items.length} exercises tested</p></div><div className="actions">
   <Button disabled={busy} onClick={async()=>{setBusy(true);try{if(await saveDraft())await update(d=>pauseAssessment(d));}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}><X size={18}/> Save and exit</Button>
   <Button disabled={busy||completed===0} primary onClick={async()=>{setBusy(true);try{if(await saveDraft())await update(d=>finishAssessment(d));else setBusy(false);}catch(e){setError((e as Error).message);setBusy(false)}}}>Finish assessment <Check size={18}/></Button>
  </div></header>
  <div className="session-progress"><i style={{width:`${completed/active.items.length*100}%`}}/></div>
  <Notice><strong>This visit is for assessment.</strong><p>Warm up and use the setup you will use in training. Count clean reps until the next clean rep is impossible: that is 0 RIR. Stop for pain or technique breakdown.</p><p>For a measured-load test, prefer 3–10 reps; 2–15 are accepted. Unmeasured bodyweight movements can use a reps-only test. Rest 3–5 minutes between attempts, longer if needed. Save and exit to continue another day. Tests do not count toward training volume.</p></Notice>
  {error&&<Notice tone="error">{error}</Notice>}
  <p className="assessment-order-note">Exercises stay together by primary muscle group, in the order each group first appears in your plan. Save and exit to split testing across visits.</p>
  <div className="logging-grid"><aside className="exercise-picker">{active.items.map((item,i)=>{const movement=data.exercises.find(e=>e.id===item.exerciseId);return <button disabled={busy} className={i===index?'selected':''} key={item.exerciseId} onClick={()=>void select(i)}><span>{String(i+1).padStart(2,'0')}</span><strong><small className="assessment-group">{assessmentGroup(movement)}</small>{movement?.name??item.exerciseId}</strong><small>{item.resultId?'Tested':item.reason==='stale'?'14+ days':item.reason==='setup'?'Setup changed':'Baseline needed'}</small></button>})}</aside>
   <section className="panel log-panel assessment-panel"><h2>{name}</h2>
    {result ? <>
     <Notice tone="success"><strong>Baseline saved</strong><p>{result.bodyweight?.tracking==='reps-only'?'Reps-only bodyweight':result.loadMode==='bodyweight'?'Bodyweight only':`${result.load} ${result.unit} ${result.loadMode==='assistance'?'assistance':result.bodyweight?'added weight':'test load'}`} · {result.reps} clean rep{result.reps===1?'':'s'} · {result.method==='1rm'?'tested 1RM':'failure set'}</p>{result.bodyweight?.bodyMassKg&&<p>Your weight at this test: {fromKg(result.bodyweight.bodyMassKg,result.unit).toFixed(1)} {result.unit}. This observation keeps its original weight.</p>}</Notice>
     <h3>Your starting workout loads</h3>
     {data.plan.days.flatMap(day=>day.exercises.filter(slot=>slot.exerciseId===result.exerciseId).map(slot=>{try{const prescription=prescribedSlot(data,slot);return <p key={slot.id}><strong>{day.name}: {prescription.loadMode==='bodyweight'?'Bodyweight only':`${prescription.load} ${data.settings.unit} ${prescription.loadMode==='assistance'?'assistance':prescription.bodyweight?'added weight':'load'}`}</strong> · {slot.repMin}–{slot.repMax} reps · RIR {slot.rir.join(' → ')}</p>}catch(e){return <Notice key={slot.id} tone="error">{day.name}: {(e as Error).message}</Notice>}}))}
     <p className="muted">These loads seed the first workout. After that, PANDR-5 uses your completed anchor set to choose the next load.</p>
     <p>{result.setup}</p>
     {result.bodyweight?.tracking==='reps-only' ? <Notice>Your reps and RIR are tracked for this exact setup. No load or 1RM is estimated. If your bodyweight, hand height, or setup changes, retest; the app cannot calculate a percentage change without measured resistance.</Notice> : <>
      <h3>Estimated fresh-set capacity</h3><p>Estimates at 0 RIR before equipment rounding. Training allows for your prescribed RIR. For bodyweight movements, these numbers are total resistance, including added weight or subtracting assistance.</p>
      <div className="strength-estimates">{[1,3,5,8,10,12,15,20].map(reps=><div key={reps}><small>{reps} reps</small><strong>{(fromKg(assessmentEstimate(result),result.unit)*fractionAt(reps,result.curve)).toFixed(1)} {result.unit}</strong></div>)}</div>
      <p className="muted">{result.method==='1rm'?'The single was measured; higher-rep capacities use a population curve.':'One measured point anchors a population curve; predictions farther from the test are less certain.'} {result.curve==='general'?'General':result.curve==='bench'?'Bench press':'Leg press'} curve.</p>
     </>}
    </> : <>
     {(bodyweight||draft.loadMode!=='external'||/bodyweight/i.test(exercise?.equipment??''))&&<BodyMassField data={data} update={update} compact/>}
     <EquipmentSetup key={draft.exerciseId} slot={{...draft.slot,loadMode:draft.loadMode,load:draft.load}} unit={draft.unit} exerciseName={name} bodyMass={data.settings.bodyMass} onChange={equipment}/>
     <div className="form-grid">
      <Field label="Test method"><select value={draft.method} disabled={repsOnly} onChange={e=>setDraft({...draft,method:e.target.value as StrengthDraft['method'],reps:e.target.value==='1rm'?1:0,confirmed:false})}><option value="failure">{repsOnly?'Clean reps to momentary failure':'Known load to momentary failure'}</option><option value="1rm">True one-repetition maximum</option></select></Field>
      {bodyweight&&!repsOnly&&<Field label="Test setup"><select value={draft.loadMode} onChange={e=>setDraft({...draft,loadMode:e.target.value as StrengthDraft['loadMode'],load:0,confirmed:false})}><option value="bodyweight">Bodyweight only · nothing added</option><option value="external">{partialBody?'Added resistance · measured at your hands':'Added weight · carried on your body'}</option><option value="assistance">{partialBody?'Assisted · measured reduction at your hands':'Assisted · measured counterweight'}</option></select></Field>}
      {draft.loadMode!=='bodyweight'&&<Field label={`${bodyweight?(draft.loadMode==='assistance'?partialBody?'Support reduction used':'Assistance used':partialBody?'Added resistance used':'Added weight used'):'Test load'} (${draft.unit})`} hint={partialBody?draft.loadMode==='assistance'?'Measure unassisted support minus assisted support at your hands. Enter the measured reduction, not the weight of a platform or band label.':'Measure support at your hands with the carried weight, then subtract your unweighted hand support. Enter that difference; the vest or plate label is not the added resistance at your hands.':bodyweight?draft.loadMode==='assistance'?'Enter the measured assistance, such as the assisted machine counterweight. Band color or hand height is not a measured assistance weight.':'Only weight you carry: a vest, belt, or securely attached load. Do not enter your bodyweight or weights used as a platform.':'Record the same total or per-dumbbell convention every time.'}><input type="number" min={bodyweight?'0':'0.01'} step="any" value={draft.load||''} onChange={e=>setDraft({...draft,load:Number(e.target.value),confirmed:false})}/></Field>}
      <Field label="Clean repetitions" hint={repsOnly?'2–100 reps for this exact setup.':draft.method==='failure'?'2–15 reps for a measured-load estimate.':undefined}><input aria-label="Clean repetitions" type="number" min={draft.method==='1rm'?1:2} max={draft.method==='1rm'?1:maxReps} disabled={draft.method==='1rm'} value={draft.reps||''} onChange={e=>setDraft({...draft,reps:Number(e.target.value),confirmed:false})}/></Field>
     </div>
     {repError&&<Notice tone="error">{repError}</Notice>}
     {bodyweight&&!repsOnly&&bodyweight.resistance>0&&<p className="resistance-equation"><strong>Test resistance: {bodyweight.resistance.toFixed(1)} {draft.unit}{draft.loadMode!=='bodyweight'?` ${draft.loadMode==='assistance'?'−':'+'} ${draft.load.toFixed(1)} ${draft.unit}`:''} = {workingResistance({...draft,bodyweight}).toFixed(1)} {draft.unit}</strong><br/><span className="muted">RIR is the clean reps you could still perform. Your weight changes the load estimate, not the meaning of RIR.</span></p>}
     <Field label="Exact setup" hint={bodyweight?'Record hand or foot height, platforms, grip and range of motion. Plates under your hands are a platform; their weight is neither added load nor assistance. Retest after changing the setup.':'Machine / station, seat setting, grip, range of motion, tempo, and whether dumbbell load is per hand. Retest after changing the setup.'}><textarea maxLength={300} value={draft.setup} onChange={e=>setDraft({...draft,setup:e.target.value,confirmed:false})}/></Field>
     <label className="check-row"><span>{draft.method==='1rm'?'I completed one clean maximum rep without pain, help or reduced range of motion.':'The next clean rep was impossible despite trying; this was 0 RIR, without pain, help or reduced range of motion.'}</span><input type="checkbox" checked={draft.confirmed} onChange={e=>setDraft({...draft,confirmed:e.target.checked})}/></label>
     <div className="actions"><Button disabled={busy} onClick={()=>void saveDraft()}>Save assessment progress</Button><Button primary disabled={busy||!draft.confirmed||!!repError} onClick={()=>void record()}>Save test result <Check size={17}/></Button></div>
    </>}
    <div className="assessment-rest"><Clock3 size={18}/><span>{remaining?`Rest guide: ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`:'Rest until fully recovered before testing.'}</span></div>
    <div className="actions"><Button disabled={busy||index===0} onClick={()=>void select(index-1)}>Previous</Button><Button disabled={busy||index===active.items.length-1} onClick={()=>void select(index+1)}>Next exercise <ArrowRight size={17}/></Button></div>
    <p className="muted">Saved results and progress resume from your account. You can train once every exercise in that workout has a current baseline. Update your weight once in Settings; linked movements use it for future workouts, and completed tests and workouts keep their original weights.</p>
   </section>
  </div>
 </>;
}
