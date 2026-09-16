const { randomBytes } = require('node:crypto');
const { createServer } = require('node:http');
const { isAppDocument } = require('./security.cjs');

const AUTH_ORIGIN = 'https://mhzryeqnmykkdpmabyeo.supabase.co';
const OAUTH_TTL_MS = 10 * 60 * 1000;
const CALLBACK_PAGE = '<!doctype html><html lang="en"><meta charset="utf-8"><title>PANDR-5 sign-in</title><h1>Return to PANDR-5</h1><p>You can close this browser tab and continue in the app.</p></html>';
const SAFE_CODE = /^[A-Za-z0-9._~-]{1,2048}$/;
const IDENTITY_SCOPES = new Set(['openid', 'email', 'profile', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile']);

function validateAuthorizeUrl(value, redirectTo) {
  const invalid = () => { throw new Error('Invalid Google sign-in URL.'); };
  if (typeof value !== 'string' || value.length > 8192 || /[\s\u0000-\u001f\u007f#]/.test(value)) return invalid();
  if (typeof redirectTo !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}\/oauth\/callback\/[A-Za-z0-9_-]{16,}$/.test(redirectTo)) return invalid();
  let url;
  try {
    if (new URL(redirectTo).href !== redirectTo) return invalid();
    url = new URL(value);
  } catch { return invalid(); }
  // Checking the original prefix also rejects URL-parser normalization of paths.
  if (!value.startsWith(`${AUTH_ORIGIN}/auth/v1/authorize?`) || url.origin !== AUTH_ORIGIN || url.pathname !== '/auth/v1/authorize' || url.username || url.password || url.hash) return invalid();
  const params = url.searchParams;
  const allowed = new Set(['provider', 'redirect_to', 'code_challenge', 'code_challenge_method', 'skip_http_redirect', 'scopes', 'prompt']);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) return invalid();
  }
  if (params.get('provider') !== 'google' || params.get('redirect_to') !== redirectTo || !/^[A-Za-z0-9_-]{43}$/.test(params.get('code_challenge') || '') || !['s256', 'S256'].includes(params.get('code_challenge_method'))) return invalid();
  if (params.has('skip_http_redirect') && params.get('skip_http_redirect') !== 'true') return invalid();
  if (params.has('prompt') && params.get('prompt') !== 'select_account') return invalid();
  if (params.has('scopes')) {
    const scopes = params.get('scopes').split(' ');
    if (scopes.some(scope => !IDENTITY_SCOPES.has(scope)) || new Set(scopes).size !== scopes.length) return invalid();
  }
  return url.href;
}

function isTrustedOAuthSender(event, contents) {
  return Boolean(contents && !contents.isDestroyed() && event.sender === contents && event.senderFrame && event.senderFrame === contents.mainFrame && isAppDocument(event.senderFrame.url));
}

function callbackResult(searchParams) {
  const allowed = new Set(['code', 'error', 'error_code', 'error_description']);
  for (const key of searchParams.keys()) {
    if (!allowed.has(key) || searchParams.getAll(key).length !== 1) return null;
  }
  const code = searchParams.get('code');
  if (code !== null) return searchParams.size === 1 && SAFE_CODE.test(code) ? { code } : null;
  const error = searchParams.get('error');
  if (!error || !SAFE_CODE.test(error)) return null;
  const errorCode = searchParams.get('error_code');
  const description = searchParams.get('error_description');
  if (errorCode !== null && !SAFE_CODE.test(errorCode)) return null;
  if (description !== null && (!description || description.length > 2048 || /[\u0000-\u001f\u007f]/.test(description))) return null;
  return { error: description || error };
}

function createOAuthBridge({ openExternal, onResult, ttlMs = OAUTH_TTL_MS }) {
  if (typeof openExternal !== 'function' || typeof onResult !== 'function') throw new TypeError('OAuth bridge callbacks are required.');
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > OAUTH_TTL_MS) throw new TypeError('Invalid OAuth lifetime.');
  let active;
  let pending = Promise.resolve();
  // Serialize short lifecycle operations; launching the browser never blocks cancellation.
  const serialize = operation => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };

  function finish(flow, result, responseSocket) {
    if (!flow || flow.finished) return Promise.resolve();
    flow.finished = true;
    if (active === flow) active = undefined;
    clearTimeout(flow.timer);
    const closed = new Promise(resolve => {
      flow.server.close(resolve);
      for (const socket of flow.sockets) if (socket !== responseSocket) socket.destroy();
    });
    if (result) onResult(result);
    return closed;
  }

  async function prepareOAuth() {
    return serialize(async () => {
      await finish(active, { error: 'Sign-in was replaced by a new attempt.' });
      const flow = { server: null, sockets: new Set(), finished: false, opened: false, timer: undefined, redirectTo: '', callbackPath: `/oauth/callback/${randomBytes(32).toString('base64url')}` };
      flow.server = createServer({ maxHeaderSize: 8192 }, (req, res) => {
        const respond = (status, body) => {
          res.writeHead(status, {
            'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', Connection: 'close',
          });
          res.end(body);
        };
        const hostCount = req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === 'host').length;
        const receiver = new URL(flow.redirectTo);
        if (hostCount !== 1 || req.headers.host !== receiver.host || (req.headers.origin && req.headers.origin !== AUTH_ORIGIN)) return respond(400, 'Invalid callback.');
        if (req.method !== 'GET') return respond(405, 'Method not allowed.');
        if (!req.url || req.url.length > 8192 || req.url.includes('#') || req.url.split('?')[0] !== flow.callbackPath) return respond(404, 'Not found.');
        if (flow.finished || !flow.opened) return respond(409, 'Sign-in is not active.');
        const result = callbackResult(new URL(req.url, receiver.origin).searchParams);
        if (!result) return respond(400, 'Invalid callback.');
        const socket = res.socket;
        respond(200, CALLBACK_PAGE);
        void finish(flow, result, socket);
      });
      flow.server.on('connection', socket => {
        flow.sockets.add(socket);
        socket.on('close', () => flow.sockets.delete(socket));
        socket.setTimeout(5000, () => socket.destroy());
      });
      flow.server.requestTimeout = 5000;
      flow.server.headersTimeout = 5000;
      flow.server.keepAliveTimeout = 1;
      await new Promise((resolve, reject) => {
        flow.server.once('error', reject);
        flow.server.listen(0, '127.0.0.1', () => {
          flow.server.removeListener('error', reject);
          resolve();
        });
      });
      flow.redirectTo = `http://127.0.0.1:${flow.server.address().port}${flow.callbackPath}`;
      active = flow;
      flow.server.on('error', () => { void finish(flow, { error: 'The sign-in callback could not be received. Please try again.' }); });
      flow.timer = setTimeout(() => { void finish(flow, { error: 'Sign-in expired. Please try again.' }); }, ttlMs);
      flow.timer.unref();
      return flow.redirectTo;
    });
  }

  async function openOAuth(value) {
    const { flow, url } = await serialize(() => {
      const flow = active;
      if (!flow || flow.finished || flow.opened) throw new Error('Prepare a new sign-in attempt first.');
      const url = validateAuthorizeUrl(value, flow.redirectTo);
      flow.opened = true;
      return { flow, url };
    });
    try { await openExternal(url); }
    catch (error) {
      await finish(flow, { error: 'The browser could not be opened. Please try again.' });
      throw error;
    }
  }

  function cancelOAuth() {
    return serialize(() => finish(active, { error: 'Sign-in was canceled.' }));
  }
  return { prepareOAuth, openOAuth, cancelOAuth };
}

module.exports = { AUTH_ORIGIN, OAUTH_TTL_MS, createOAuthBridge, validateAuthorizeUrl, isTrustedOAuthSender };
