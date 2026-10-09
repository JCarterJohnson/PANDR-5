import { describe, expect, it } from 'vitest';
import { DEFAULT_EXERCISES, DEFAULT_PLAN } from '../data/seed';
import { calculateVolume, makeRir, scaleTrainingDays } from './engine';

function plan() {
  const p = structuredClone(DEFAULT_PLAN);
  const slot = (name:string,sets:number,id:string) => ({...p.days[2]!.exercises[0]!,id,exerciseId:DEFAULT_EXERCISES.find(e=>e.name===name)!.id,sets,rir:makeRir(sets)});
  p.days[2]!.exercises=[slot('Leg Extension',10,'quad-a'),slot('Lying Hamstring Curls',10,'ham-a'),slot('Lateral Raise',5,'delt-a')];
  p.days[5]!.exercises=[slot('Leg Extension',10,'quad-b'),slot('Lying Hamstring Curls',10,'ham-b'),slot('Lateral Raise',5,'delt-b')];
  p.targets={quads:20,hamstrings:20,'lateral-delts':20,chest:20};
  return p;
}

describe('proportional training-day volume',()=>{
  it('scales both leg days from 20 to 12 weekly sets and reconciles overlap from other days',()=>{
    const p=plan(),before=structuredClone(p);
    const result=scaleTrainingDays(p,DEFAULT_EXERCISES,[p.days[2]!.id,p.days[5]!.id],60);
    expect(result.plan.days[2]!.exercises.map(s=>s.sets)).toEqual([6,6,3]);
    expect(result.plan.days[5]!.exercises.map(s=>s.sets)).toEqual([6,6,3]);
    expect(result.plan.targets.quads).toBe(12);expect(result.plan.targets.hamstrings).toBe(12);
    // The Push day still supplies 3 lateral sets: 3 + 3 + 3 = 9.
    expect(result.plan.targets['lateral-delts']).toBe(9);
    expect(result.plan.targets.chest).toBe(20);
    expect(result.plan.days[0]).toEqual(p.days[0]);expect(p).toEqual(before);
    expect(result.plan.days[2]!.exercises[0]!.rir).toHaveLength(6);
  });
  it('distributes rounding so a 10-set day becomes 6, rather than rounding each exercise into 7',()=>{
    const p=plan();const day=p.days[2]!;day.exercises.forEach((s,i)=>{s.sets=[4,3,3][i]!;s.rir=makeRir(s.sets)});
    const next=scaleTrainingDays(p,DEFAULT_EXERCISES,[day.id],60).plan;
    expect(next.days[2]!.exercises.map(s=>s.sets)).toEqual([2,2,2]);
    expect(next.days[5]).toEqual(p.days[5]);
  });
  it('shows the minimum achievable volume without removing exercises or adding unchecked targets',()=>{
    const p=plan();delete p.targets['lateral-delts'];
    const result=scaleTrainingDays(p,DEFAULT_EXERCISES,[p.days[2]!.id],1);
    expect(result.plan.days[2]!.exercises.map(s=>s.sets)).toEqual([1,1,1]);
    expect(result.issues.some(i=>i.code==='scaling-rounded')).toBe(true);
    expect(result.plan.targets['lateral-delts']).toBeUndefined();
    expect(calculateVolume(result.plan,DEFAULT_EXERCISES).find(r=>r.muscle==='lateral-delts')!.total).toBe(9);
  });
  it('keeps a 100% preview unchanged and rejects invalid day choices and percentages',()=>{
    const p=plan();expect(scaleTrainingDays(p,DEFAULT_EXERCISES,[p.days[2]!.id],100).plan).toEqual(p);
    for(const [days,percent] of [[[],60],[[p.days[3]!.id],60],[['missing'],60],[[p.days[2]!.id],NaN],[[p.days[2]!.id],0]] as [string[],number][]){
      const result=scaleTrainingDays(p,DEFAULT_EXERCISES,days,percent);
      expect(result.plan).toEqual(p);expect(result.issues.some(i=>i.severity==='error')).toBe(true);
    }
  });
  it('reconciles targets even when whole-set rounding keeps a selected exercise unchanged',()=>{
    const p=plan();p.days[2]!.exercises=p.days[2]!.exercises.slice(0,1);p.days[2]!.exercises[0]!.sets=1;p.days[2]!.exercises[0]!.rir=[1];
    const result=scaleTrainingDays(p,DEFAULT_EXERCISES,[p.days[2]!.id],60);
    expect(result.plan.targets.quads).toBe(11);
    expect(result.plan.days[2]!.exercises[0]!.rir).toEqual([1]);
  });
});
