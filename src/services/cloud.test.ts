import 'fake-indexeddb/auto';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { createInitialData } from '../data/seed';
import { createSession } from '../domain/engine';
import { catalogForPlan } from '../data/catalog';
import { importExerciseCatalog, exportBackup, parseBackup } from './backup';
import { saveData,loadData } from './storage';
const fake=vi.hoisted(()=>({user:'',profiles:new Map<string,any>(),records:new Map<string,any>(),calls:[] as any[],race:false,fail:false}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:{id:fake.user}},error:null})},from:(table:string)=>{
 const q:any={op:'select',filters:[] as any[],payload:undefined,versions:undefined};
 const run=async()=>{fake.calls.push({table,op:q.op,filters:q.filters});if(fake.fail)return {error:{message:'Offline'},data:null};const user=q.filters.find((x:any)=>x[0]==='user_id')?.[1]||q.payload?.user_id;if(q.op==='select'){if(table==='pandr_profiles')return {data:fake.profiles.get(user)||null,error:null};return {data:[...fake.records.values()].filter(r=>r.user_id===user&&(!q.versions||q.versions.includes(r.version))),error:null}}
 if(q.op==='insert'){if(table==='pandr_profiles'){if(fake.profiles.has(user))return {error:{code:'23505',message:'Duplicate'},data:null};fake.profiles.set(user,structuredClone(q.payload))}else for(const row of q.payload)fake.records.set(row.version,structuredClone(row));return {data:null,error:null}}
 if(fake.race)return {data:[],error:null};const remote=fake.profiles.get(user);const rev=q.filters.find((x:any)=>x[0]==='revision')?.[1];if(remote?.revision!==rev)return {data:[],error:null};fake.profiles.set(user,{...remote,...structuredClone(q.payload)});return {data:[{revision:q.payload.revision}],error:null};};
 const builder:any={select(){return builder},eq(k:string,v:unknown){q.filters.push([k,v]);return builder},in(_k:string,v:string[]){q.versions=v;return builder},maybeSingle:run,insert(v:any){q.op='insert';q.payload=v;return builder},update(v:any){q.op='update';q.payload=v;return builder},then(resolve:any,reject:any){return run().then(resolve,reject)}};return builder;
}})}));
import { getCloudClient,readCloudData,syncData } from './cloud';
beforeEach(()=>{fake.user=crypto.randomUUID();fake.profiles.clear();fake.records.clear();fake.calls=[];fake.race=false;fake.fail=false;vi.stubEnv('VITE_SUPABASE_URL','https://test.supabase.co');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','sb_publishable_test');vi.stubEnv('VITE_ENABLE_CLOUD_SYNC','true')});
describe('account cloud sync',()=>{
 it('stays disabled in local-only builds and rejects secret keys',()=>{vi.stubEnv('VITE_ENABLE_CLOUD_SYNC','false');expect(getCloudClient()).toBeNull();vi.stubEnv('VITE_ENABLE_CLOUD_SYNC','true');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','sb_secret_test');expect(()=>getCloudClient()).toThrow('Secret and service-role')});
 it('rejects an account ID different from the authenticated user before queries',async()=>{await expect(syncData(crypto.randomUUID(),createInitialData())).rejects.toThrow('signed-in account changed');expect(fake.calls).toHaveLength(0)});
 it('publishes complete records and restores on a fresh device',async()=>{const d=createInitialData();d.sessions=[createSession(d.plan.days[0],d.exercises,d.settings,1,false)];await saveData(fake.user,d);const result=await syncData(fake.user,d);expect(result.data.sessions).toEqual(d.sessions);expect(fake.records.size).toBe(1);const freshUser=crypto.randomUUID();const head=structuredClone(fake.profiles.get(fake.user));head.user_id=freshUser;fake.profiles.set(freshUser,head);for(const row of [...fake.records.values()])fake.records.set(crypto.randomUUID(),{...row,user_id:freshUser});fake.user=freshUser;expect((await readCloudData(freshUser))?.sessions).toEqual(d.sessions)});
 it('synchronizes expanded and custom exercises and their plan/history references to a fresh device',async()=>{
  const d=createInitialData();
  const custom={id:'owner-neck',name:'Owner neck exercise',equipment:'Band',contributions:[{muscle:'neck',coefficient:0.5}],source:'User supplied',beyondFailureAllowed:false};
  d.exercises=importExerciseCatalog(JSON.stringify({schemaVersion:1,exercises:[custom]}),d.exercises);
  d.plan.days[0].exercises[0].exerciseId='p5-barbell-incline-bench-press';
  d.plan.days[0].exercises[1].exerciseId=custom.id;
  d.exercises=catalogForPlan(d.exercises,d.plan);
  d.sessions=[createSession(d.plan.days[0],d.exercises,d.settings,1,false)];
  await saveData(fake.user,d);const result=await syncData(fake.user,d);
  expect(result.data.exercises).toEqual(d.exercises);expect(result.data.plan).toEqual(d.plan);
  const freshUser=crypto.randomUUID();const head=structuredClone(fake.profiles.get(fake.user));head.user_id=freshUser;fake.profiles.set(freshUser,head);
  for(const row of [...fake.records.values()])fake.records.set(crypto.randomUUID(),{...row,user_id:freshUser});
  fake.user=freshUser;const restored=(await readCloudData(freshUser))!;
  expect(restored.exercises).toEqual(d.exercises);expect(restored.plan).toEqual(d.plan);expect(restored.sessions).toEqual(d.sessions);
  expect(parseBackup(exportBackup(restored))).toEqual(restored);
 });
 it('does not re-upload unchanged workout payloads',async()=>{const d=createInitialData();d.sessions=[createSession(d.plan.days[0],d.exercises,d.settings,1,false)];await saveData(fake.user,d);const first=await syncData(fake.user,d);fake.calls=[];await syncData(fake.user,first.data);expect(fake.calls.filter(c=>c.table==='pandr_records'&&c.op==='insert')).toHaveLength(0)});
 it('preserves both plans on simultaneous metadata edits',async()=>{const d=createInitialData();await saveData(fake.user,d);const first=await syncData(fake.user,d);const local=structuredClone(first.data);local.plan.name='Local';fake.profiles.get(fake.user).metadata.plan.name='Remote';await saveData(fake.user,local);await expect(syncData(fake.user,local)).rejects.toThrow('both devices changed plan');expect(fake.profiles.get(fake.user).metadata.plan.name).toBe('Remote');expect((await loadData(fake.user))?.plan.name).toBe('Local')});
 it('detects a competing publication and leaves local edits intact',async()=>{const d=createInitialData();await saveData(fake.user,d);const first=await syncData(fake.user,d);const local=structuredClone(first.data);local.settings.name='Changed';await saveData(fake.user,local);fake.race=true;await expect(syncData(fake.user,local)).rejects.toThrow('cloud profile during');expect((await loadData(fake.user))?.settings.name).toBe('Changed')});
 it('retains local data during network failure',async()=>{const d=createInitialData();await saveData(fake.user,d);fake.fail=true;await expect(syncData(fake.user,d)).rejects.toThrow('Offline');expect(await loadData(fake.user)).toEqual(d)});
});
