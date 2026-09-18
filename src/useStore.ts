import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData } from './domain/types';
import { validateAppData } from './domain/validation';
import { createInitialData } from './data/seed';
import { allocateSets } from './domain/engine';
import { loadData, saveData } from './services/storage';
import { getCloudClient, readCloudData, syncData } from './services/cloud';

export function useStore() {
 const [data,setData]=useState<AppData>();const [profile,setProfile]=useState('local');const [email,setEmail]=useState('');const [error,setError]=useState('');const [status,setStatus]=useState('Opening your training log…');const [busy,setBusy]=useState(false);const [ready,setReady]=useState(false);
 const queue=useRef(Promise.resolve());const current=useRef<AppData | undefined>(undefined);const profileRef=useRef('local');const generation=useRef(0);const busyRef=useRef(false);const client=useRef(getCloudClient()).current;
 const openProfile=useCallback(async(id:string,emailAddress='')=>{const gen=++generation.current;setReady(false);setBusy(true);busyRef.current=true;await queue.current;profileRef.current=id;setProfile(id);setEmail(emailAddress);try{let loaded=await loadData(id);if(!loaded&&id!=='local')loaded=(await readCloudData(id))??undefined;if(!loaded){loaded=createInitialData();const result=allocateSets(loaded.plan,loaded.exercises);loaded.plan=result.plan;await saveData(id,loaded)}if(gen!==generation.current)return;current.current=loaded;setData(loaded);setStatus(id==='local'?'Saved on this device':'Account loaded');setReady(true);setError('')}catch(e){if(gen===generation.current)setError(String((e as Error).message))}finally{if(gen===generation.current){setBusy(false);busyRef.current=false}}},[]);
 useEffect(() => {
  let alive = true;
  const localOpened = openProfile('local');
  if (!client) return () => { alive = false; };
  void (async () => {
   const initialized = await client.auth.initialize();
   await localOpened;
   if (!alive) return;
   if (initialized.error) setError(`Sign-in could not finish: ${initialized.error.message}`);
   const { data: auth, error: sessionError } = await client.auth.getSession();
   if (!alive) return;
   if (sessionError) setError(sessionError.message);
   if (auth.session && profileRef.current !== auth.session.user.id) {
    await openProfile(auth.session.user.id, auth.session.user.email);
   }
  })().catch(e => { if (alive) setError((e as Error).message); });
  const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
   if (!alive || (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT')) return;
   const id = session?.user.id ?? 'local';
   if (id !== profileRef.current) void openProfile(id, session?.user.email);
  });
  return () => { alive = false; subscription.subscription.unsubscribe(); };
 }, [client, openProfile]);
 const update=useCallback((change:(data:AppData)=>AppData):Promise<void>=>{if(busyRef.current)return Promise.reject(new Error('Please wait for the current save or sync to finish.'));const id=profileRef.current;const gen=generation.current;const work=async()=>{if(gen!==generation.current||!current.current)return;const next=change(structuredClone(current.current));next.updatedAt=new Date().toISOString();validateAppData(next);current.current=next;setData(next);setStatus('Saving…');await saveData(id,next);if(gen===generation.current){setStatus(id==='local'?'Saved on this device':'Saved on this device · sync pending')}};const task=queue.current.then(work);queue.current=task.catch(e=>{setError(e.message);setStatus('Save failed — export a backup')});return task},[]);
 const sync=useCallback(async()=>{if(profileRef.current==='local'||busyRef.current)return;busyRef.current=true;setBusy(true);try{await queue.current;if(!current.current)return;const result=await syncData(profileRef.current,current.current);current.current=result.data;setData(result.data);setStatus('Synced to your account');setError('')}catch(e){setError((e as Error).message);setStatus('Saved locally · sync needs attention')}finally{busyRef.current=false;setBusy(false)}},[]);
 useEffect(()=>{if(!ready||profile==='local'||!navigator.onLine||data?.activeSession||!['Saved on this device · sync pending','Account loaded'].includes(status))return;const timer=setTimeout(()=>void sync(),8000);return ()=>clearTimeout(timer)},[data,profile,ready,status,sync]);
 useEffect(()=>{const online=()=>{if(profileRef.current!=='local'&&!current.current?.activeSession)void sync()};window.addEventListener('online',online);return ()=>window.removeEventListener('online',online)},[sync]);
 return {data,update,error,setError,status,busy,ready,profile,email,client,sync,openProfile};
}
