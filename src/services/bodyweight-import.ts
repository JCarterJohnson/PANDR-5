export interface BodyweightImport {
  value: number;
  unit: 'kg' | 'lb';
  kg: number;
  measuredAt: string;
  stale: boolean;
}

const LB_PER_KG = 2.20462262185;
const DAY_MS = 24 * 60 * 60 * 1000;
const fields = new Set(['bodyweight', 'unit', 'measuredAt']);

/** Parse only the weight handoff. Unrelated fragments, including OAuth, are untouched. */
export function parseBodyweightImport(hash: string, now = new Date()): BodyweightImport | undefined {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (!params.has('bodyweight')) return undefined;
  if (hash.length > 1000 || [...params.keys()].some(key => !fields.has(key)) ||
      [...fields].some(key => params.getAll(key).length !== 1)) {
    throw new Error('The bodyweight link is incomplete or contains unexpected fields. Run your weight Shortcut again.');
  }
  const rawValue = params.get('bodyweight')!;
  const unit = params.get('unit');
  if (!/^\d+(?:\.\d+)?$/.test(rawValue) || (unit !== 'kg' && unit !== 'lb')) {
    throw new Error('The bodyweight link needs a positive number and a unit of kg or lb.');
  }
  const value = Number(rawValue);
  const kg = unit === 'lb' ? value / LB_PER_KG : value;
  if (!Number.isFinite(kg) || kg <= 0 || kg > 500) {
    throw new Error('Imported bodyweight must be greater than zero and no more than 500 kg (1,102.3 lb).');
  }
  const date = parseMeasurementDate(params.get('measuredAt')!);
  if (date.getTime() > now.getTime() + 5 * 60 * 1000) {
    throw new Error('The weight measurement is dated in the future. Check the date in your Shortcut.');
  }
  return { value, unit, kg, measuredAt: date.toISOString(), stale: now.getTime() - date.getTime() > 14 * DAY_MS };
}

function parseMeasurementDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  const date = new Date(value);
  if (!match || !Number.isFinite(date.getTime())) throw new Error('The weight link needs the measurement date in ISO 8601 format, including its time zone.');
  const [, year, month, day, hour, minute, second, , zone] = match;
  const offset = zone === 'Z' ? 0 : (zone[0] === '+' ? 1 : -1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
  const local = new Date(date.getTime() + offset * 60 * 1000);
  if ((zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59)) ||
      local.getUTCFullYear() !== Number(year) || local.getUTCMonth() + 1 !== Number(month) || local.getUTCDate() !== Number(day) ||
      local.getUTCHours() !== Number(hour) || local.getUTCMinutes() !== Number(minute) || local.getUTCSeconds() !== Number(second)) {
    throw new Error('The weight link contains an invalid measurement date.');
  }
  return date;
}

export function importedWeightIsOlder(sample: BodyweightImport, current?: { recordedAt: string }): boolean {
  return !!current && Date.parse(sample.measuredAt) < Date.parse(current.recordedAt);
}

/** Clear only the import that was reviewed; never remove a newer handoff or OAuth response. */
export function clearedBodyweightImportUrl(currentUrl: string, reviewedHash: string): string | undefined {
  const url = new URL(currentUrl);
  if (url.hash !== reviewedHash || !new URLSearchParams(reviewedHash.replace(/^#/, '')).has('bodyweight')) return undefined;
  url.hash = '';
  return url.href;
}
