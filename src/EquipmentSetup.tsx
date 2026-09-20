import { useState } from 'react';
import type { PlanExercise, Settings } from './domain/types';
import { Field, Notice } from './components';

const loads = (text: string) => text.trim() ? text.split(',').filter(v => v.trim() !== '').map(v => Number(v.trim())) : [];
export function EquipmentSetup({ slot, unit, onChange }: { slot: PlanExercise; unit: Settings['unit']; onChange: (slot: PlanExercise) => void }) {
 const [available, setAvailable] = useState(slot.availableLoads?.join(', ') ?? '');
 const [added, setAdded] = useState(slot.bodyweight?.addedLoads.join(', ') ?? '');
 const [assistance, setAssistance] = useState(slot.bodyweight?.assistanceLoads.join(', ') ?? '');
 return <details className="equipment-setup" open={!!slot.bodyweight || !!slot.availableLoads}><summary>Equipment and bodyweight progression</summary>
 <p>Record the loads you actually have. The app keeps the 2–5% increase and 2–3% reduction limits; it cannot bridge a larger equipment gap automatically.</p>
 <label className="check-row"><span>Set up bodyweight resistance</span><input type="checkbox" checked={!!slot.bodyweight} onChange={e => onChange({ ...slot, availableLoads: undefined, bodyweight: e.target.checked ? { resistance: 0, addedLoads: loads(added), assistanceLoads: loads(assistance) } : undefined })}/></label>
 {slot.bodyweight ? <><Notice>Enter the resistance moved in this exact setup. Full body mass can be used when lifting the whole body, such as a pull-up. For partially supported movements, use a measured supported load. There is no universal bodyweight percentage. Band labels alone do not measure assistance; use calibrated assistance for the same setup and range of motion. Update this value when your body mass or setup changes.</Notice>
 <Field label={`Bodyweight resistance (${unit})`} hint="Before adding weight or subtracting assistance. This is a mechanical estimate, not a measure of muscle force."><input aria-label={`Bodyweight resistance (${unit})`} type="number" min="0.01" step="any" value={slot.bodyweight.resistance || ''} onChange={e => onChange({ ...slot, bodyweight: { ...slot.bodyweight!, resistance: Number(e.target.value) } })}/></Field>
 <Field label={`Available added loads (${unit})`} hint="Positive total added loads, separated by commas. Leave blank if none."><input aria-label={`Available added loads (${unit})`} placeholder="2, 2.5, 4, 5" value={added} onChange={e => { setAdded(e.target.value); onChange({ ...slot, bodyweight: { ...slot.bodyweight!, addedLoads: loads(e.target.value) } }); }}/></Field>
 <Field label={`Available measured assistance (${unit})`} hint="Positive assistance amounts below the bodyweight resistance, separated by commas. Leave blank if none."><input aria-label={`Available measured assistance (${unit})`} placeholder="2, 4, 6" value={assistance} onChange={e => { setAssistance(e.target.value); onChange({ ...slot, bodyweight: { ...slot.bodyweight!, assistanceLoads: loads(e.target.value) } }); }}/></Field>
 <p>The next workout can move between assisted, unassisted, and added-weight modes when a confirmed option fits. External weight means added load with this setup enabled.</p></> : <><label className="check-row"><span>Use an exact list of available loads</span><input type="checkbox" checked={!!slot.availableLoads} onChange={e => onChange({ ...slot, availableLoads: e.target.checked ? loads(available) : undefined })}/></label>
 {slot.availableLoads && <Field label={`Available working loads (${unit})`} hint="Comma-separated total working loads. This list replaces the uniform increment; include microloads only if you have them."><input aria-label={`Available working loads (${unit})`} placeholder="10, 10.25, 12.5, 15" value={available} onChange={e => { setAvailable(e.target.value); onChange({ ...slot, availableLoads: loads(e.target.value) }); }}/></Field>}</>}
 </details>;
}
