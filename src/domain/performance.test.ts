import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/seed';
import { createSession } from './engine';
import { performanceEvidence } from './training';

function exposures(reps: number[]) {
  const data = createInitialData();
  return reps.map((value, index) => {
    const session = createSession(data.plan.days[0], data.exercises, data.settings, index + 1, false);
    session.startedAt = new Date(Date.UTC(2026, 0, 5 + index * 7, 12)).toISOString();
    session.date = session.startedAt.slice(0, 10);
    session.completedAt = session.startedAt;
    session.exercises = session.exercises.slice(0, 2);
    for (const exercise of session.exercises) {
      exercise.load = 100;
      for (const set of exercise.sets) { set.completed = true; set.reps = value; set.rir = 1; }
    }
    return session;
  });
}

describe('confirmed performance decline', () => {
  it('does not treat a one-rep fluctuation as declining performance', () => {
    expect(performanceEvidence(exposures([10, 10, 10, 10, 9]), 5)).toEqual([]);
  });
  it('requires a second low exposure before adding a performance flag', () => {
    expect(performanceEvidence(exposures([10, 10, 10, 7]), 4)).toEqual([]);
  });
  it('recognizes a sustained decline even when the second low result is unchanged', () => {
    expect(performanceEvidence(exposures([10, 10, 10, 8, 8]), 5)).toHaveLength(2);
  });
  it('uses the low end of the baseline so ordinary variability is not a decline', () => {
    expect(performanceEvidence(exposures([9, 11, 10, 9, 8]), 5)).toEqual([]);
  });
  it('recognizes a gradual decline across five unchanged prescriptions', () => {
    expect(performanceEvidence(exposures([10, 9, 8, 7, 6]), 5)).toHaveLength(2);
    expect(performanceEvidence(exposures([10, 10, 9, 8, 7]), 5)).toHaveLength(2);
    expect(performanceEvidence(exposures([11, 11, 10, 9, 9]), 5)).toEqual([]);
  });
  it('does not compare changed prescriptions or recycle stale pre-break evidence', () => {
    const changed = exposures([10, 10, 10, 8, 8]);
    changed[3].exercises.forEach(e => { e.load = 105; });
    expect(performanceEvidence(changed, 5)).toEqual([]);
    const stale = exposures([10, 10, 10, 8, 8]);
    stale[4].startedAt = '2026-04-20T12:00:00Z';
    expect(performanceEvidence(stale, 5)).toEqual([]);
  });
  it('does not infer a decline from reduced effort or a pivot prescription', () => {
    const easier = exposures([10, 10, 10, 8, 8]);
    easier[4].exercises.forEach(e => { e.sets.forEach(s => { s.rir = 3; }); });
    expect(performanceEvidence(easier, 5)).toEqual([]);
    const pivot = exposures([10, 10, 10, 8, 8]); pivot[4].pivot = true;
    expect(performanceEvidence(pivot, 5)).toEqual([]);
  });
});
