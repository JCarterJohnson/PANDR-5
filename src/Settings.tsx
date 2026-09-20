import { convertPlanLoads } from './domain/coaching';
import { useEffect, useRef, useState } from 'react';
import { Account } from './Account';
import { Download, Upload, Check, Cloud, MessageCircle } from 'lucide-react';
import { Support } from './Support';
import type { AppData, Settings as SettingsType } from './domain/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Update } from './Train';
import { validatePlan } from './domain/engine';
import { activeCycle, cyclesFor, endCycle, inActiveCycle, localDate, scheduledCheckInDay, startCycle, weekdays } from './domain/training';
import { exportBackup, exportCsv, parseBackup, restoreBackup } from './services/backup';
import { loadData } from './services/storage';
import { Button, Field, HelpButton, Modal, Notice, download, readFile, numberValue } from './components';

export function Settings({data,update,client,profile,email,sync,signOut,pending,goPlan,goMethod,goHistory}:{
 data:AppData;update:Update;client:SupabaseClient|null;profile:string;email:string;sync:()=>Promise<void>;signOut:()=>Promise<void>;pending:boolean;goPlan:()=>void;goMethod:(section:string)=>void;goHistory:()=>void;
}) {
 const [draft,setDraft]=useState<SettingsType>(data.settings);
 const [message,setMessage]=useState('');const [error,setError]=useState('');const [restore,setRestore]=useState<AppData>();const [saving,setSaving]=useState(false);
 const [newCycleId,setNewCycleId]=useState(()=>crypto.randomUUID());const [cycleAction,setCycleAction]=useState<'new'|'end'>();const [cycleName,setCycleName]=useState(`Cycle ${cyclesFor(data).length+1}`);const [cycleDate,setCycleDate]=useState(localDate());
 const cycle=activeCycle(data);const hasRecords=data.sessions.some(s=>inActiveCycle(data,s))||data.checkIns.some(c=>inActiveCycle(data,c));
 const [legacy,setLegacy]=useState<{label:string;data:AppData}[]>([]);
 useEffect(()=>{let alive=true;void Promise.all((profile==='local'?['local']:['local',profile]).map(async id=>({label:id==='local'?'Previous local profile':'Previous account copy',data:await loadData(id)}))).then(rows=>{if(alive)setLegacy(rows.filter((r):r is {label:string;data:AppData}=>!!r.data))}).catch(()=>{});return ()=>{alive=false}},[profile]);
 const lastSavedSettings=useRef(JSON.stringify(data.settings));const currentDraft=useRef(draft);currentDraft.current=draft;
 useEffect(()=>{const next=JSON.stringify(data.settings),previous=lastSavedSettings.current;if(next===previous)return;lastSavedSettings.current=next;const edited=JSON.stringify(currentDraft.current);if(edited===previous||edited===next)setDraft(data.settings);else setError('Account preferences changed while you were editing. Review your changes before saving.')},[data.settings]);
 async function save(){
  setError('');setMessage('');if(data.activeSession){setError('Finish your active session before changing settings.');return}
  if(draft.increasePercent<2||draft.increasePercent>5||draft.decreasePercent<2||draft.decreasePercent>3||draft.restSeconds<0||!Number.isInteger(draft.restSeconds)||!draft.startDate){setError('Use a 2–5% increase, 2–3% decrease, a start date, and a whole rest duration of at least 0 seconds.');return}
  if((hasRecords||cycle.endedAt)&&draft.startDate!==cycle.startDate){setError('Start a new cycle to reset Week 1 while keeping your history.');return}
  const issues=validatePlan(data.plan,data.exercises,draft.strict).filter(i=>i.severity==='error');if(issues.length){setError(issues[0].message);return}
  setSaving(true);try{await update(d=>{
   if(!draft.strict||draft.adaptiveRecovery===false)delete d.plan.recovery;
   if(d.settings.unit!==draft.unit){const factor=draft.unit==='lb'?2.20462262185:1/2.20462262185;d.plan=convertPlanLoads(d.plan,factor);d.plan.updatedAt=new Date().toISOString()}
   if(d.cycles)activeCycle(d).startDate=draft.startDate;
   d.settings=draft;return d;
  });setMessage(profile==='local'?'Preview preferences applied. Sign in to save them.':'Preferences saved to your account. Historical sessions keep their original units.')}catch(e){setError((e as Error).message)}finally{setSaving(false)}
 }
 async function stageRestore(file:File){try{setRestore(parseBackup(await readFile(file)));setError('')}catch(e){setError((e as Error).message)}}
 const draftSchedule=scheduledCheckInDay({...data,settings:draft,cycles:data.cycles?.map(c=>c.id===data.activeCycleId?{...c,startDate:draft.startDate}:c)});
 const restWeekdays=data.plan.days.flatMap((day,i)=>day.kind==='rest'?[(new Date(`${draft.startDate}T12:00:00`).getDay()+i)%7]:[]);
 return <>
  <header className="page-heading"><div><h1>Settings</h1><p>Training preferences, account, and data.</p></div></header>
  {message&&<Notice tone="success">{message}</Notice>}{error&&<Notice tone="error">{error}</Notice>}
  <div className="settings-grid"><div><section className="panel"><h2>Training preferences</h2>
   <Field label="Your name"><input value={draft.name} maxLength={100} onChange={e=>setDraft({...draft,name:e.target.value})}/></Field>
   <Field label="Appearance"><select value={draft.theme??'automatic'} onChange={e=>setDraft({...draft,theme:e.target.value as SettingsType['theme']})}><option value="light">Light</option><option value="dark">Dark Mode</option><option value="automatic">Automatic (device setting)</option></select></Field>
   <label className="switch-row"><div><h3>Constrained PANDR-5 mode</h3><p>Five training days, non-competing split, 10–20 effective sets for selected muscles, and the RIR staircase.</p></div><input role="switch" aria-label="Constrained PANDR-5 mode" type="checkbox" checked={draft.strict} onChange={e=>setDraft({...draft,strict:e.target.checked})}/></label>
   <label className="switch-row"><div><h3>Automatic recovery volume</h3><p>In constrained mode, repeated recovery flags allow small set reductions within 10–20 effective sets. Three recovered, attended normal weeks allow gradual restoration. Your saved plan stays the ceiling. Turning this off restores its full set counts; qualifying pivots still apply.</p></div><input role="switch" aria-label="Automatic recovery volume" type="checkbox" checked={draft.adaptiveRecovery!==false} disabled={!draft.strict} onChange={e=>setDraft({...draft,adaptiveRecovery:e.target.checked})}/></label>
   <p>Turn this off to choose any 1–7 training days and weekly volume. Changes take effect when you save.</p>
   <div className="form-grid"><Field label="Weight unit"><select value={draft.unit} onChange={e=>setDraft({...draft,unit:e.target.value as 'kg'|'lb'})}><option value="kg">Kilograms (kg)</option><option value="lb">Pounds (lb)</option></select></Field>
    <Field label="Current cycle · Week 1 begins" hint={hasRecords||cycle.endedAt?'Start a new cycle below to reset Week 1.':'Day 1 of the plan starts on this date.'}><input type="date" disabled={hasRecords||!!cycle.endedAt} value={draft.startDate} onChange={e=>setDraft({...draft,startDate:e.target.value})}/></Field>
   </div>
   <div className="section-head compact"><h3>Load progression</h3><HelpButton label="Explain load changes in The method" onClick={()=>goMethod('load-progression')}/></div>
   <p>Increase after reaching the rep cap; reduce after falling below the rep floor at 0–1 RIR.</p>
   <div className="form-grid"><Field label="Load increase (%)" hint="PANDR-5 range: 2–5%"><input type="number" min="2" max="5" step="0.5" value={draft.increasePercent} onChange={e=>setDraft({...draft,increasePercent:numberValue(e.target.value)})}/></Field><Field label="Load reduction (%)" hint="PANDR-5 range: 2–3%"><input type="number" min="2" max="3" step="0.5" value={draft.decreasePercent} onChange={e=>setDraft({...draft,decreasePercent:numberValue(e.target.value)})}/></Field><Field label="Rest timer (seconds)"><input type="number" min="0" max="86400" step="15" value={draft.restSeconds} onChange={e=>setDraft({...draft,restSeconds:numberValue(e.target.value)})}/></Field></div>
   <div className="section-head compact"><h3>Weekly check-in</h3><HelpButton label="Read the recovery evidence in The method" onClick={()=>goMethod('recovery-evidence')}/></div>
   <Field label="Check-in weekday"><select value={draft.checkInDay??'auto'} onChange={e=>setDraft({...draft,checkInDay:e.target.value==='auto'?undefined:Number(e.target.value)})}><option value="auto">Last rest day of the plan (automatic)</option>{weekdays.map((name,i)=><option key={name} value={i}>{name}{restWeekdays.includes(i)?' · rest day':''}</option>)}</select></Field>
   <p>Every {weekdays[draftSchedule]}, once per training week. Check-in prompts appear only on that day, using your device’s local date and time. {restWeekdays.includes(draftSchedule)?'Scheduled on a rest day.':'This is a training day in your current plan.'}</p>
   <div className="actions"><Button primary disabled={saving||!!data.activeSession} onClick={()=>void save()}>Save preferences <Check size={17}/></Button><Button onClick={goPlan}>Edit your plan</Button></div>
  </section>
  <section className="panel"><h2>Training cycles</h2><p>A cycle keeps a stretch of training together, however long it lasts. End it when you stop; start another when you return.</p>
   <div className="cycle-list">{cyclesFor(data).map(c=><div className="data-line" key={c.id}><span><strong>{c.name}</strong><br/>{c.startDate} → {c.endedAt??'ongoing'}</span><span>{data.sessions.filter(s=>(s.cycleId??cyclesFor(data)[0].id)===c.id).length} sessions{c.id===cycle.id&&!c.endedAt?' · current':''}</span></div>)}</div>
   <div className="actions"><Button primary disabled={!!data.activeSession} onClick={()=>{setNewCycleId(crypto.randomUUID());setCycleName(`Cycle ${cyclesFor(data).length+1}`);setCycleDate(localDate());setCycleAction('new')}}>Start a new cycle</Button>{!cycle.endedAt&&<Button disabled={!!data.activeSession||cycle.startDate>localDate()} onClick={()=>setCycleAction('end')}>End current cycle</Button>}<Button onClick={goHistory}>View cycle history</Button></div>
  </section></div>
  <div><Account client={client} profile={profile} email={email} sync={sync} signOut={signOut} pending={pending}/>
   <section className="panel"><h2><Cloud size={21}/> Your data</h2><p>{profile==='local'?'This preview is held in memory and is not saved. Reloading or closing the page clears it.':'Training saves to your Google-linked PANDR-5 account. An internet connection is required. Unsaved changes remain only in this open tab until a save succeeds.'}</p>
    <div className="data-actions"><Button onClick={()=>download('pandr-5-all-time.csv',exportCsv(data),'text/csv;charset=utf-8')}><Download size={17}/> Full all-time CSV</Button><Button onClick={()=>download(`pandr-5-backup-${localDate()}.json`,exportBackup(data),'application/json')}><Download size={17}/> Download complete backup</Button><label className="button"><Upload size={17}/> Restore a backup<input aria-label="Restore a backup" hidden type="file" accept=".json,application/json" disabled={!!data.activeSession} onChange={e=>{const file=e.target.files?.[0];if(file)void stageRestore(file);e.target.value=''}}/></label></div>
    {legacy.length>0&&<Notice><strong>History from the previous app is still available.</strong><p>These old copies have not been deleted or changed. Download one before restoring it into your signed-in account.</p>{legacy.map(({label,data:old})=><Button key={label} small onClick={()=>download(`pandr-5-${label.toLowerCase().replaceAll(' ','-')}.json`,exportBackup(old),'application/json')}>{label} · {old.sessions.length} sessions</Button>)}</Notice>}
   </section>
   <Support key={profile} client={client} profile={profile}/>
   <section className="panel"><h2><MessageCircle size={21}/> Feedback & contact</h2><p>Send ideas, bug reports, or questions to Carter, or join the conversation on r/PANDR5.</p><div className="data-actions"><a className="button" href="https://www.instagram.com/cj.fitguy/" target="_blank" rel="noreferrer">Instagram · @cj.fitguy</a><a className="button" href="https://www.reddit.com/user/iamjohncarterofmars/" target="_blank" rel="noreferrer">Reddit · u/iamjohncarterofmars</a><a className="button" href="https://www.reddit.com/r/PANDR5/" target="_blank" rel="noreferrer">Join r/PANDR5</a></div></section>
   <section className="panel"><h2>TDEE calculator</h2><p>Another project by Carter for estimating daily calorie needs and planning macros, with the formulas and research explained on the site.</p><a className="button" href="https://www.thetdee.com/" target="_blank" rel="noreferrer">Open TDEE calculator</a></section>
   <section className="panel"><h2>Install PANDR-5</h2><p><strong>Desktop:</strong> <a href="https://github.com/JCarterJohnson/PANDR-5/releases" target="_blank" rel="noreferrer">download a desktop build</a>, or use your browser’s Install app / Add to Dock option.</p><p><strong>Phone or tablet:</strong> open the hosted app and choose Add to Home Screen from your browser.</p><small>Account saving needs an internet connection, including in the installed app.</small></section>
  </div></div>
  {cycleAction&&<Modal title={cycleAction==='new'?'Start a new training cycle':'End this training cycle'} onClose={()=>setCycleAction(undefined)}>
   {cycleAction==='new'?<><p>Your current cycle and its history are kept. The new cycle starts at Week 1 using your current plan and working loads. Review those loads before training after a long break.</p><Field label="Cycle name"><input maxLength={100} value={cycleName} onChange={e=>setCycleName(e.target.value)}/></Field><Field label="New cycle starts"><input type="date" min={localDate()} value={cycleDate} onChange={e=>setCycleDate(e.target.value)}/></Field></>:<p>{cycle.name} will end today. All sessions and check-ins remain in History. Start a new cycle when you return.</p>}
   {error&&<Notice tone="error">{error}</Notice>}<Button primary disabled={saving} onClick={async()=>{setSaving(true);setError('');try{await update(d=>cycleAction==='new'?startCycle(d,cycleName,cycleDate,new Date(),newCycleId):endCycle(d));setCycleAction(undefined);setMessage('Training cycle updated.')}catch(e){setError((e as Error).message)}finally{setSaving(false)}}}>{cycleAction==='new'?'Start cycle':'End cycle'}</Button>
  </Modal>}
  {restore&&<Modal title="Restore this backup?" onClose={()=>setRestore(undefined)}><p>{restore.sessions.length} sessions and {restore.checkIns.length} check-ins. This replaces your current plan and preferences. Existing cloud history is retained; conflicting records stop the save for review.</p><Notice>A backup of your current data will download first. {profile==='local'?'Sign in first if you want the restored data to be saved.':''}</Notice><Button primary disabled={saving} onClick={async()=>{setSaving(true);try{download('pandr-5-before-restore.json',exportBackup(data),'application/json');await update(d=>restoreBackup(d,restore));setRestore(undefined);setDraft(restore.settings);setMessage(profile==='local'?'Backup loaded into this unsaved preview.':'Backup saved to your account.')}catch(e){setError((e as Error).message)}finally{setSaving(false)}}}>Back up current data and restore</Button>{error&&<Notice tone="error">{error}</Notice>}</Modal>}
 </>;
}
