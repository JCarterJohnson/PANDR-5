import type { AppData, EquipmentPreset, Exercise, PlanExercise, Settings, TrainingPlan } from './types';

export const POUNDS_PER_KG = 2.2046226218;
type Equipment = Pick<PlanExercise, 'increment' | 'availableLoads' | 'equipmentPreset'>;
type ExerciseEquipment = Pick<Exercise, 'name' | 'equipment'>;
const round = (n: number) => Math.round(n * 1e8) / 1e8;
const stepFor = (unit: Settings['unit']) => unit === 'lb' ? 5 : 2.5;
const close = (a: number, b: number) => Math.abs(a-b) < .001;

/** The prospective plate count follows coupled or independently loaded hardware. */
export function equipmentLoadConvention(exercise: ExerciseEquipment): 'per-side' | 'total' | undefined {
  const label = `${exercise.name} ${exercise.equipment}`;
  if (/plate[\s-]*loaded/i.test(label)) {
    return /iso[\s-]*lateral|unilateral|single[\s-]*(?:arm|leg)|one[\s-]*arm|independent[\s-]*lever|converging/i.test(label) ? 'per-side' : 'total';
  }
  return /barbell|smith/i.test(exercise.equipment) ? 'total' : undefined;
}

/** Total working weight: the bar plus the same plates on both sides. */
export function barbellEquipment(unit: Settings['unit'], smallestPlate = unit === 'lb' ? 5 : 2.5): Equipment {
  const step = smallestPlate * 2, bar = unit === 'lb' ? 45 : 20;
  return { increment: step, availableLoads: Array.from({length:Math.floor((unit === 'lb' ? 960 : 480) / step) + 1}, (_,i) => round(bar + i * step)) };
}

/** A normal rack is the default; smaller steps require a confirmed custom inventory. */
export function dumbbellEquipment(unit: Settings['unit']): Equipment {
  const step = stepFor(unit);
  return {increment:step,availableLoads:Array.from({length:40},(_,i)=>round((i+1)*step))};
}

export function standardEquipment(exercise: ExerciseEquipment, unit: Settings['unit']): Equipment {
  const equipment = /barbell/i.test(exercise.equipment) ? barbellEquipment(unit)
    : /smith|plate[\s-]*loaded/i.test(`${exercise.name} ${exercise.equipment}`) ? { increment: stepFor(unit)*(equipmentLoadConvention(exercise)==='per-side'?1:2), availableLoads: undefined }
    : /dumbbell/i.test(exercise.equipment) ? dumbbellEquipment(unit)
    : { increment: stepFor(unit), availableLoads: undefined };
  return { ...equipment, equipmentPreset: 'auto' };
}

export function equipmentForPreset(exercise: ExerciseEquipment, unit: Settings['unit'], preset: EquipmentPreset): Equipment {
  if (preset === 'auto') return standardEquipment(exercise,unit);
  if (preset === 'custom') return { increment: stepFor(unit), availableLoads: undefined, equipmentPreset: preset };
  const equipment = preset === 'dumbbell-rack' ? dumbbellEquipment(unit)
    : preset === 'five-pound' ? { increment: stepFor(unit), availableLoads: undefined }
    : barbellEquipment(unit,preset === 'barbell-2.5' ? unit === 'lb' ? 2.5 : 1.25 : preset === 'barbell-1' ? unit === 'lb' ? 1 : .5 : undefined);
  return {...equipment,equipmentPreset:preset};
}

export function equipmentSummary(slot: Pick<PlanExercise,'increment'|'equipmentPreset'>, unit: Settings['unit']): string {
  return slot.equipmentPreset === 'custom' ? 'Custom equipment' : `${Number(slot.increment.toFixed(1))} ${unit} weight steps`;
}

/** New plans use the same practical defaults as migrated accounts. */
export function withStandardEquipment(plan: TrainingPlan, exercises: Exercise[], unit: Settings['unit']): TrainingPlan {
  const next = structuredClone(plan), catalog = new Map(exercises.map(e=>[e.id,e]));
  for (const day of next.days) for (const slot of day.exercises) {
    const exercise = catalog.get(slot.exerciseId);
    if (exercise) Object.assign(slot, standardEquipment(exercise, unit));
  }
  return next;
}

export const defaultLoadIncrement = stepFor;

/** Preserve explicit presets and arbitrary inventories; recognize only known old defaults. */
function legacyPreset(slot: PlanExercise, exercise: ExerciseEquipment, unit: Settings['unit']): EquipmentPreset {
  if (slot.equipmentPreset) return slot.equipmentPreset;
  if (slot.bodyweight) return slot.bodyweight.tracking==='full-body'&&!slot.bodyweight.addedLoads.length&&!slot.bodyweight.assistanceLoads.length ? 'auto' : 'custom'; // Preserve confirmed or measured inventories.
  const legacyIncrement = unit === 'kg' ? .5 : 1.1023;
  if (!Number.isFinite(slot.increment) || slot.increment <= 0 || !slot.availableLoads && close(slot.increment,legacyIncrement)) return 'auto';
  const pounds = (value: number) => unit === 'lb' ? value : value * POUNDS_PER_KG;
  const sameList = (expected: number[]) => !!slot.availableLoads && slot.availableLoads.length === expected.length && slot.availableLoads.every((n,i)=>close(pounds(n),expected[i]!));
  if (/barbell/i.test(exercise.equipment)) {
    for (const [step,preset] of [[10,'auto'],[5,'barbell-2.5'],[2,'barbell-1']] as const) {
      if (sameList(Array.from({length:Math.floor(960/step)+1},(_,i)=>45+i*step))) return preset;
    }
  }
  if (/dumbbell/i.test(exercise.equipment) && sameList([...Array.from({length:19},(_,i)=>5+i*2.5),...Array.from({length:30},(_,i)=>55+i*5)])) return 'auto';
  if (!slot.availableLoads && close(pounds(slot.increment),5)) return 'auto';
  const standard = standardEquipment(exercise,unit);
  if (close(slot.increment,standard.increment) && JSON.stringify(slot.availableLoads) === JSON.stringify(standard.availableLoads)) return 'auto';
  return 'custom';
}

export function equipmentLoadAtOrBelow(slot: Pick<PlanExercise,'increment'|'availableLoads'>, target: number): number | undefined {
  if (!Number.isFinite(target) || target <= 0) return;
  if (slot.availableLoads) return slot.availableLoads.filter(n=>n>0&&n<=target+1e-6).sort((a,b)=>b-a)[0];
  if (!Number.isFinite(slot.increment) || slot.increment<=0) return;
  const load = round(Math.floor((target+1e-8)/slot.increment)*slot.increment);
  return load>0 ? load : undefined;
}

/** Changes future equipment and working prescriptions, never recorded observations or live workouts.
 * Idempotence lets hydration and cloud merges share this normalization without repeat writes.
 */
export function migratePracticalEquipment(data: AppData): AppData {
  const catalog=new Map(data.exercises.map(e=>[e.id,e]));let changed=false;
  const days=data.plan.days.map(day=>{
    let dayChanged=false;
    const exercises=day.exercises.map(slot=>{
      const exercise=catalog.get(slot.exerciseId);if(!exercise)return slot;
      const preset=legacyPreset(slot,exercise,data.settings.unit);
      // Saved bodyweight resistance is an observation, not an external loading grid.
      const equipment=slot.bodyweight ? {equipmentPreset:preset,...(preset==='auto'?{increment:stepFor(data.settings.unit)}:{})} : preset==='custom' ? {equipmentPreset:preset} : equipmentForPreset(exercise,data.settings.unit,preset);
      const candidate={...slot,...equipment};
      if(!slot.bodyweight&&preset!=='custom'&&slot.loadMode==='external'&&slot.load>0)candidate.load=equipmentLoadAtOrBelow(candidate,slot.load)??0;
      if(JSON.stringify(candidate)===JSON.stringify(slot))return slot;
      changed=true;dayChanged=true;return candidate;
    });
    return dayChanged?{...day,exercises}:day;
  });
  return changed?{...data,plan:{...data.plan,days}}:data;
}

/** Infer existing automatic equipment when older conversion callers omit the catalog. */
export function inferAutomaticEquipment(slot: PlanExercise, unit: Settings['unit']): ExerciseEquipment {
  const first=slot.availableLoads?.[0],bar=unit==='lb'?45:20;
  return {name:'',equipment:first!==undefined&&close(first,bar)&&close(slot.increment,stepFor(unit)*2)?'Barbell'
    : slot.availableLoads?.length===40?'Dumbbell'
    : !slot.availableLoads&&close(slot.increment,stepFor(unit)*2)?'Smith':'Machine'};
}
