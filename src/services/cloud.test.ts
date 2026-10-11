import 'fake-indexeddb/auto';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { createInitialData } from '../data/seed';
import { createSession } from '../domain/engine';
import { catalogForPlan } from '../data/catalog';
import { importExerciseCatalog, exportBackup, parseBackup } from './backup';
import { saveData,loadData } from './storage';
const fake=vi.hoisted(()=>({failWriteAt:0,writes:0,user:'',profiles:new Map<string,any>(),records:new Map<string,any>(),calls:[] as any[],race:false,fail:false}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:{id:fake.user}},error:null})},from:(table:string)=>{
 const q:any={op:'select',filters:[] as any[],payload:undefined,versions:undefined};
 const run=async()=>{fake.calls.push({table,op:q.op,filters:q.filters});if(fake.fail)return {error:{message:'Offline'},data:null};const user=q.filters.find((x:any)=>x[0]==='user_id')?.[1]||q.payload?.user_id;if(q.op==='select'){if(table==='pandr_profiles')return {data:fake.profiles.get(user)||null,error:null};return {data:[...fake.records.values()].filter(r=>r.user_id===user&&(!q.versions||q.versions.includes(r.version))),error:null}}
 if(table==='pandr_profiles'&&++fake.writes===fake.failWriteAt)return {error:{message:'Write interrupted'},data:null};
 if(q.op==='insert'){if(table==='pandr_profiles'){if(fake.profiles.has(user))return {error:{code:'23505',message:'Duplicate'},data:null};fake.profiles.set(user,structuredClone(q.payload))}else for(const row of q.payload)fake.records.set(row.version,structuredClone(row));return {data:null,error:null}}
 if(fake.race)return {data:[],error:null};const remote=fake.profiles.get(user);const rev=q.filters.find((x:any)=>x[0]==='revision')?.[1];if(remote?.revision!==rev)return {data:[],error:null};fake.profiles.set(user,{...remote,...structuredClone(q.payload)});return {data:[{revision:q.payload.revision}],error:null};};
 const builder:any={select(){return builder},eq(k:string,v:unknown){q.filters.push([k,v]);return builder},in(_k:string,v:string[]){q.versions=v;return builder},maybeSingle:run,insert(v:any){q.op='insert';q.payload=v;return builder},update(v:any){q.op='update';q.payload=v;return builder},then(resolve:any,reject:any){return run().then(resolve,reject)}};return builder;
}})}));
import { getCloudClient,readCloudData,syncData } from './cloud';
import { PracticalSyncError, prepareCurrentEquipment, syncPracticalData } from './practical-equipment';
beforeEach(()=>{fake.user=crypto.randomUUID();fake.profiles.clear();fake.records.clear();fake.calls=[];fake.race=false;fake.fail=false;fake.failWriteAt=0;fake.writes=0;vi.stubEnv('VITE_SUPABASE_URL','https://test.supabase.co');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','sb_publishable_test');vi.stubEnv('VITE_ENABLE_CLOUD_SYNC','true')});
it('saves legacy equipment upgrades through revision guards without changing observations or archived plans',async()=>{
 const {createMemoryPersistence}=await import('./memory');
 const {beginAssessment,recordAssessment}=await import('../domain/strength');
 const now=new Date('2026-10-10T12:00:00Z');let d=createInitialData();
 d.settings.unit='lb';d.settings.startDate='2026-10-10';const slot=d.plan.days[0]!.exercises[0]!;
 Object.assign(slot,{increment:1.1023,load:202.8232});delete slot.availableLoads;delete slot.equipmentPreset;
 d=beginAssessment(d,d.plan.days[0],now);
 d=recordAssessment(d,0,{...d.strength!.active!.items[0]!,load:225,reps:8,setup:'Saved bench setup',confirmed:true},now);
 // Recreate a legacy plan after the test saved its equipment snapshot.
 const legacy=d.plan.days[0]!.exercises[0]!;legacy.increment=1.1023;legacy.load=202.8232;delete legacy.availableLoads;delete legacy.equipmentPreset;
 d.sessions=[createSession(d.plan.days[0]!,d.exercises,d.settings,1,false)];
 d.sessions[0]!.completedAt=new Date().toISOString();Object.assign(d.sessions[0]!.exercises[0]!.sets[0]!,{completed:true,reps:8});
 delete d.strength!.active;d.activeSession=createSession(d.plan.days[0]!,d.exercises,d.settings,1,false);
 d.cycles=[{id:'old-cycle',name:'Old cycle',startDate:'2026-09-01',endedAt:'2026-10-01',plan:structuredClone(d.plan)},{id:'current-cycle',name:'Current cycle',startDate:'2026-10-10'}];d.activeCycleId='current-cycle';
 const unchanged=structuredClone({strength:d.strength,sessions:d.sessions,activeSession:d.activeSession,cycles:d.cycles});
 await syncData(fake.user,d,createMemoryPersistence());
 const memory=createMemoryPersistence(),loaded=(await readCloudData(fake.user,memory))!;
 const next=prepareCurrentEquipment(loaded);expect(next.plan.days[0]!.exercises[0]!).toMatchObject({increment:10,equipmentPreset:'auto'});
 const saved=(await syncPracticalData(fake.user,next,memory)).data;
 expect({strength:saved.strength,sessions:saved.sessions,activeSession:saved.activeSession,cycles:saved.cycles}).toEqual(unchanged);
 expect((await readCloudData(fake.user,createMemoryPersistence()))!.plan).toEqual(saved.plan);
 expect(prepareCurrentEquipment(saved)).toBe(saved);
 const stale=structuredClone(saved);stale.plan.name='Local change';fake.profiles.get(fake.user).metadata.plan.name='Other device';
 await expect(syncPracticalData(fake.user,stale,memory)).rejects.toThrow('both devices changed plan');
 expect(fake.profiles.get(fake.user).metadata.plan.name).toBe('Other device');
});
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

describe('cloud-only app persistence',()=>{
 it('saves and reloads account data without writing a device profile',async()=>{
  const {createMemoryPersistence}=await import('./memory');
  const memory=createMemoryPersistence();const d=createInitialData();d.settings.theme='dark';
  const result=await syncData(fake.user,d,memory);expect(await loadData(fake.user)).toBeUndefined();
  expect(result.data.settings.theme).toBe('dark');const restored=await readCloudData(fake.user,createMemoryPersistence());expect(restored?.settings.theme).toBe('dark');expect(await loadData(fake.user)).toBeUndefined();
 });
 it('preserves cycles and measured check-ins across a fresh account hydration',async()=>{
  const {createMemoryPersistence}=await import('./memory');const {startCycle}=await import('../domain/training');
  const base=createInitialData();base.settings.startDate='2026-09-01';
  const d=startCycle(base,'Return','2026-09-18',new Date('2026-09-18T12:00:00'));d.settings.theme='automatic';d.settings.checkInDay=0;
  await syncData(fake.user,d,createMemoryPersistence());expect(await readCloudData(fake.user,createMemoryPersistence())).toMatchObject({cycles:d.cycles,activeCycleId:d.activeCycleId,settings:d.settings});
 });
 it('retains the memory baseline after a failed write so a retry can succeed',async()=>{
  const {createMemoryPersistence}=await import('./memory');const memory=createMemoryPersistence();const first=await syncData(fake.user,createInitialData(),memory);
  const next=structuredClone(first.data);next.settings.name='Updated';fake.fail=true;await expect(syncData(fake.user,next,memory)).rejects.toThrow('Offline');fake.fail=false;
  expect((await syncData(fake.user,next,memory)).data.settings.name).toBe('Updated');expect(await loadData(fake.user)).toBeUndefined();
 });
});

it('persists strength drafts, observations and onboarding state through fresh account hydration',async()=>{
 const {createMemoryPersistence}=await import('./memory');const {beginAssessment,recordAssessment}=await import('../domain/strength');
 const now=new Date('2026-09-01T12:00:00');let d=createInitialData();d=beginAssessment(d,d.plan.days[0],now);
 const item=d.strength!.active!.items[0];d=recordAssessment(d,0,{...item,load:80,reps:8,setup:'Rack A, full ROM',confirmed:true},now);
 await syncData(fake.user,d,createMemoryPersistence());const restored=await readCloudData(fake.user,createMemoryPersistence());expect(restored?.strength).toEqual(d.strength);
});
it('detects concurrent strength edits without discarding either devices observations',async()=>{
 const {createMemoryPersistence}=await import('./memory');const memory=createMemoryPersistence();const d=createInitialData();d.strength={assessments:[]};
 await syncData(fake.user,d,memory);const local=structuredClone(d);local.strength!.onboardingCompletedAt='2026-09-02T12:00:00Z';
 fake.profiles.get(fake.user).metadata.strength.onboardingCompletedAt='2026-09-03T12:00:00Z';
 await expect(syncData(fake.user,local,memory)).rejects.toThrow('strength');expect(local.strength!.onboardingCompletedAt).toBe('2026-09-02T12:00:00Z');
});

it('editing a name and cycles with an assessment never writes another account',async()=>{
 const {createMemoryPersistence}=await import('./memory');const {beginAssessment,recordAssessment}=await import('../domain/strength');const {endCycle,startCycle}=await import('../domain/training');
 const now=new Date('2026-09-18T12:00:00'),owner=fake.user,other=crypto.randomUUID(),ownerMemory=createMemoryPersistence(),otherMemory=createMemoryPersistence();
 let a=createInitialData();a.settings.startDate='2026-09-14';a=beginAssessment(a,a.plan.days[0],now);a=recordAssessment(a,0,{...a.strength!.active!.items[0],load:80,reps:8,setup:'Owner station',confirmed:true},now);
 await syncData(owner,a,ownerMemory);fake.user=other;const b=createInitialData();b.settings.name='Other person';b.plan.name='Other plan';b.sessions=[createSession(b.plan.days[0],b.exercises,b.settings,1,false)];await syncData(other,b,otherMemory);
 const untouched=JSON.stringify(fake.profiles.get(other)),records=JSON.stringify([...fake.records.values()].filter(r=>r.user_id===other));
 fake.user=owner;fake.calls=[];a.settings.name='New owner name';a=startCycle(endCycle(a,now),'Return','2026-09-21',now);await syncData(owner,a,ownerMemory);
 expect(JSON.stringify(fake.profiles.get(other))).toBe(untouched);expect(JSON.stringify([...fake.records.values()].filter(r=>r.user_id===other))).toBe(records);
 expect(fake.calls.every(c=>c.filters.some((f:any)=>f[0]==='user_id'&&f[1]===owner)||c.op==='insert')).toBe(true);
 expect((await readCloudData(owner,createMemoryPersistence()))!.strength).toEqual(a.strength);
 fake.calls=[];await expect(readCloudData(other,createMemoryPersistence())).rejects.toThrow('signed-in account changed');expect(fake.calls).toHaveLength(0);
});

it('retains merged remote plan changes when the equipment-upgrade write fails and is retried',async()=>{
 const {createMemoryPersistence}=await import('./memory');const memory=createMemoryPersistence();const d=createInitialData();d.settings.unit='lb';
 const initial=await syncData(fake.user,d,memory),local=structuredClone(initial.data);local.settings.name='Local preferences';
 const remote=fake.profiles.get(fake.user);remote.metadata.plan.name='Other device plan';
 const slot=remote.metadata.plan.days[0].exercises[0];delete slot.equipmentPreset;delete slot.availableLoads;slot.increment=1.1023;slot.load=202.8232;
 fake.failWriteAt=fake.writes+2;
 let failure:PracticalSyncError|undefined;
 try{await syncPracticalData(fake.user,local,memory)}catch(e){expect(e).toBeInstanceOf(PracticalSyncError);failure=e as PracticalSyncError}
 expect(failure).toBeDefined();expect(failure!.data.plan.name).toBe('Other device plan');expect(failure!.data.settings.name).toBe('Local preferences');
 expect(failure!.data.plan.days[0]!.exercises[0]!).toMatchObject({equipmentPreset:'auto',increment:10});
 const retried=(await syncPracticalData(fake.user,failure!.data,memory)).data;
 expect(retried.plan.name).toBe('Other device plan');expect(retried.settings.name).toBe('Local preferences');expect(retried.strength).toEqual(initial.data.strength);
 expect(fake.profiles.get(fake.user).metadata.plan.name).toBe('Other device plan');
});
