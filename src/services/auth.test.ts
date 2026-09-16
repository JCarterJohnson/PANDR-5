import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInWithGoogle, type DesktopOAuth } from './auth';

function fixture(failure?: string) {
  let receive: (result: {code?:string;error?:string}) => void = () => {};
  const unsubscribe = vi.fn();
  const desktop: DesktopOAuth = {
    prepareOAuth: vi.fn(async () => 'http://127.0.0.1:42000/oauth/callback/random'),
    onOAuthResult: vi.fn(handler => { receive = handler; return unsubscribe; }),
    openOAuth: vi.fn(async () => { receive(failure ? {error:failure} : {code:'one-time-code'}); }),
    cancelOAuth: vi.fn(async () => {}),
  };
  const auth = {
    signInWithOAuth: vi.fn(async () => ({data:{url:'https://example.supabase.co/auth/v1/authorize'},error:null})),
    exchangeCodeForSession: vi.fn(async () => ({data:{},error:null})),
  };
  return {desktop,auth,unsubscribe,client:{auth} as unknown as SupabaseClient};
}
describe('Google sign-in handoff', () => {
  it('exchanges only the returned code in the app that started PKCE', async () => {
    const f=fixture(); await signInWithGoogle(f.client,f.desktop);
    expect(f.auth.signInWithOAuth).toHaveBeenCalledWith({provider:'google',options:{redirectTo:'http://127.0.0.1:42000/oauth/callback/random',skipBrowserRedirect:true,queryParams:{prompt:'select_account'}}});
    expect(f.auth.exchangeCodeForSession).toHaveBeenCalledWith('one-time-code');
    expect(f.unsubscribe).toHaveBeenCalledOnce(); expect(f.desktop.cancelOAuth).toHaveBeenCalledOnce();
  });
  it('preserves cancellation and closes the one-use callback listener', async () => {
    const f=fixture('Sign-in cancelled'); await expect(signInWithGoogle(f.client,f.desktop)).rejects.toThrow('cancelled');
    expect(f.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(f.unsubscribe).toHaveBeenCalledOnce(); expect(f.desktop.cancelOAuth).toHaveBeenCalledOnce();
  });
  it('cleans up when opening the browser fails', async () => {
    const f=fixture(); vi.mocked(f.desktop.openOAuth).mockRejectedValueOnce(new Error('Could not open browser'));
    await expect(signInWithGoogle(f.client,f.desktop)).rejects.toThrow('Could not open browser');
    expect(f.unsubscribe).toHaveBeenCalledOnce(); expect(f.desktop.cancelOAuth).toHaveBeenCalledOnce();
  });
});
