import { useEffect, useRef, useState } from 'react';
import type { BodyweightResistance, PlanExercise, Settings } from './domain/types';
import { Field, Notice } from './components';
import { barbellEquipment, defaultLoadIncrement, dumbbellEquipment } from './domain/equipment';

const poundsPerKg = 2.2046226218;
const loads = (text: string) => [...new Set(text.split(',').filter(value => value.trim() !== '').map(value => Number(value.trim())).filter(value => value !== 0))];
const invalidLoads = (text: string) => text.split(',').some(value => value.trim() !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0));
const display = (value: number) => Number(value.toFixed(2)).toLocaleString();
const initialTracking = (name = ''): NonNullable<BodyweightResistance['tracking']> => /\b(?:pull[\s-]?ups?|chin[\s-]?ups?|dips?)\b/i.test(name) ? 'full-body' : 'reps-only';

export function EquipmentSetup({ slot, unit, onChange, exerciseName, bodyMass }: {
 slot: PlanExercise;
 unit: Settings['unit'];
 onChange: (slot: PlanExercise) => void;
 exerciseName?: string;
 bodyMass?: Settings['bodyMass'];
}) {
 const [available, setAvailable] = useState(slot.availableLoads?.join(', ') ?? '');
 const [added, setAdded] = useState(slot.bodyweight?.addedLoads.join(', ') ?? '');
 const [assistance, setAssistance] = useState(slot.bodyweight?.assistanceLoads.join(', ') ?? '');
 const [preset, setPreset] = useState('keep');
 const [expanded, setExpanded] = useState(!!slot.bodyweight || !!slot.availableLoads);
 const [extrasExpanded, setExtrasExpanded] = useState(!!(slot.bodyweight?.addedLoads.length || slot.bodyweight?.assistanceLoads.length));
 const previous = useRef({ id: slot.id, unit, available: slot.availableLoads?.join(', ') ?? '', added: slot.bodyweight?.addedLoads.join(', ') ?? '', assistance: slot.bodyweight?.assistanceLoads.join(', ') ?? '' });
 const availableValue = slot.availableLoads?.join(', ') ?? '';
 const addedValue = slot.bodyweight?.addedLoads.join(', ') ?? '';
 const assistanceValue = slot.bodyweight?.assistanceLoads.join(', ') ?? '';
 useEffect(() => {
  const before = previous.current;
  const changedExercise = before.id !== slot.id || before.unit !== unit;
  // Account updates can refresh untouched fields without replacing an in-progress comma list.
  if (changedExercise || available === before.available) setAvailable(availableValue);
  if (changedExercise || added === before.added) setAdded(addedValue);
  if (changedExercise || assistance === before.assistance) setAssistance(assistanceValue);
  if (changedExercise) { setPreset('keep'); setExpanded(!!slot.bodyweight || !!slot.availableLoads); setExtrasExpanded(!!(slot.bodyweight?.addedLoads.length || slot.bodyweight?.assistanceLoads.length)); }
  previous.current = { id: slot.id, unit, available: availableValue, added: addedValue, assistance: assistanceValue };
 }, [slot.id, unit, availableValue, addedValue, assistanceValue]);

 const bodyweight = slot.bodyweight;
 const tracking = bodyweight?.tracking ?? 'measured';
 const currentMass = bodyMass ? bodyMass.kg * (unit === 'lb' ? poundsPerKg : 1) : undefined;
 const supported = tracking === 'full-body' ? currentMass ?? 0 : tracking === 'reps-only' ? 0 : bodyweight?.resistance ?? 0;
 const addedResistance = slot.loadMode === 'external' ? slot.load : 0;
 const helped = slot.loadMode === 'assistance' ? slot.load : 0;

 function chooseTracking(next: NonNullable<BodyweightResistance['tracking']>, keepMeasurement = false) {
  const base: BodyweightResistance = { resistance: 0, addedLoads: loads(added), assistanceLoads: loads(assistance), tracking: next };
  if (next === 'full-body') {
   base.resistance = currentMass ?? 0;
   base.bodyMassKg = bodyMass?.kg;
  } else if (next === 'measured' && keepMeasurement && bodyweight) {
   base.resistance = bodyweight.resistance;
   base.bodyMassKg = bodyMass?.kg;
   if (currentMass && base.resistance > 0) base.fraction = base.resistance / currentMass;
  } else if (next === 'reps-only') {
   base.addedLoads = []; base.assistanceLoads = [];
  }
  onChange({ ...slot, availableLoads: undefined, bodyweight: base, ...(next === 'reps-only' || !bodyweight ? { load: 0, loadMode: 'bodyweight' as const } : {}) });
 }

 return <details className="equipment-setup" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
  <summary>Equipment and bodyweight progression</summary>
  <p>{bodyweight ? 'Choose how to track this movement. Your current bodyweight is saved once for the whole app.' : 'Record the loads you actually have. The app keeps the 2–5% increase and 2–3% reduction limits; it cannot bridge a larger equipment gap automatically.'}</p>
  {!bodyweight && <>
   <Field label="Equipment preset"><select value={preset} onChange={event => {
    const value = event.target.value; setPreset(value); if (value === 'keep') return;
    const setup = value === 'dumbbell-rack' ? dumbbellEquipment(unit) : value === 'five-pound' ? { increment: defaultLoadIncrement(unit), availableLoads: undefined } : barbellEquipment(unit, value === 'barbell-2.5' ? 2.5 : value === 'barbell-1' ? 1 : 5);
    setAvailable(setup.availableLoads?.join(', ') ?? ''); onChange({ ...slot, ...setup });
   }}><option value="keep">Keep current equipment</option><option value="barbell-standard">45 lb bar · 5, 10, 25, 45 lb plates</option><option value="dumbbell-rack">Dumbbells · 2.5 lb steps through 50 lb, then 5 lb</option><option value="five-pound">5 lb load steps · machines, cables or racks</option><option value="barbell-2.5">45 lb bar · includes 2.5 lb plates</option><option value="barbell-1">45 lb bar · includes 1 lb plates</option></select></Field>
   <p className="muted">Barbell presets use total load on a 45 lb bar; equal 5 lb plates add 10 lb. The dumbbell rack preset records one dumbbell, with 2.5 lb steps from 5–50 lb and 5 lb steps above 50 through 200 lb. Edit the exact list to match your rack. Machines and cables default to 5 lb steps; use the actual stack increments or confirmed available loads for your setup.</p>
  </>}
  <label className="check-row"><span>Set up bodyweight resistance</span><input type="checkbox" checked={!!bodyweight} onChange={event => {
   if (event.target.checked) chooseTracking(initialTracking(exerciseName));
   else onChange({ ...slot, bodyweight: undefined, loadMode: 'external', load: 0 });
  }}/></label>
  {bodyweight ? <>
   <Field label="How much of your body moves?"><select value={tracking} onChange={event => chooseTracking(event.target.value as NonNullable<BodyweightResistance['tracking']>, tracking === 'measured')}>
    <option value="full-body">Whole body · pull-ups, chin-ups, dips</option>
    <option value="measured">Part of my body · measured push-ups or rows</option>
    <option value="reps-only">I haven't measured it · track reps and RIR</option>
   </select></Field>
   {tracking === 'full-body' ? <>
    <p><strong>Bodyweight used: {currentMass ? `${display(currentMass)} ${unit}` : 'not entered yet'}</strong><br/><small>Uses your current bodyweight automatically. Update it above or in Settings.</small></p>
    {!currentMass && <Notice>Enter and save your current bodyweight above or in Settings before saving a load-based assessment.</Notice>}
   </> : tracking === 'measured' ? <>
    <Field label={`Supported load at your hands (${unit})`} hint={bodyweight.fraction && bodyMass ? 'Unweighted baseline: measure without carried weight or assistance. After a bodyweight update, this is an estimate using your measured share; remeasure to update it.' : 'Measure without carried weight or assistance. Enter this unweighted hand support, not your whole bodyweight.'}>
     <input aria-label={bodyweight.tracking ? `Supported load at your hands (${unit})` : `Bodyweight resistance (${unit})`} type="number" min="0.01" step="any" value={bodyweight.resistance || ''} onChange={event => {
      const resistance = Number(event.target.value);
      onChange({ ...slot, bodyweight: { ...bodyweight, resistance, tracking: currentMass ? 'measured' : bodyweight.tracking, bodyMassKg: bodyMass?.kg, fraction: currentMass && resistance > 0 ? resistance / currentMass : undefined } });
     }}/>
    </Field>
    {bodyweight.fraction && bodyMass ? <p className="muted">About {display(bodyweight.fraction * 100)}% of your bodyweight in this setup; adjusts when your saved weight changes.</p> : <p className="muted">{currentMass ? 'Enter a new measurement to link it to your saved bodyweight.' : 'Save your bodyweight, then enter this measurement to link future weight updates. Until then, this is a fixed measured load.'}</p>}
    <details><summary>How to measure supported load</summary><p>For push-ups, place scales under both hands at the same height and add their readings together. Keep your feet, hand height and position the same as the exercise. For rows, measure the load supported through your hands in that setup. There is no universal bodyweight percentage.</p><p>Example: your hands support 140 lb without a vest and 146 lb with it. Enter 6 lb of added resistance, even if the vest is labeled 10 lb.</p><p>Changes to hand height, foot position or range of motion need a new measurement and assessment.</p></details>
   </> : <Notice>Record clean reps and RIR for the same setup. No load, estimated 1RM or percentage progression is calculated until you measure the moved load.</Notice>}
   {(!exerciseName || /push[\s-]?ups?/i.test(exerciseName)) && <p className="muted">Plates under your hands are a platform, neither added weight nor assistance. Record their height in Exact setup.</p>}
   {tracking !== 'reps-only' && <>
    <details open={extrasExpanded} onToggle={event => setExtrasExpanded(event.currentTarget.open)}><summary>Optional weights and measured assistance</summary>
    <Field label={tracking === 'measured' ? `Available added resistance at your hands (${unit})` : `Available added loads (${unit})`} hint={tracking === 'measured' ? 'Measure hand support with the carried weight, subtract unweighted hand support; enter that difference, not the vest or belt label weight. Positive amounts separated by commas; blank or 0 means none.' : 'Weight carried in a vest or belt. Positive total loads, separated by commas; blank or 0 means none.'}><input aria-label={tracking === 'measured' && bodyweight.tracking ? `Available added resistance at your hands (${unit})` : `Available added loads (${unit})`} aria-invalid={invalidLoads(added) || undefined} placeholder={unit === 'lb' ? '5, 10, 25' : '2.5, 5, 10'} value={added} onChange={event => { setAdded(event.target.value); onChange({ ...slot, bodyweight: { ...bodyweight, addedLoads: loads(event.target.value) } }); }}/></Field>
    <Field label={tracking === 'measured' ? `Available measured reduction at your hands (${unit})` : `Available measured assistance (${unit})`} hint={tracking === 'measured' ? 'Subtract assisted hand support from unweighted hand support; enter that measured reduction. Positive amounts separated by commas; blank or 0 means none.' : 'Machine counterweight or calibrated assistance. Positive amounts, separated by commas; blank or 0 means none.'}><input aria-label={tracking === 'measured' && bodyweight.tracking ? `Available measured reduction at your hands (${unit})` : `Available measured assistance (${unit})`} aria-invalid={invalidLoads(assistance) || undefined} placeholder="10, 20, 30" value={assistance} onChange={event => { setAssistance(event.target.value); onChange({ ...slot, bodyweight: { ...bodyweight, assistanceLoads: loads(event.target.value) } }); }}/></Field>
    <p className="muted">A band color or label does not measure assistance. Use a calibrated amount for this setup and range of motion.</p>
    {(invalidLoads(added) || invalidLoads(assistance)) && <Notice tone="error">Enter positive weight amounts separated by commas. Use blank or 0 when you have none.</Notice>}
    </details>
    <p><strong>Moved load:</strong> {display(supported)} {unit} {tracking === 'full-body' ? 'bodyweight' : 'supported'} + {display(addedResistance)} {tracking === 'measured' ? 'measured added resistance' : 'carried'} − {display(helped)} {tracking === 'measured' ? 'measured reduction' : 'assistance'} = {display(supported + addedResistance - helped)} {unit}.</p>
   </>}
  </> : <>
   <label className="check-row"><span>Use an exact list of available loads</span><input type="checkbox" checked={!!slot.availableLoads} onChange={event => onChange({ ...slot, availableLoads: event.target.checked ? loads(available) : undefined })}/></label>
   {slot.availableLoads && <Field label={`Available working loads (${unit})`} hint="Comma-separated total working loads. This list replaces the uniform increment; include microloads only if you have them."><input aria-label={`Available working loads (${unit})`} placeholder={unit === 'lb' ? '45, 55, 65, 75' : '20, 25, 30, 35'} value={available} onChange={event => { setPreset('keep'); setAvailable(event.target.value); onChange({ ...slot, availableLoads: loads(event.target.value) }); }}/></Field>}
  </>}
 </details>;
}
