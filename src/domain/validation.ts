import { z } from 'zod';
import type { AppData } from './types';

export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const text = z.string().max(10_000);
const label = z.string().min(1).max(300);
export const idSchema = z.string().min(1).max(200).regex(/^[^\x00-\x1f\x7f]+$/).refine(s => !['__proto__', 'prototype', 'constructor'].includes(s), 'Reserved identifier');
const count = z.number().int().min(0).max(10_000);
const load = z.number().min(0).max(1_000_000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(`${s}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s; }, 'Invalid calendar date');
const timestamp = z.iso.datetime({ offset: true });
const rir = z.union([z.number().min(-10).max(100), z.literal('0-1'), z.literal('<0')]);
const unit = z.enum(['kg', 'lb']);
const loadMode = z.enum(['external', 'assistance', 'bodyweight']);
export const contributionSchema = z.strictObject({ muscle: idSchema, coefficient: z.union([z.literal(0.25), z.literal(0.5), z.literal(1)]) });
const contributions = z.array(contributionSchema).min(1).max(100).refine(a => new Set(a.map(c => c.muscle)).size === a.length, 'Duplicate muscle contribution');
export const exerciseSchema = z.strictObject({ id: idSchema, name: label, equipment: label, contributions, source: label, beyondFailureAllowed: z.boolean() });
const planExerciseSchema = z.strictObject({ id: idSchema, exerciseId: idSchema, sets: z.number().int().min(1).max(100), repMin: count.min(1).max(100), repMax: count.min(1).max(100), rir: z.array(rir).min(1).max(100), load, increment: z.number().positive().max(1_000_000), loadMode }).refine(x => x.repMin <= x.repMax, 'Minimum reps exceeds maximum reps').refine(x => x.rir.length === x.sets, 'RIR targets must match the set count');
const daySchema = z.strictObject({ id: idSchema, name: label, kind: z.enum(['training', 'rest']), exercises: z.array(planExerciseSchema).max(100) });
export const planSchema = z.strictObject({ id: idSchema, name: label, days: z.array(daySchema).min(1).max(366), targets: z.record(idSchema, z.number().min(0).max(1000)).refine(v => Object.keys(v).length <= 1000, 'Too many targets'), updatedAt: timestamp });
export const settingsSchema = z.strictObject({ name: text, strict: z.boolean(), unit, startDate: date, increasePercent: z.number().min(2).max(5), decreasePercent: z.number().min(2).max(3), restSeconds: z.number().int().min(0).max(86400) });
const recommendationSchema = z.strictObject({ action: z.enum(['increase', 'decrease', 'hold']), nextLoad: load, targetReps: count, reason: text, anchorIndex: z.number().int().min(-1).max(1000) });
const setSchema = z.strictObject({ index: z.number().int().min(0).max(1000), reps: count, rir: z.number().min(-10).max(100), completed: z.boolean() });
const logSchema = z.strictObject({ slotId: idSchema, exerciseId: idSchema, name: label, load, unit, loadMode, increment: z.number().positive().max(1_000_000).optional(), repMin: count, repMax: count, targetRir: z.array(rir).max(1000), contributions, sets: z.array(setSchema).max(1000), notes: text, recommendation: recommendationSchema.optional() }).refine(x => x.repMin <= x.repMax, 'Minimum reps exceeds maximum reps').refine(x => new Set(x.sets.map(s => s.index)).size === x.sets.length, 'Duplicate set index').refine(x => x.sets.length === x.targetRir.length && x.sets.every((s,i) => s.index === i), 'Set rows must match the prescribed targets').refine(x => x.sets.every(s => !s.completed || s.reps > 0), 'Completed sets need positive reps');
export const sessionSchema = z.strictObject({ id: idSchema, dayId: idSchema, dayName: label, date, startedAt: timestamp, completedAt: timestamp.optional(), week: z.number().int().min(1).max(100_000), pivot: z.boolean(), exercises: z.array(logSchema).max(100), notes: text }).refine(x => new Set(x.exercises.map(e => e.slotId)).size === x.exercises.length, 'Duplicate exercise slot');
export const checkInSchema = z.strictObject({ id: idSchema, date, week: z.number().int().min(1).max(100_000), poorSleep: z.boolean(), runDown: z.boolean(), elevatedHr: z.boolean(), lingeringSoreness: z.boolean(), performanceDip: z.boolean(), jointPain: z.boolean(), notes: text });
export const appDataSchema = z.strictObject({ schemaVersion: z.literal(1), id: idSchema, updatedAt: timestamp, settings: settingsSchema, plan: planSchema, exercises: z.array(exerciseSchema).min(1).max(20_000), sessions: z.array(sessionSchema).max(100_000), checkIns: z.array(checkInSchema).max(100_000), activeSession: sessionSchema.optional() }).superRefine((d, ctx) => {
  const unique = (values: string[], path: string) => { if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', path: [path], message: `Duplicate IDs in ${path}` }); };
  unique(d.exercises.map(e => e.id), 'exercises');
  unique(d.plan.days.map(day => day.id), 'plan.days');
  unique(d.plan.days.flatMap(day => day.exercises.map(e => e.id)), 'plan.exercises');
  unique(d.sessions.map(s => s.id), 'sessions');
  unique(d.checkIns.map(c => c.id), 'checkIns');
  const catalog = new Set(d.exercises.map(e => e.id));
  for (const day of d.plan.days) for (const e of day.exercises) if (!catalog.has(e.exerciseId)) ctx.addIssue({ code: 'custom', path: ['plan'], message: `Unknown exercise: ${e.exerciseId}` });
  if (d.activeSession && d.sessions.some(s => s.id === d.activeSession!.id)) ctx.addIssue({ code: 'custom', path: ['activeSession'], message: 'Active session is already in history' });
});

export function validateAppData(input: unknown): AppData {
  const result = appDataSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Invalid PANDR-5 data at ${issue.path.join('.') || 'root'}: ${issue.message}`);
  }
  return result.data;
}

export function parseAppData(json: string): AppData {
  if (new TextEncoder().encode(json).byteLength > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 50 MB import limit.');
  let input: unknown;
  try { input = JSON.parse(json); } catch { throw new Error('Backup is not valid JSON.'); }
  // Version dispatch is explicit: future migrations belong here, before validation.
  if (!input || typeof input !== 'object' || !('schemaVersion' in input) || input.schemaVersion !== 1) throw new Error('Unsupported backup version. Expected schemaVersion 1.');
  return validateAppData(input);
}
