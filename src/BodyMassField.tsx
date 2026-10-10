import { useEffect, useRef, useState } from 'react';
import { Button, Field, Notice } from './components';
import type { AppData } from './domain/types';
import { updateBodyMass } from './domain/bodyweight';
import type { Update } from './Train';

const poundsPerKg = 2.2046226218;
const inputValue = (kg: number | undefined, unit: 'kg' | 'lb') => kg === undefined ? '' : String(Number((kg * (unit === 'lb' ? poundsPerKg : 1)).toFixed(2)));

export function BodyMassField({ data, update, compact = false }: { data: AppData; update: Update; compact?: boolean }) {
 const unit = data.settings.unit;
 const bodyMass = data.settings.bodyMass;
 const [value, setValue] = useState(() => inputValue(bodyMass?.kg, unit));
 const [dirty, setDirty] = useState(false);
 const [saving, setSaving] = useState(false);
 const [message, setMessage] = useState('');
 const [error, setError] = useState('');
 const current = useRef({ value, dirty, unit }); current.current = { value, dirty, unit };
 const previous = useRef({ kg: bodyMass?.kg, unit });
 useEffect(() => {
  const before = previous.current;
  if (before.unit !== unit && current.current.dirty) {
   const entered = Number(current.current.value);
   if (current.current.value.trim() && Number.isFinite(entered)) {
    const kg = before.unit === 'lb' ? entered / poundsPerKg : entered;
    setValue(inputValue(kg, unit));
   }
  } else if (!current.current.dirty) setValue(inputValue(bodyMass?.kg, unit));
  previous.current = { kg: bodyMass?.kg, unit };
 }, [bodyMass?.kg, bodyMass?.recordedAt, unit]);

 async function save() {
  const entered = Number(value);
  setError(''); setMessage('');
  if (!value.trim() || !Number.isFinite(entered) || entered <= 0) { setError('Enter your current bodyweight as a number greater than 0.'); return; }
  const submitted = value;
  const submittedUnit = unit;
  setSaving(true);
  try {
   await update(latest => updateBodyMass(latest, entered, submittedUnit, new Date()));
   if (current.current.value === submitted && current.current.unit === submittedUnit) { setDirty(false); setValue(String(Number(entered.toFixed(2)))); }
   setMessage('Bodyweight saved. Future workouts use it; past results keep their recorded weight.');
  } catch (failure) { setError((failure as Error).message); }
  finally { setSaving(false); }
 }

 return <section className={compact ? 'body-mass-field' : 'panel body-mass-field'}>
  {compact ? <h3>Your bodyweight</h3> : <h2>Your bodyweight</h2>}
  <Field label={`Current bodyweight (${unit})`} hint="Your scale weight. Save it once here; whole-body movements and measured setups linked to it update automatically.">
   <input aria-label={`Current bodyweight (${unit})`} type="number" inputMode="decimal" min="0.01" step="any" value={value} onChange={event => { setValue(event.target.value); setDirty(true); setMessage(''); setError(''); }}/>
  </Field>
  {bodyMass && <p className="muted"><small>Last updated {new Date(bodyMass.recordedAt).toLocaleDateString()}. Saved assessments and workouts keep the bodyweight used at the time.</small></p>}
  {error && <Notice tone="error">{error}</Notice>}
  {message && <Notice tone="success">{message}</Notice>}
  <Button type="button" disabled={saving || !dirty} onClick={() => void save()}>{saving ? 'Saving bodyweight…' : 'Save bodyweight'}</Button>
 </section>;
}
