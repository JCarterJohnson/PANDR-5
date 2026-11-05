import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/seed';
import { createSession } from './engine';
import { assessmentDue, beginAssessment, finishAssessment, recordAssessment, startTraining } from './strength';

const profileId = '95629b72-6d84-41fc-acf0-5bf492ede8e8';
const assessedAt = new Date('2026-09-01T12:00:00');

function account() {
  let data = createInitialData();
  data.id = profileId;
  data.settings.startDate = '2026-09-01';
  data.settings.strict = false;
  const slot = { ...data.plan.days[0].exercises[0], sets: 3, rir: [2, 1, '0-1'] as const, repMin: 8, repMax: 12, increment: .5, equipmentPreset: 'custom' as const, availableLoads: undefined };
  data.plan.days = [{ ...data.plan.days[0], exercises: [{ ...slot, rir: [...slot.rir] }] }];
  data = beginAssessment(data, data.plan.days[0], assessedAt);
  data = recordAssessment(data, 0, { ...data.strength!.active!.items[0], load: 80, reps: 8, confirmed: true, setup: 'Flat bench, full range' }, assessedAt);
  return finishAssessment(data, assessedAt);
}

describe('requested account return on November 5', () => {
  it('resets every previously assessed movement without changing observations or prescriptions', () => {
    const data = account();
    const second = { ...data.plan.days[0].exercises[0], id: 'second-slot', exerciseId: data.exercises[1].id };
    data.plan.days.push({ id: 'second-day', name: 'Second day', kind: 'training', exercises: [second] });
    data.strength!.assessments.push({ ...data.strength!.assessments[0], id: 'second-assessment', exerciseId: second.exerciseId });
    const before = structuredClone(data);
    for (const day of data.plan.days) expect(assessmentDue(data, day, new Date('2026-11-05T12:00:00'))).toEqual([]);
    expect(data).toEqual(before);
    expect(startTraining(data, data.plan.days[0], false, new Date('2026-11-05T12:00:00')).activeSession?.assessmentBypassed).toBe(false);
  });

  it('starts on the requested date and expires at exactly fourteen local calendar days', () => {
    const data = account(), day = data.plan.days[0];
    expect(assessmentDue(data, day, new Date('2026-11-04T23:59:00'))[0]?.reason).toBe('stale');
    expect(assessmentDue(data, day, new Date('2026-11-18T23:59:00'))).toEqual([]);
    expect(assessmentDue(data, day, new Date('2026-11-19T00:00:00'))[0]?.reason).toBe('stale');
  });

  it('leaves the inactivity rule unchanged for other accounts', () => {
    const data = account();
    data.id = 'another-profile';
    expect(assessmentDue(data, data.plan.days[0], new Date('2026-11-05T12:00:00'))[0]?.reason).toBe('stale');
  });

  it('still requires missing and incompatible strength baselines', () => {
    const data = account(), day = data.plan.days[0], now = new Date('2026-11-05T12:00:00');
    day.exercises[0].loadMode = 'assistance';
    expect(assessmentDue(data, day, now)[0]?.reason).toBe('setup');
    data.strength!.assessments = [];
    expect(assessmentDue(data, day, now)[0]?.reason).toBe('new');
  });

  it('lets real completed training move the inactivity clock forward again', () => {
    const data = account(), day = data.plan.days[0];
    const session = createSession(day, data.exercises, data.settings, 11, false);
    session.date = '2026-11-10';
    session.completedAt = '2026-11-10T20:00:00Z';
    session.exercises[0].sets[0] = { index: 0, reps: 8, rir: 2, completed: true };
    data.sessions.push(session);
    expect(assessmentDue(data, day, new Date('2026-11-23T12:00:00'))).toEqual([]);
    expect(assessmentDue(data, day, new Date('2026-11-24T12:00:00'))[0]?.reason).toBe('stale');
  });
});
