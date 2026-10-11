import { describe, expect, it } from 'vitest';
import { clearedBodyweightImportUrl, importedWeightIsOlder, parseBodyweightImport } from './bodyweight-import';

const now = new Date('2026-10-10T16:00:00.000Z');
const hash = (weight = '235', unit = 'lb', measuredAt = '2026-10-10T08:00:00-07:00') => `#bodyweight=${weight}&unit=${unit}&measuredAt=${encodeURIComponent(measuredAt)}`;

describe('bodyweight Shortcut handoff', () => {
  it('converts pounds and keeps the actual measurement time', () => {
    const sample = parseBodyweightImport(hash(), now)!;
    expect(sample.value).toBe(235);
    expect(sample.unit).toBe('lb');
    expect(sample.kg).toBeCloseTo(106.59420695);
    expect(sample.measuredAt).toBe('2026-10-10T15:00:00.000Z');
    expect(sample.stale).toBe(false);
    expect(parseBodyweightImport(hash('100', 'kg'), now)?.kg).toBe(100);
  });

  it('ignores navigation and authentication fragments', () => {
    expect(parseBodyweightImport('#load-progression', now)).toBeUndefined();
    expect(parseBodyweightImport('#access_token=private&token_type=bearer', now)).toBeUndefined();
    expect(parseBodyweightImport('', now)).toBeUndefined();
  });

  it.each(['0', '-1', 'NaN', 'Infinity', '1e3', '0x64', '', '500.1'])('rejects invalid kg value %s', weight => {
    expect(() => parseBodyweightImport(hash(weight, 'kg'), now)).toThrow();
  });

  it('enforces the same maximum in either unit', () => {
    expect(parseBodyweightImport(hash('500', 'kg'), now)?.kg).toBe(500);
    expect(() => parseBodyweightImport(hash('1103', 'lb'), now)).toThrow('500 kg');
    expect(() => parseBodyweightImport(hash('235', 'stone'), now)).toThrow('kg or lb');
  });

  it('rejects missing, duplicate, and unexpected fields without reflecting their values', () => {
    expect(() => parseBodyweightImport('#bodyweight=235&unit=lb', now)).toThrow('incomplete');
    expect(() => parseBodyweightImport(`${hash()}&bodyweight=99`, now)).toThrow('unexpected');
    expect(() => parseBodyweightImport(`${hash()}&access_token=private`, now)).toThrow('unexpected');
    expect(() => parseBodyweightImport(`${hash()}&unit=kg`, now)).toThrow('unexpected');
  });

  it.each(['2026-10-10', '2026-10-10T15:00:00', '2026-02-30T15:00:00Z', '2026-10-10T24:00:00Z', '2026-10-10T15:00:00+99:00'])('rejects invalid date %s', date => {
    expect(() => parseBodyweightImport(hash('100', 'kg', date), now)).toThrow();
  });

  it('permits clock skew of five minutes and rejects later timestamps', () => {
    expect(parseBodyweightImport(hash('100', 'kg', '2026-10-10T16:05:00Z'), now)).toBeDefined();
    expect(() => parseBodyweightImport(hash('100', 'kg', '2026-10-10T16:05:01Z'), now)).toThrow('future');
  });

  it('flags stale and older measurements for review without rejecting them', () => {
    const sample = parseBodyweightImport(hash('100', 'kg', '2026-09-01T16:00:00Z'), now)!;
    expect(sample.stale).toBe(true);
    expect(importedWeightIsOlder(sample, { recordedAt: '2026-10-01T16:00:00Z' })).toBe(true);
    expect(importedWeightIsOlder(sample, { recordedAt: sample.measuredAt })).toBe(false);
    expect(importedWeightIsOlder(sample)).toBe(false);
  });

  it('only clears the exact reviewed weight fragment and preserves the path/query', () => {
    expect(clearedBodyweightImportUrl(`https://pandr.example/app/?next=settings${hash()}`, hash())).toBe('https://pandr.example/app/?next=settings');
    expect(clearedBodyweightImportUrl(`https://pandr.example/${hash('240')}`, hash())).toBeUndefined();
    expect(clearedBodyweightImportUrl('https://pandr.example/#access_token=private', '#access_token=private')).toBeUndefined();
  });
});
