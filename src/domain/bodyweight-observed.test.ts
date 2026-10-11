import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/seed';
import { createSession, recommendProgression } from './engine';
import { withObservedBodyweightLoad } from './bodyweight';
import { workingResistance } from './resistance';
import { validateAppData } from './validation';
import { completeSession } from './coaching';

describe('observed bodyweight resistance corrections', () => {
  it('logs 80 lb assistance against the frozen bodyweight and retains full-rep observations', () => {
    const data = createInitialData();
    data.settings.unit = 'lb';
    const session = createSession(data.plan.days[0], data.exercises, data.settings, 1, false);
    const log = session.exercises[0];
    log.bodyweight = { tracking: 'full-body', resistance: 235, bodyMassKg: 235 / 2.2046226218, addedLoads: [5], assistanceLoads: [10] };
    log.load = 0; log.loadMode = 'bodyweight'; log.prescribedLoad = 0; log.prescribedLoadMode = 'bodyweight';
    log.sets[0] = { index: 0, reps: 9, rir: 0, completed: true };
    const before = structuredClone(log);
    const corrected = withObservedBodyweightLoad(log, 'assistance', 80);
    expect(corrected).toMatchObject({ load: 80, loadMode: 'assistance', actualLoadOverride: true, prescribedLoad: 0, prescribedLoadMode: 'bodyweight' });
    expect(corrected.sets).toEqual(before.sets);
    expect(corrected.bodyweight).toEqual(before.bodyweight);
    expect(workingResistance(corrected)).toBe(155);
    expect(log).toEqual(before);
    session.exercises[0] = corrected; data.activeSession = session;
    expect(validateAppData(data).activeSession!.exercises[0]).toEqual(corrected);
    expect(() => withObservedBodyweightLoad(corrected, 'assistance', 235)).toThrow('less than');
  });

  it('keeps unmeasured assistance as actual load context and never estimates total resistance', () => {
    const data = createInitialData();
    const session = createSession(data.plan.days[0], data.exercises, data.settings, 1, false);
    const log = session.exercises[0];
    log.bodyweight = { tracking: 'reps-only', resistance: 0, addedLoads: [], assistanceLoads: [], additionalWeightKg: 10 };
    log.load = 0; log.loadMode = 'bodyweight';
    log.sets.forEach((set, i) => { set.reps = log.repMax; set.rir = i === log.sets.length - 1 ? 1 : 2; set.completed = true; });
    const corrected = withObservedBodyweightLoad(log, 'assistance', 80);
    expect(corrected.bodyweight!.additionalWeightKg).toBeUndefined();
    expect(workingResistance(corrected)).toBe(0);
    expect(recommendProgression(corrected, data.settings)).toMatchObject({ action: 'hold', nextLoad: 80, nextLoadMode: 'assistance', status: 'bodyweight-setup' });
    session.exercises[0] = corrected; data.activeSession = session;
    expect(validateAppData(data).activeSession!.exercises[0].load).toBe(80);
    const slot = data.plan.days[0].exercises[0];
    slot.bodyweight = structuredClone(corrected.bodyweight); slot.load = 0; slot.loadMode = 'bodyweight';
    const finished = completeSession(data, session, new Date().toISOString());
    expect(finished.plan.days[0].exercises[0]).toMatchObject({ load: 0, loadMode: 'bodyweight' });
    expect(finished.sessions[0].exercises[0]).toMatchObject({ load: 80, loadMode: 'assistance' });
    expect(() => validateAppData(finished)).not.toThrow();
  });
});
