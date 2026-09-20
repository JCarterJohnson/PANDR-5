import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createInitialData } from '../../src/data/seed';
import { allocateSets, createSession, isPivotWeek, recommendProgression } from '../../src/domain/engine';
import { performanceEvidence } from '../../src/domain/training';
import { simulatePerson, random } from './model';
import type { CheckIn, Session } from '../../src/domain/types';

test.skipIf(process.env.PANDR_SIM_BACKEND==='true')('sensitivity and stationary-performance negative controls',async()=>{
  const directory='research/simulation/results/probes';mkdirSync(directory,{recursive:true});
  const assumptions=[];
  // Paired subjects: the same seed/life events, altered model assumptions. No cloud claims here.
  for(const index of [0,10,20,30,40,50,60,70,80,90,100,110])for(const variant of [{name:'base',gainScale:1,noiseScale:1},{name:'half-response',gainScale:.5,noiseScale:1},{name:'higher-response',gainScale:1.5,noiseScale:1},{name:'half-noise',gainScale:1,noiseScale:.5},{name:'higher-noise',gainScale:1,noiseScale:1.5}]){
    const result=await simulatePerson(index,async d=>d,{...variant,checkpoints:false});
    assumptions.push({variant:variant.name,...result.summary});
  }
  const data=createInitialData();data.plan=allocateSets(data.plan,data.exercises).plan;
  const rng=random(73021),stationary:Session[]=[],weeks=200;let flags=0,sleepFlags=0;
  for(let week=1;week<=weeks;week++){
    for(const [di,day] of data.plan.days.entries())if(day.kind==='training'){
      const session=createSession(day,data.exercises,data.settings,week,false);
      const stamp=new Date(Date.UTC(2020,0,6+(week-1)*7+di,12)).toISOString();
      session.date=stamp.slice(0,10);session.startedAt=stamp;session.completedAt=stamp;
      for(const e of session.exercises){e.load=50;for(const s of e.sets){s.completed=true;s.reps=10+Math.floor(rng()*3)-1;s.rir=e.targetRir[s.index]==='<0'?-1:e.targetRir[s.index]==='0-1'?1:Number(e.targetRir[s.index]);}}
      stationary.push(session);
    }
    if(week===1)continue;
    const proof=performanceEvidence(stationary,week);if(proof.length>=2)flags++;
    const c:CheckIn={id:`stationary-${week}`,date:'2020-01-01',week,poorSleep:true,jointPain:false,performanceDip:false,measuredPerformanceDip:proof.length>=2,runDown:false,lingeringSoreness:false,elevatedHr:false,notes:''};
    if(isPivotWeek([c],week+1))sleepFlags++;
  }
  const log=createSession(data.plan.days[0],data.exercises,data.settings,1,false).exercises[0];
  log.load=10;log.increment=2.5;log.sets.forEach(s=>{s.completed=true;s.reps=log.repMax+2;s.rir=1});
  const coarse=recommendProgression(log,data.settings);assert.equal(coarse.action,'hold');
  const stalled=[];for(let w=0;w<12;w++){const rec=recommendProgression(log,data.settings);log.load=rec.nextLoad;stalled.push(rec.nextLoad);}assert(stalled.every(x=>x===10));
  log.increment=.25;const fine=recommendProgression(log,data.settings);assert.equal(fine.action,'increase');
  log.loadMode='bodyweight';log.load=0;const bodyweight=recommendProgression(log,data.settings);assert.equal(bodyweight.action,'hold');
  const result={assumptions,negativeControls:{stationaryWeeks:weeks-1,stationaryMeasuredFlags:flags,stationaryPlusPoorSleepPivots:sleepFlags,noise:'Independent uniformly distributed -1/0/+1 rep; unchanged true strength, load, RIR and prescription; no fatigue.',coarseEquipment:{load:10,increment:2.5,twelveWeekLoads:stalled,recommendation:coarse},fineEquipment:fine,bodyweight}};
  writeFileSync(`${directory}/probes.json`,JSON.stringify(result,null,2));
  console.log(`PROBES stationary performance flagged ${flags}/${weeks-1} unchanged-capacity weeks; paired sensitivity runs=${assumptions.length}`);
});
