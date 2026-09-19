import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BUILTIN_EXERCISES, availableExercises, catalogForPlan, exerciseResearch, matchesExercise, exerciseOrigin, CATALOG_SOURCES } from './catalog';
import { createInitialData, DEFAULT_EXERCISES, DEFAULT_PLAN, MUSCLES, SOURCE_MUSCLES } from './seed';
import { calculateVolume, createSession } from '../domain/engine';
import { validateAppData } from '../domain/validation';
import { exportBackup, exportCsv, importExerciseCatalog, parseBackup } from '../services/backup';
import { loadData, saveData } from '../services/storage';
import oldCatalog from '../../tests/fixtures/legacy-catalog.json';
import oldMuscles from '../../tests/fixtures/legacy-muscles.json';
import oldPlan from '../../tests/fixtures/legacy-plan.json';

const ids = new Set(MUSCLES.map(m => m.id));
const normalization = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

describe('research catalog integrity', () => {
  it('loads every canonical exercise through the unchanged version-1 importer', () => {
    expect(BUILTIN_EXERCISES.length).toBeGreaterThan(350);
    expect(importExerciseCatalog(JSON.stringify({ schemaVersion: 1, exercises: BUILTIN_EXERCISES }), [])).toEqual(BUILTIN_EXERCISES);
  });
  it('retains every legacy field, ID, muscle name and source plan', () => {
    expect(DEFAULT_EXERCISES).toEqual(oldCatalog.exercises);
    expect(SOURCE_MUSCLES).toEqual(oldMuscles);
    expect(DEFAULT_PLAN).toEqual(oldPlan);
    expect(BUILTIN_EXERCISES.filter(e => e.id.startsWith('source-'))).toEqual(oldCatalog.exercises);
    for (const row of calculateVolume(DEFAULT_PLAN, BUILTIN_EXERCISES)) {
      if (oldMuscles.some(m => m.id === row.muscle)) expect(row).toEqual(calculateVolume(DEFAULT_PLAN, DEFAULT_EXERCISES).find(r => r.muscle === row.muscle));
      else expect(row.total).toBe(0);
    }
    expect(Object.keys(DEFAULT_PLAN.targets).some(m => !oldMuscles.some(old => old.id === m))).toBe(false);
  });
  it('has unique canonical names and aliases with known muscles, sources and bounded credits', () => {
    const names = new Map<string, string>();
    const uniqueIds = new Set<string>();
    for (const e of BUILTIN_EXERCISES) {
      expect(uniqueIds.has(e.id), e.id).toBe(false); uniqueIds.add(e.id);
      const r = exerciseResearch(e)!;
      expect(r, e.id).toBeDefined();
      for (const field of ['category','setup','rationale','limitations','confidence'] as const) expect(r[field].length).toBeGreaterThan(0);
      expect(ids.has(r.primaryMuscle)).toBe(true);
      expect(e.contributions.some(c => c.muscle === r.primaryMuscle)).toBe(true);
      if (!e.id.startsWith('source-')) {
        expect(e.contributions.some(c => c.coefficient === 1), e.id).toBe(true);
        expect(e.contributions.length, e.id).toBeLessThanOrEqual(4);
        expect(e.contributions.reduce((sum,c)=>sum+c.coefficient,0),e.id).toBeLessThanOrEqual(2.5);
        expect(e.beyondFailureAllowed).toBe(false);
      }
      for (const c of e.contributions) {
        expect(ids.has(c.muscle), `${e.id}: ${c.muscle}`).toBe(true);
        expect([.25,.5,1]).toContain(c.coefficient);
      }
      expect(r.sourceIds.length).toBeGreaterThan(0);
      for (const id of r.sourceIds) expect(CATALOG_SOURCES.some(s => s.id === id && s.title && s.authors && s.year && new URL(s.url).protocol === 'https:'), `${e.id}: ${id}`).toBe(true);
      for (const name of [e.name,...r.aliases]) {
        const key=normalization(name);
        expect(names.get(key) ?? e.id, name).toBe(e.id); names.set(key,e.id);
      }
    }
    for (const muscle of MUSCLES) expect(BUILTIN_EXERCISES.some(e=>e.contributions.some(c=>c.muscle===muscle.id&&c.coefficient===1)), muscle.name).toBe(true);
  });
  it('finds canonical names and every alias, including punctuation-normalized queries', () => {
    for (const e of BUILTIN_EXERCISES) for (const query of [e.name, ...exerciseResearch(e)!.aliases]) expect(matchesExercise(e,query), query).toBe(true);
    expect(BUILTIN_EXERCISES.filter(e=>matchesExercise(e,'Bayesian'))).toHaveLength(1);
    expect(BUILTIN_EXERCISES.find(e=>matchesExercise(e,'Russian kettlebell swing'))?.id).toBe('p5-two-hand-kettlebell-swing');
    expect(matchesExercise(DEFAULT_EXERCISES[0], 'not an exercise')).toBe(false);
  });
});

describe('catalog integration and portable saved plans', () => {
  it('offers the expansion without mutating an old account or history', () => {
    const d=createInitialData(); const before=structuredClone(d);
    expect(availableExercises(d.exercises)).toHaveLength(BUILTIN_EXERCISES.length);
    expect(catalogForPlan(d.exercises,d.plan)).toEqual(d.exercises);
    expect(d).toEqual(before);
  });
  it('selects new exercises, computes exact FSA and restores plan/session snapshots after local saving and export', async () => {
    const d=createInitialData();
    d.plan.days[0].exercises=[{...d.plan.days[0].exercises[0],exerciseId:'p5-barbell-incline-bench-press',sets:4,rir:[3,2,1,'0-1']}];
    d.plan.days.slice(1).forEach(day=>day.exercises=[]);
    d.exercises=catalogForPlan(d.exercises,d.plan);
    expect(d.exercises).toHaveLength(27);
    const rows=calculateVolume(d.plan,d.exercises);
    expect(rows.find(r=>r.muscle==='chest')).toMatchObject({direct:4,fractional:0,total:4});
    expect(rows.find(r=>r.muscle==='anterior-delts')?.total).toBe(2);
    expect(rows.find(r=>r.muscle==='triceps')?.total).toBe(1);
    d.sessions=[createSession(d.plan.days[0],d.exercises,d.settings,1,false)];
    const profile=crypto.randomUUID(); await saveData(profile,d);
    expect(await loadData(profile)).toEqual(d);
    expect(parseBackup(exportBackup(d))).toEqual(d);
    expect(exportCsv(d)).toContain('p5-barbell-incline-bench-press');
    expect(validateAppData(d)).toEqual(d);
    expect(d.sessions[0].exercises[0].contributions).toEqual(d.exercises.at(-1)!.contributions);
    expect(catalogForPlan(d.exercises,d.plan)).toEqual(d.exercises);
  });
  it('round-trips each approved muscle addition with an explicitly selected target', () => {
    for (const muscle of MUSCLES.slice(19)) {
      const d=createInitialData(); const e=BUILTIN_EXERCISES.find(e=>e.contributions.some(c=>c.muscle===muscle.id))!;
      d.plan.days[0].exercises=[{...d.plan.days[0].exercises[0],exerciseId:e.id}];
      d.plan.targets[muscle.id]=12; d.exercises=catalogForPlan(d.exercises,d.plan);
      expect(parseBackup(exportBackup(d))).toEqual(d);
      expect(calculateVolume(d.plan,d.exercises).find(r=>r.muscle===muscle.id)?.total).toBe(4);
    }
  });
});

describe('custom import compatibility and precedence', () => {
  it('preserves previously valid custom values even when a new built-in shares its ID or name', () => {
    const d=createInitialData();const canonical=BUILTIN_EXERCISES.find(e=>e.id==='p5-barbell-incline-bench-press')!;
    const custom={...canonical,source:'My coach',contributions:[{muscle:'chest',coefficient:.5}],beyondFailureAllowed:true};
    d.exercises=importExerciseCatalog(JSON.stringify({schemaVersion:1,exercises:[custom]}),d.exercises);
    expect(availableExercises(d.exercises).filter(e=>e.id===custom.id)).toEqual([custom]);
    expect(exerciseResearch(custom)).toBeUndefined();
    expect(exerciseResearch({...canonical,contributions:custom.contributions})).toBeUndefined();
    expect(exerciseOrigin(custom)).toBe('Custom / imported');
    expect(parseBackup(exportBackup(d))).toEqual(d);
    const named={...custom,id:'owner-other-id'};
    const combined=availableExercises(importExerciseCatalog(JSON.stringify({schemaVersion:1,exercises:[named]}),DEFAULT_EXERCISES));
    expect(combined.filter(e=>e.name===named.name&&e.equipment===named.equipment)).toEqual([named]);
  });
  it('still accepts the exact original strict format and owner-defined muscles', () => {
    const d=createInitialData();const custom={id:'owner-new',name:'My custom movement',equipment:'My equipment',contributions:[{muscle:'owner-muscle',coefficient:.25}],source:'My assessment',beyondFailureAllowed:false};
    const text=JSON.stringify({schemaVersion:1,exercises:[custom]});
    expect(importExerciseCatalog(text,d.exercises).at(-1)).toEqual(custom);
    expect(exerciseResearch(custom)).toBeUndefined();
    expect(()=>importExerciseCatalog(text,[...d.exercises,custom])).toThrow('Duplicate');
    for(const patch of [{confidence:'high'},{contributions:[{muscle:'chest',coefficient:.63}]},{contributions:[{muscle:'chest',coefficient:1},{muscle:'chest',coefficient:.5}]}]) expect(()=>importExerciseCatalog(JSON.stringify({schemaVersion:1,exercises:[{...custom,...patch}]}),d.exercises)).toThrow('Invalid catalog');
    expect(d.exercises).toEqual(DEFAULT_EXERCISES);
  });
});
