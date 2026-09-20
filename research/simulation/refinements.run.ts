import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createInitialData } from '../../src/data/seed';
import { createSession } from '../../src/domain/engine';
import { performanceEvidence } from '../../src/domain/training';
import { performanceEvidence as legacyEvidence } from '../coaching-refinements/baseline/training';
import { simulatePerson, random } from './model';
import type { Session } from '../../src/domain/types';

const directory='research/coaching-refinements/results/controlled';
test.skipIf(process.env.PANDR_SIM_BACKEND==='true')('paired original/refined controllers and independent held-out people',async()=>{
 mkdirSync(directory,{recursive:true});const accounts:any[]=[],weekly:any[]=[];
 // Both controllers receive the same physical equipment, latent biology, life events,
 // adherence and per-exercise noise. The held-out seed family was not used to set thresholds.
 for(const seedOffset of [0,900000])for(let index=0;index<120;index++)for(const algorithm of ['baseline','refined'] as const){
  const result=await simulatePerson(index,async d=>d,{algorithm,seedOffset,checkpoints:false});
  accounts.push({...result.summary,sample:seedOffset?'held-out':'original'});
  weekly.push(...result.weekly.map(w=>({...w,algorithm,sample:seedOffset?'held-out':'original'})));
  if(index%10===9&&algorithm==='refined')console.log(`PAIRED sample=${seedOffset?'held-out':'original'} people=${index+1}`);
 }
 // Separate the measured bodyweight setup from controller changes.
 for(const sample of ['original','held-out'])for(let person=0;person<120;person++){
  const inputs=(algorithm:string)=>weekly.filter(r=>r.sample===sample&&r.person===person&&r.algorithm===algorithm).map(r=>({week:r.week,sleep:r.sleep,pain:r.pain,scheduled:r.scheduled,sessions:r.sessions}));
  assert.deepEqual(inputs('baseline'),inputs('refined'),'Controller changes must not change independent life events or attendance');
 }
 const uncalibrated=[];
 for(const index of [0,10,20,30,40,50,60,70,80,90,100,110]){
  const result=await simulatePerson(index,async d=>d,{calibratedBodyweight:false,checkpoints:false});
  uncalibrated.push(result.summary);
 }
 writeFileSync(`${directory}/paired.json`,JSON.stringify({accounts,weekly,uncalibrated}));
});

test.skipIf(process.env.PANDR_SIM_BACKEND==='true')('independent detector controls report false flags AND genuine-decline detection',()=>{
 mkdirSync(directory,{recursive:true});const rows:any[]=[];
 const source=createInitialData();
 for(const noise of [0,1,2])for(const scenario of ['stationary','abrupt','gradual'])for(let person=0;person<40;person++){
  const rng=random(9821000+person),sessions:Session[]=[];let oldFlags=0,newFlags=0,oldFirst:number|null=null,newFirst:number|null=null,eligible=0;
  for(let week=1;week<=52;week++){
   const truth=scenario==='stationary'||week<10?12:scenario==='abrupt'?8:Math.max(6,12-(week-9));
   // Twenty independent movements: avoid counting two copies of the same exercise.
   for(const [di,day] of source.plan.days.entries())if(day.kind==='training'){
    const s=createSession(day,source.exercises,source.settings,week,false);
    s.startedAt=new Date(Date.UTC(2024,0,1+(week-1)*7+di,12)).toISOString();s.date=s.startedAt.slice(0,10);s.completedAt=s.startedAt;
    for(const e of s.exercises){e.load=50;const observed=Math.max(1,truth+Math.floor(rng()*(noise*2+1))-noise);for(const set of e.sets){set.completed=true;set.reps=observed;set.rir=1;}}
    sessions.push(s);
   }
   const old=legacyEvidence(sessions,week).length>=2,current=performanceEvidence(sessions,week).length>=2;
   if(week>=5){eligible++;oldFlags+=Number(old);newFlags+=Number(current);}
   if(week>=10&&old&&oldFirst===null)oldFirst=week;
   if(week>=10&&current&&newFirst===null)newFirst=week;
  }
  rows.push({noise,scenario,person,eligibleWeeks:eligible,oldFlags,newFlags,oldFirst,newFirst});
  if(noise===0&&scenario!=='stationary')assert(newFirst!==null&&newFirst<=13,'A clear sustained decline must be detected');
  if(noise===0&&scenario==='stationary')assert.equal(newFlags,0);
 }
 // This guard would fail a detector that simply disabled all flags, above, or one
 // that still flagged most weeks with ordinary +/-1 noise, here.
 const ordinary=rows.filter(r=>r.noise===1&&r.scenario==='stationary');
 assert(ordinary.reduce((n,r)=>n+r.newFlags,0)/ordinary.reduce((n,r)=>n+r.eligibleWeeks,0)<0.05,'Ordinary-noise false flags must remain rare');
 writeFileSync(`${directory}/detector.json`,JSON.stringify({rows},null,2));
});
