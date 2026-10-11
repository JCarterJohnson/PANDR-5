import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/seed';
import { createSession } from './engine';
import { beginAssessment, recordAssessment } from './strength';
import { activeCycle, cyclesFor, startCycle } from './training';
import { cycleDeletionSummary, removeClosedCycle } from './cycle-deletion';
import type { CheckIn } from './types';

function deletionData() {
  const now = new Date('2026-09-18T12:00:00Z');
  let d = createInitialData(); d.settings.startDate = '2026-09-01';
  d = beginAssessment(d, d.plan.days[0], now);
  d = recordAssessment(d, 0, { ...d.strength!.active!.items[0], load: 80, reps: 8, setup: 'Saved assessment setup', confirmed: true }, now);
  delete d.strength!.active;
  d.sessions = [createSession(d.plan.days[0], d.exercises, d.settings, 1, false)];
  d.checkIns = [{ id: crypto.randomUUID(), date: '2026-09-07', week: 1, poorSleep: false, runDown: false, elevatedHr: false, lingeringSoreness: false, performanceDip: false, jointPain: false, notes: 'Old recovery note' } satisfies CheckIn];
  d = startCycle(d, 'Second cycle', '2026-09-18', now);
  const second = createSession(d.plan.days[0], d.exercises, d.settings, 1, false); second.cycleId = activeCycle(d).id;
  d.sessions.push(second);
  d = startCycle(d, 'Current cycle', '2026-09-25', new Date('2026-09-25T12:00:00Z'));
  d.activeSession = createSession(d.plan.days[0], d.exercises, d.settings, 1, false); d.activeSession.cycleId = activeCycle(d).id;
  return d;
}

describe('explicit previous-cycle deletion', () => {
  it('counts and removes legacy first-cycle logs while preserving strength and current training', () => {
    const d = deletionData(), original = structuredClone(d), id = cyclesFor(d)[0].id;
    expect(cycleDeletionSummary(d, id)).toMatchObject({ sessions: 1, checkIns: 1 });
    const next = removeClosedCycle(d, id);
    expect(next.sessions).toEqual([d.sessions[1]]); expect(next.checkIns).toEqual([]);
    expect(next.cycles).toEqual(d.cycles!.slice(1)); expect(next.activeCycleId).toBe(d.activeCycleId);
    expect(next.strength).toEqual(d.strength); expect(next.plan).toEqual(d.plan);
    expect(next.settings).toEqual(d.settings); expect(next.activeSession).toEqual(d.activeSession);
    expect(d).toEqual(original);
  });
  it('removes a later cycle without reassigning legacy first-cycle records', () => {
    const d = deletionData(), next = removeClosedCycle(d, d.cycles![1].id);
    expect(next.sessions).toEqual([d.sessions[0]]); expect(next.checkIns).toEqual(d.checkIns);
    expect(next.cycles![0].id).toBe(d.cycles![0].id);
  });
  it('rejects current cycles even when ended, unended cycles, unknown cycles and conflicting workouts', () => {
    const d = deletionData();
    expect(() => removeClosedCycle(d, d.activeCycleId!)).toThrow('previous, ended');
    d.cycles!.at(-1)!.endedAt = '2026-09-26';
    expect(() => removeClosedCycle(d, d.activeCycleId!)).toThrow('previous, ended');
    expect(() => removeClosedCycle(d, 'missing')).toThrow('no longer exists');
    const id = d.cycles![0].id; d.activeSession!.cycleId = id;
    expect(() => removeClosedCycle(d, id)).toThrow('workout in progress');
    delete d.activeSession; delete d.cycles![0].endedAt;
    expect(() => removeClosedCycle(d, id)).toThrow('previous, ended');
  });
});
