import { useState } from 'react';
import { Cloud, RefreshCw } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button, Notice } from './components';
import { signInWithGoogle } from './services/auth';

export function Account({ client, profile, email, sync }: {
  client: SupabaseClient | null; profile: string; email: string; sync: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function authenticate() {
    if (!client) return;
    setBusy(true); setError('');
    try { await signInWithGoogle(client, window.pandrDesktop); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="panel">
    <h2><Cloud size={21}/> Your account</h2>
    {!client ? <>
      <p>This edition saves on this device. Use the account-enabled app to sync across devices.</p>
      <a className="button" href="https://pandr-5.vercel.app/" target="_blank" rel="noreferrer">Open account-enabled PANDR-5</a>
      <p className="muted">Export a complete backup below to bring your existing training with you.</p>
    </> : profile !== 'local' ? <>
      <p>Signed in as <strong>{email}</strong></p>
      <p>Changes sync automatically after editing pauses and after you finish a workout. Offline changes stay on this device until you reconnect.</p>
      <div className="actions">
        <Button primary onClick={() => void sync()}><RefreshCw size={17}/> Sync now</Button>
        <Button onClick={async () => { const { error } = await client.auth.signOut({ scope: 'local' }); if (error) setError(error.message); }}>Sign out</Button>
      </div>
      <p className="muted">Your account and local profile are kept separate. Signing out returns to the local profile.</p>
    </> : <>
      <p>Keep your training across devices with your Google account. Your first sign-in creates your private PANDR-5 account.</p>
      <Button disabled={busy} onClick={() => void authenticate()}>{busy ? 'Finish signing in with Google…' : 'Continue with Google'}</Button>
      {busy && window.pandrDesktop && <button className="text-link" onClick={() => void window.pandrDesktop?.cancelOAuth()}>Cancel sign-in</button>}
      <p className="muted">Your local profile stays separate. To bring its history into your account, download a backup before signing in, then restore it while signed in.</p>
      <small>Google shares your basic profile and email for sign-in. Your workout history stays in PANDR-5. <a href="https://pandr-5.vercel.app/privacy.html" target="_blank" rel="noreferrer">Privacy</a></small>
    </>}
    {error && <Notice tone="error">{error}</Notice>}
  </section>;
}
