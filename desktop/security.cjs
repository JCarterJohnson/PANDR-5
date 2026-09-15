const path = require('node:path');

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

function parseAppUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'pandr:' || url.hostname !== 'app' || url.port || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function resolveAppFile(value, root) {
  const url = parseAppUrl(value);
  if (!url) return null;
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return null; }
  if (pathname.includes('\\') || pathname.includes('\0')) return null;
  const base = path.resolve(root);
  const candidate = path.resolve(base, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!candidate.startsWith(`${base}${path.sep}`)) return null;
  return candidate;
}

function isAppDocument(value) {
  const url = parseAppUrl(value);
  return Boolean(url && (url.pathname === '/' || url.pathname === '/index.html'));
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    return url;
  } catch {
    return null;
  }
}

module.exports = { CONTENT_SECURITY_POLICY, resolveAppFile, isAppDocument, safeExternalUrl };
