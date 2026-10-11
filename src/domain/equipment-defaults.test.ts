import { describe, expect, it } from 'vitest';
import { createInitialData, DEFAULT_PLAN, DEFAULT_EXERCISES } from '../data/seed';
import { BUILTIN_EXERCISES } from '../data/catalog';
import { createSession, recommendProgression } from './engine';
import { equipmentForPreset, equipmentLoadConvention, standardEquipment } from './equipment';

describe('standard equipment defaults',()=>{
  it('distinguishes standard barbells, dumbbell racks and machine increments',()=>{
    const d=createInitialData();const bench=d.plan.days[0]!.exercises[0]!,dumbbell=d.plan.days[0]!.exercises[1]!;
    expect(bench.increment).toBe(5);
    expect(bench.availableLoads!.slice(0,3)).toEqual([20,25,30]);
    expect(bench.availableLoads).not.toContain(22.5);
    expect(dumbbell.increment).toBe(2.5);
    expect(dumbbell.availableLoads!.slice(0,3)).toEqual([2.5,5,7.5]);
    expect(standardEquipment(DEFAULT_EXERCISES.find(e=>e.equipment==='Machine')!,'lb')).toEqual({increment:5,availableLoads:undefined,equipmentPreset:'auto'});
    expect(DEFAULT_PLAN.days[0]!.exercises[0]!.increment).toBe(.5);
  });
  it('uses a 5 lb rack and allows an exact microload inventory to override that assumption',()=>{
    const d=createInitialData();const slot=d.plan.days[0]!.exercises[1]!;
    const equipment=standardEquipment(d.exercises.find(e=>e.id===slot.exerciseId)!,'lb');
    expect(equipment.availableLoads).toEqual(expect.arrayContaining([5,10,45,50,55,60,100,105]));
    expect(equipment.availableLoads).not.toContain(7.5);
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
  it('counts paired barbell plates and treats explicit smaller plates as an override',()=>{
    const bench={name:'Bench Press',equipment:'Barbell'};
    expect(standardEquipment(bench,'lb')).toMatchObject({increment:10,availableLoads:[45,55,65,...Array.from({length:94},(_,i)=>75+i*10)]});
    expect(equipmentForPreset(bench,'lb','barbell-2.5')).toMatchObject({increment:5});
    expect(equipmentForPreset(bench,'kg','barbell-standard')).toMatchObject({increment:5});
    expect(equipmentForPreset(bench,'kg','barbell-2.5')).toMatchObject({increment:2.5});
  });
  it('uses one plate step per side on actual independent machine catalog entries',()=>{
    for(const name of ['Converging Chest Press','Incline Converging Chest Press','Independent-Lever Shoulder Press','Independent-Lever Low Row','Independent-Lever Pulldown']){
      const exercise=BUILTIN_EXERCISES.find(e=>e.name===name)!;
      expect(exercise,name).toBeTruthy();
      expect(equipmentLoadConvention(exercise),name).toBe('per-side');
      expect(standardEquipment(exercise,'lb'),name).toMatchObject({increment:5});
      expect(standardEquipment(exercise,'kg'),name).toMatchObject({increment:2.5});
    }
    const bilateral=BUILTIN_EXERCISES.find(e=>e.name==='Horizontal Lever Leg Press')!;
    expect(equipmentLoadConvention(bilateral)).toBe('total');
    expect(standardEquipment(bilateral,'lb')).toMatchObject({increment:10});
    expect(standardEquipment({name:'Single-Leg Press',equipment:'Plate-loaded machine'},'lb')).toMatchObject({increment:5});
    expect(standardEquipment({name:'Squat',equipment:'Smith machine'},'lb')).toMatchObject({increment:10});
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
