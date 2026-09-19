import { useState } from 'react';
import { Cloud, RefreshCw } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button, Notice } from './components';
import { signInWithGoogle } from './services/auth';

export function Account({ client, profile, email, sync, signOut, pending }: {
  client: SupabaseClient | null; profile: string; email: string; sync: () => Promise<void>; signOut: () => Promise<void>; pending: boolean;
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
  return <section className="panel" id="account" tabIndex={-1}>
    <h2><Cloud size={21}/> Your account</h2>
    {!client ? <>
      <p>This edition is an unsaved preview. Open the account-enabled app to save your training with Google.</p>
      <a className="button" href="https://pandr-5.vercel.app/" target="_blank" rel="noreferrer">Open account-enabled PANDR-5</a>
      <p className="muted">Export a complete backup below to bring your existing training with you.</p>
    </> : profile !== 'local' ? <>
      <p>Signed in as <strong>{email}</strong></p>
      <p>Your training saves to this account as you log. Wait for “Saved to your account” before closing. If saving fails, keep this tab open and retry or download a backup.</p>
      <div className="actions">
        <Button primary onClick={() => void sync()}><RefreshCw size={17}/> Sync now</Button>
        <Button disabled={pending} onClick={async () => { try { await signOut(); } catch (e) { setError((e as Error).message); } }}>Sign out</Button>
      </div>
      <p className="muted">Signing out returns to an unsaved preview. Your saved training stays in your account.</p>
    </> : <>
      <p>Keep your training across devices with your Google account. Your first sign-in creates your private PANDR-5 account.</p>
      <Button disabled={busy} onClick={() => void authenticate()}>{busy ? 'Finish signing in with Google…' : 'Continue with Google'}</Button>
      {busy && window.pandrDesktop && <button className="text-link" onClick={() => void window.pandrDesktop?.cancelOAuth()}>Cancel sign-in</button>}
      <p className="muted">Without signing in, training is not saved on this device or across devices. Signing in opens your account; preview changes are not transferred. Download a backup first if you want to keep them.</p>
      <small>Google shares your basic profile and email for sign-in. Your workout history stays in PANDR-5. <a href="https://pandr-5.vercel.app/privacy.html" target="_blank" rel="noreferrer">Privacy</a></small>
    </>}
    {error && <Notice tone="error">{error}</Notice>}
  </section>;
}
