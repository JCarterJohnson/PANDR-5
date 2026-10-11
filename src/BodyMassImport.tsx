import { useEffect, useState } from 'react';
import { Button, Notice } from './components';
import { updateBodyMass } from './domain/bodyweight';
import type { AppData } from './domain/types';
import type { Update } from './Train';
import { clearedBodyweightImportUrl, importedWeightIsOlder, parseBodyweightImport, type BodyweightImport } from './services/bodyweight-import';

export function BodyMassImport({ data, update, signedIn }: { data: AppData; update: Update; signedIn: boolean }) {
  const [reviewedHash, setReviewedHash] = useState('');
  const [sample, setSample] = useState<BodyweightImport>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    function readImport() {
      const hash = location.hash;
      if (!new URLSearchParams(hash.replace(/^#/, '')).has('bodyweight')) {
        setReviewedHash(''); setSample(undefined); setError('');
        return;
      }
      setReviewedHash(hash); setSaved(false);
      try { setSample(parseBodyweightImport(hash)); setError(''); }
      catch (e) { setSample(undefined); setError((e as Error).message); }
    }
    readImport();
    addEventListener('hashchange', readImport);
    return () => removeEventListener('hashchange', readImport);
  }, []);

  function clearReviewedImport() {
    const cleared = clearedBodyweightImportUrl(location.href, reviewedHash);
    if (cleared) {
      history.replaceState(history.state, '', cleared);
      setReviewedHash(''); setSample(undefined); setError('');
    }
  }

  async function apply() {
    if (!sample || !signedIn) return;
    setSaving(true); setError('');
    try {
      const validated = parseBodyweightImport(reviewedHash)!;
      await update(d => updateBodyMass(d, validated.value, validated.unit, new Date(validated.measuredAt)));
      clearReviewedImport(); setSaved(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  if (!reviewedHash) return saved ? <Notice tone="success"><strong>Imported bodyweight saved to your account.</strong><p>Future bodyweight loads use this measurement. Your saved tests and workouts keep their original weights.</p><Button small onClick={() => setSaved(false)}>Dismiss</Button></Notice> : null;
  const older = !!sample && importedWeightIsOlder(sample, data.settings.bodyMass);
  return <section className="panel" aria-label="Review imported bodyweight">
    <h2>Review imported bodyweight</h2>
    {sample && <>
      <p><strong>{sample.value.toLocaleString(undefined, { maximumFractionDigits: 3 })} {sample.unit}</strong> · measured {new Date(sample.measuredAt).toLocaleString()}</p>
      <p>This link supplies a weight measurement. Nothing has been saved yet. Use it to update your bodyweight in Settings and future bodyweight loads.</p>
      {(sample.stale || older) && <Notice>{older ? `This measurement is older than your saved bodyweight.${sample.stale ? ' It is also over 14 days old.' : ''} Apply it only if you intend to replace the newer measurement.` : 'This measurement is over 14 days old. Check that it still reflects your current weight before using it.'}</Notice>}
      {data.activeSession && <p>Your current workout keeps the bodyweight it started with. This update applies to future workouts.</p>}
      {!signedIn && <Notice>Open Settings and sign in to save this weight to your account. The import will stay available in this tab until you use or cancel it.</Notice>}
    </>}
    {error && <Notice tone="error">{error}</Notice>}
    <div className="actions">
      {sample && <Button primary disabled={saving || !signedIn} onClick={() => void apply()}>{saving ? 'Saving bodyweight…' : 'Use imported bodyweight'}</Button>}
      <Button disabled={saving} onClick={clearReviewedImport}>Cancel import</Button>
    </div>
  </section>;
}
