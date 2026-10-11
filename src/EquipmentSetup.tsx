import { useEffect, useRef, useState } from 'react';
import type { BodyweightResistance, EquipmentPreset, Exercise, PlanExercise, Settings } from './domain/types';
import { Button, Field, Notice } from './components';
import { equipmentForPreset, equipmentLoadConvention, equipmentSummary } from './domain/equipment';
import { formatEstimate, formatWeightList } from './domain/weight-format';
import { LoadInput } from './LoadInput';

const poundsPerKg = 2.2046226218;
const loads = (text: string) => [...new Set(text.split(',').filter(value => value.trim() !== '').map(value => Number(value.trim())).filter(value => value !== 0))];
const invalidLoads = (text: string) => text.split(',').some(value => value.trim() !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0));
type MovementKind = 'full-body' | 'partial-body';

export function EquipmentSetup({ slot, unit, onChange, exercise, bodyMass, movementKind }: {
 slot: PlanExercise;
 unit: Settings['unit'];
 onChange: (slot: PlanExercise) => void;
 exerciseName?: string;
 exercise?: Exercise;
 bodyMass?: Settings['bodyMass'];
 movementKind?: MovementKind;
}) {
 const [available, setAvailable] = useState(formatWeightList(slot.availableLoads));
 const [added, setAdded] = useState(formatWeightList(slot.bodyweight?.addedLoads));
 const [assistance, setAssistance] = useState(formatWeightList(slot.bodyweight?.assistanceLoads));
 const [expanded, setExpanded] = useState(false);
 const previous = useRef({ id: slot.id, unit, available: formatWeightList(slot.availableLoads), added: formatWeightList(slot.bodyweight?.addedLoads), assistance: formatWeightList(slot.bodyweight?.assistanceLoads) });
 const availableValue = formatWeightList(slot.availableLoads);
 const addedValue = formatWeightList(slot.bodyweight?.addedLoads);
 const assistanceValue = formatWeightList(slot.bodyweight?.assistanceLoads);
 useEffect(() => {
  const before = previous.current;
  const changedExercise = before.id !== slot.id || before.unit !== unit;
  // Account updates can refresh untouched fields without replacing an in-progress comma list.
  if (changedExercise || available === before.available) setAvailable(availableValue);
  if (changedExercise || added === before.added) setAdded(addedValue);
  if (changedExercise || assistance === before.assistance) setAssistance(assistanceValue);
  if (changedExercise) setExpanded(false);
  previous.current = { id: slot.id, unit, available: availableValue, added: addedValue, assistance: assistanceValue };
 }, [slot.id, unit, availableValue, addedValue, assistanceValue]);

 const bodyweight = slot.bodyweight;
 const kind = movementKind;
 const convention = exercise ? equipmentLoadConvention(exercise) : undefined;
 const tracking = bodyweight?.tracking ?? 'measured';
 const currentMass = bodyMass ? bodyMass.kg * (unit === 'lb' ? poundsPerKg : 1) : undefined;

 function chooseTracking(next: 'full-body' | 'reps-only') {
  // A new setup must not reinterpret historical measured loads as carried weight.
  const selected = next === 'full-body' && !currentMass ? 'reps-only' : next;
  const base: BodyweightResistance = { resistance: selected === 'full-body' ? currentMass! : 0, addedLoads: [], assistanceLoads: [], tracking: selected, ...(bodyMass ? { bodyMassKg: bodyMass.kg } : {}) };
  setAdded(''); setAssistance('');
  onChange({ ...slot, availableLoads: undefined, bodyweight: base, load: 0, loadMode: 'bodyweight' });
 }

 return <>{!bodyweight && !kind && <p className="muted equipment-summary">{equipmentSummary(slot, unit)}</p>}<details className="equipment-setup" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
  <summary>Equipment options</summary>
  {!bodyweight && !kind && <>
   <Field label="Equipment preset"><select value={slot.equipmentPreset ?? 'auto'} onChange={event => {
    const value = event.target.value as EquipmentPreset;
    if (value === 'custom') { setAvailable(''); onChange({ ...slot, equipmentPreset: 'custom', availableLoads: undefined }); return; }
    if (!exercise) return;
    const setup = equipmentForPreset(exercise, unit, value);
    setAvailable(formatWeightList(setup.availableLoads)); onChange({ ...slot, ...setup });
   }}><option value="auto">Use default equipment</option><option value="barbell-standard">{unit === 'lb' ? '45 lb bar · standard plates' : '20 kg bar · standard plates'}</option><option value="dumbbell-rack">Dumbbell rack</option><option value="five-pound">{unit === 'lb' ? '5 lb steps' : '2.5 kg steps'}</option><option value="barbell-2.5">{unit === 'lb' ? '45 lb bar · includes 2.5 lb plates' : '20 kg bar · includes 1.25 kg plates'}</option><option value="barbell-1">{unit === 'lb' ? '45 lb bar · includes 1 lb plates' : '20 kg bar · includes 0.5 kg plates'}</option><option value="custom">Custom equipment</option></select></Field>
   <details><summary>Preset details</summary><p className="muted">Barbell presets include the bar and plates on both sides. Dumbbells are recorded per hand. Edit the available weights to match your equipment.</p></details>
   <Field label={`Weight increment (${unit})`} hint={convention === 'per-side' ? 'Smallest weight change on one side.' : convention === 'total' ? 'Smallest total weight change. Count plates on both sides.' : 'Smallest weight change available.'}><LoadInput min="0" step="any" value={slot.increment} preset={slot.equipmentPreset} observed onChange={increment => {
    const availableLoads = slot.equipmentPreset === 'custom' ? slot.availableLoads : undefined;
    if (!availableLoads) setAvailable('');
    onChange({ ...slot, increment, availableLoads, equipmentPreset: 'custom' });
   }}/></Field>
   {(!Number.isFinite(slot.increment) || slot.increment <= 0) && <Notice tone="error">Enter a positive weight increment.</Notice>}
  </>}
  {!kind && <label className="check-row"><span>Bodyweight exercise</span><input type="checkbox" checked={!!bodyweight} onChange={event => {
   if (event.target.checked) chooseTracking('reps-only');
   else onChange({ ...slot, bodyweight: undefined, loadMode: 'external', load: 0 });
  }}/></label>}
  {bodyweight ? <>
   {!kind && tracking !== 'measured' && <Field label="Exercise type"><select value={tracking} onChange={event => chooseTracking(event.target.value as 'full-body' | 'reps-only')}>
    <option value="reps-only">Push-up or supported movement</option>
    <option value="full-body">Pull-up, chin-up or dip</option>
   </select></Field>}
   {tracking === 'measured' ? <>
    <p>Using your saved setup. Your previous test is unchanged.</p>
    <details><summary>Use a different setup</summary><p className="muted">Start a new test if you change the exercise setup. Your old results stay in History.</p><Button type="button" small onClick={() => chooseTracking(kind === 'full-body' ? 'full-body' : 'reps-only')}>Use a new setup</Button></details>
   </> : tracking === 'full-body' ? <>
    <p className="muted">{currentMass ? `Uses your saved bodyweight: ${formatEstimate(currentMass)} ${unit}.` : 'Save your bodyweight above or in Settings.'}</p>
    <Field label={`Weights you can add (${unit})`} hint="Used to choose your next workout’s weight. Separate weights with commas."><input aria-invalid={invalidLoads(added) || undefined} placeholder={unit === 'lb' ? '5, 10, 25' : '2.5, 5, 10'} value={added} onChange={event => { setAdded(event.target.value); onChange({ ...slot, equipmentPreset: 'custom', bodyweight: { ...bodyweight, addedLoads: loads(event.target.value) } }); }}/></Field>
    <Field label={`Machine assistance options (${unit})`} hint="Available settings on your assistance machine."><input aria-invalid={invalidLoads(assistance) || undefined} placeholder="10, 20, 30" value={assistance} onChange={event => { setAssistance(event.target.value); onChange({ ...slot, equipmentPreset: 'custom', bodyweight: { ...bodyweight, assistanceLoads: loads(event.target.value) } }); }}/></Field>
    {(invalidLoads(added) || invalidLoads(assistance)) && <Notice tone="error">Enter positive weights separated by commas, or leave blank.</Notice>}
   </> : <p className="muted">{kind === 'full-body' && !currentMass ? 'Save your bodyweight above or in Settings to use it for this exercise.' : 'Reps and RIR are tracked for this setup.'}</p>}
  </> : !kind ? <>
   <label className="check-row"><span>List available weights</span><input type="checkbox" checked={slot.equipmentPreset === 'custom' && !!slot.availableLoads} onChange={event => onChange({ ...slot, equipmentPreset: 'custom', availableLoads: event.target.checked ? loads(available) : undefined })}/></label>
   {slot.equipmentPreset === 'custom' && slot.availableLoads && <Field label={`Available weights (${unit})`} hint="Separate weights with commas. This list takes the place of the increment above."><input aria-invalid={invalidLoads(available) || undefined} placeholder={unit === 'lb' ? '45, 55, 65, 75' : '20, 25, 30, 35'} value={available} onChange={event => { setAvailable(event.target.value); onChange({ ...slot, equipmentPreset: 'custom', availableLoads: loads(event.target.value) }); }}/></Field>}
   {invalidLoads(available) && slot.equipmentPreset === 'custom' && slot.availableLoads && <Notice tone="error">Enter positive weights separated by commas.</Notice>}
  </> : <p className="muted">This exercise uses your bodyweight automatically.</p>}
 </details></>;
}
