import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AppData, TrainingPlan } from './domain/types';
import { availableExercises, catalogForPlan } from './data/catalog';
import { validatePlan } from './domain/engine';
import { planSchema } from './domain/validation';
import type { Update } from './Train';

export type RegisterBeforeLeave = (save:()=>Promise<boolean>)=>()=>void;
const signature=(plan:TrainingPlan)=>JSON.stringify({...plan,updatedAt:undefined});

export function usePlanAutosave(data:AppData,draft:TrainingPlan,setDraft:(plan:TrainingPlan)=>void,update:Update,registerBeforeLeave:RegisterBeforeLeave,onError:(message:string)=>void) {
  const committed=useRef(signature(data.plan));
  const latest=useRef(draft);latest.current=draft;
  const running=useRef<Promise<boolean>|undefined>(undefined);
  const saveLatest=useRef<()=>Promise<boolean>>(async()=>true);
  const [saving,setSaving]=useState(false),[saved,setSaved]=useState(false);
  const [failed,setFailed]=useState(false);
  const value=signature(draft),dirty=value!==committed.current;
  const errors=validatePlan(draft,availableExercises(data.exercises),data.settings.strict).filter(i=>i.severity==='error');
  const canSave=!data.activeSession&&!errors.length&&planSchema.safeParse(draft).success;

  saveLatest.current=()=>{
    if(running.current)return running.current.then(ok=>ok&&signature(latest.current)!==committed.current?saveLatest.current():ok);
    if(signature(latest.current)===committed.current)return Promise.resolve(true);
    if(!canSave){onError(data.activeSession?'Finish your active workout before saving plan changes.':'Your changes are still here. Fix the plan checks below before they can be saved or you leave this page.');return Promise.resolve(false)}
    const snapshot=structuredClone(latest.current);
    setSaving(true);setFailed(false);
    const task=(async()=>{
      try {
        await update(d=>({...d,exercises:catalogForPlan(d.exercises,snapshot),plan:{...snapshot,updatedAt:new Date().toISOString()}}));
        committed.current=signature(snapshot);setSaved(true);return true;
      } catch(e){setFailed(true);onError((e as Error).message);return false}
      finally{running.current=undefined;setSaving(false)}
    })();
    running.current=task;return task;
  };

  useLayoutEffect(()=>registerBeforeLeave(()=>saveLatest.current()),[registerBeforeLeave]);
  useEffect(()=>{
    if(!dirty||!canSave)return;
    setSaved(false);setFailed(false);
    const timer=setTimeout(()=>void saveLatest.current(),700);
    return()=>clearTimeout(timer);
  },[value,dirty,canSave]);
  // Account merges and recorded assessments may update prescription loads.
  // Refresh the editor only when it has no unapplied local changes.
  useEffect(()=>{
    if(!dirty&&!saving&&signature(data.plan)!==value){committed.current=signature(data.plan);setDraft(structuredClone(data.plan))}
  },[data.plan,dirty,saving,value,setDraft]);
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if(signature(latest.current)!==committed.current){event.preventDefault();event.returnValue=''}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[]);
  return {dirty,saving,failed,saved:saved&&!dirty,canSave,save:()=>saveLatest.current()};
}
