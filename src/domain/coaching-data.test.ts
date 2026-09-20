import { expect, it } from 'vitest';
import { createInitialData } from '../data/seed';
import { createSession } from './engine';
import { exportBackup, parseBackup } from '../services/backup';
import { validateAppData } from './validation';

it('preserves confirmed equipment and calibrated bodyweight in plans and historical backups', () => {
  const data = createInitialData();
  data.plan.days[0].exercises[0].availableLoads = [10, 10.25, 12.5];
  const slot = data.plan.days[0].exercises[1];
  slot.load = 0; slot.loadMode = 'bodyweight';
  slot.bodyweight = { resistance: 80, addedLoads: [2, 4], assistanceLoads: [2, 4] };
  const session = createSession(data.plan.days[0], data.exercises, data.settings, 1, false);
  data.sessions = [session];
  expect(parseBackup(exportBackup(data))).toEqual(data);
  slot.bodyweight.resistance = 90;
  expect(session.exercises[1].bodyweight?.resistance).toBe(80);
});

it('rejects impossible assistance and malformed load lists', () => {
  const data = createInitialData();
  const slot = data.plan.days[0].exercises[0];
  slot.bodyweight = { resistance: 80, addedLoads: [2.5], assistanceLoads: [80] };
  expect(() => validateAppData(data)).toThrow();
  delete slot.bodyweight;
  slot.availableLoads = [10, -1];
  expect(() => validateAppData(data)).toThrow();
});
