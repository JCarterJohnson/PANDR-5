import { createInitialData } from '../../src/data/seed';
import { allocateSets } from '../../src/domain/engine';
import { curveFor, rirValue } from '../../src/domain/strength';
import { localDate } from '../../src/domain/training';
import type { AppData } from '../../src/domain/types';
import type { Page } from '@playwright/test';
import { PUBLIC_CLOUD } from '../../src/data/cloud-config';

/** An isolated, in-process Supabase contract fixture. Never touches live accounts. */
export async function accountFixture(page: Page, seed?: AppData) {
 const userId='0a211e47-82e7-4b8f-9d62-f0bf17195204';
 const email='test-account@example.com';
 const user={id:userId,email,aud:'authenticated',role:'authenticated',app_metadata:{provider:'google'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
 let head:any=seed?{user_id:userId,revision:crypto.randomUUID(),metadata:((({sessions:_,checkIns:__,...meta})=>meta)(seed)),records:[]}:null;const records=new Map<string,any>();let fail=false;
 const token=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:userId,exp:Math.floor(Date.now()/1000)+315360000,aud:'authenticated',role:'authenticated'})).toString('base64url')}.test-signature`;
 await page.addInitScript(({key,token,user})=>{if(!sessionStorage.getItem('fixture-signed-out'))localStorage.setItem(key,JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_in:315360000,expires_at:Math.floor(Date.now()/1000)+315360000,token_type:'bearer',user}));},{key:`sb-${new URL(PUBLIC_CLOUD.url).hostname.split('.')[0]}-auth-token`,token,user});
 await page.route(`${PUBLIC_CLOUD.url}/**`,async route=>{
  const req=route.request(),url=new URL(req.url()),method=req.method();
  if(url.pathname==='/auth/v1/user'){await route.fulfill({json:user});return;}
  if(url.pathname==='/auth/v1/logout'){await page.evaluate(()=>sessionStorage.setItem('fixture-signed-out','true'));await route.fulfill({status:204});return;}
  if(fail){await route.fulfill({status:400,json:{message:'Test network unavailable'}});return;}
  if(url.pathname==='/rest/v1/rpc/pandr_support_status'){await route.fulfill({json:[{total:0,voted:false}]});return;}
  if(url.pathname==='/rest/v1/pandr_profiles'){
   if(method==='GET'){await route.fulfill({json:head});return;}
   const input=req.postDataJSON();
   if(method==='POST'){head=input;await route.fulfill({status:201,json:null});return;}
   if(method==='PATCH'){const expected=url.searchParams.get('revision')?.replace('eq.','');if(head?.revision!==expected){await route.fulfill({json:[]});return;}head={...head,...input};await route.fulfill({json:[{revision:head.revision}]});return;}
  }
  if(url.pathname==='/rest/v1/pandr_records'){
   if(method==='POST'){for(const row of req.postDataJSON())records.set(row.version,row);await route.fulfill({status:201,json:null});return;}
   const wanted=url.searchParams.get('version')??'';await route.fulfill({json:[...records.values()].filter(r=>wanted.includes(r.version))});return;
  }
  await route.fulfill({status:400,json:{message:`Unexpected fixture request ${method} ${url.pathname}`}});
 });
 return {email,userId,broadcastAuth:async(event:'SIGNED_IN'|'SIGNED_OUT')=>{await page.evaluate(({key,event,user,token})=>{const channel=new BroadcastChannel(key);channel.postMessage({event,session:event==='SIGNED_OUT'?null:{access_token:token,refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+315360000,user}});channel.close()},{key:`sb-${new URL(PUBLIC_CLOUD.url).hostname.split('.')[0]}-auth-token`,event,user,token})},getHead:()=>head,setFailure:(value:boolean)=>{fail=value},records};
}

/** Existing assessed account for tests of normal workouts, separate from onboarding tests. */
export function trainingReadyData(): AppData {
 const d=createInitialData();d.plan=allocateSets(d.plan,d.exercises).plan;
 const now=new Date();const prior=new Date(now);prior.setDate(prior.getDate()-1);
 const slots=d.plan.days.flatMap(day=>day.exercises).filter((slot,i,all)=>all.findIndex(s=>s.exerciseId===slot.exerciseId)===i);
 d.strength={onboardingCompletedAt:prior.toISOString(),assessments:slots.map(slot=>{
  const exercise=d.exercises.find(e=>e.id===slot.exerciseId)!;
  const bodyweight=/Chinups/i.test(exercise.name)?{resistance:80,addedLoads:[2.5,5],assistanceLoads:[2,4]}:undefined;
  if(bodyweight)d.plan.days.forEach(day=>day.exercises.forEach(s=>{if(s.exerciseId===slot.exerciseId){s.bodyweight=bodyweight;s.loadMode='bodyweight';s.load=0}}));
  return {id:crypto.randomUUID(),exerciseId:slot.exerciseId,name:exercise.name,date:localDate(prior),completedAt:prior.toISOString(),method:'failure' as const,reps:Math.min(15,Math.ceil(slot.repMin+Math.max(...slot.rir.map(rirValue)))),load:bodyweight?0:80,loadMode:bodyweight?'bodyweight' as const:'external' as const,unit:d.settings.unit,bodyweight,setup:'Same recorded equipment and full range of motion',curve:curveFor(exercise),version:1 as const};
 })};
 return d;
}
