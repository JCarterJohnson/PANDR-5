import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Modal, Notice } from './components';
import { cycleDeletionSummary } from './domain/cycle-deletion';
import type { AppData } from './domain/types';

export function CycleDeletion({ data, cycleId, onDelete, disabled = false }: {
  data: AppData;
  cycleId: string;
  onDelete: (cycleId: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  let summary;
  try { summary = cycleDeletionSummary(data, cycleId); } catch { return null; }
  const close = () => { if (!busy) { setStep(0); setError(''); } };
  const remove = async () => {
    setBusy(true); setError('');
    try { await onDelete(cycleId); setStep(0); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const counts = `${summary.sessions} workout${summary.sessions === 1 ? '' : 's'} and ${summary.checkIns} recovery check-in${summary.checkIns === 1 ? '' : 's'}`;
  return <>
    <Button small disabled={disabled} onClick={() => { setError(''); setStep(1); }} aria-label={`Delete ${summary.cycle.name}`}><Trash2 size={16}/> Delete cycle</Button>
    {step > 0 && <Modal title={step === 1 ? `Delete ${summary.cycle.name}?` : 'Are you really sure?'} onClose={close}>
      <p>{summary.cycle.name} · {summary.cycle.startDate} to {summary.cycle.endedAt}</p>
      <p>{step === 1 ? `This cycle contains ${counts}.` : `Permanently delete this cycle, its archived plan, ${counts}? This cannot be undone.`}</p>
      <p>Your strength assessments and current cycle stay saved.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="button-row"><Button disabled={busy} onClick={close}>Cancel</Button>{step === 1
        ? <Button onClick={() => setStep(2)}>Continue to final confirmation</Button>
        : <Button className="danger" disabled={busy || disabled} onClick={() => void remove()}>{busy ? 'Deleting…' : 'Delete permanently'}</Button>}</div>
    </Modal>}
  </>;
}
