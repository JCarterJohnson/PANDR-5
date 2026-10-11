import { describe, expect, it } from 'vitest';
import { formatEstimate, formatWeight, formatWeightList } from './weight-format';

describe('weight display without changing numerical data', () => {
 it('keeps default loading amounts concise and estimates to one decimal', () => {
  expect(formatWeight(202.5, { preset: 'auto' })).toBe('202.5');
  expect(formatWeight(205, { preset: 'auto' })).toBe('205');
  expect(formatEstimate(202.8232)).toBe('202.8');
  expect(formatEstimate(176.369809744)).toBe('176.4');
 });
 it('preserves custom microloads and historical observations', () => {
  expect(formatWeight(10.25, { preset: 'custom' })).toBe('10.25');
  expect(formatWeight(0.00025, { preset: 'custom' })).toBe('0.00025');
  expect(formatWeight(202.8232, { observed: true })).toBe('202.8232');
  expect(formatWeightList([10, 10.25, 12.5])).toBe('10, 10.25, 12.5');
 });
 it('does not invent a plate load by rounding body mass or formula estimates to a grid', () => {
  const mass = 176.369809744;
  expect(formatEstimate(mass)).toBe('176.4');
  expect(mass).toBe(176.369809744);
  expect(formatWeight(-0.0000000001)).toBe('0');
  expect(formatEstimate(Number.NaN)).toBe('—');
 });
});
