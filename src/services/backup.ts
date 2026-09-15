import { z } from 'zod';
import type { AppData, Exercise, Session } from '../domain/types';
import { exerciseSchema, MAX_BACKUP_BYTES, parseAppData, validateAppData } from '../domain/validation';

export function exportBackup(data: AppData): string { return JSON.stringify(validateAppData(data), null, 2); }
export function parseBackup(text: string): AppData { return parseAppData(text); }

/** Returns the combined catalog. Nothing is silently replaced on an ID/name collision. */
export function importExerciseCatalog(text: string, existing: Exercise[]): Exercise[] {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('Catalog exceeds the 50 MB import limit.');
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new Error('Exercise catalog is not valid JSON.'); }
  const schema = z.strictObject({ schemaVersion: z.literal(1), exercises: z.array(exerciseSchema).min(1).max(20_000) });
  const result = schema.safeParse(input);
  if (!result.success) { const issue = result.error.issues[0]; throw new Error(`Invalid catalog at ${issue.path.join('.')}: ${issue.message}`); }
  const ids = new Set(existing.map(e => e.id));
  const normalized = (e: Exercise) => `${e.name.trim().toLocaleLowerCase()}\0${e.equipment.trim().toLocaleLowerCase()}`;
  const names = new Set(existing.map(normalized));
  for (const exercise of result.data.exercises) {
    if (ids.has(exercise.id) || names.has(normalized(exercise))) throw new Error(`Duplicate exercise: ${exercise.name} (${exercise.id}). Existing entries are preserved.`);
    ids.add(exercise.id); names.add(normalized(exercise));
  }
  if (existing.length + result.data.exercises.length > 20_000) throw new Error('The combined catalog exceeds 20,000 exercises.');
  return [...existing, ...result.data.exercises];
}

type Cell = string | number | boolean | undefined;
function csvCell(value: Cell): string {
  if (value === undefined) return '""';
  let s = String(value);
  if (typeof value === 'string') {
    const unsafe = /^\s*[=+\-@]/u.test(s) || /[\x00-\x1f\x7f]/.test(s);
    s = s.replace(/[\x00-\x1f\x7f]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
    if (unsafe) s = `'${s}`;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

/** A single all-time CSV with typed rows; record_json preserves complete snapshots. */
export function exportCsv(input: AppData): string {
  const data = validateAppData(input);
  const columns = ['record_type','record_id','profile_id','schema_version','date','started_at','completed_at','week','pivot','session_id','session_notes','plan_id','plan_name','day_id','day_name','day_kind','slot_id','exercise_id','exercise_name','equipment','source','beyond_failure_allowed','load','unit','load_mode','increment','prescribed_sets','rep_min','rep_max','target_rir','set_index','reps','actual_rir','set_completed','exercise_notes','muscle','coefficient','target_volume','recommendation_action','recommended_load','recommended_reps','recommendation_reason','anchor_index','poor_sleep','run_down','elevated_hr','lingering_soreness','performance_dip','joint_pain','notes','updated_at','record_json'] as const;
  type Row = Partial<Record<typeof columns[number], Cell>>;
  const rows: string[] = [columns.map(csvCell).join(',')];
  const add = (row: Row, record: unknown) => rows.push(columns.map(c => csvCell({ profile_id: data.id, schema_version: data.schemaVersion, ...row, record_json: JSON.stringify(record) }[c])).join(','));
  add({ record_type: 'settings', record_id: data.id, unit: data.settings.unit, updated_at: data.updatedAt }, data.settings);
  add({ record_type: 'plan', record_id: data.plan.id, plan_id: data.plan.id, plan_name: data.plan.name, updated_at: data.plan.updatedAt }, data.plan);
  for (const [muscle, target] of Object.entries(data.plan.targets)) add({ record_type: 'target', plan_id: data.plan.id, muscle, target_volume: target }, { muscle, target });
  for (const day of data.plan.days) {
    const context = { plan_id: data.plan.id, plan_name: data.plan.name, day_id: day.id, day_name: day.name, day_kind: day.kind };
    add({ record_type: 'plan_day', record_id: day.id, ...context }, day);
    for (const slot of day.exercises) add({ record_type: 'plan_exercise', record_id: slot.id, ...context, slot_id: slot.id, exercise_id: slot.exerciseId, exercise_name: data.exercises.find(e => e.id === slot.exerciseId)?.name, prescribed_sets: slot.sets, rep_min: slot.repMin, rep_max: slot.repMax, target_rir: JSON.stringify(slot.rir), load: slot.load, unit: data.settings.unit, load_mode: slot.loadMode, increment: slot.increment }, slot);
  }
  for (const exercise of data.exercises) {
    const context = { exercise_id: exercise.id, exercise_name: exercise.name, equipment: exercise.equipment, source: exercise.source, beyond_failure_allowed: exercise.beyondFailureAllowed };
    add({ record_type: 'catalog_exercise', record_id: exercise.id, ...context }, exercise);
    for (const c of exercise.contributions) add({ record_type: 'catalog_contribution', ...context, muscle: c.muscle, coefficient: c.coefficient }, c);
  }
  const sessionRows = (session: Session, active = false) => {
    const context = { session_id: session.id, date: session.date, started_at: session.startedAt, completed_at: session.completedAt, week: session.week, pivot: session.pivot, day_id: session.dayId, day_name: session.dayName, session_notes: session.notes };
    add({ record_type: active ? 'active_session' : 'session', record_id: session.id, ...context }, session);
    for (const e of session.exercises) {
      const rec = e.recommendation;
      const exerciseContext = { ...context, slot_id: e.slotId, exercise_id: e.exerciseId, exercise_name: e.name, load: e.load, unit: e.unit, load_mode: e.loadMode, increment: e.increment, rep_min: e.repMin, rep_max: e.repMax, target_rir: JSON.stringify(e.targetRir), exercise_notes: e.notes, recommendation_action: rec?.action, recommended_load: rec?.nextLoad, recommended_reps: rec?.targetReps, recommendation_reason: rec?.reason, anchor_index: rec?.anchorIndex };
      add({ record_type: active ? 'active_exercise' : 'session_exercise', ...exerciseContext }, e);
      for (const c of e.contributions) add({ record_type: 'session_contribution', ...exerciseContext, muscle: c.muscle, coefficient: c.coefficient }, c);
      for (const set of e.sets) add({ record_type: active ? 'active_set' : 'set', ...exerciseContext, set_index: set.index, reps: set.reps, actual_rir: set.rir, set_completed: set.completed }, set);
    }
  };
  data.sessions.forEach(s => sessionRows(s));
  if (data.activeSession) sessionRows(data.activeSession, true);
  for (const c of data.checkIns) add({ record_type: 'recovery', record_id: c.id, date: c.date, week: c.week, poor_sleep: c.poorSleep, run_down: c.runDown, elevated_hr: c.elevatedHr, lingering_soreness: c.lingeringSoreness, performance_dip: c.performanceDip, joint_pain: c.jointPain, notes: c.notes }, c);
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}
