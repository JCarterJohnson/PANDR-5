import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { resolveAppFile, isAppDocument, safeExternalUrl } = require('./security.cjs');
const root = path.resolve('/app/dist');

describe('desktop origin boundary', () => {
  it('serves only the fixed app host and files inside the bundle', () => {
    expect(resolveAppFile('pandr://app/', root)).toBe(path.join(root, 'index.html'));
    expect(resolveAppFile('pandr://app/assets/main.js', root)).toBe(path.join(root, 'assets/main.js'));
    for (const url of [
      'https://app/index.html', 'pandr://evil/index.html', 'pandr://app:99/',
      'pandr://user@app/', 'pandr://app/%2e%2e%2fsecret',
      'pandr://app/%5c..%5csecret', 'pandr://app/%00', 'pandr://app/%ZZ',
    ]) expect(resolveAppFile(url, root), url).toBeNull();
  });

  it('keeps document navigation inside the entry point', () => {
    expect(isAppDocument('pandr://app/#settings')).toBe(true);
    expect(isAppDocument('pandr://app/index.html')).toBe(true);
    expect(isAppDocument('pandr://app/assets/main.js')).toBe(false);
    expect(isAppDocument('pandr://app.evil/')).toBe(false);
  });

  it('only permits credential-free HTTPS links to reach the confirmation dialog', () => {
    expect(safeExternalUrl('https://example.com/help')?.href).toBe('https://example.com/help');
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://example.com', 'mailto:person@example.com', 'https://user:pass@example.com', 'https://example.com:8080/']) {
      expect(safeExternalUrl(url), url).toBeNull();
    }
  });
});
