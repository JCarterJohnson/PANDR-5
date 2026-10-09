import { describe, expect, it } from 'vitest';
import { createInitialData, DEFAULT_PLAN, DEFAULT_EXERCISES } from '../data/seed';
import { createSession, recommendProgression } from './engine';
import { standardEquipment } from './equipment';
const poundsPerKg=2.2046226218;

describe('standard equipment defaults',()=>{
  it('distinguishes standard barbells, dumbbell racks and machine increments',()=>{
    const d=createInitialData();const bench=d.plan.days[0]!.exercises[0]!,dumbbell=d.plan.days[0]!.exercises[1]!;
    expect(bench.increment*poundsPerKg).toBeCloseTo(10,4);
    expect(bench.availableLoads![0]!*poundsPerKg).toBeCloseTo(45,4);
    expect(bench.availableLoads![1]!*poundsPerKg).toBeCloseTo(55,4);
    expect(bench.availableLoads!.some(n=>Math.abs(n*poundsPerKg-50)<.001)).toBe(false);
    expect(dumbbell.increment*poundsPerKg).toBeCloseTo(2.5,4);
    expect(dumbbell.availableLoads!.map(n=>Math.round(n*poundsPerKg*100)/100)).toContain(47.5);
    expect(standardEquipment(DEFAULT_EXERCISES.find(e=>e.equipment==='Machine')!,'lb')).toEqual({increment:5,availableLoads:undefined});
    expect(DEFAULT_PLAN.days[0]!.exercises[0]!.increment).toBe(.5);
  });
  it('uses 2.5 lb rack steps through 50, then 5 lb, and allows an exact inventory to override that assumption',()=>{
    const d=createInitialData();const slot=d.plan.days[0]!.exercises[1]!;
    const equipment=standardEquipment(d.exercises.find(e=>e.id===slot.exerciseId)!,'lb');
    expect(equipment.availableLoads).toEqual(expect.arrayContaining([5,7.5,47.5,50,55,60,100,105]));
    expect(equipment.availableLoads).not.toContain(52.5);
    const log=createSession(d.plan.days[0]!,d.exercises,d.settings,1,false).exercises[1]!;
    Object.assign(log,equipment,{unit:'lb',load:50});
    const anchor=log.targetRir.at(-1)==='<0'?log.sets.length-2:log.sets.length-1;
    Object.assign(log.sets[anchor]!,{completed:true,reps:log.repMax,rir:1});
    expect(recommendProgression(log,d.settings)).toMatchObject({action:'hold',status:'equipment-needed'});
    log.availableLoads!.push(52.5);
    expect(recommendProgression(log,d.settings)).toMatchObject({action:'increase',nextLoad:52.5});
    log.load=100;
    expect(recommendProgression(log,d.settings)).toMatchObject({action:'increase',nextLoad:105});
  });
  it('does not silently assume a microload when a historical log has no equipment increment',()=>{
    const d=createInitialData(),log=createSession(d.plan.days[0]!,d.exercises,d.settings,1,false).exercises[0]!;
    delete log.increment;delete log.availableLoads;log.unit='lb';log.load=100;
    log.sets.at(-1)!.completed=true;log.sets.at(-1)!.reps=log.repMax;log.sets.at(-1)!.rir=1;
    expect(recommendProgression(log,d.settings)).toMatchObject({action:'increase',nextLoad:105});
    log.load=50;const blocked=recommendProgression(log,d.settings);expect(blocked).toMatchObject({action:'hold',status:'equipment-needed'});
    expect(blocked.reason).toContain('5 lb (10%)');
    log.increment=1;expect(recommendProgression(log,d.settings)).toMatchObject({action:'increase',nextLoad:51});
  });
});
