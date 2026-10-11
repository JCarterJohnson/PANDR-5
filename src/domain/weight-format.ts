import type { EquipmentPreset } from './types';

/** Display only: equipment selection and stored observations keep their full precision. */
export function formatWeight(value: number, options: { preset?: EquipmentPreset; observed?: boolean } = {}): string {
 if (!Number.isFinite(value)) return '—';
 // Explicit microloading and historical observations must not become different weights.
 const digits = options.observed || options.preset === 'custom' ? 8 : 1;
 return String(Number(value.toFixed(digits)));
}

/** Body mass, mechanical totals and formula estimates are not plate prescriptions. */
export const formatEstimate = (value: number): string => formatWeight(value);

export const formatWeightList = (values: number[] | undefined): string =>
 values?.map(value => formatWeight(value, { observed: true })).join(', ') ?? '';
