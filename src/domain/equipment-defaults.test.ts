import { describe, expect, it } from 'vitest';
import { createInitialData, DEFAULT_PLAN } from '../data/seed';
import { createSession, recommendProgression } from './engine';
const poundsPerKg=2.2046226218;

describe('standard equipment defaults',()=>{
  it('assumes paired 5 lb plates and a 45 lb bar, with 5 lb steps for other equipment',()=>{
    const d=createInitialData();const bench=d.plan.days[0]!.exercises[0]!,dumbbell=d.plan.days[0]!.exercises[1]!;
    expect(bench.increment*poundsPerKg).toBeCloseTo(10,4);
    expect(bench.availableLoads![0]!*poundsPerKg).toBeCloseTo(45,4);
    expect(bench.availableLoads![1]!*poundsPerKg).toBeCloseTo(55,4);
    expect(bench.availableLoads!.some(n=>Math.abs(n*poundsPerKg-50)<.001)).toBe(false);
    expect(dumbbell.increment*poundsPerKg).toBeCloseTo(5,4);
    expect(DEFAULT_PLAN.days[0]!.exercises[0]!.increment).toBe(.5);
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
