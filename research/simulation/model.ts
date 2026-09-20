import assert from 'node:assert/strict';
import { createInitialData } from '../../src/data/seed';
import { allocateSets, calculateVolume, createSession, getWeek, isPivotWeek, recommendProgression, validatePlan } from '../../src/domain/engine';
import { activeCycle, checkInDue, completedWeeklyVolume, inActiveCycle, materializeCycles, performanceEvidence, startCycle } from '../../src/domain/training';
import { validateAppData } from '../../src/domain/validation';
import type { AppData, CheckIn, ExerciseLog } from '../../src/domain/types';

// These are explicit stress-test assumptions, NOT fitted human growth equations.
export const COHORTS = ['novice','intermediate','experienced','slow-response','poor-sleep','missed-sessions','long-break','coarse-equipment','noisy-RIR','conservative-effort','pain-episodes','custom-three-day'] as const;
export function random(seed:number) { let x=seed>>>0;return ()=>{x+=0x6D2B79F5;let t=Math.imul(x^(x>>>15),1|x);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296}; }
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const mean=(ns:number[])=>ns.length?ns.reduce((a,b)=>a+b,0)/ns.length:0;
export const rounded=(n:number)=>Math.round(n*10000)/10000;
export type Save = (data:AppData,kind:string,day:number)=>Promise<AppData>;
export type Options = { days?:number; gainScale?:number; noiseScale?:number; seedOffset?:number; checkpoints?:boolean };

export async function simulatePerson(index:number, save:Save=async d=>d, options:Options={}) {
  const cohort=COHORTS[Math.floor(index/10)%COHORTS.length];
  const seed=520260000+index+(options.seedOffset??0), rng=random(seed);
  const normal=()=>Math.sqrt(-2*Math.log(Math.max(1e-12,rng())))*Math.cos(2*Math.PI*rng());
  const days=options.days??365, gainScale=options.gainScale??1, noiseScale=options.noiseScale??1;
  const dateAt=(d:number)=>new Date(Date.UTC(2025,0,6+d,12));
  const iso=(d:number)=>dateAt(d).toISOString().slice(0,10);
  let data=createInitialData();
  data.id=`synthetic-${index}`;data.settings.name=`SYNTHETIC ${index} ${cohort}`;
  data.settings.startDate=iso(0);data.settings.unit=index%2?'lb':'kg';
  const conversion=data.settings.unit==='lb'?2.20462262185:1;
  data.updatedAt=dateAt(0).toISOString();data.plan=allocateSets(data.plan,data.exercises).plan;
  data.plan.updatedAt=data.updatedAt;materializeCycles(data);
  if(cohort==='custom-three-day'){
    data.settings.strict=false;
    // User-selected three-day split. This deliberately does not claim to meet PANDR-5 constraints.
    for(const i of [4,5])data.plan.days[i]={...data.plan.days[i],kind:'rest',exercises:[]};
    for(const key of Object.keys(data.plan.targets))data.plan.targets[key]=8;
  }
  const experience=cohort==='novice'?0:cohort==='experienced'?2:1;
  const bodyMass=55+45*rng(), strengthScale=(0.65+0.7*rng())*(experience===0?0.7:experience===2?1.35:1);
  const gainCeiling=(experience===0?0.65:experience===2?0.16:0.34)*(0.65+0.7*rng())*gainScale*(cohort==='slow-response'?0.15:1);
  const adaptationRate=(0.025+0.025*rng())*(experience===0?1.25:1);
  const adherence=cohort==='missed-sessions'?0.55+0.2*rng():0.87+0.12*rng();
  const checkAdherence=cohort==='missed-sessions'?0.7:0.96;
  const reportingError=(cohort==='noisy-RIR'?1.8:0.55)*noiseScale;
  const effortBias=cohort==='conservative-effort'?2.3:0;
  const fineIncrement=0.25;
  const slots=data.plan.days.flatMap(d=>d.exercises);
  const baseline=new Map<string,number>(), capacities=new Map<string,number>(), gains=new Map<string,number>();
  const rateFactors=new Map<string,number>(), fatigueSets=new Map<string,number>(), stimulus=new Map<string,number>();
  const initialLoads=new Map<string,number>(), initialSets=new Map(slots.map(s=>[s.id,s.sets]));
  const targetSets=new Map<string,number>();
  const map=new Map(data.exercises.map(e=>[e.id,e]));
  for(const slot of slots){
    const exercise=map.get(slot.exerciseId)!;
    const name=exercise.name.toLowerCase();
    const initial=/leg press|hack squat/.test(name)?105:/squat|deadlift|rdl/.test(name)?65:/bench press/.test(name)?45:/press|row|pulldown/.test(name)?25:/calf/.test(name)?40:10;
    slot.increment=(cohort==='coarse-equipment'?2.5:fineIncrement)*conversion;
    slot.load=Math.round(initial*strengthScale/fineIncrement)*fineIncrement*conversion;
    if(slot.loadMode==='bodyweight'){
      if(index%3===0){slot.loadMode='assistance';slot.load=20*conversion;}
      else slot.load=0;
    }
    initialLoads.set(slot.id,slot.load);
    const effective=slot.loadMode==='bodyweight'?bodyMass*0.7:slot.loadMode==='assistance'?bodyMass*0.7-slot.load/conversion:slot.load/conversion;
    const capacity=Math.max(5,effective)*(1+(slot.repMin+2+(slot.sets-1)*0.6)/30);
    if(!baseline.has(slot.exerciseId)){
      baseline.set(slot.exerciseId,capacity);capacities.set(slot.exerciseId,capacity);gains.set(slot.exerciseId,0);rateFactors.set(slot.exerciseId,0.75+0.5*rng());
    }
    targetSets.set(slot.exerciseId,(targetSets.get(slot.exerciseId)??0)+slot.sets);
  }
  const errors=validatePlan(data.plan,data.exercises,data.settings.strict).filter(x=>x.severity==='error');
  assert.deepEqual(errors,[],'Initial plan must be valid');
  let fatigue=0, missed=0, trained=0, pivots=0, checks=0, increases=0, decreases=0, holds=0, roundingHolds=0, effortHolds=0, bodyweightHolds=0, partialAnchors=0, falsePerformanceFlags=0, measuredFlags=0;
  let weekSleep=7.5, weekPain=false, weekIll=false, readiness=1, globalWeek=1;
  let weekCompleted=0, weekPotential=0, overCap=0, anchorCount=0, underFloor=0;
  const weekly:any[]=[], lifts:any[]=[], actions:Record<string,number>={};
  const interruptionWeek=18+Math.floor(rng()*5), illnessWeek=8+Math.floor(rng()*35);
  const startingVolume=calculateVolume(data.plan,data.exercises).map(v=>({muscle:v.muscle,total:v.total}));
  data=await save(data,'initial',-1);
  for(let day=0;day<days;day++){
    globalWeek=Math.floor(day/7)+1;
    if(day%7===0){
      weekIll=globalWeek===illnessWeek;
      const badEpisode=(cohort==='poor-sleep'&&globalWeek%8<5)||weekIll;
      weekSleep=clamp((badEpisode?5.5:7.5)+normal()*0.4,4,9);
      weekPain=cohort==='pain-episodes'&&[12,13,30,31].includes(globalWeek);
      readiness=clamp(1-fatigue*0.055-(weekSleep<6?0.045:0)-(weekIll?0.08:0),0.65,1);
      weekCompleted=0;weekPotential=0;
      if(cohort==='long-break'&&globalWeek===interruptionWeek+6){data=startCycle(data,'Return after six-week break',iso(day),dateAt(day));data=await save(data,'cycle',day);}
    }
    const cycle=activeCycle(data), week=getWeek(cycle.startDate,dateAt(day));
    const planDay=data.plan.days[day%7];
    const pivot=isPivotWeek(data.checkIns.filter(c=>inActiveCycle(data,c)),week);
    const onBreak=cohort==='long-break'&&globalWeek>=interruptionWeek&&globalWeek<interruptionWeek+6;
    if(planDay.kind==='training'){
      weekPotential++;
      if(onBreak||rng()>adherence||(weekIll&&rng()<0.6)){missed++;}
      else {
        trained++;weekCompleted++;if(pivot)pivots++;
        const session=createSession(planDay,data.exercises,data.settings,week,pivot);
        session.date=iso(day);session.startedAt=dateAt(day).toISOString();session.cycleId=cycle.id;
        data.activeSession=session;
        const detailed=options.checkpoints!==false&&index%10===0&&(globalWeek===1||globalWeek===52);
        if(detailed)data=await save(data,'session-start',day);
        const dailyNoise=normal()*0.022*noiseScale;
        for(const log of session.exercises){
          const capacity=capacities.get(log.exerciseId)!;
          const effective=log.loadMode==='bodyweight'?bodyMass*0.7:log.loadMode==='assistance'?Math.max(5,bodyMass*0.7-log.load/conversion):log.load/conversion;
          const rawReps=30*(capacity*(readiness+dailyNoise)/Math.max(1,effective)-1);
          const painful=weekPain&&log.contributions.some(c=>c.muscle==='chest');
          for(const set of log.sets){
            const prescription=log.targetRir[set.index];
            const target=prescription==='<0'?0:prescription==='0-1'?0.5:prescription;
            const trueTarget=Math.max(0,target+effortBias+normal()*0.3*noiseScale);
            const available=Math.max(0,rawReps-set.index*0.6);
            const completed=!painful&&available>=1&&rng()>0.008;
            const reps=completed?clamp(Math.floor(available-trueTarget),1,100):0;
            const actualRir=Math.max(0,available-reps);
            set.reps=reps;set.completed=completed;
            set.rir=prescription==='<0'?-1:clamp(Math.round(actualRir+normal()*reportingError),0,10);
            if(completed){
              stimulus.set(log.exerciseId,(stimulus.get(log.exerciseId)??0)+Math.max(0,1-actualRir/6));
              for(const c of log.contributions)fatigueSets.set(c.muscle,(fatigueSets.get(c.muscle)??0)+c.coefficient);
            }
            if(detailed){data.activeSession=structuredClone(session);data=await save(data,'set',day);}
          }
          const rec=recommendProgression(log,data.settings,pivot);log.recommendation=rec;
          const anchor=log.sets[rec.anchorIndex];
          if(anchor?.completed){anchorCount++;if(anchor.reps>log.repMax+5)overCap++;if(anchor.reps<log.repMin)underFloor++;}
          else partialAnchors++;
          if(rec.action==='increase')increases++;else if(rec.action==='decrease')decreases++;else holds++;
          if(rec.reason.includes('increment'))roundingHolds++;
          if(rec.reason.includes('until the anchor'))effortHolds++;
          if(rec.reason.startsWith('Bodyweight'))bodyweightHolds++;
          actions[rec.action]=(actions[rec.action]??0)+1;
          assert(Number.isFinite(rec.nextLoad)&&rec.nextLoad>=0);
          if(pivot||!anchor?.completed)assert.equal(rec.action,'hold');
          if(rec.action!=='hold'){
            const pct=Math.abs(rec.nextLoad-log.load)/log.load*100;
            assert(pct>=2-1e-5&&pct<=(rec.action==='increase'?5:3)+1e-5);
            assert.equal(rec.action==='increase',log.loadMode==='assistance'?rec.nextLoad<log.load:rec.nextLoad>log.load);
          }
          const original=initialSets.get(log.slotId)!;
          assert.equal(log.sets.length,pivot?Math.max(1,Math.ceil(original/2)):original);
        }
        // Same completion transition as Workout.finish in Train.tsx. All decisions above use the production engine.
        session.completedAt=new Date(dateAt(day).getTime()+70*60000).toISOString();
        data.sessions.push(session);data.activeSession=undefined;
        for(const slot of data.plan.days.flatMap(d=>d.exercises)){
          const log=session.exercises.find(e=>e.slotId===slot.id);
          if(log?.recommendation)slot.load=log.recommendation.nextLoad;
        }
        data.plan.updatedAt=session.completedAt;
        data=await save(data,'session-finish',day);
      }
    }
    if(checkInDue(data,dateAt(day))&&!onBreak&&rng()<checkAdherence){
      const evidence=performanceEvidence(data.sessions.filter(s=>inActiveCycle(data,s)),week);
      const reportedDip=readiness<0.91&&rng()<0.85;
      const check:CheckIn={id:crypto.randomUUID(),cycleId:activeCycle(data).id,date:iso(day),week,poorSleep:weekSleep<6,performanceDip:reportedDip,jointPain:weekPain,runDown:fatigue>1.5||weekIll,elevatedHr:weekIll,lingeringSoreness:fatigue>1.5,notes:'Synthetic observation; not a human outcome.',sleepHours:rounded(weekSleep),fatigue:Math.round(clamp(1+fatigue*1.7,1,5)),soreness:Math.round(clamp(1+fatigue*1.3,1,5)),stress:weekSleep<6?4:2,measuredPerformanceDip:evidence.length>=2,performanceEvidence:evidence,assessmentVersion:'1'};
      checks++;if(check.measuredPerformanceDip){measuredFlags++;if(readiness>=0.97&&!weekIll)falsePerformanceFlags++;}
      data.checkIns.push(check);assert.equal(checkInDue(data,dateAt(day)),false,'No second check-in in one week');
      data=await save(data,'check-in',day);
    }
    if(day%7===6||day===days-1){
      // A diminishing-response simulator driven by completed work and recovery, independent of recommendations.
      for(const [id,base] of baseline){
        const work=stimulus.get(id)??0, normalWork=targetSets.get(id)!;
        const dose=clamp(work/Math.max(1,normalWork*0.7),0,1.2);
        let gain=gains.get(id)!;
        const recovery=clamp(1-(weekSleep<6?0.35:0)-fatigue*0.15,0.2,1);
        if(work>0)gain+=(gainCeiling-gain)*adaptationRate*rateFactors.get(id)!*dose*recovery;
        else if(onBreak||weekCompleted===0)gain=Math.max(-0.1,gain-0.003*(1+gain));
        gains.set(id,gain);capacities.set(id,base*(1+gain));
      }
      const maximumVolume=Math.max(0,...fatigueSets.values());
      fatigue=clamp(fatigue*0.48+maximumVolume/22+(weekSleep<6?0.45:0)+(weekIll?0.3:0),0,4);
      const volumes=completedWeeklyVolume(data,week);
      // Independent summation catches FSA/account-cycle leakage without using planned volume.
      const expected=new Map<string,number>();
      for(const s of data.sessions.filter(s=>inActiveCycle(data,s)&&s.week===week))for(const e of s.exercises)for(const c of e.contributions)expected.set(c.muscle,(expected.get(c.muscle)??0)+e.sets.filter(s=>s.completed).length*c.coefficient);
      for(const row of volumes)assert(Math.abs(row.total-(expected.get(row.muscle)??0))<1e-8);
      weekly.push({person:index,cohort,week:globalWeek,date:iso(day),cycleWeek:week,sessions:weekCompleted,scheduled:weekPotential,pivot,pain:weekPain,sleep:rounded(weekSleep),readiness:rounded(readiness),fatigue:rounded(fatigue),latentCapacityGainPct:rounded(mean([...gains.values()])*100),chestSets:expected.get('chest')??0,quadsSets:expected.get('quads')??0});
      for(const slot of data.plan.days.flatMap(d=>d.exercises))lifts.push({person:index,cohort,week:globalWeek,slot:slot.id,exercise:slot.exerciseId,name:map.get(slot.exerciseId)!.name,mode:slot.loadMode,loadKg:rounded(slot.load/conversion),initialKg:rounded(initialLoads.get(slot.id)!/conversion),latentCapacityKg:rounded(capacities.get(slot.exerciseId)!),sets:slot.sets});
      fatigueSets.clear();stimulus.clear();
    }
  }
  validateAppData(data);
  assert.deepEqual(calculateVolume(data.plan,data.exercises).map(v=>({muscle:v.muscle,total:v.total})),startingVolume,'Progression must not silently add weekly volume');
  const changed=data.plan.days.flatMap(d=>d.exercises).filter(s=>s.loadMode==='external').map(s=>(s.load/initialLoads.get(s.id)!-1)*100);
  return {data,weekly,lifts,summary:{person:index,cohort,seed,days,unit:data.settings.unit,bodyMass:rounded(bodyMass),gainCeilingPct:rounded(gainCeiling*100),adherence:rounded(adherence),trained,missed,checks,pivots,increases,decreases,holds,roundingHolds,effortHolds,bodyweightHolds,partialAnchors,measuredFlags,falsePerformanceFlags,anchorCount,overCap,underFloor,loadChangePct:rounded(mean(changed)),latentCapacityGainPct:rounded(mean([...gains.values()])*100),cycles:data.cycles!.length}};
}
