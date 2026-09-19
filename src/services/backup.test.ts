import { describe,it,expect } from 'vitest';
import { createInitialData } from '../data/seed';
import { createSession } from '../domain/engine';
import { exportBackup,parseBackup,exportCsv,importExerciseCatalog,restoreBackup } from './backup';
describe('portable backups',()=>{
 it('round trips full session snapshots and active training',()=>{const d=createInitialData();const s=createSession(d.plan.days[0],d.exercises,d.settings,1,false);s.exercises[0].sets[0].completed=true;s.exercises[0].sets[0].reps=7;d.sessions=[{...s,completedAt:new Date().toISOString()}];d.activeSession={...s,id:crypto.randomUUID()};expect(parseBackup(exportBackup(d))).toEqual(d)});
 it.each([NaN,Infinity,-1])('rejects invalid load %s',value=>{const d=createInitialData();d.plan.days[0].exercises[0].load=value;expect(()=>exportBackup(d)).toThrow('Invalid PANDR-5')});
 it('rejects newer versions and missing exercise references',()=>{const d=createInitialData();expect(()=>parseBackup(JSON.stringify({...d,schemaVersion:2}))).toThrow('Unsupported');d.plan.days[0].exercises[0].exerciseId='missing';expect(()=>parseBackup(JSON.stringify(d))).toThrow('Unknown exercise')});
 it('rejects duplicate session IDs',()=>{const d=createInitialData();const s=createSession(d.plan.days[0],d.exercises,d.settings,1,false);d.sessions=[s,s];expect(()=>exportBackup(d)).toThrow('Duplicate IDs')});
 it('includes all-time records and neutralizes spreadsheet formulas',()=>{const d=createInitialData();const s=createSession(d.plan.days[0],d.exercises,d.settings,1,false);s.notes='=HYPERLINK("https://example.com")';s.exercises[0].notes='\t+SUM(A1)\nhello';s.exercises[0].sets[0].completed=true;s.exercises[0].sets[0].reps=5;d.sessions=[s];const csv=exportCsv(d);expect(csv).toContain('"set"');expect(csv).toContain('"plan_exercise"');expect(csv).toContain('"catalog_contribution"');expect(csv).toContain(`"'=HYPERLINK`);expect(csv).toContain("'\\u0009+SUM(A1)\\u000ahello");expect(csv).toContain('"false"')});
 it('imports supplied exercise values and rejects duplicate/invalid credits',()=>{const d=createInitialData();const e={...d.exercises[0],id:'owner-test',name:'Owner supplied name'};const result=importExerciseCatalog(JSON.stringify({schemaVersion:1,exercises:[e]}),d.exercises);expect(result.at(-1)).toEqual(e);expect(()=>importExerciseCatalog(JSON.stringify({schemaVersion:1,exercises:[e,e]}),d.exercises)).toThrow('Duplicate');expect(()=>importExerciseCatalog(JSON.stringify({schemaVersion:1,exercises:[{...e,contributions:[{muscle:'chest',coefficient:2}]}]}),d.exercises)).toThrow('Invalid catalog')});
});

it('restores an old local backup into a cycled account without orphaning either history',async()=>{
 const {startCycle,activeCycle,recordCycleId}=await import('../domain/training');
 const original=createInitialData();original.settings.startDate='2026-01-01';original.sessions=[createSession(original.plan.days[0],original.exercises,original.settings,1,false)];
 const account=startCycle(original,'Return','2026-09-18',new Date('2026-09-18T12:00:00'));
 const backup=createInitialData();backup.settings.name='Imported';backup.sessions=[createSession(backup.plan.days[0],backup.exercises,backup.settings,1,false)];
 const restored=restoreBackup(account,backup);expect(restored.sessions).toHaveLength(2);expect(restored.cycles).toHaveLength(3);expect(restored.settings.name).toBe('Imported');expect(recordCycleId(restored,restored.sessions[0])).not.toBe(activeCycle(restored).id);expect(recordCycleId(restored,restored.sessions[1])).toBe(activeCycle(restored).id);expect(parseBackup(exportBackup(restored))).toEqual(restored);
});
