import { chooseResistanceChange } from './resistance';
import { fitSetCounts } from './allocation';
import { DEFAULT_EXERCISES, DEFAULT_PLAN, MUSCLES } from '../data/seed';
import type { CheckIn, ConstraintIssue, Exercise, ExerciseLog, PlanDay, Recommendation, Rir, Session, Settings, TrainingPlan, VolumeRow } from './types';

const EPSILON = 1e-8;
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const finite = (n: number) => Number.isFinite(n);
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

// Contiguous movement blocks from the Guide Sheet. Their roles are derived from J/K credit,
// including the source's chin-up slot in the Push non-competing arm block.
const SOURCE_BLOCKS: number[][][] = [
  [[5, 6, 7], [8, 9, 10], [11]],
  [[13, 14, 15], [16, 17, 18]],
  [[20, 21], [22, 23, 24], [25], [26]],
  [],
  [[30, 31], [32, 33, 34], [35], [36, 37]],
  [[39, 40], [41, 42, 43], [44], [45]],
  [],
];
function primaryRoles(exercise: Exercise): string[] {
  const maximum = Math.max(0, ...exercise.contributions.map(c => c.coefficient));
  return exercise.contributions.filter(c => c.coefficient === maximum && maximum > 0).map(c => c.muscle);
}
const sourceSlots = new Map(DEFAULT_PLAN.days.flatMap(day => day.exercises).map(slot => [slot.id, slot]));
const sourceCatalog = new Map(DEFAULT_EXERCISES.map(exercise => [exercise.id, exercise]));
const SOURCE_ROLE_BLOCKS = SOURCE_BLOCKS.map(blocks => blocks.map(rows => new Set(rows.flatMap(row => {
  const slot = sourceSlots.get(`slot-${row}`)!;
  return primaryRoles(sourceCatalog.get(slot.exerciseId)!);
}))));

export function calculateVolume(plan: TrainingPlan, exercises: Exercise[]): VolumeRow[] {
  const catalog = new Map(exercises.map(exercise => [exercise.id, exercise]));
  const rows = new Map<string, VolumeRow>(MUSCLES.map(({ id: muscle }) => [muscle, { muscle, direct: 0, fractional: 0, total: 0, target: plan.targets[muscle] }]));
  for (const exercise of exercises) for (const contribution of exercise.contributions) {
    if (!rows.has(contribution.muscle)) rows.set(contribution.muscle, { muscle: contribution.muscle, direct: 0, fractional: 0, total: 0, target: plan.targets[contribution.muscle] });
  }
  for (const [muscle, target] of Object.entries(plan.targets)) {
    if (!rows.has(muscle)) rows.set(muscle, { muscle, direct: 0, fractional: 0, total: 0, target });
  }
  for (const day of plan.days.filter(day => day.kind === 'training')) for (const slot of day.exercises) {
    for (const contribution of catalog.get(slot.exerciseId)?.contributions ?? []) {
      const row = rows.get(contribution.muscle)!;
      const credit = slot.sets * contribution.coefficient;
      if (contribution.coefficient === 1) row.direct += credit;
      else row.fractional += credit;
      row.total += credit;
    }
  }
  return Array.from(rows.values()).map(row => ({ ...row, direct: round(row.direct), fractional: round(row.fractional), total: round(row.total) }));
}

export function validatePlan(plan: TrainingPlan, exercises: Exercise[], strict: boolean): ConstraintIssue[] {
  const issues: ConstraintIssue[] = [];
  const error = (code: string, message: string) => issues.push({ code, message, severity: 'error' });
  const method = (code: string, message: string) => issues.push({ code, message, severity: strict ? 'error' : 'warning' });
  const catalog = new Map(exercises.map(exercise => [exercise.id, exercise]));
  const dayNames = [/push/i, /pull/i, /legs/i, /rest/i, /upper/i, /lower/i, /rest/i];
  const dayKinds = ['training', 'training', 'training', 'rest', 'training', 'training', 'rest'];
  if (plan.days.length !== 7 || plan.days.some((day, i) => day.kind !== dayKinds[i] || !dayNames[i]?.test(day.name))) {
    method('schedule', 'PANDR-5 requires Push, Pull, Legs, Rest, Upper, Lower, Rest in that seven-day order.');
  }
  if (!Object.keys(plan.targets).length) method('targets-missing', 'Select at least one muscle target so weekly volume can be checked.');
  const dayIds = new Set<string>();
  const slotIds = new Set<string>();
  for (const [dayIndex, day] of plan.days.entries()) {
    let previousBlock = -1;
    if (dayIds.has(day.id)) error('duplicate-day', 'Each training day must have a unique identifier.');
    dayIds.add(day.id);
    if (day.kind === 'rest' && day.exercises.length) error('rest-exercises', `${day.name}: rest days cannot contain working sets.`);
    if (day.kind === 'training' && !day.exercises.length) error('empty-day', `${day.name}: select at least one exercise.`);
    for (const slot of day.exercises) {
      const exercise = catalog.get(slot.exerciseId);
      if (!exercise) error('unknown-exercise', `${day.name}: an exercise is missing from the library.`);
      if (slotIds.has(slot.id)) error('duplicate-slot', 'Each exercise slot must have a unique identifier.');
      slotIds.add(slot.id);
      const label = exercise?.name ?? slot.exerciseId;
      if (exercise && day.kind === 'training' && SOURCE_ROLE_BLOCKS[dayIndex]?.length) {
        const roles = primaryRoles(exercise);
        const blocks = SOURCE_ROLE_BLOCKS[dayIndex]!;
        const matches = blocks.flatMap((block, index) => roles.length > 0 && roles.every(role => block.has(role)) ? [index] : []);
        if (!matches.length) method('split-role', `${day.name}: ${label} does not match this day's source muscle roles. Use a suitable replacement or custom mode.`);
        else {
          const block = matches.find(index => index >= previousBlock);
          if (block === undefined) method('split-order', `${day.name}: ${label} breaks the source movement-block order. Keep the non-competing arm work after the main lifts.`);
          else previousBlock = block;
        }
      }
      if (!Number.isInteger(slot.sets) || slot.sets < 1 || slot.sets > 30) error('sets', `${label}: enter 1–30 whole working sets.`);
      if (!Number.isInteger(slot.repMin) || !Number.isInteger(slot.repMax) || slot.repMin < 1 || slot.repMax < slot.repMin || slot.repMax > 100) error('rep-range', `${label}: use a whole-number rep range from 1 to 100 with the floor at or below the cap.`);
      if (!finite(slot.load) || slot.load < 0 || !finite(slot.increment) || slot.increment <= 0) error('load', `${label}: load must be nonnegative and equipment increment must be positive.`);
      if (slot.availableLoads && (slot.availableLoads.some(n => !finite(n) || n < 0) || new Set(slot.availableLoads).size !== slot.availableLoads.length)) error('equipment-loads', `${label}: available loads must be unique nonnegative numbers.`);
      if (slot.bodyweight && (!finite(slot.bodyweight.resistance) || slot.bodyweight.resistance <= 0 || slot.bodyweight.addedLoads.some(n => !finite(n) || n <= 0) || slot.bodyweight.assistanceLoads.some(n => !finite(n) || n <= 0 || n >= slot.bodyweight!.resistance) || (slot.loadMode === 'assistance' && slot.load >= slot.bodyweight.resistance))) error('bodyweight-resistance', `${label}: record positive bodyweight resistance and valid added/assistance loads; assistance must be smaller than the bodyweight resistance.`);
      if (slot.loadMode === 'bodyweight' && slot.load !== 0) error('bodyweight-load', `${label}: bodyweight mode has no external load; choose weighted or assisted mode to record load.`);
      if (slot.rir.length !== slot.sets) error('rir-count', `${label}: give each set an RIR target.`);
      if (slot.rir.some(rir => rir !== '0-1' && rir !== '<0' && (!finite(rir) || rir < 0 || rir > 10))) error('rir-value', `${label}: RIR targets must be 0–10, 0–1, or <0.`);
      const finisher = slot.rir.indexOf('<0');
      if (finisher >= 0 && (finisher !== slot.rir.length - 1 || slot.rir.length < 2 || slot.rir.lastIndexOf('<0') !== finisher)) error('finisher-position', `${label}: a beyond-failure finisher needs a preceding anchor and must be the last set.`);
      if (finisher >= 0 && !exercise?.beyondFailureAllowed) method('finisher-unsupported', `${label}: the source library does not support beyond-failure work for this exercise.`);
      const efforts = slot.rir.map(rir => rir === '<0' ? -1 : rir === '0-1' ? 0.5 : rir);
      if (efforts.some((rir, index) => rir > 3 || (index > 0 && rir > efforts[index - 1]!))) method('rir-staircase', `${label}: use an abating RIR staircase from at most 3 toward 0–1, with an optional final <0 set.`);
      const anchor = slot.rir.at(finisher >= 0 ? -2 : -1);
      if (anchor !== '0-1' && anchor !== 0 && anchor !== 1) method('rir-anchor', `${label}: the progression anchor should finish at 0–1 RIR.`);
      if (exercise) {
        const sums = new Map<string, number>();
        for (const contribution of exercise.contributions) {
          if (!finite(contribution.coefficient) || contribution.coefficient <= 0 || contribution.coefficient > 1) error('contribution', `${label}: muscle contributions must be greater than zero and at most one.`);
          sums.set(contribution.muscle, (sums.get(contribution.muscle) ?? 0) + contribution.coefficient);
        }
        if (Array.from(sums.values()).some(sum => sum > 1 + EPSILON)) error('contribution-total', `${label}: combined credit for one muscle cannot exceed one per set.`);
      }
    }
  }
  const totals = new Map(calculateVolume(plan, exercises).map(row => [row.muscle, row.total]));
  for (const [muscle, target] of Object.entries(plan.targets)) {
    if (!finite(target) || target < 10 || target > 20) method('target-bounds', `${muscle}: selected weekly targets must be between 10 and 20 effective sets.`);
    const volume = totals.get(muscle) ?? 0;
    if (volume < 10 - EPSILON || volume > 20 + EPSILON) method('volume-bounds', `${muscle}: ${round(volume)} effective sets; the required weekly range is 10–20.`);
    const exposures = plan.days.filter(day => day.kind === 'training' && day.exercises.some(slot => slot.sets > 0 && catalog.get(slot.exerciseId)?.contributions.some(c => c.muscle === muscle && c.coefficient > 0))).length;
    if (exposures < 2) method('frequency', `${muscle}: ${exposures} training-day exposure${exposures === 1 ? '' : 's'}; at least two are required each week.`);
  }
  return issues;
}

/** Generic abating staircase for edited set counts; source prescriptions remain untouched. */
export function makeRir(sets: number, beyondFailure = false): Rir[] {
  if (!Number.isInteger(sets) || sets < 1 || sets > 30) return [];
  const finisher = beyondFailure && sets >= 2;
  const anchorCount = sets - Number(finisher);
  const result: Rir[] = Array.from({ length: anchorCount }, (_, i) => i === anchorCount - 1 ? '0-1' : Math.min(3, anchorCount - i - 1));
  if (finisher) result.push('<0');
  return result;
}

/** Double progression uses only the completed prescribed anchor, never the finisher. */
export function recommendProgression(log: ExerciseLog, settings: Settings, pivot = false): Recommendation {
  const finisher = log.targetRir.at(-1) === '<0';
  const anchorIndex = log.targetRir.length - (finisher ? 2 : 1);
  const anchor = log.sets.find(set => set.index === anchorIndex);
  const hold = (reason: string, targetReps = log.repMax): Recommendation => ({ action: 'hold', nextLoad: log.load, targetReps, reason, anchorIndex });
  if (pivot) return hold('Pivot week: keep the load and defer progression until normal training resumes.');
  if (anchorIndex < 0 || !anchor?.completed || !finite(anchor.reps) || !Number.isInteger(anchor.reps) || anchor.reps < 0 || !finite(anchor.rir)) return hold('Complete the prescribed anchor set with reps and RIR before changing load.');
  if (!finite(log.load) || log.load < 0 || !Number.isInteger(log.repMin) || !Number.isInteger(log.repMax) || log.repMin < 1 || log.repMax < log.repMin) return hold('Correct the load or rep range before calculating progression.');
  const target = log.targetRir[anchorIndex];
  const onTarget = target === '0-1' ? anchor.rir >= 0 && anchor.rir <= 1 : typeof target === 'number' && Math.abs(anchor.rir - target) < EPSILON;
  if (!onTarget) return hold(`Keep the load until the anchor reaches its assigned ${target} RIR; logged ${anchor.rir} RIR.`, Math.min(log.repMax, Math.max(log.repMin, anchor.reps + 1)));
  const increase = anchor.reps >= log.repMax;
  const decrease = anchor.reps < log.repMin;
  if (!increase && !decrease) return hold('Anchor is within the rep range at its target RIR. Keep the load and build reps.', Math.min(log.repMax, anchor.reps + 1));
  return chooseResistanceChange(log, settings, increase, anchorIndex);
}

function calendarDay(date: string | Date): number {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-').map(Number) as [number, number, number];
    const stamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(stamp);
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new Error('Invalid calendar date.');
    return stamp / 86_400_000;
  }
  const parsed = date instanceof Date ? date : new Date(date);
  if (!finite(parsed.getTime())) throw new Error('Invalid calendar date.');
  return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) / 86_400_000;
}

export function getWeek(startDate: string, date: string | Date = new Date()): number {
  return Math.floor(Math.max(0, calendarDay(date) - calendarDay(startDate)) / 7) + 1;
}

export function getDayIndex(startDate: string, date: string | Date = new Date()): number {
  return Math.max(0, calendarDay(date) - calendarDay(startDate)) % 7;
}

export function isPivotWeek(checkIns: CheckIn[], week: number): boolean {
  return week > 1 && checkIns.some(check => check.week === week - 1 && Number(!!(check.performanceDip || check.measuredPerformanceDip)) + Number(check.jointPain) + Number(check.poorSleep) >= 2);
}

export function recoveryAdvice(checkIn: CheckIn): string {
  if (checkIn.jointPain) return 'Avoid exercises that provoke joint pain. Use comfortable movement only; persistent or worsening pain needs assessment before returning to painful loading.';
  if (checkIn.poorSleep || checkIn.runDown || checkIn.elevatedHr || checkIn.lingeringSoreness) return 'Passive rest today: easy steps only, with no planned cardio. Avoid failure work, HIIT, and make-up lifting.';
  return 'Active rest today: 20–30 minutes of very easy aerobic work at conversational pace (about 40–60% max heart rate), plus 5–10 minutes of mobility. Avoid failure work, HIIT, and make-up lifting.';
}

export function createSession(planDay: PlanDay, exercises: Exercise[], settings: Settings, week: number, pivot: boolean): Session {
  if (planDay.kind !== 'training') throw new Error('Rest days do not create lifting sessions.');
  const catalog = new Map(exercises.map(exercise => [exercise.id, exercise]));
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return { id: crypto.randomUUID(), dayId: planDay.id, dayName: planDay.name, date, startedAt: now.toISOString(), week, pivot, notes: '', exercises: planDay.exercises.map(slot => {
    const exercise = catalog.get(slot.exerciseId);
    if (!exercise) throw new Error(`Exercise ${slot.exerciseId} is missing from the library.`);
    const count = pivot ? Math.max(1, Math.ceil(slot.sets / 2)) : slot.sets;
    const targetRir = slot.rir.slice(0, count);
    return { slotId: slot.id, exerciseId: slot.exerciseId, name: exercise.name, load: slot.load, increment: slot.increment, unit: settings.unit, loadMode: slot.loadMode, ...(slot.availableLoads ? { availableLoads: [...slot.availableLoads] } : {}), ...(slot.bodyweight ? { bodyweight: structuredClone(slot.bodyweight) } : {}), repMin: slot.repMin, repMax: slot.repMax, targetRir, contributions: structuredClone(exercise.contributions), notes: '', sets: targetRir.map((rir, index) => ({ index, reps: 0, rir: rir === '<0' ? -1 : rir === '0-1' ? 1 : rir, completed: false })) };
  }) };
}

/** Bounded integer search. Exact targets are preferences; strict weekly bounds stay hard. */
export function allocateSets(plan: TrainingPlan, exercises: Exercise[], strict = true, maxSetsPerExercise = 6): { plan: TrainingPlan; issues: ConstraintIssue[] } {
  const next = structuredClone(plan);
  if (!Number.isInteger(maxSetsPerExercise) || maxSetsPerExercise < 1 || maxSetsPerExercise > 30) return { plan: next, issues: [{ code: 'allocation-limit', severity: 'error', message: 'Use a whole automatic set limit between 1 and 30 per exercise.' }] };
  if (Object.values(next.targets).some(target => !finite(target) || target < 0 || target > 300)) return { plan: next, issues: [{ code: 'allocation-target', severity: 'error', message: 'Use finite weekly targets from 0 to 300 effective sets.' }] };
  const structural = validatePlan(next, exercises, strict).filter(issue => !['volume-bounds', 'frequency'].includes(issue.code));
  if (structural.some(issue => issue.severity === 'error')) return { plan: next, issues: structural };
  if (!Object.keys(next.targets).length) return { plan: next, issues: structural };
  const catalog = new Map(exercises.map(exercise => [exercise.id, exercise]));
  const slots = next.days.filter(day => day.kind === 'training').flatMap(day => day.exercises);
  const targets = Object.entries(next.targets);
  const matrix = slots.map(slot => targets.map(([muscle]) => (catalog.get(slot.exerciseId)?.contributions ?? []).filter(c => c.muscle === muscle).reduce((sum, c) => sum + c.coefficient, 0)));
  const days = next.days.flatMap((day, i) => day.kind === 'training' ? day.exercises.map(() => i) : []);
  const counts = fitSetCounts(matrix, days, targets.map(([, target]) => target), slots.map(slot => slot.sets), strict, maxSetsPerExercise);
  let changed = false;
  slots.forEach((slot, i) => {
    if (slot.sets !== counts[i]) { changed = true; slot.sets = counts[i]!; slot.rir = makeRir(slot.sets, slot.rir.at(-1) === '<0'); }
  });
  if (changed) { next.updatedAt = new Date().toISOString(); delete next.recovery; }
  const issues = validatePlan(next, exercises, strict);
  if (issues.some(issue => issue.severity === 'error')) {
    issues.unshift({ code: 'allocation-infeasible', severity: 'error', message: `No constrained allocation was found within the ${maxSetsPerExercise}-set limit per exercise. Change exercises, coverage, targets, or the automatic set limit; custom mode allows lower weekly volume.` });
  }
  const missed = calculateVolume(next, exercises).filter(row => row.target !== undefined && Math.abs(row.total - row.target) > EPSILON);
  if (missed.length) issues.push({ code: 'target-approximation', severity: 'warning', message: `Some targets were not matched with whole sets and the ${maxSetsPerExercise}-set limit per exercise. Planned / target: ${missed.map(row => `${MUSCLES.find(m => m.id === row.muscle)?.name ?? row.muscle} ${row.total}/${row.target}`).join(', ')}. Adjust targets, exercise coverage, or the automatic set limit. Retained exercises keep at least one set.` });
  return { plan: next, issues };
}

/** Scale only selected days; reconcile selected muscle goals against the complete week.
 * Whole sets are apportioned to a rounded day budget rather than rounded independently.
 * A preview always starts from its input plan, so dragging does not compound rounding.
 */
export function scaleTrainingDays(plan: TrainingPlan, exercises: Exercise[], dayIds: string[], percent: number): { plan: TrainingPlan; issues: ConstraintIssue[] } {
  const next = structuredClone(plan);
  const selected = new Set(dayIds);
  const issues: ConstraintIssue[] = [];
  if (!finite(percent) || percent <= 0 || percent > 200 || !selected.size || [...selected].some(id=>!plan.days.some(day=>day.id===id && day.kind==='training' && day.exercises.length))) {
    return {plan:next,issues:[{code:'scaling-input',severity:'error',message:'Select one or more training days and a volume percentage above 0 and at most 200.'}]};
  }
  if (percent === 100) return {plan:next,issues};
  const catalog = new Map(exercises.map(e=>[e.id,e]));
  const affected = new Set<string>();
  let changed = false;
  for (const day of next.days.filter(day=>selected.has(day.id))) {
    if (day.exercises.some(s=>!catalog.has(s.exerciseId) || !Number.isInteger(s.sets) || s.sets<1 || s.sets>30)) return {plan:structuredClone(plan),issues:[{code:'scaling-plan',severity:'error',message:'Correct the selected days’ exercise definitions and whole set counts before scaling.'}]};
    const desired = day.exercises.map(s=>s.sets*percent/100);
    const requested = desired.reduce((sum,n)=>sum+n,0);
    const budget = clamp(Math.round(requested),day.exercises.length,day.exercises.length*30);
    const counts = desired.map(n=>clamp(Math.floor(n),1,30));
    let total = counts.reduce((sum,n)=>sum+n,0);
    while (total!==budget) {
      const direction = total<budget ? 1 : -1;
      let winner = -1, best = Infinity;
      counts.forEach((n,i)=>{
        if(n+direction<1 || n+direction>30)return;
        const cost = (n+direction-desired[i]!)**2-(n-desired[i]!)**2;
        if(cost<best-EPSILON){best=cost;winner=i;}
      });
      if(winner<0)break;
      counts[winner]!+=direction;total+=direction;
    }
    if (Math.abs(total-requested)>EPSILON) issues.push({code:'scaling-rounded',severity:'warning',message:`${day.name}: ${round(requested)} requested working sets rounds to ${total}. Retained exercises keep 1–30 whole sets.`});
    day.exercises.forEach((slot,i)=>{
      for(const c of catalog.get(slot.exerciseId)!.contributions)affected.add(c.muscle);
      if (slot.sets===counts[i])return;
      slot.sets=counts[i]!;slot.rir=makeRir(slot.sets,slot.rir.at(-1)==='<0');changed=true;
    });
  }
  for(const row of calculateVolume(next,exercises))if(affected.has(row.muscle) && next.targets[row.muscle]!==undefined && next.targets[row.muscle]!==row.total){next.targets[row.muscle]=row.total;changed=true;}
  if(changed){
    delete next.recovery;next.updatedAt=new Date().toISOString();
  }
  return {plan:next,issues};
}
