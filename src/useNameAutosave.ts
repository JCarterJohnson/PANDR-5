import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Update } from './Train';
import type { RegisterBeforeLeave } from './usePlanAutosave';

/** Saves only the name: unrelated preference drafts and training stay intact. */
export function useNameAutosave(savedName:string,name:string,update:Update,registerBeforeLeave:RegisterBeforeLeave,savedToAccount:boolean,preview:boolean) {
 const committed=useRef(savedName),latest=useRef(name);latest.current=name;
 const running=useRef<Promise<boolean>|undefined>(undefined);
 const saveLatest=useRef<()=>Promise<boolean>>(async()=>true);
 const [saving,setSaving]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState('');
 const dirty=name!==committed.current;
 saveLatest.current=()=>{
  if(running.current)return running.current.then(ok=>ok&&latest.current!==committed.current?saveLatest.current():ok);
  if(latest.current===committed.current)return Promise.resolve(true);
  const snapshot=latest.current;setSaving(true);setError('');
  const task=(async()=>{
   try {await update(d=>({...d,settings:{...d.settings,name:snapshot}}));committed.current=snapshot;setSaved(true);return true}
   catch(e){setError(`Name not saved: ${(e as Error).message}`);return false}
   finally{running.current=undefined;setSaving(false)}
  })();running.current=task;return task;
 };
 useLayoutEffect(()=>registerBeforeLeave(()=>saveLatest.current()),[registerBeforeLeave]);
 useEffect(()=>{
  if(!dirty)return;setSaved(false);
  const timer=setTimeout(()=>void saveLatest.current(),700);return()=>clearTimeout(timer);
 },[name,dirty]);
 useEffect(()=>{
  if(!dirty&&savedName!==name)committed.current=savedName;
  if(error&&!preview&&savedToAccount&&savedName===name){committed.current=name;setError('');setSaved(true)}
 },[savedName,name,dirty,error,savedToAccount,preview]);
 useEffect(()=>{
  const warn=(event:BeforeUnloadEvent)=>{if(latest.current!==committed.current){event.preventDefault();event.returnValue=''}};
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[]);
 return {dirty,saving,saved:saved&&!dirty,failed:!!error,error,save:()=>saveLatest.current()};
}
