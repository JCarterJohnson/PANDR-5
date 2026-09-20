import { useEffect, useRef, useState } from 'react';
import { Coffee, Heart } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readSupport, setSupport, type SupportStatus } from './services/support';

export function Support({ client, profile }: { client: SupabaseClient | null; profile: string }) {
  const [status, setStatus] = useState<SupportStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const locked = useRef(false);
  const generation = useRef(0);
  const signedIn = profile !== 'local';

  useEffect(() => {
    let alive = true;
    async function refresh() {
      if (!client || locked.current || document.visibilityState === 'hidden') return;
      const request = ++generation.current;
      try {
        const next = await readSupport(client);
        if (alive && request === generation.current) { setStatus(next); setError(''); }
      } catch {
        if (alive && request === generation.current) { setStatus(undefined); setError('Couldn’t load upvotes. Check your connection and try again.'); }
      }
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false; ++generation.current;
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [client, profile, retry]);

  async function toggle() {
    if (!client || !signedIn || !status || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    const request = ++generation.current;
    try {
      await setSupport(client, profile, !status.voted);
      const next = await readSupport(client);
      if (request === generation.current) setStatus(next);
    } catch {
      // A lost response may still have committed. Read the server before another toggle.
      if (request === generation.current) { setStatus(undefined); setError('Couldn’t confirm your upvote. Reconnect and retry to check its saved state.'); }
    } finally {
      locked.current = false;
      if (request === generation.current) setBusy(false);
    }
  }

  return <section className="panel support-panel" aria-labelledby="support-heading">
    <h2 id="support-heading"><Coffee size={21}/> Support PANDR-5</h2>
    <p>If the app is useful to you, leave a heart or support its development through Buy Me a Coffee.</p>
    <div className="data-actions">
      <button type="button" className="button support-heart" aria-pressed={status?.voted ?? false}
        aria-label={status?.voted ? 'Remove your upvote for PANDR-5' : 'Upvote PANDR-5'}
        disabled={!client || !signedIn || !status || busy} onClick={() => void toggle()}>
        <Heart size={20} fill={status?.voted ? 'currentColor' : 'none'} aria-hidden="true"/>
        {busy ? 'Saving…' : status?.voted ? 'Upvoted' : 'Upvote'}
      </button>
      <span className="muted support-count" role="status">{status ? `${status.total.toLocaleString()} ${status.total === 1 ? 'upvote' : 'upvotes'}` : error || !client ? 'Count unavailable' : 'Loading upvotes…'}</span>
      <a className="button" href="https://buymeacoffee.com/iamjohncaru" target="_blank" rel="noreferrer">Buy Me a Coffee</a>
    </div>
    <p className="support-note">{!client ? 'Upvotes are available in the online app.' : signedIn ? 'One heart per account, saved across devices. Tap again to remove it.' : 'Sign in with Google in the Account section above to leave a heart.'}</p>
    {error && <p role="alert" className="support-note">{error} <button className="text-button" onClick={() => setRetry(value => value + 1)}>Retry upvotes</button></p>}
  </section>;
}
