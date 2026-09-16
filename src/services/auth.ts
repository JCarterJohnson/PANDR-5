import type { SupabaseClient } from '@supabase/supabase-js';

export interface DesktopOAuth {
  prepareOAuth(): Promise<string>;
  openOAuth(url: string): Promise<void>;
  cancelOAuth(): Promise<void>;
  onOAuthResult(handler: (result: { code?: string; error?: string }) => void): () => void;
}

/** PKCE keeps the code verifier in the app that initiated sign-in. */
export async function signInWithGoogle(client: SupabaseClient, desktop?: DesktopOAuth) {
  if (!desktop) {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}${location.pathname}`, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw error;
    return;
  }
  const redirectTo = await desktop.prepareOAuth();
  let unsubscribe = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = new Promise<{ code?: string; error?: string }>(resolve => {
    unsubscribe = desktop.onOAuthResult(resolve);
    timer = setTimeout(() => resolve({ error: 'Sign-in timed out. Try again when you are ready.' }), 10 * 60 * 1000);
  });
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw error;
    if (!data.url) throw new Error('Google sign-in could not be opened.');
    await desktop.openOAuth(data.url);
    const callback = await result;
    if (callback.error) throw new Error(callback.error);
    if (!callback.code) throw new Error('Sign-in returned no authorization code.');
    const exchanged = await client.auth.exchangeCodeForSession(callback.code);
    if (exchanged.error) throw exchanged.error;
  } finally {
    if (timer) clearTimeout(timer);
    unsubscribe();
    await desktop.cancelOAuth();
  }
}
