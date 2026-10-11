import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/seed';
import { availableExercises } from '../data/catalog';
import { completeSession, convertPlanLoads } from './coaching';
import { createSession } from './engine';
import { barbellEquipment, migratePracticalEquipment, POUNDS_PER_KG, standardEquipment } from './equipment';
import { estimatedCapacity, hasStrengthBaseline, prescribedSlot } from './strength';
import type { AppData, BodyweightResistance } from './types';
import { validateAppData } from './validation';

function legacyAccount(): AppData {
  const data = createInitialData();
  data.settings.unit = 'lb';
  data.settings.strict = false;
  const slot = { ...data.plan.days[0]!.exercises[0]!, increment: 1.1023, availableLoads: undefined, equipmentPreset: undefined, load: 202.8232 };
  data.plan.days = [{ ...data.plan.days[0]!, exercises: [slot] }];
  data.strength = {
    onboardingCompletedAt: '2026-10-01T12:00:00Z',
    assessments: [{ id: 'bench-test', exerciseId: slot.exerciseId, name: 'Bench Press', date: '2026-10-01', completedAt: '2026-10-01T12:00:00Z', method: '1rm', reps: 1, load: 225, loadMode: 'external', unit: 'lb', setup: 'Saved bench setup', curve: 'bench', version: 1 }],
    active: { paused: true, id: 'unfinished-test', initial: false, startedAt: '2026-10-08T12:00:00Z', dayId: data.plan.days[0]!.id, items: [{ exerciseId: slot.exerciseId, slot: structuredClone(slot), reason: 'stale', method: 'failure', load: 207.321, reps: 8, loadMode: 'external', unit: 'lb', setup: 'Unfinished test setup', confirmed: true }] },
  };
  const session = createSession(data.plan.days[0]!, data.exercises, data.settings, 1, false);
  session.id = 'completed-legacy';
  session.date = '2026-10-08';
  session.startedAt = '2026-10-08T12:00:00Z';
  session.completedAt = '2026-10-08T13:00:00Z';
  const log = session.exercises[0]!;
  log.sets.forEach(set => { set.completed = true; set.reps = log.repMax; set.rir = 1; });
  log.recommendation = { action: 'hold', nextLoad: slot.load, targetReps: log.repMax, anchorIndex: log.sets.length - 1, reason: 'Saved recommendation' };
  data.sessions = [session];
  data.activeSession = { ...structuredClone(session), id: 'active-legacy', completedAt: undefined };
  return data;
}

function freezeDeep(value: object): void {
  Object.values(value).forEach(child => { if (child && typeof child === 'object') freezeDeep(child); });
  Object.freeze(value);
}

describe('practical equipment migration', () => {
  it('replaces the converted half-kilogram grid while preserving every recorded observation and live workout', () => {
    const data = legacyAccount();
    expect(Math.round(.5 * POUNDS_PER_KG * 1e4) / 1e4 * 184).toBeCloseTo(202.8232, 8);
    const original = structuredClone(data);
    freezeDeep(data);
    const next = migratePracticalEquipment(data);
    expect(next.plan.days[0]!.exercises[0]).toMatchObject({ equipmentPreset: 'auto', increment: 10, load: 195 });
    expect(next.plan.days[0]!.exercises[0]!.availableLoads!.slice(0, 3)).toEqual([45, 55, 65]);
    expect(next.strength).toBe(data.strength);
    expect(next.sessions).toBe(data.sessions);
    expect(next.activeSession).toBe(data.activeSession);
    expect(next.checkIns).toBe(data.checkIns);
    expect(data).toEqual(original);
    expect(migratePracticalEquipment(next)).toBe(next);
    expect(() => validateAppData(next)).not.toThrow();
  });

  it('carries an old off-grid recommendation onto practical future gear without changing strength', () => {
    const data = legacyAccount(), capacity = estimatedCapacity(data, data.plan.days[0]!.exercises[0]!)!;
    const next = migratePracticalEquipment(data), slot = next.plan.days[0]!.exercises[0]!;
    expect(hasStrengthBaseline(next, slot)).toBe(true);
    expect(estimatedCapacity(next, slot)).toEqual(capacity);
    expect(prescribedSlot(next, slot).load).toBe(195);
    expect(next.strength!.assessments[0]!.load).toBe(225);
    expect(next.strength!.active!.items[0]).toEqual(data.strength!.active!.items[0]);
  });

  it('uses current equipment for an old active workout’s next recommendation but logs the weight actually lifted', () => {
    const next = migratePracticalEquipment(legacyAccount()), active = next.activeSession!;
    const performed = structuredClone(active.exercises[0]!);
    const completed = completeSession(next, active, '2026-10-09T13:00:00Z');
    const recorded = completed.sessions.at(-1)!.exercises[0]!;
    expect(recorded.load).toBe(performed.load);
    expect(recorded.increment).toBe(performed.increment);
    expect(recorded.availableLoads).toEqual(performed.availableLoads);
    expect(recorded.sets).toEqual(performed.sets);
    // Neither 205 nor 215 fits the 2–5% increase limit from the old odd load.
    // The next workout therefore uses the closest available load below the hold.
    expect(recorded.recommendation!.nextLoad).toBe(195);
    expect(completed.plan.days[0]!.exercises[0]!.load).toBe(195);
    expect(completed.sessions[0]).toEqual(next.sessions[0]);
    expect(completed.strength).toBe(next.strength);
  });

  it('recognizes prior generated gear while preserving explicit plate overrides and custom microloads', () => {
    const data = legacyAccount(), slot = data.plan.days[0]!.exercises[0]!;
    const oldMetricBar = barbellEquipment('lb');
    data.settings.unit = 'kg';
    Object.assign(slot, { increment: 10 / POUNDS_PER_KG, availableLoads: oldMetricBar.availableLoads!.map(n => n / POUNDS_PER_KG), load: 90 });
    const native = migratePracticalEquipment(data).plan.days[0]!.exercises[0]!;
    expect(native).toMatchObject({ equipmentPreset: 'auto', increment: 5, load: 90 });
    expect(native.availableLoads!.slice(0, 3)).toEqual([20, 25, 30]);

    data.settings.unit = 'lb';
    Object.assign(slot, { ...barbellEquipment('lb', 2.5), equipmentPreset: undefined, load: 200 });
    expect(migratePracticalEquipment(data).plan.days[0]!.exercises[0]).toMatchObject({ equipmentPreset: 'barbell-2.5', increment: 5, load: 200 });
    Object.assign(slot, { increment: .125, availableLoads: [199.875, 200, 200.125], equipmentPreset: undefined });
    const custom = migratePracticalEquipment(data).plan.days[0]!.exercises[0]!;
    expect(custom).toMatchObject({ equipmentPreset: 'custom', increment: .125, availableLoads: [199.875, 200, 200.125], load: 200 });
  });

  it('preserves older explicitly selected five-pound barbell and dumbbell steps without an inventory', () => {
    for (const equipment of ['barbell', 'dumbbell']) for (const unit of ['lb', 'kg'] as const) {
      const data = legacyAccount(), slot = data.plan.days[0]!.exercises[0]!;
      slot.exerciseId = data.exercises.find(exercise => new RegExp(equipment, 'i').test(exercise.equipment))!.id;
      data.settings.unit = unit;
      const increment = unit === 'lb' ? 5 : 2.267962;
      const load = unit === 'lb' ? 200 : 90.71848;
      Object.assign(slot, { increment, load, availableLoads: undefined, equipmentPreset: undefined });
      const migrated = migratePracticalEquipment(data).plan.days[0]!.exercises[0]!;
      expect(migrated).toMatchObject({ equipmentPreset: 'custom', increment, load });
      expect(migrated.availableLoads).toBeUndefined();
      expect(migratePracticalEquipment(migratePracticalEquipment(data))).toEqual(migratePracticalEquipment(data));
    }
  });

  it('rebuilds automatic presets in native units and physically converts custom values with precision', () => {
    const data = createInitialData(), automatic = data.plan.days[0]!.exercises[0]!;
    automatic.load = 92;
    const pounds = convertPlanLoads(data.plan, POUNDS_PER_KG, 'lb', data.exercises);
    expect(pounds.days[0]!.exercises[0]).toMatchObject({ increment: 10, load: 195, equipmentPreset: 'auto' });
    expect(pounds.days[0]!.exercises[0]!.availableLoads!.slice(0, 3)).toEqual([45, 55, 65]);
    expect(convertPlanLoads(pounds, 1 / POUNDS_PER_KG, 'kg', data.exercises).days[0]!.exercises[0]).toMatchObject({ increment: 5, equipmentPreset: 'auto' });

    Object.assign(automatic, { equipmentPreset: 'custom', increment: .125, availableLoads: [10.125, 10.25], load: 10.125 });
    const custom = convertPlanLoads(data.plan, POUNDS_PER_KG, 'lb', data.exercises);
    expect(custom.days[0]!.exercises[0]!.increment).toBeCloseTo(.125 * POUNDS_PER_KG, 7);
    expect(custom.days[0]!.exercises[0]!.availableLoads![0]).toBeCloseTo(10.125 * POUNDS_PER_KG, 7);
    const roundTrip = convertPlanLoads(custom, 1 / POUNDS_PER_KG, 'kg', data.exercises).days[0]!.exercises[0]!;
    expect(roundTrip).toMatchObject({ equipmentPreset: 'custom', increment: .125, load: 10.125 });
    expect(roundTrip.availableLoads).toEqual([10.125, 10.25]);
  });

  it('preserves body mass and legacy effective load precision while updating only empty full-body future gear', () => {
    const data = legacyAccount(), slot = data.plan.days[0]!.exercises[0]!;
    const profiles: BodyweightResistance[] = [
      { tracking: 'full-body', resistance: 192.51431372, bodyMassKg: 87.321, addedLoads: [], assistanceLoads: [] },
      { tracking: 'measured', resistance: 131.23456789, bodyMassKg: 87.321, fraction: .68168, addedLoads: [4.321], assistanceLoads: [8.765] },
      { resistance: 131.23456789, addedLoads: [4.321], assistanceLoads: [8.765] },
    ];
    for (const profile of profiles) {
      Object.assign(slot, { loadMode: 'bodyweight', load: 0, bodyweight: profile, equipmentPreset: undefined });
      const next = migratePracticalEquipment(data).plan.days[0]!.exercises[0]!;
      expect(next.bodyweight).toBe(profile);
      expect(next.bodyweight).toEqual(profile);
      expect(next.increment).toBe(profile.tracking === 'full-body' ? 5 : 1.1023);
      expect(next.equipmentPreset).toBe(profile.tracking === 'full-body' ? 'auto' : 'custom');
    }
  });

  it('keeps standard default prescriptions on the physical grid for every catalog exercise', () => {
    const data = createInitialData();
    for (const unit of ['lb', 'kg'] as const) {
      for (const exercise of availableExercises(data.exercises)) {
        const equipment = standardEquipment(exercise, unit);
        expect(equipment.increment, exercise.name).toBeGreaterThanOrEqual(unit === 'lb' ? 5 : 2.5);
        for (const load of equipment.availableLoads ?? []) expect(load * 2, exercise.name).toBe(Math.round(load * 2));
      }
    }
  });
});
