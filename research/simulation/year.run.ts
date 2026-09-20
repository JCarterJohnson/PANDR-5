import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { simulatePerson, COHORTS } from './model';
import { createMemoryPersistence } from '../../src/services/memory';
import { exportBackup, exportCsv, parseBackup } from '../../src/services/backup';
import type { AppData } from '../../src/domain/types';

// Only construction is redirected. Auth, HTTP, PostgREST, SQL/RLS and the complete
// production sync/read/merge/hash code remain real. Accounts run sequentially.
const transport=vi.hoisted(()=>({client:null as SupabaseClient|null}));
vi.mock('@supabase/supabase-js',async importOriginal=>{
  const actual=await importOriginal<typeof import('@supabase/supabase-js')>();
  return {...actual,createClient:()=>new Proxy({},{get:(_,key)=>{
    if(!transport.client)throw new Error('No isolated test account selected');
    const value=Reflect.get(transport.client,key);
    return typeof value==='function'?value.bind(transport.client):value;
  }})};
});
import { syncData, readCloudData, SyncConflictError } from '../../src/services/cloud';

const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
function csv(rows:Record<string,unknown>[]){const keys=Object.keys(rows[0]??{});return [keys,...rows.map(r=>keys.map(k=>r[k]))].map(row=>row.map(v=>JSON.stringify(String(v??''))).join(',')).join('\n')+'\n';}

test('120 synthetic accounts, 365 days, real isolated account storage',async()=>{
  const backend=process.env.PANDR_SIM_BACKEND==='true';
  const shard=Number(process.env.PANDR_SIM_SHARD??0),shards=Number(process.env.PANDR_SIM_SHARDS??1);
  const count=Number(process.env.PANDR_SIM_COUNT??120),days=Number(process.env.PANDR_SIM_DAYS??365);
  assert(count>=1&&count<=120&&shards>=1&&shards<=12&&shard>=0&&shard<shards&&days>0&&days<=365);
  const directory=join('research/coaching-refinements/results',backend?`backend-${shard}`:'dry-run');mkdirSync(directory,{recursive:true});
  const {createClient}=await vi.importActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js');
  const config=backend?JSON.parse(readFileSync('research/simulation/.local/status.json','utf8')):{};
  if(backend){
    const parsed=new URL(config.API_URL);assert(['127.0.0.1','localhost'].includes(parsed.hostname),'Refusing any hosted/production backend');
    assert(config.ANON_KEY&&config.SERVICE_ROLE_KEY,'Missing isolated local keys');
    vi.stubEnv('VITE_SUPABASE_URL',config.API_URL);vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY',config.ANON_KEY);vi.stubEnv('VITE_ENABLE_CLOUD_SYNC','true');
  }
  const clientOptions={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  const admin=backend?createClient(config.API_URL,config.SERVICE_ROLE_KEY,clientOptions):undefined;
  const summaries:any[]=[],weekly:any[]=[],lifts:any[]=[],backups:Record<string,string>={};
  const metrics={saves:0,reloads:0,fullSetSaves:0,failedWritesRecovered:0,lostResponsesRecovered:0,conflictsDetected:0,isolationChecks:0,requestBytes:0,responseBytes:0,requests:0,saveMs:[] as number[],csvRoundTrips:0};
  let otherUser:string|undefined;
  const start=Date.now();
  for(let index=shard;index<count;index+=shards){
    let userId='', account:SupabaseClient|undefined, password='', email='';
    let fault:''|'before-record'|'after-head'='';
    const measuredFetch:typeof fetch=async(input,init)=>{
      const path=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url).pathname;
      metrics.requests++;if(typeof init?.body==='string')metrics.requestBytes+=Buffer.byteLength(init.body);
      if(fault==='before-record'&&path.endsWith('/pandr_records')&&init?.method==='POST'){fault='';return new Response(JSON.stringify({message:'Injected connection failure before write'}),{status:503});}
      const response=await fetch(input,init);
      metrics.responseBytes+=Buffer.byteLength(await response.clone().text());
      if(fault==='after-head'&&path.endsWith('/pandr_profiles')&&init?.method==='PATCH'&&response.ok){fault='';return new Response(JSON.stringify({message:'Injected lost acknowledgement after commit'}),{status:503});}
      return response;
    };
    if(admin){
      email=`pandr-synthetic-${index}@example.invalid`;password=randomBytes(24).toString('hex');
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{synthetic:true}});assert.ifError(created.error);userId=created.data.user!.id;
      account=createClient(config.API_URL,config.ANON_KEY,{...clientOptions,global:{fetch:measuredFetch}});
      const login=await account.auth.signInWithPassword({email,password});assert.ifError(login.error);transport.client=account;
      if(otherUser){
        const other=await account.from('pandr_profiles').select('user_id').eq('user_id',otherUser);assert.ifError(other.error);assert.deepEqual(other.data,[]);
        const all=await account.from('pandr_records').select('user_id').eq('user_id',otherUser);assert.ifError(all.error);assert.deepEqual(all.data,[]);
        const denied=await account.from('pandr_records').insert({user_id:otherUser,version:crypto.randomUUID(),kind:'session',record_id:'denied',payload:{id:'denied'}});assert(denied.error,'Cross-account insert must fail');metrics.isolationChecks+=3;
      }
      otherUser=userId;
    }
    let memory=createMemoryPersistence(),month=-1,retried=false,lost=false;
    const save=async(data:AppData,kind:string,day:number)=>{
      if(!backend)return data;
      if(kind==='set')metrics.fullSetSaves++;
      const t=performance.now();
      if(index%10===0&&kind==='session-finish'&&day>=70&&!retried){fault='before-record';retried=true;}
      if(index%10===0&&kind==='session-finish'&&day>=140&&!lost){fault='after-head';lost=true;}
      const attemptedFault=fault;
      let result:Awaited<ReturnType<typeof syncData>>;
      try{result=await syncData(userId,data,memory);assert.equal(attemptedFault,'','Injected failure was not exercised');}
      catch(e){
        if(!attemptedFault)throw e;
        assert.equal(fault,'','Unexpected failure before the intended injection');
        assert.match((e as Error).message,/Injected/);
        result=await syncData(userId,data,memory);
        if(attemptedFault==='before-record')metrics.failedWritesRecovered++;else metrics.lostResponsesRecovered++;
      }
      metrics.saves++;metrics.saveMs.push(performance.now()-t);
      if(day>=0&&Math.floor(day/30)>month&&kind==='session-finish'){
        month=Math.floor(day/30);memory=createMemoryPersistence();
        const loaded=await readCloudData(userId,memory);assert.deepEqual(loaded,result.data,'Fresh-device history differs');metrics.reloads++;
      }
      return result.data;
    };
    const result=await simulatePerson(index,save,{days,checkpoints:backend});
    if(backend){
      // A fresh auth client/session and no local snapshot: actual account/device restoration.
      const fresh=createClient(config.API_URL,config.ANON_KEY,clientOptions);assert.ifError((await fresh.auth.signInWithPassword({email,password})).error);
      transport.client=fresh;const restored=await readCloudData(userId,createMemoryPersistence());assert.deepEqual(restored,result.data);metrics.reloads++;
      // Simultaneous-device disagreement must preserve the server's winning version.
      if(index%10===0){
        const a=createMemoryPersistence(),b=createMemoryPersistence();
        const left=(await readCloudData(userId,a))!,right=(await readCloudData(userId,b))!;
        left.settings.name+=' device A';right.settings.name+=' device B';
        await syncData(userId,left,a);let rejected=false;
        try{await syncData(userId,right,b);}catch(e){assert(e instanceof SyncConflictError);rejected=true;}
        assert(rejected);const winner=(await readCloudData(userId,createMemoryPersistence()))!;assert.equal(winner.settings.name,left.settings.name);metrics.conflictsDetected++;
        // Restore the synthetic profile's original display name using the confirmed baseline.
        result.data=(await syncData(userId,result.data,a)).data;
      }
      assert.ifError((await fresh.auth.signOut({scope:'local'})).error);
      await account!.auth.signOut({scope:'local'});
    }
    const backup=exportBackup(result.data);assert.deepEqual(parseBackup(backup),JSON.parse(JSON.stringify(result.data)));
    const exportText=exportCsv(result.data);
    // CSV carries record_json, so compare frozen session/check-in payloads, not only row counts.
    const records=parseCsvRecords(exportText);
    for(const s of result.data.sessions)assert.deepEqual(records.get(`session:${s.id}`),s);
    for(const c of result.data.checkIns)assert.deepEqual(records.get(`recovery:${c.id}`),c);
    metrics.csvRoundTrips++;
    summaries.push({...result.summary,accountId:backend?userId:null,backupSha256:sha(backup),backupBytes:Buffer.byteLength(backup),csvBytes:Buffer.byteLength(exportText)});
    weekly.push(...result.weekly);lifts.push(...result.lifts);
    if(backend)backups[String(index)]=gzipSync(backup).toString('base64');
    console.log(`SIM person=${index} cohort=${result.summary.cohort} sessions=${result.summary.trained} progress=${result.summary.loadChangePct}% pivots=${result.summary.pivots}`);
  }
  let database:any=null;
  if(admin){
    const profiles=await admin.from('pandr_profiles').select('user_id',{count:'exact',head:true});assert.ifError(profiles.error);assert.equal(profiles.count,summaries.length);
    const records=await admin.from('pandr_records').select('version',{count:'exact',head:true});assert.ifError(records.error);
    const publicClient=createClient(config.API_URL,config.ANON_KEY,clientOptions);
    const hidden=await publicClient.from('pandr_profiles').select('user_id');assert(hidden.error||hidden.data?.length===0);metrics.isolationChecks++;
    database={profiles:profiles.count,immutableRecordVersions:records.count};
  }
  const sorted=metrics.saveMs.sort((a,b)=>a-b);
  const report={schema:1,backend:backend?'real local Supabase on GitHub runner':'engine only; no backend',codeCommit:process.env.GITHUB_SHA??'working-tree',seedFamily:520260000,shard,shards,days,cohorts:COHORTS,accounts:summaries,metrics:{...metrics,saveMs:undefined,saveP50Ms:sorted[Math.floor(sorted.length*.5)]??null,saveP95Ms:sorted[Math.floor(sorted.length*.95)]??null,elapsedSeconds:(Date.now()-start)/1000},database};
  writeFileSync(join(directory,'summary.json'),JSON.stringify(report,null,2));
  writeFileSync(join(directory,'accounts.csv'),csv(summaries));writeFileSync(join(directory,'weekly.csv'),csv(weekly));
  writeFileSync(join(directory,'lifts.csv.gz'),gzipSync(csv(lifts)));
  if(backend){
    // Logs do not consume artifact storage quota. No passwords, keys, JWTs or real-user data.
    // Emit after Vitest exits, so its reporter cannot interleave bytes into a bundle.
    writeFileSync(join(directory,'evidence.json.gz'),gzipSync(JSON.stringify({report,weekly,lifts,backups})));
  }
});

function parseCsvRecords(text:string){
  text=text.replace(/^\uFEFF/,'');
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];if(c==='\r'&&!quoted)continue;if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if(c==='\n'&&!quoted){row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  const header=rows.shift()!,type=header.indexOf('record_type'),id=header.indexOf('record_id'),json=header.indexOf('record_json');
  const result=new Map<string,unknown>();for(const r of rows)if(r[type]==='session'||r[type]==='recovery')result.set(`${r[type]}:${r[id]}`,JSON.parse(r[json]));
  return result;
}
