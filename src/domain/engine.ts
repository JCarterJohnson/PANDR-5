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
  if (log.loadMode === 'bodyweight') return hold(increase ? 'Bodyweight anchor reached the cap. Progress difficulty or choose weighted/assisted mode; no external load is assumed.' : 'Bodyweight anchor is below the floor. Adjust assistance or exercise difficulty; no external load is assumed.', log.repMin);
  if (log.load === 0) return hold('Enter your working load before calculating a percentage-based change.', log.repMin);
  const requested = increase ? settings.increasePercent : settings.decreasePercent;
  const minPercent = 2;
  const maxPercent = increase ? 5 : 3;
  const percent = clamp(finite(requested) ? requested : 2.5, minPercent, maxPercent);
  // For assisted movements, decreasing the assistance is an increase in difficulty.
  const direction = (increase ? 1 : -1) * (log.loadMode === 'assistance' ? -1 : 1);
  const increment = log.increment ?? 0.5;
  if (!finite(increment) || increment <= 0) return hold('Set a positive equipment increment before calculating a load change.', log.repMin);
  const lowLoad = log.load * (1 + (direction > 0 ? minPercent : -maxPercent) / 100);
  const highLoad = log.load * (1 + (direction > 0 ? maxPercent : -minPercent) / 100);
  const minStep = Math.max(0, Math.ceil((lowLoad - EPSILON) / increment));
  const maxStep = Math.floor((highLoad + EPSILON) / increment);
  if (minStep > maxStep) return hold(`No available ${increment} ${log.unit} equipment increment fits the model's ${minPercent}–${maxPercent}% change. Keep this load or use a smaller increment.`, log.repMin);
  const idealLoad = log.load * (1 + direction * percent / 100);
  const nextLoad = round(clamp(Math.round(idealLoad / increment), minStep, maxStep) * increment);
  const actualPercent = Math.abs(nextLoad - log.load) / log.load * 100;
  if (actualPercent < minPercent - EPSILON || actualPercent > maxPercent + EPSILON || nextLoad === log.load) return hold(`The equipment increment cannot produce a ${minPercent}–${maxPercent}% change. Keep this load or use a smaller increment.`, log.repMin);
  const verb = log.loadMode === 'assistance' ? (increase ? 'Reduce assistance' : 'Increase assistance') : (increase ? 'Increase load' : 'Reduce load');
  return { action: increase ? 'increase' : 'decrease', nextLoad, targetReps: log.repMin, anchorIndex, reason: `${finisher ? 'Pre-finisher anchor' : 'Anchor'} ${increase ? 'reached or exceeded the cap' : 'fell below the floor'} at its assigned RIR. ${verb} ${round(actualPercent)}% and restart at ${log.repMin} reps.` };
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
  return week > 1 && checkIns.some(check => check.week === week - 1 && Number(check.performanceDip) + Number(check.jointPain) + Number(check.poorSleep) >= 2);
}

export function recoveryAdvice(checkIn: CheckIn): string {
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
    return { slotId: slot.id, exerciseId: slot.exerciseId, name: exercise.name, load: slot.load, increment: slot.increment, unit: settings.unit, loadMode: slot.loadMode, repMin: slot.repMin, repMax: slot.repMax, targetRir, contributions: structuredClone(exercise.contributions), notes: '', sets: targetRir.map((rir, index) => ({ index, reps: 0, rir: rir === '<0' ? -1 : rir === '0-1' ? 1 : rir, completed: false })) };
  }) };
}

/** Bounded integer search. Exact targets are preferences; strict weekly bounds stay hard. */
export function allocateSets(plan: TrainingPlan, exercises: Exercise[], strict = true): { plan: TrainingPlan; issues: ConstraintIssue[] } {
  const next = structuredClone(plan);
  const structural = validatePlan(next, exercises, strict).filter(issue => !['volume-bounds', 'frequency'].includes(issue.code));
  if (structural.some(issue => issue.severity === 'error')) return { plan: next, issues: structural };
  const catalog = new Map(exercises.map(exercise => [exercise.id, exercise]));
  const slots = next.days.filter(day => day.kind === 'training').flatMap(day => day.exercises);
  const targets = Object.entries(next.targets);
  const matrix = slots.map(slot => targets.map(([muscle]) => (catalog.get(slot.exerciseId)?.contributions ?? []).filter(c => c.muscle === muscle).reduce((sum, c) => sum + c.coefficient, 0)));
  const original = slots.map(slot => slot.sets);
  const counts = [...original];
  const objective = (candidate: number[]) => {
    let bounds = 0;
    let distance = 0;
    targets.forEach(([, target], i) => {
      const volume = candidate.reduce((sum, sets, j) => sum + sets * matrix[j]![i]!, 0);
      if (strict) bounds += Math.max(0, 10 - volume) ** 2 + Math.max(0, volume - 20) ** 2;
      distance += (volume - target) ** 2;
    });
    return bounds * 1e6 + distance + candidate.reduce((sum, sets, i) => sum + Math.abs(sets - original[i]!), 0) * 0.00001;
  };
  let score = objective(counts);
  for (let iteration = 0; iteration < 500; iteration++) {
    let best = score;
    let winner: number[] | undefined;
    for (let i = 0; i < counts.length; i++) {
      if (!matrix[i]!.some(Boolean)) continue;
      for (const delta of [-1, 1]) {
        if (counts[i]! + delta < 1 || counts[i]! + delta > 30) continue;
        const candidate = [...counts];
        candidate[i]! += delta;
        const value = objective(candidate);
        if (value < best - EPSILON) { best = value; winner = candidate; }
      }
    }
    // A coupled swap can improve two muscles when neither single move helps.
    if (!winner) for (let i = 0; i < counts.length; i++) for (let j = i + 1; j < counts.length; j++) {
      if (!matrix[i]!.some(Boolean) || !matrix[j]!.some(Boolean)) continue;
      for (const di of [-1, 1]) for (const dj of [-1, 1]) {
        if (counts[i]! + di < 1 || counts[i]! + di > 30 || counts[j]! + dj < 1 || counts[j]! + dj > 30) continue;
        const candidate = [...counts]; candidate[i]! += di; candidate[j]! += dj;
        const value = objective(candidate);
        if (value < best - EPSILON) { best = value; winner = candidate; }
      }
    }
    if (!winner) break;
    counts.splice(0, counts.length, ...winner);
    score = best;
  }
  slots.forEach((slot, i) => {
    if (slot.sets !== counts[i]) { slot.sets = counts[i]!; slot.rir = makeRir(slot.sets, slot.rir.at(-1) === '<0'); }
  });
  next.updatedAt = new Date().toISOString();
  const issues = validatePlan(next, exercises, strict);
  if (issues.some(issue => issue.severity === 'error')) {
    issues.unshift({ code: 'allocation-infeasible', severity: 'error', message: 'No valid set allocation was found for this exercise selection. Change exercises, training-day coverage, or selected targets before activating strict mode.' });
  } else {
    const missed = calculateVolume(next, exercises).filter(row => row.target !== undefined && Math.abs(row.total - row.target) > EPSILON);
    if (missed.length) issues.push({ code: 'target-approximation', severity: 'warning', message: `Whole sets cannot match every requested target in this allocation. ${strict ? 'All selected muscles remain within 10–20: ' : 'Planned / target: '}${missed.map(row => `${row.muscle} ${row.total}/${row.target}`).join(', ')}.` });
  }
  return { plan: next, issues };
}
