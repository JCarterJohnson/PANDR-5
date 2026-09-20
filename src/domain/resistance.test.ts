import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/seed';
import { createSession, recommendProgression } from './engine';

function anchor(reps = 8) {
  const data = createInitialData();
  const log = createSession(data.plan.days[0], data.exercises, data.settings, 1, false).exercises[0];
  log.load = 10; log.repMin = 5; log.repMax = 8; log.increment = 2.5;
  log.sets.forEach(s => { s.reps = reps; s.rir = 1; s.completed = true; });
  return { data, log };
}
const bodyweight = { resistance: 80, addedLoads: [2.5, 5, 7.5, 10], assistanceLoads: [2.5, 5, 10, 15, 20] };

describe('equipment-aware progression without changing percentage limits', () => {
  it('uses confirmed load options, including an available microload', () => {
    const { data, log } = anchor();
    expect(recommendProgression({ ...log, availableLoads: [10, 10.25, 12.5] }, data.settings)).toMatchObject({ action: 'increase', nextLoad: 10.25 });
  });
  it('never invents a rounded load absent from the supplied equipment list', () => {
    const { data, log } = anchor();
    expect(recommendProgression({ ...log, increment: 0.25, availableLoads: [10, 12.5] }, data.settings)).toMatchObject({ action: 'hold', status: 'equipment-needed', nextLoad: 10 });
  });
  it('identifies the real adjustment needed instead of silently holding forever', () => {
    const { data, log } = anchor();
    expect(recommendProgression(log, data.settings)).toMatchObject({ action: 'hold', status: 'equipment-needed', requiredChange: { min: 0.2, max: 0.5 } });
  });
  it('does not treat repeated successes as permission for an oversized jump', () => {
    const { data, log } = anchor(20);
    for (let i = 0; i < 20; i++) expect(recommendProgression(log, data.settings).nextLoad).toBe(10);
  });
});

describe('calibrated bodyweight progression', () => {
  it('moves from bodyweight to a real available added load using total resistance', () => {
    const { data, log } = anchor();
    const calibrated = { ...log, loadMode: 'bodyweight' as const, load: 0, bodyweight };
    expect(recommendProgression(calibrated, data.settings)).toMatchObject({ action: 'increase', nextLoad: 2.5, nextLoadMode: 'external', resistanceChangePercent: 3.125 });
  });
  it('reduces assistance using the resistance actually moved, not the assistance number', () => {
    const { data, log } = anchor();
    const calibrated = { ...log, loadMode: 'assistance' as const, load: 5, bodyweight };
    expect(recommendProgression(calibrated, data.settings)).toMatchObject({ action: 'increase', nextLoad: 2.5, nextLoadMode: 'assistance' });
  });
  it('crosses from assistance to unassisted without a zero-division stall', () => {
    const { data, log } = anchor();
    expect(recommendProgression({ ...log, loadMode: 'assistance', load: 2.5, bodyweight }, data.settings)).toMatchObject({ action: 'increase', nextLoad: 0, nextLoadMode: 'bodyweight' });
  });
  it('moves below unassisted resistance when the anchor is below the floor', () => {
    const { data, log } = anchor(4);
    const profile = { ...bodyweight, assistanceLoads: [2, 5, 10] };
    expect(recommendProgression({ ...log, loadMode: 'bodyweight', load: 0, bodyweight: profile }, data.settings)).toMatchObject({ action: 'decrease', nextLoad: 2, nextLoadMode: 'assistance', resistanceChangePercent: 2.5 });
  });
  it('requires calibration and real equipment instead of guessing a body-mass percentage', () => {
    const { data, log } = anchor();
    expect(recommendProgression({ ...log, loadMode: 'bodyweight', load: 0 }, data.settings)).toMatchObject({ action: 'hold', status: 'bodyweight-setup' });
    expect(recommendProgression({ ...log, loadMode: 'bodyweight', load: 0, bodyweight: { ...bodyweight, addedLoads: [20] } }, data.settings)).toMatchObject({ action: 'hold', status: 'equipment-needed' });
  });
  it('still holds on a pivot or incomplete anchor', () => {
    const { data, log } = anchor();
    const calibrated = { ...log, loadMode: 'bodyweight' as const, load: 0, bodyweight };
    expect(recommendProgression(calibrated, data.settings, true).action).toBe('hold');
    calibrated.sets.at(-1)!.completed = false;
    expect(recommendProgression(calibrated, data.settings).action).toBe('hold');
  });
});
