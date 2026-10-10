import { describe, expect, it } from 'vitest';
import { DEFAULT_EXERCISES, DEFAULT_PLAN } from '../data/seed';
import { allocateSets, calculateVolume, makeRir } from './engine';
import type { Exercise, TrainingPlan } from './types';
import { fitSetCounts } from './allocation';
import { appDataSchema } from './validation';
import { createInitialData } from '../data/seed';
import { planPrescriptionSignature } from './recovery';

// The screenshot's edited leg days, including its existing 11/1 split.
function editedLegPlan(extension = true): TrainingPlan {
  const plan = structuredClone(DEFAULT_PLAN);
  const slot = (name: string, sets: number, id: string) => ({
    ...plan.days[2]!.exercises[0]!, id,
    exerciseId: DEFAULT_EXERCISES.find(e => e.name === name)!.id,
    sets, rir: makeRir(sets),
  });
  plan.days[2]!.exercises = [slot('Seated Hamstring Curls', 2, 'seated'), slot('Lying Hamstring Curls', 3, 'lying-a'), slot(extension ? 'Leg Extension' : 'Leg Press', 11, 'quad-a'), slot('Standing Calf Raise (Machine)', 5, 'calf-a'), slot('Lateral Raise', 3, 'delt-a')];
  plan.days[5]!.exercises = [slot('Lying Hamstring Curls', 1, 'lying-b'), slot('Leg Extension', 1, 'quad-b'), slot('Standing Calf Raise (Machine)', 5, 'calf-b'), slot('Lateral Raise', 3, 'delt-b')];
  plan.targets = { quads: 12, hamstrings: 12, gastrocnemius: 10 };
  return plan;
}

function screenshotUpperPlan(): TrainingPlan {
  const plan = structuredClone(DEFAULT_PLAN);
  const slot = (name: string, sets: number, id: string) => ({ ...plan.days[0]!.exercises[0]!, id, exerciseId: DEFAULT_EXERCISES.find(e => e.name === name)!.id, sets, rir: makeRir(sets), load: 0, loadMode: 'external' as const });
  plan.days[0]!.exercises = [slot('Bench Press',2,'push-bench'),slot('Incline Dumbbell Press',2,'push-incline'),slot('Machine Chest Flyes',4,'push-fly'),slot('Close-Grip Chinups (Assisted, BW, or Weighted)',4,'push-chin'),slot('Preacher Curls (Machine)',4,'push-preacher'),slot('Hammer Curls',1,'push-hammer'),slot('Lateral Raise',3,'push-lateral')];
  plan.days[1]!.exercises = [slot('Single-Arm Bent-Over Dumbbell Row',3,'pull-row'),slot('Lat Pulldown (Standard Bar)',2,'pull-down'),slot('Lat Pullovers (Cable; any attachment)',1,'pull-over'),slot('Ez-Bar Tricep Overhead Extension',3,'pull-ez'),slot('Tricep Cable Pushdown (preferred attachment)',3,'pull-pushdown'),slot('Tricep Cable Overhead Extension (preferred attachment)',3,'pull-overhead')];
  plan.days[4]!.exercises = [slot('Wide-Grip Seated Cable Rows',4,'upper-row'),slot('Lat Pullovers (Cable; any attachment)',1,'upper-over'),slot('Incline Dumbbell Press',1,'upper-incline'),slot('Machine Chest Flyes',5,'upper-fly'),slot('Incline/Elevated Pushups',1,'upper-pushup'),slot('Incline Curls',4,'upper-curl'),slot('Tricep Cable Pushdown (preferred attachment)',4,'upper-pushdown'),slot('Tricep Cable Overhead Extension (preferred attachment)',4,'upper-overhead')];
  // These are the totals visible in the screenshots, rather than an assumption
  // that the account's unpictured target controls necessarily have these values.
  plan.targets = {chest:15,lats:15,biceps:15,triceps:18.5};
  return plan;
}

describe('intentional exercise allocation', () => {
  it('repairs the screenshot one-set remnants without changing movements, order, loads, or the input plan', () => {
    const plan=screenshotUpperPlan(), before=structuredClone(plan);
    const result=allocateSets(plan,DEFAULT_EXERCISES);
    expect(result.issues.filter(i=>i.severity==='error')).toEqual([]);
    for(const index of [0,1,4]) expect(result.plan.days[index]!.exercises.every(s=>s.sets>=2)).toBe(true);
    for(const row of calculateVolume(result.plan,DEFAULT_EXERCISES).filter(r=>r.target!==undefined)) expect(Math.abs(row.total-row.target!)).toBeLessThanOrEqual(1);
    expect(plan).toEqual(before);
    expect(result.plan.days.map(d=>d.exercises.map(s=>[s.id,s.exerciseId,s.load,s.loadMode,s.repMin,s.repMax]))).toEqual(before.days.map(d=>d.exercises.map(s=>[s.id,s.exerciseId,s.load,s.loadMode,s.repMin,s.repMax])));
    expect(result.issues).toEqual([]);
    for(const row of calculateVolume(result.plan,DEFAULT_EXERCISES).filter(r=>r.target!==undefined)) expect(row.total).toBe(row.target);
  });

  it('is idempotent on the screenshot coupled search',()=>{
    const first=allocateSets(screenshotUpperPlan(),DEFAULT_EXERCISES).plan;
    expect(allocateSets(first,DEFAULT_EXERCISES).plan.days).toEqual(first.days);
  });

  it('makes the same prescriptions when rows are reordered in custom mode',()=>{
    const original=screenshotUpperPlan(), reversed=structuredClone(original);
    reversed.days.forEach(d=>d.exercises.reverse());
    const counts=(p:TrainingPlan)=>Object.fromEntries(p.days.flatMap(d=>d.exercises).map(s=>[s.id,s.sets]));
    expect(counts(allocateSets(original,DEFAULT_EXERCISES,false).plan)).toEqual(counts(allocateSets(reversed,DEFAULT_EXERCISES,false).plan));
  });

  it.each([[5,2],[7,3]])('preserves a direct %i-set budget over %i same-day exercises', (target, slots)=>{
    const result=fitSetCounts(Array.from({length:slots},()=>[1]),new Array(slots).fill(0),[target],new Array(slots).fill(2),false,6);
    expect(result.reduce((a,b)=>a+b,0)).toBe(target);
    expect(Math.max(...result)-Math.min(...result)).toBe(1);
  });

  it.each([undefined,[2,1]])('preserves a direct five-set budget when the same exercises have fractional overlap (%j priorities)', priorities=>{
    const result=fitSetCounts([[1,.5],[1,.5]],[0,0],[5,2.5],[4,1],false,6,{primary:[[1,0],[1,0]],priorities});
    expect(result.reduce((a,b)=>a+b,0)).toBe(5);
    expect(result.every(n=>n>=2)).toBe(true);
  });

  it('preserves an attainable direct budget in constrained mode despite coupled fractional arm work',()=>{
    const result=fitSetCounts([[1,.5],[1,0],[0,1],[0,1]],[0,0,0,0],[11,10],[5,6,3,4],true,6,{primary:[[1,0],[1,0],[0,1],[0,1]]});
    expect(result[0]!+result[1]!).toBe(11);
    expect(result[0]!*.5+result[2]!+result[3]!).toBeGreaterThanOrEqual(10);
    expect(result[0]!*.5+result[2]!+result[3]!).toBeLessThanOrEqual(11);
  });

  it('gives a user-prioritized exercise proportionate preference without ranking exercise types',()=>{
    const matrix=[[1],[1],[1],[1]], days=[0,0,1,1], prior=[3,3,3,3];
    expect(fitSetCounts(matrix,days,[12],prior,false,6,{priorities:[2,1,1,1]})).toEqual([4,2,3,3]);
    expect(fitSetCounts(matrix,days,[12],prior,false,6)).toEqual([3,3,3,3]);
  });

  it('balances primary triceps days without promoting pressing overlap to a competing arm session',()=>{
    const matrix=[[.25],[1],[1]];
    const counts=fitSetCounts(matrix,[0,1,4],[12],[4,3,5],true,6,{primary:[[0],[1],[1]]});
    expect(counts[1]).toBe(counts[2]);
  });

  it('falls back to contributing days when the selected muscle has no primary exercise',()=>{
    const result=fitSetCounts([[.5],[.5]],[0,1],[4],[1,6],false,6,{primary:[[0],[0]]});
    expect(result).toEqual([4,4]);
  });

  it('keeps necessary one-set exercises and explains the coverage constraint',()=>{
    const plan=editedLegPlan();plan.targets={hamstrings:4};
    const result=allocateSets(plan,DEFAULT_EXERCISES,false);
    expect(calculateVolume(result.plan,DEFAULT_EXERCISES).find(r=>r.muscle==='hamstrings')!.total).toBe(4);
    expect(result.issues.some(i=>i.code==='allocation-single-set')).toBe(true);
  });

  it('accepts optional priorities in account backups and rejects invalid values',()=>{
    const d=createInitialData();d.plan.days[0]!.exercises[0]!.allocationPriority='priority';
    expect(appDataSchema.safeParse(d).success).toBe(true);
    d.plan.days[0]!.exercises[0]!.allocationPriority='invalid' as 'priority';
    expect(appDataSchema.safeParse(d).success).toBe(false);
    expect(allocateSets(d.plan,d.exercises).issues.some(i=>i.code==='allocation-priority')).toBe(true);
  });

  it('preserves legacy recovery signatures for missing or standard priority, and resets for priority edits',()=>{
    const plan=screenshotUpperPlan();
    const legacy=JSON.stringify({targets:Object.entries(plan.targets).sort(([a],[b])=>a.localeCompare(b)),days:plan.days.map(d=>({id:d.id,kind:d.kind,exercises:d.exercises.map(e=>({id:e.id,exerciseId:e.exerciseId,sets:e.sets,rir:e.rir,repMin:e.repMin,repMax:e.repMax}))}))});
    expect(planPrescriptionSignature(plan)).toBe(legacy);
    plan.days[0]!.exercises[0]!.allocationPriority='standard';
    expect(planPrescriptionSignature(plan)).toBe(legacy);
    plan.days[0]!.exercises[0]!.allocationPriority='priority';
    expect(planPrescriptionSignature(plan)).not.toBe(legacy);
  });
});

describe('balanced set allocation', () => {
  it('reconciles all attainable combinations of independent leg targets without favoring the first day', () => {
    for (const q of [2, 4, 6, 8, 10, 12]) for (const h of [4, 6, 8, 10, 12]) for (const calf of [2, 6, 10, 12]) {
      const plan = editedLegPlan(); plan.targets = { quads:q,hamstrings:h,gastrocnemius:calf };
      const next = allocateSets(plan, DEFAULT_EXERCISES, false).plan;
      const totals = calculateVolume(next, DEFAULT_EXERCISES);
      expect(totals.find(r=>r.muscle==='quads')!.total).toBe(q);
      expect(totals.find(r=>r.muscle==='hamstrings')!.total).toBe(h);
      expect(totals.find(r=>r.muscle==='gastrocnemius')!.total).toBe(calf);
      const a = next.days[2]!.exercises, b = next.days[5]!.exercises;
      expect(a[2]!.sets).toBe(b[1]!.sets);
      expect(a[3]!.sets).toBe(b[2]!.sets);
      // Six hamstring sets over three retained exercises use 2/2/2, rather
      // than preserve day equality by leaving a one-set remnant on Legs.
      if (h === 6) expect([a[0]!.sets,a[1]!.sets,b[0]!.sets]).toEqual([2,2,2]);
      else expect(a[0]!.sets+a[1]!.sets).toBe(b[0]!.sets);
    }
  });
  it('repairs 11/1 into 6/6 and balances hamstring volume across days', () => {
    const plan = editedLegPlan();
    const before = structuredClone(plan);
    const { plan: next } = allocateSets(plan, DEFAULT_EXERCISES, false);
    expect(next.days[2]!.exercises.map(s => s.sets)).toEqual([3, 3, 6, 5, 3]);
    expect(next.days[5]!.exercises.map(s => s.sets)).toEqual([6, 6, 5, 3]);
    expect(plan).toEqual(before);
    expect(next.days.map(d => d.exercises.map(s => [s.id, s.exerciseId, s.load]))).toEqual(plan.days.map(d => d.exercises.map(s => [s.id, s.exerciseId, s.load])));
    expect(allocateSets(next, DEFAULT_EXERCISES, false).plan.days).toEqual(next.days);
  });

  it.each([2, 4, 6, 8, 10, 12])('fits %i weekly quad sets evenly without changing unchecked exercises', target => {
    const plan = editedLegPlan(); plan.targets = { quads: target };
    const next = allocateSets(plan, DEFAULT_EXERCISES, false).plan;
    expect(next.days[2]!.exercises[2]!.sets).toBe(target / 2);
    expect(next.days[5]!.exercises[1]!.sets).toBe(target / 2);
    expect(next.days[2]!.exercises.slice(0, 2)).toEqual(plan.days[2]!.exercises.slice(0, 2));
  });

  it('reports a high target shortfall instead of concentrating automatic volume', () => {
    const plan = editedLegPlan(); plan.targets = { quads: 20 };
    const result = allocateSets(plan, DEFAULT_EXERCISES, false);
    expect(result.plan.days[2]!.exercises[2]!.sets).toBe(6);
    expect(result.plan.days[5]!.exercises[1]!.sets).toBe(6);
    expect(result.issues.some(i => i.code === 'target-approximation' && i.message.includes('12/20'))).toBe(true);
  });

  it('accounts for fractional compound credit and reports an unattainable half-set target', () => {
    const plan = editedLegPlan(false); plan.targets = { quads: 12, hamstrings: 11.5 };
    const result = allocateSets(plan, DEFAULT_EXERCISES, false);
    const totals = calculateVolume(result.plan, DEFAULT_EXERCISES);
    expect(totals.find(r => r.muscle === 'quads')!.total).toBe(12);
    // Fractional overlap is approximate. Primary hamstring work is balanced,
    // and the reported total remains within the explicit one-set tolerance.
    expect(Math.abs(totals.find(r => r.muscle === 'hamstrings')!.total - 11.5)).toBeLessThanOrEqual(1);
    expect(result.plan.targets.hamstrings).toBe(11.5);
    expect(result.issues.some(i => i.code === 'target-approximation')).toBe(true);
    expect(result.plan.days[2]!.exercises[2]!.sets).toBeLessThanOrEqual(6);
  });

  it('uses an explicitly chosen automatic cap', () => {
    const plan = editedLegPlan(); plan.targets = { quads: 20 };
    const next = allocateSets(plan, DEFAULT_EXERCISES, false, 10).plan;
    expect(next.days[2]!.exercises[2]!.sets).toBe(10);
    expect(next.days[5]!.exercises[1]!.sets).toBe(10);
  });

  it.each([NaN, Infinity, -1])('rejects malformed custom targets without changing sets: %s', target => {
    const plan = editedLegPlan(); plan.targets = { quads: target };
    const result = allocateSets(plan, DEFAULT_EXERCISES, false);
    expect(result.plan).toEqual(plan);
    expect(result.issues.some(i => i.severity === 'error')).toBe(true);
  });

  it('reports zero targets blocked by retained exercises, and leaves no-target plans unchanged', () => {
    const plan = editedLegPlan(); plan.targets = { quads: 0 };
    const result = allocateSets(plan, DEFAULT_EXERCISES, false);
    expect(calculateVolume(result.plan, DEFAULT_EXERCISES).find(r => r.muscle === 'quads')!.total).toBe(2);
    expect(result.issues.some(i => i.code === 'target-approximation')).toBe(true);
    plan.targets = {};
    expect(allocateSets(plan, DEFAULT_EXERCISES, false).plan).toEqual(plan);
  });

  it('finds the closest attainable coupled totals rather than claiming an exact fit', () => {
    const plan = editedLegPlan(); plan.targets = { quads: 5.25 };
    const result = allocateSets(plan, DEFAULT_EXERCISES, false);
    expect(calculateVolume(result.plan, DEFAULT_EXERCISES).find(r => r.muscle === 'quads')!.total).toBe(5);
    expect(result.issues.some(i => i.code === 'target-approximation')).toBe(true);
  });

  it('does not rebuild a manually customized RIR prescription when its set count stays unchanged', () => {
    const plan = editedLegPlan(); plan.targets = { gastrocnemius: 10 };
    plan.days[2]!.exercises[3]!.rir = [3, 3, 2, 1, 1];
    expect(allocateSets(plan, DEFAULT_EXERCISES, false).plan.days[2]!.exercises[3]!.rir).toEqual([3, 3, 2, 1, 1]);
  });

  it('matches the global best error outside tolerance on a small coupled exercise selection', () => {
    const exercises: Exercise[] = [
      { ...DEFAULT_EXERCISES[0]!, id: 'a', contributions: [{muscle:'quads',coefficient:1},{muscle:'hamstrings',coefficient:0.5}] },
      { ...DEFAULT_EXERCISES[0]!, id: 'b', contributions: [{muscle:'quads',coefficient:0.25},{muscle:'hamstrings',coefficient:1}] },
      { ...DEFAULT_EXERCISES[0]!, id: 'c', contributions: [{muscle:'quads',coefficient:0.5},{muscle:'hamstrings',coefficient:0.25}] },
    ];
    for (const [q,h] of [[4,6],[7.25,5],[2,2],[9,8.5]]) {
      const plan = editedLegPlan();
      plan.days = [{ ...plan.days[2]!, exercises: exercises.map((e,i) => ({...plan.days[2]!.exercises[i]!,exerciseId:e.id,sets:1,rir:[1]})) }];
      plan.targets = { quads:q!,hamstrings:h! };
      let best = Infinity;
      for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)for(let c=1;c<=6;c++) best=Math.min(best,Math.max(0,Math.abs(a+b*.25+c*.5-q!)-1)**2+Math.max(0,Math.abs(a*.5+b+c*.25-h!)-1)**2);
      const totals = calculateVolume(allocateSets(plan,exercises,false).plan,exercises);
      expect(Math.max(0,Math.abs(totals.find(r=>r.muscle==='quads')!.total-q!)-1)**2+Math.max(0,Math.abs(totals.find(r=>r.muscle==='hamstrings')!.total-h!)-1)**2).toBe(best);
    }
  });
});
