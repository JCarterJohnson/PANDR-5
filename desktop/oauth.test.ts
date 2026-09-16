import { createRequire } from 'node:module';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { AUTH_ORIGIN, OAUTH_TTL_MS, createOAuthBridge, validateAuthorizeUrl, isTrustedOAuthSender } = require('./oauth.cjs');
const bridges: { cancelOAuth(): Promise<void> }[] = [];
afterEach(async () => { await Promise.all(bridges.splice(0).map(bridge => bridge.cancelOAuth())); });

function authorize(redirectTo: string) {
  const url = new URL(`${AUTH_ORIGIN}/auth/v1/authorize`);
  url.search = new URLSearchParams({ provider: 'google', redirect_to: redirectTo, code_challenge: 'a'.repeat(43), code_challenge_method: 's256', skip_http_redirect: 'true', prompt: 'select_account' }).toString();
  return url.href;
}
function bridge(options: Record<string, unknown> = {}) {
  const onResult = vi.fn(); const openExternal = vi.fn(async () => {});
  const value = createOAuthBridge({ onResult, openExternal, ...options });
  bridges.push(value);
  return { ...value, onResult, openExternal };
}
function callback(url: string, options: { method?: string; path?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: Number(parsed.port), path: options.path ?? parsed.pathname + parsed.search, method: options.method ?? 'GET', headers: options.headers, agent: false }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', text => { body += text; });
      res.on('end', () => resolve({ status: res.statusCode!, body, headers: res.headers }));
    });
    req.on('error', reject); req.end(options.body);
  });
}

describe('desktop authorization boundary', () => {
  const redirect = 'http://127.0.0.1:12345/oauth/callback/random-secret-path';
  it('permits only the prepared Google PKCE authorize URL', () => {
    expect(validateAuthorizeUrl(authorize(redirect), redirect)).toBe(authorize(redirect));
    const upper = new URL(authorize(redirect)); upper.searchParams.set('code_challenge_method', 'S256');
    expect(validateAuthorizeUrl(upper.href, redirect)).toBe(upper.href);
    expect(OAUTH_TTL_MS).toBe(600_000);
  });
  it('accepts only Google identity scopes', () => {
    const url = new URL(authorize(redirect)); url.searchParams.set('scopes', 'openid email profile');
    expect(validateAuthorizeUrl(url.href, redirect)).toBe(url.href);
    url.searchParams.set('scopes', 'openid profile profile');
    expect(() => validateAuthorizeUrl(url.href, redirect)).toThrow();
  });
  it.each([
    ['provider', 'github'], ['redirect_to', 'https://evil.example'], ['redirect_to', 'http://127.0.0.1:12346/oauth/callback/random-secret-path'],
    ['code_challenge', ''], ['code_challenge_method', 'plain'], ['code_challenge_method', ''],
    ['redirect_uri', 'https://evil.example'], ['url', 'https://evil.example'], ['scope', 'cloud-platform'],
    ['scopes', 'https://www.googleapis.com/auth/drive'], ['skip_http_redirect', 'false'], ['prompt', 'unexpected'],
  ])('rejects unauthorized parameter %s=%s', (key, value) => {
    const url = new URL(authorize(redirect)); url.searchParams.set(key, value);
    expect(() => validateAuthorizeUrl(url.href, redirect)).toThrow();
  });
  it('rejects credentials, fragments, duplicate parameters, other paths and origins', () => {
    const valid = authorize(redirect);
    for (const invalid of [
      valid.replace(AUTH_ORIGIN, 'https://evil.example'), valid.replace('/authorize?', '/callback?'),
      valid.replace('https://', 'http://'), valid.replace('https://', 'https://name:secret@'), `${valid}#fragment`, `${valid}#`,
      `${valid}&provider=google`, `${valid}&redirect_to=${encodeURIComponent(redirect)}`, valid.replace(AUTH_ORIGIN, `${AUTH_ORIGIN}:444`),
      ` ${valid}`, valid.replace('/auth/v1/authorize', '/other/../auth/v1/authorize'),
    ]) expect(() => validateAuthorizeUrl(invalid, redirect), invalid).toThrow();
    expect(() => validateAuthorizeUrl(valid, 'http://localhost:12345/oauth/callback/random-secret-path')).toThrow();
  });
  it('requires the current app main frame and exact owning web contents', () => {
    const frame = { url: 'pandr://app/' }; const contents = { mainFrame: frame, isDestroyed: () => false };
    expect(isTrustedOAuthSender({ sender: contents, senderFrame: frame }, contents)).toBe(true);
    expect(isTrustedOAuthSender({ sender: {}, senderFrame: frame }, contents)).toBe(false);
    expect(isTrustedOAuthSender({ sender: contents, senderFrame: { url: 'pandr://app/' } }, contents)).toBe(false);
    expect(isTrustedOAuthSender({ sender: contents, senderFrame: null }, contents)).toBe(false);
    frame.url = 'https://evil.example';
    expect(isTrustedOAuthSender({ sender: contents, senderFrame: frame }, contents)).toBe(false);
    expect(isTrustedOAuthSender({}, null)).toBe(false);
  });
});

describe('real loopback OAuth receiver', () => {
  it('prepares without opening a browser, then receives a one-use code without reflecting it in HTML', async () => {
    const flow = bridge(); const redirect = await flow.prepareOAuth(); const parsed = new URL(redirect);
    expect(parsed.hostname).toBe('127.0.0.1'); expect(Number(parsed.port)).toBeGreaterThan(0);
    expect(parsed.pathname).toMatch(/^\/oauth\/callback\/[A-Za-z0-9_-]{32,}$/);
    expect(flow.openExternal).not.toHaveBeenCalled();
    expect((await callback(`${redirect}?code=too-early`)).status).toBe(409);
    await flow.openOAuth(authorize(redirect));
    expect(flow.openExternal).toHaveBeenCalledExactlyOnceWith(authorize(redirect));
    const response = await callback(`${redirect}?code=private-authorization-code`);
    expect(response.status).toBe(200); expect(response.body).toContain('Return to PANDR-5');
    expect(response.body).not.toContain('private-authorization-code');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(flow.onResult).toHaveBeenCalledExactlyOnceWith({ code: 'private-authorization-code' });
    await expect(callback(`${redirect}?code=second-code`)).rejects.toThrow();
    expect(flow.onResult).toHaveBeenCalledTimes(1);
  });
  it('rejects wrong host, origin, method, path and malformed queries without consuming the valid callback', async () => {
    const flow = bridge(); const redirect = await flow.prepareOAuth(); await flow.openOAuth(authorize(redirect));
    for (const [url, options] of [
      [`${redirect}?code=bad-host`, { headers: { host: 'evil.example' } }],
      [`${redirect}?code=localhost-host`, { headers: { host: `localhost:${new URL(redirect).port}` } }],
      [`${redirect}?code=bad-origin`, { headers: { origin: 'https://evil.example' } }],
      [`${redirect}?code=bad-method`, { method: 'POST' }],
      [`${redirect}/other?code=bad-path`, {}],
      [`${redirect}?code=one&code=two`, {}], [`${redirect}?code=`, {}],
      [`${redirect}?code=code&error=access_denied`, {}], [`${redirect}?access_token=token`, {}],
      [`${redirect}?code=valid&next=https://evil.example`, {}], [`${redirect}?code=spaces%20not%20allowed`, {}],
      [`${redirect}?code=fragment#invalid`, {}],
      [`${redirect}?code=absolute`, { path: `${redirect}?code=absolute` }],
    ] as [string, { headers?: Record<string, string>; method?: string; path?: string }][]) {
      if (url.includes('#')) options.path = new URL(redirect).pathname + '?code=fragment#invalid';
      expect((await callback(url, options)).status, url).toBeGreaterThanOrEqual(400);
      expect(flow.onResult).not.toHaveBeenCalled();
    }
    expect((await callback(`${redirect}?code=valid-code`)).status).toBe(200);
    expect(flow.onResult).toHaveBeenCalledExactlyOnceWith({ code: 'valid-code' });
  });
  it('forwards a provider error once and keeps the response page static', async () => {
    const flow = bridge(); const redirect = await flow.prepareOAuth(); await flow.openOAuth(authorize(redirect));
    const response = await callback(`${redirect}?error=access_denied&error_code=provider_error&error_description=Private%20provider%20description`);
    expect(response.status).toBe(200);
    expect(response.body).not.toContain('Private provider description');
    expect(flow.onResult).toHaveBeenCalledExactlyOnceWith({ error: 'Private provider description' });
  });
  it('does not consume a prepared receiver when an invalid launch URL is rejected', async () => {
    const flow = bridge(); const redirect = await flow.prepareOAuth();
    await expect(flow.openOAuth('https://evil.example')).rejects.toThrow();
    expect(flow.openExternal).not.toHaveBeenCalled();
    await flow.openOAuth(authorize(redirect));
    await expect(flow.openOAuth(authorize(redirect))).rejects.toThrow();
    await callback(`${redirect}?code=valid-code`);
    expect(flow.onResult).toHaveBeenCalledTimes(1);
  });
  it('replaces old callbacks, cancels cleanly, and closes after browser launch failure', async () => {
    const flow = bridge(); const old = await flow.prepareOAuth(); const current = await flow.prepareOAuth();
    expect(new URL(current).pathname).not.toBe(new URL(old).pathname);
    await expect(callback(`${old}?code=old-code`)).rejects.toThrow();
    await flow.cancelOAuth();
    await expect(callback(`${current}?code=canceled-code`)).rejects.toThrow();
    expect(flow.onResult.mock.calls).toEqual([
      [{ error: 'Sign-in was replaced by a new attempt.' }],
      [{ error: 'Sign-in was canceled.' }],
    ]);
    const failing = bridge({ openExternal: async () => { throw new Error('Browser unavailable'); } });
    const redirect = await failing.prepareOAuth();
    await expect(failing.openOAuth(authorize(redirect))).rejects.toThrow('Browser unavailable');
    await expect(callback(`${redirect}?code=failed-launch`)).rejects.toThrow();
    expect(failing.onResult).toHaveBeenCalledExactlyOnceWith({ error: 'The browser could not be opened. Please try again.' });
  });
  it('cancels an open sign-in once so the renderer waiting for a result can settle', async () => {
    const flow = bridge(); const redirect = await flow.prepareOAuth(); await flow.openOAuth(authorize(redirect));
    await Promise.all([flow.cancelOAuth(), flow.cancelOAuth()]);
    expect(flow.onResult).toHaveBeenCalledExactlyOnceWith({ error: 'Sign-in was canceled.' });
    await expect(callback(`${redirect}?code=late-code`)).rejects.toThrow();
  });
  it('serializes simultaneous preparations and leaves only the newest receiver active', async () => {
    const flow = bridge();
    const [old, current] = await Promise.all([flow.prepareOAuth(), flow.prepareOAuth()]);
    expect(old).not.toBe(current);
    await expect(callback(`${old}?code=old-code`)).rejects.toThrow();
    expect(flow.onResult).toHaveBeenCalledExactlyOnceWith({ error: 'Sign-in was replaced by a new attempt.' });
    await flow.openOAuth(authorize(current));
    expect((await callback(`${current}?code=current-code`)).status).toBe(200);
    expect(flow.onResult).toHaveBeenLastCalledWith({ code: 'current-code' });
  });
  it('lets cancellation complete while browser launch is pending, without consuming a newer flow', async () => {
    let rejectLaunch!: (error: Error) => void;
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const flow = bridge({ openExternal: () => { markStarted(); return new Promise((_resolve, reject) => { rejectLaunch = reject; }); } });
    const old = await flow.prepareOAuth();
    const opening = flow.openOAuth(authorize(old));
    const rejection = expect(opening).rejects.toThrow('Late browser failure');
    await started;
    await flow.cancelOAuth();
    const current = await flow.prepareOAuth();
    rejectLaunch(new Error('Late browser failure'));
    await rejection;
    expect(flow.onResult).toHaveBeenCalledExactlyOnceWith({ error: 'Sign-in was canceled.' });
    expect((await callback(`${current}?code=still-prepared`)).status).toBe(409);
    await expect(callback(`${old}?code=old-code`)).rejects.toThrow();
  });
  it('expires with one renderer error and releases its loopback port', async () => {
    let deliver!: (value: { error?: string }) => void;
    const result = new Promise<{ error?: string }>(resolve => { deliver = resolve; });
    const flow = bridge({ ttlMs: 30, onResult: deliver }); const redirect = await flow.prepareOAuth();
    expect((await result).error).toContain('expired');
    await expect(callback(`${redirect}?code=late-code`)).rejects.toThrow();
    await expect(flow.openOAuth(authorize(redirect))).rejects.toThrow();
  });
});

describe('preload surface and packaging', () => {
  it('exposes only narrow operations and never passes the Electron event to a listener', async () => {
    const expose = vi.fn(); const invoke = vi.fn(async () => 'result');
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const removeListener = vi.fn((channel, listener) => { if (listeners.get(channel) === listener) listeners.delete(channel); });
    const electron = { contextBridge: { exposeInMainWorld: expose }, ipcRenderer: { invoke, on: (channel: string, listener: (...args: unknown[]) => void) => listeners.set(channel, listener), removeListener } };
    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), { require: () => electron, process: { isMainFrame: true } });
    const [name, surface] = expose.mock.calls[0]!;
    expect(name).toBe('pandrDesktop'); expect(Object.keys(surface).sort()).toEqual(['cancelOAuth', 'onOAuthResult', 'openOAuth', 'prepareOAuth']);
    await surface.prepareOAuth(); await surface.openOAuth('url'); await surface.cancelOAuth();
    expect(invoke.mock.calls).toEqual([['pandr:oauth:prepare'], ['pandr:oauth:open', 'url'], ['pandr:oauth:cancel']]);
    const handler = vi.fn(); const unsubscribe = surface.onOAuthResult(handler);
    const listener = listeners.get('pandr:oauth:result')!;
    listener({ sender: 'privileged' }, { code: 'auth-code', extra: 'ignored' });
    expect(handler).toHaveBeenCalledExactlyOnceWith({ code: 'auth-code' });
    listener({}, { code: 'ambiguous', error: 'ambiguous' }); listener({}, {});
    expect(handler).toHaveBeenCalledTimes(1);
    unsubscribe(); expect(removeListener).toHaveBeenCalledTimes(1); expect(listeners.size).toBe(0);
  });
  it('does not expose the bridge in a subframe and packages both native modules', () => {
    const expose = vi.fn();
    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), { require: () => ({ contextBridge: { exposeInMainWorld: expose } }), process: { isMainFrame: false } });
    expect(expose).not.toHaveBeenCalled();
    const config = readFileSync(new URL('../electron-builder.yml', import.meta.url), 'utf8');
    expect(config).toContain('desktop/preload.cjs'); expect(config).toContain('desktop/oauth.cjs');
  });
});
