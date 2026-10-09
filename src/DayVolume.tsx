import { useState } from 'react';
import type { Exercise, TrainingPlan } from './domain/types';
import { calculateVolume, scaleTrainingDays, validatePlan } from './domain/engine';
import { MUSCLES } from './data/seed';
import { Button, Field, Modal, Notice, numberValue } from './components';

export function DayVolume({plan,exercises,dayId,strict,onApply,onClose}:{plan:TrainingPlan;exercises:Exercise[];dayId:string;strict:boolean;onApply:(plan:TrainingPlan,message:string)=>void;onClose:()=>void}) {
  const training = plan.days.filter(d=>d.kind==='training' && d.exercises.length);
  const [selected,setSelected] = useState<string[]>([dayId]);
  const [percent,setPercent] = useState(100);
  const musclesFor = (ids:string[]) => new Set(plan.days.filter(d=>ids.includes(d.id)).flatMap(d=>d.exercises.flatMap(s=>exercises.find(e=>e.id===s.exerciseId)?.contributions.map(c=>c.muscle)??[])));
  const [reference,setReference] = useState(()=>[...musclesFor([dayId])].find(m=>plan.targets[m]!==undefined)??'');
  const result = scaleTrainingDays(plan,exercises,selected,percent);
  const before = calculateVolume(plan,exercises), after = calculateVolume(result.plan,exercises);
  const affected = musclesFor(selected);
  const rows = before.filter(r=>affected.has(r.muscle));
  const selectedVolume = calculateVolume({...plan,days:plan.days.filter(d=>selected.includes(d.id))},exercises).find(r=>r.muscle===reference)?.total??0;
  const fixedVolume = (before.find(r=>r.muscle===reference)?.total??0)-selectedVolume;
  const referenceName = MUSCLES.find(m=>m.id===reference)?.name??reference;
  const legDays = training.filter(d=>/leg|lower/i.test(d.name)).map(d=>d.id);
  const constrained = strict ? validatePlan(result.plan,exercises,true).filter(i=>i.severity==='error') : [];
  const setVolume = (n:number) => setPercent(Math.min(200,Math.max(1,n)));
  return <Modal title="Scale day volume" onClose={onClose}>
    <p>Scale one day or a group of days together. Enter a reference muscle’s desired weekly sets, or drag the slider. The other exercises follow the same proportion.</p>
    <div className="actions"><Button small onClick={()=>setSelected([dayId])}>This day</Button>{legDays.length>1&&<Button small onClick={()=>{setSelected(legDays);if(musclesFor(legDays).has('quads'))setReference('quads')}}>Legs + Lower</Button>}</div>
    <div className="volume-day-choices">{training.map(d=><label className="check-row" key={d.id}><span>Day {plan.days.indexOf(d)+1} · {d.name}</span><input aria-label={`Scale ${d.name}`} type="checkbox" checked={selected.includes(d.id)} onChange={e=>setSelected(e.target.checked?[...selected,d.id]:selected.filter(id=>id!==d.id))}/></label>)}</div>
    <div className="form-grid"><Field label="Reference muscle"><select value={affected.has(reference)?reference:''} onChange={e=>setReference(e.target.value)}><option value="">Choose a muscle</option>{rows.map(r=><option key={r.muscle} value={r.muscle}>{MUSCLES.find(m=>m.id===r.muscle)?.name??r.muscle}</option>)}</select></Field>
    <Field label={`Desired weekly sets for ${referenceName||'reference muscle'}`} hint="The whole-set result appears below. Work on unselected days stays fixed."><input aria-label={`Desired weekly sets for ${referenceName||'reference muscle'}`} type="number" min="0" max="300" step="0.25" disabled={!selectedVolume || !affected.has(reference)} value={Math.round((fixedVolume+selectedVolume*percent/100)*100)/100} onChange={e=>setVolume((numberValue(e.target.value)-fixedVolume)/selectedVolume*100)}/></Field></div>
    <Field label="Volume percentage" hint="60% changes 20 sets to 12 before whole-set rounding."><input aria-label="Volume percentage" type="number" min="1" max="200" step="1" value={Math.round(percent*100)/100} onChange={e=>setVolume(numberValue(e.target.value))}/></Field>
    <input className="volume-slider" aria-label="Day volume percentage" type="range" min="1" max="200" step="1" value={percent} onChange={e=>setVolume(numberValue(e.target.value))}/>
    <h3>Working sets by day</h3>{training.filter(d=>selected.includes(d.id)).map(d=><div className="data-line" key={d.id}><span>{d.name}</span><strong>{d.exercises.reduce((sum,s)=>sum+s.sets,0)} → {result.plan.days.find(day=>day.id===d.id)!.exercises.reduce((sum,s)=>sum+s.sets,0)}</strong></div>)}
    <h3 className="volume-preview-title">Weekly muscle sets</h3>{rows.map(r=><div className="data-line" data-muscle={r.muscle} key={r.muscle}><span>{MUSCLES.find(m=>m.id===r.muscle)?.name??r.muscle}{r.target!==undefined&&<small className="muted"> · target follows volume</small>}</span><strong>{r.total} → {after.find(a=>a.muscle===r.muscle)!.total}</strong></div>)}
    <p className="muted">Weekly totals include all days and fractional credits. Existing selected targets follow the new totals; other muscle groups stay unselected. Exercise choices, loads and unselected days stay unchanged. Each retained exercise keeps at least one set.</p>
    {result.issues.map((i,n)=><Notice key={n} tone={i.severity==='error'?'error':'info'}>{i.message}</Notice>)}
    {!!constrained.length&&<Notice>These changes fall outside constrained-mode checks. Review the plan checks before saving; weekly targets below 10 require custom mode in Settings.</Notice>}
    <Button primary disabled={percent===100||result.issues.some(i=>i.severity==='error')} onClick={()=>{onApply(result.plan,`Volume scaled to ${Math.round(percent*100)/100}% for ${selected.map(id=>training.find(d=>d.id===id)!.name).join(' + ')}. Affected muscle targets now match the planned weekly totals. Review and save your plan.`);onClose()}}>Apply day volume</Button>
    <Button onClick={onClose}>Cancel</Button>
  </Modal>;
}
