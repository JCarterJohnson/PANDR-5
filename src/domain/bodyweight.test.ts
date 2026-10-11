import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/seed';
import { resolveBodyweight, updateBodyMass } from './bodyweight';
import { completeSession, convertPlanLoads } from './coaching';
import { createSession, recommendProgression, validatePlan } from './engine';
import { assessmentDue, assessmentEstimate, beginAssessment, estimatedCapacity, finishAssessment, hasStrengthBaseline, prescribedSlot, reconcileAssessment, recordAssessment, startTraining, suggestedReps } from './strength';
import { workingResistance } from './resistance';
import { validateAppData } from './validation';
import { exportBackup, exportCsv, parseBackup } from '../services/backup';
import type { AppData, BodyweightResistance } from './types';

const now = new Date('2026-09-01T12:00:00Z');
function base(profile: BodyweightResistance = { tracking: 'full-body', resistance: 80, bodyMassKg: 80, addedLoads: [2,4,10], assistanceLoads: [3,5,10,15,20,30,40,90] }): AppData {
  const data = createInitialData();
  data.settings.unit = 'kg'; data.settings.startDate = '2026-09-01'; data.settings.bodyMass = { kg: 80, recordedAt: now.toISOString() };
  const slot = { ...data.plan.days[0].exercises[0], sets: 3, rir: [2,1,'0-1'] as const, repMin: 8, repMax: 12, load: 0, loadMode: 'bodyweight' as const, bodyweight: profile };
  data.plan.days = [{ ...data.plan.days[0], exercises: [{ ...slot, rir: [...slot.rir] }] }];
  return data;
}
function assessed(data = base(), reps = 8): AppData {
  data = beginAssessment(data,data.plan.days[0],now);
  const draft = data.strength!.active!.items[0];
  data = recordAssessment(data,0,{ ...draft, reps, setup: 'Same station, grip and range of motion', confirmed: true },now);
  return finishAssessment(data,now);
}
function progressed(): AppData {
  let data = assessed();
  const session = createSession(data.plan.days[0],data.exercises,data.settings,1,false);
  session.exercises[0].sets.forEach(set => { set.reps = 12; set.rir = 1; set.completed = true; });
  data = completeSession(data,session,'2026-09-02T12:00:00Z');
  expect(data.sessions[0].exercises[0].recommendation).toMatchObject({ action: 'increase', nextLoad: 2, nextLoadMode: 'external' });
  return data;
}

describe('shared body mass and immutable observations', () => {
  it('recomputes first-session offsets at a new mass without scaling historical absolute capacity', () => {
    const data = assessed(), before = prescribedSlot(data,data.plan.days[0].exercises[0]);
    const capacity = estimatedCapacity(data,data.plan.days[0].exercises[0])!.kg;
    const next = updateBodyMass(data,90,'kg',new Date('2026-09-02T10:00:00Z'));
    const after = prescribedSlot(next,next.plan.days[0].exercises[0]);
    expect(workingResistance(after)).toBe(workingResistance(before));
    expect(after).toMatchObject({ load: 15, loadMode: 'assistance', bodyweight: { resistance: 90, bodyMassKg: 90 } });
    expect(estimatedCapacity(next,after)!.kg).toBe(capacity);
    expect(next.strength!.assessments[0].bodyweight!.resistance).toBe(80);
    expect(assessmentDue(next,next.plan.days[0],now)).toEqual([]);
  });

  it('translates a progressed absolute target into assistance after a mass increase', () => {
    const data = progressed();
    const next = updateBodyMass(data,85,'kg');
    const prescribed = prescribedSlot(next,next.plan.days[0].exercises[0]);
    expect(prescribed).toMatchObject({ loadMode: 'assistance', load: 3 });
    expect(workingResistance(prescribed)).toBe(82);
    expect(next.sessions).toEqual(data.sessions);
    const gap = updateBodyMass(data,100,'kg');
    gap.plan.days[0].exercises[0].bodyweight!.assistanceLoads = [3,5];
    expect(() => prescribedSlot(gap,gap.plan.days[0].exercises[0])).toThrow('No available');
    const reversal = updateBodyMass(data,88,'kg');
    reversal.plan.days[0].exercises[0].bodyweight!.assistanceLoads = [30];
    expect(() => prescribedSlot(reversal,reversal.plan.days[0].exercises[0])).toThrow('PANDR limits');
  });

  it('freezes active workouts and saved assessments while clearing stale unfinished test inputs', () => {
    let data = startTraining(assessed(),base().plan.days[0],false,new Date('2026-09-02T12:00:00Z'));
    const workout = structuredClone(data.activeSession);
    data = updateBodyMass(data,90,'kg');
    expect(data.activeSession).toEqual(workout);
    expect(data.plan.days[0].exercises[0].bodyweight!.resistance).toBe(90);
    let unfinished = beginAssessment(base(),base().plan.days[0],now);
    unfinished.strength!.active!.items[0] = { ...unfinished.strength!.active!.items[0], reps: 8, confirmed: true, setup: 'Saved setup' };
    const changed = updateBodyMass(unfinished,90,'kg');
    expect(changed.strength!.active!.items[0]).toMatchObject({ reps: 0, confirmed: false, setup: 'Saved setup', slot: { bodyweight: { resistance: 90 } } });
    const single = structuredClone(unfinished); single.strength!.active!.items[0].method = '1rm'; single.strength!.active!.items[0].reps = 1;
    expect(updateBodyMass(single,90,'kg').strength!.active!.items[0]).toMatchObject({ reps: 1, confirmed: false });
    expect(reconcileAssessment(changed,unfinished.plan,now).strength!.active!.items[0]).toMatchObject({ reps: 0, confirmed: false, setup: 'Saved setup', slot: { bodyweight: { resistance: 90 } } });
    const saved = recordAssessment(unfinished,0,unfinished.strength!.active!.items[0],now);
    expect(updateBodyMass(saved,90,'kg').strength!.active!.items[0]).toEqual(saved.strength!.active!.items[0]);
    expect(reconcileAssessment(updateBodyMass(saved,90,'kg'),saved.plan,now).strength!.active!.items[0]).toEqual(saved.strength!.active!.items[0]);
    expect(() => recordAssessment(changed,0,unfinished.strength!.active!.items[0],now)).toThrow('body weight changed');
  });

  it('applies completion progression at the original snapshot even after a weight edit during the workout', () => {
    let data = assessed();
    const session = createSession(data.plan.days[0],data.exercises,data.settings,1,false);
    session.exercises[0].sets.forEach(set => { set.reps = 12; set.rir = 1; set.completed = true; });
    data.activeSession = session;
    data = updateBodyMass(data,85,'kg');
    data = completeSession(data,data.activeSession!,'2026-09-02T12:00:00Z');
    expect(data.sessions[0].exercises[0]).toMatchObject({ bodyweight: { resistance: 80 }, recommendation: { nextLoad: 2, nextLoadMode: 'external' } });
    expect(data.plan.days[0].exercises[0]).toMatchObject({ load: 3, loadMode: 'assistance', bodyweight: { resistance: 85 } });
  });

  it('scales only an explicitly measured same-setup fraction and keeps legacy numeric profiles fixed', () => {
    const partial = base({ tracking: 'measured', resistance: 48, bodyMassKg: 80, fraction: .6, addedLoads: [], assistanceLoads: [] });
    const changed = updateBodyMass(partial,90,'kg');
    expect(changed.plan.days[0].exercises[0].bodyweight).toMatchObject({ fraction: .6, resistance: 54, bodyMassKg: 90 });
    const legacy = base({ resistance: 48, addedLoads: [], assistanceLoads: [] });
    expect(updateBodyMass(legacy,90,'kg').plan.days[0].exercises[0].bodyweight).toEqual(legacy.plan.days[0].exercises[0].bodyweight);
    expect(parseBackup(exportBackup(legacy))).toEqual(legacy);
    const unlinked = base({ tracking: 'measured', resistance: 48, addedLoads: [], assistanceLoads: [] });
    const withMass = updateBodyMass(unlinked,90,'kg');
    expect(updateBodyMass(withMass,100,'kg').plan.days[0].exercises[0].bodyweight).toEqual(unlinked.plan.days[0].exercises[0].bodyweight);
  });

  for (const unit of ['kg','lb'] as const) for (const loadMode of ['bodyweight','assistance','external'] as const) it(`preserves a saved legacy ${unit} ${loadMode} test through reload, shared-weight edits and unit changes`, () => {
    const legacy = base({ resistance: unit === 'kg' ? 80 : 235, addedLoads: [10], assistanceLoads: [20] });
    legacy.settings.unit = unit; delete legacy.settings.bodyMass;
    const slot = legacy.plan.days[0].exercises[0];
    slot.loadMode = loadMode; slot.load = loadMode === 'bodyweight' ? 0 : loadMode === 'assistance' ? 20 : 10;
    const started = beginAssessment(legacy,legacy.plan.days[0],now);
    const recorded = recordAssessment(started,0,{ ...started.strength!.active!.items[0], reps: 8, setup: 'Three plates under each hand; same elevation, grip and full range of motion.', confirmed: true },now);
    const observations = JSON.stringify(recorded.strength!.assessments);
    const savedDraft = structuredClone(recorded.strength!.active!.items[0]);
    const originalSlot = structuredClone(recorded.plan.days[0].exercises[0]);
    const capacity = estimatedCapacity(recorded,originalSlot)!.kg;

    // Account/backup validation and the queue reconciliation used on hydration
    // must not infer tracking or rewrite previously recorded observations.
    const restored = reconcileAssessment(validateAppData(parseBackup(exportBackup(recorded))),undefined,now);
    expect(JSON.stringify(restored.strength!.assessments)).toBe(observations);
    expect(restored.strength!.active!.items[0]).toEqual(savedDraft);
    const changed = reconcileAssessment(updateBodyMass(restored,90,'kg',now),restored.plan,now);
    expect(changed.plan.days[0].exercises[0]).toEqual(originalSlot);
    expect(changed.strength!.active!.items[0]).toEqual(savedDraft);
    expect(JSON.stringify(changed.strength!.assessments)).toBe(observations);
    expect(hasStrengthBaseline(changed,changed.plan.days[0].exercises[0])).toBe(true);
    expect(assessmentDue(changed,changed.plan.days[0],now)).toEqual([]);
    expect(estimatedCapacity(changed,changed.plan.days[0].exercises[0])!.kg).toBe(capacity);

    const converted = structuredClone(changed);
    converted.plan = convertPlanLoads(converted.plan,unit === 'kg' ? 2.2046226218 : 1 / 2.2046226218);
    converted.settings.unit = unit === 'kg' ? 'lb' : 'kg';
    const reopened = reconcileAssessment(validateAppData(converted),changed.plan,now);
    expect(JSON.stringify(reopened.strength!.assessments)).toBe(observations);
    expect(reopened.strength!.active!.items[0]).toEqual(savedDraft);
    expect(hasStrengthBaseline(reopened,reopened.plan.days[0].exercises[0])).toBe(true);
    expect(assessmentDue(reopened,reopened.plan.days[0],now)).toEqual([]);
    expect(estimatedCapacity(reopened,reopened.plan.days[0].exercises[0])!.kg).toBe(capacity);
  });

  for (const tracking of [undefined,'measured'] as const) it(`requires reassessment after a fixed supported load changes, but preserves a unit-equivalent setup (${tracking ?? 'legacy'})`, () => {
    const data = assessed(base({ tracking, resistance: 40, addedLoads: [], assistanceLoads: [5,10] }));
    const recalibrated = structuredClone(data);
    recalibrated.plan.days[0].exercises[0].bodyweight!.resistance = 55;
    expect(assessmentDue(recalibrated,recalibrated.plan.days[0],now)[0].reason).toBe('setup');
    expect(estimatedCapacity(recalibrated,recalibrated.plan.days[0].exercises[0])).toBeUndefined();
    const equivalent = structuredClone(data);
    equivalent.plan = convertPlanLoads(equivalent.plan,2.2046226218); equivalent.settings.unit = 'lb';
    expect(assessmentDue(equivalent,equivalent.plan.days[0],now)).toEqual([]);
    expect(estimatedCapacity(equivalent,equivalent.plan.days[0].exercises[0])!.kg).toBe(estimatedCapacity(data,data.plan.days[0].exercises[0])!.kg);
  });

  it('keeps kilograms as the shared source when display and equipment units change', () => {
    const data = base({ tracking: 'measured', resistance: 48, bodyMassKg: 80, fraction: .6, addedLoads: [2], assistanceLoads: [3] });
    data.plan = convertPlanLoads(data.plan,2.2046226218); data.settings.unit = 'lb';
    expect(data.plan.days[0].exercises[0].bodyweight).toMatchObject({ fraction: .6, bodyMassKg: 80 });
    const changed = updateBodyMass(data,90 * 2.2046226218,'lb');
    expect(changed.settings.bodyMass!.kg).toBeCloseTo(90);
    expect(changed.plan.days[0].exercises[0].bodyweight!.resistance).toBeCloseTo(54 * 2.2046226218);
    expect(data.settings.bodyMass!.kg).toBe(80);
    expect(() => validateAppData(changed)).not.toThrow();
  });

  it('preserves assistance inventory above the new mass and resets an impossible future offset', () => {
    const data = base(); data.plan.days[0].exercises[0].loadMode = 'assistance'; data.plan.days[0].exercises[0].load = 70;
    const next = updateBodyMass(data,60,'kg');
    expect(next.plan.days[0].exercises[0]).toMatchObject({ loadMode: 'bodyweight', load: 0, bodyweight: { assistanceLoads: [3,5,10,15,20,30,40,90] } });
    expect(() => validateAppData(next)).not.toThrow();
  });

  it('validates shared mass, calibration ratios, and reps-only load invariants', () => {
    for (const mass of [0,-1,NaN,Infinity,501]) expect(() => updateBodyMass(base(),mass,'kg')).toThrow();
    const data = base(); data.settings.bodyMass!.kg = 0; expect(() => validateAppData(data)).toThrow();
    const invalid = base({ tracking: 'full-body', resistance: 80, bodyMassKg: 80, fraction: .5, addedLoads: [], assistanceLoads: [] });
    expect(() => validateAppData(invalid)).toThrow();
    const badRatio = base({ tracking: 'measured', resistance: 80, bodyMassKg: 80, fraction: 1.1, addedLoads: [], assistanceLoads: [] });
    expect(() => validateAppData(badRatio)).toThrow();
  });
});

describe('bodyweight repetitions without a measured resistance', () => {
  const profile: BodyweightResistance = { tracking: 'reps-only', resistance: 0, bodyMassKg: 80, addedLoads: [], assistanceLoads: [] };
  it('records a 16-rep baseline, supplies RIR guidance, and omits load and e1RM estimates', () => {
    const data = assessed(base(profile),16);
    const baseline = data.strength!.assessments[0];
    expect(() => assessmentEstimate(baseline)).toThrow('no measured resistance');
    expect(estimatedCapacity(data,data.plan.days[0].exercises[0])).toBeUndefined();
    const started = startTraining(data,data.plan.days[0],false,new Date('2026-09-02T12:00:00Z'));
    expect(started.activeSession!.exercises[0]).toMatchObject({ load: 0, loadMode: 'bodyweight' });
    expect(suggestedReps(started,started.activeSession!,0)).toEqual([12,12,12]);
    started.activeSession!.exercises[0].sets[0] = { index: 0, reps: 9, rir: 1, completed: true };
    expect(suggestedReps(started,started.activeSession!,0)[1]).toBe(9);
    const csv = exportCsv(data).slice(1).split('\r\n');
    const headings = csv[0].split(',');
    const row = csv.find(line => line.includes('"strength_assessment"'))!;
    expect(row.split(',')[headings.indexOf('"estimated_1rm_kg"')]).toBe('""');
    expect(parseBackup(exportBackup(data))).toEqual(data);
    expect(validatePlan(data.plan,data.exercises,false).some(issue => issue.code === 'bodyweight-resistance')).toBe(false);
  });

  it('holds the same setup at the cap and requests a retest without inventing a percentage load', () => {
    const data = assessed(base(profile),16);
    const log = createSession(data.plan.days[0],data.exercises,data.settings,1,false).exercises[0];
    log.sets.forEach(set => { set.reps = 12; set.rir = 1; set.completed = true; });
    expect(recommendProgression(log,data.settings)).toMatchObject({ action: 'hold', nextLoad: 0, nextLoadMode: 'bodyweight', status: 'bodyweight-setup' });
    expect(recommendProgression(log,data.settings).reason).toContain('retest');
    expect(recommendProgression(log,data.settings).resistanceChangePercent).toBeUndefined();
    const changed = updateBodyMass(data,90,'kg');
    expect(assessmentDue(changed,changed.plan.days[0],now)[0].reason).toBe('setup');
    const unfinished = beginAssessment(base(profile),base(profile).plan.days[0],now);
    unfinished.strength!.active!.items[0].setup = 'Elevation on three plates';
    expect(reconcileAssessment(updateBodyMass(unfinished,90,'kg'),unfinished.plan,now).strength!.active!.items[0].setup).toBe('Elevation on three plates');
  });

  it('rejects a reps-only 1RM and any load or assistance attached to a reps-only setup', () => {
    const data = beginAssessment(base(profile),base(profile).plan.days[0],now), draft = data.strength!.active!.items[0];
    expect(() => recordAssessment(data,0,{ ...draft, method: '1rm', reps: 1, setup: 'Same setup', confirmed: true },now)).toThrow('2–100');
    const invalid = base({ ...profile, addedLoads: [5] }); expect(() => validateAppData(invalid)).toThrow();
    const invalidMode = base(profile); invalidMode.plan.days[0].exercises[0].loadMode = 'external';
    expect(() => validateAppData(invalidMode)).toThrow();
    expect(resolveBodyweight(invalidMode.plan.days[0].exercises[0],invalidMode.settings)).toMatchObject({ loadMode: 'bodyweight', load: 0 });
  });
});
