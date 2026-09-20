import type { ExerciseLog, Recommendation, Settings } from './types';

const EPSILON = 1e-8;
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Mechanical resistance proxy for an unchanged setup, not joint force or an e1RM. */
export function workingResistance(log: Pick<ExerciseLog, 'load' | 'loadMode' | 'bodyweight'>): number {
  return log.bodyweight ? log.bodyweight.resistance + (log.loadMode === 'assistance' ? -log.load : log.loadMode === 'external' ? log.load : 0) : log.load;
}

/** Called only after the completed anchor has passed the original rep/RIR gates. */
export function chooseResistanceChange(log: ExerciseLog, settings: Settings, increase: boolean, anchorIndex: number): Recommendation {
  const hold = (reason: string, extra: Partial<Recommendation> = {}): Recommendation => ({ action: 'hold', nextLoad: log.load, targetReps: log.repMin, anchorIndex, reason, ...extra });
  if (log.loadMode === 'bodyweight' && !log.bodyweight) return hold('Bodyweight progression needs setup: record the bodyweight resistance actually moved and the added loads or measured assistance you have. No body-mass percentage or harder variation is guessed.', { status: 'bodyweight-setup' });
  const current = workingResistance(log);
  if (!Number.isFinite(current) || current <= 0) return hold('Enter a positive working resistance before calculating a percentage-based change.', log.bodyweight ? { status: 'bodyweight-setup' } : {});
  const minimum = 2, maximum = increase ? 5 : 3;
  const requested = increase ? settings.increasePercent : settings.decreasePercent;
  const percent = Math.min(maximum, Math.max(minimum, Number.isFinite(requested) ? requested : 2.5));
  const direction = (increase ? 1 : -1) * (!log.bodyweight && log.loadMode === 'assistance' ? -1 : 1);
  const low = current * (1 + (direction > 0 ? minimum : -maximum) / 100);
  const high = current * (1 + (direction > 0 ? maximum : -minimum) / 100);
  const ideal = current * (1 + direction * percent / 100);
  type Candidate = { load: number; mode: ExerciseLog['loadMode']; resistance: number };
  let candidates: Candidate[] = [];
  if (log.bodyweight) {
    const base = log.bodyweight.resistance;
    candidates = [
      { load: 0, mode: 'bodyweight', resistance: base },
      ...log.bodyweight.addedLoads.map(load => ({ load, mode: 'external' as const, resistance: base + load })),
      ...log.bodyweight.assistanceLoads.map(load => ({ load, mode: 'assistance' as const, resistance: base - load })),
    ];
  } else if (log.availableLoads) {
    candidates = log.availableLoads.map(load => ({ load, mode: log.loadMode, resistance: load }));
  } else {
    const increment = log.increment ?? 0.5;
    if (!Number.isFinite(increment) || increment <= 0) return hold('Set a positive equipment increment before calculating a load change.');
    const first = Math.max(0, Math.ceil((low - EPSILON) / increment));
    const last = Math.floor((high + EPSILON) / increment);
    if (first <= last) {
      const load = round(Math.min(last, Math.max(first, Math.round(ideal / increment))) * increment);
      candidates = [{ load, mode: log.loadMode, resistance: load }];
    }
  }
  const valid = candidates.filter(c => Number.isFinite(c.resistance) && Number.isFinite(c.load) && c.load >= 0 && c.resistance > 0 && c.resistance >= low - EPSILON && c.resistance <= high + EPSILON && Math.abs(c.resistance - current) > EPSILON)
    .sort((a, b) => Math.abs(a.resistance - ideal) - Math.abs(b.resistance - ideal) || Math.abs(a.resistance - current) - Math.abs(b.resistance - current));
  const next = valid[0];
  const requiredChange = { min: round(current * minimum / 100), max: round(current * maximum / 100) };
  if (!next) return hold(`Equipment adjustment needed: the next ${increase ? 'increase' : 'decrease'} requires a ${requiredChange.min}–${requiredChange.max} ${log.unit} change${log.bodyweight ? ' in total resistance' : ''}. No confirmed load or equipment increment fits. Keep this load for now; add an available microload or configure another measured resistance option. The ${minimum}–${maximum}% limit stays in place.`, { status: 'equipment-needed', requiredChange });
  const actualPercent = Math.abs(next.resistance - current) / current * 100;
  if (actualPercent < minimum - EPSILON || actualPercent > maximum + EPSILON) return hold('The available equipment increment falls outside the permitted change.', { status: 'equipment-needed', requiredChange });
  const label = next.mode === 'bodyweight' ? 'unassisted bodyweight' : `${next.load} ${log.unit} ${next.mode === 'assistance' ? 'assistance' : log.bodyweight ? 'added load' : 'external load'}`;
  return { action: increase ? 'increase' : 'decrease', nextLoad: next.load, targetReps: log.repMin, anchorIndex,
    ...(log.bodyweight ? { nextLoadMode: next.mode, resistanceChangePercent: round(actualPercent) } : {}),
    reason: `${log.targetRir.at(-1) === '<0' ? 'Pre-finisher anchor' : 'Anchor'} ${increase ? 'reached or exceeded the cap' : 'fell below the floor'} at its assigned RIR. Use ${label} next time: ${round(actualPercent)}% ${increase ? 'more' : 'less'} ${log.bodyweight ? 'total resistance' : 'difficulty'}. Restart at ${log.repMin} reps.` };
}
