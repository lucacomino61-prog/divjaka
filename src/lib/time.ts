/**
 * Time helpers. The business runs on Europe/Tirane wall-clock time.
 * Server side only (Node ships full ICU, so Intl with a timeZone is safe here).
 * Date strings are 'YYYY-MM-DD'; local date-times are 'YYYY-MM-DDTHH:MM'.
 */
export const TZ = 'Europe/Tirane';

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export interface LocalNow { date: string; time: string; dateTime: string; month: number; hour: number }

/** Wall-clock time in Divjakë for an instant (default: now). */
export function tirane(at: Date = new Date()): LocalNow {
  const p: Record<string, string> = {};
  for (const x of partsFmt.formatToParts(at)) p[x.type] = x.value;
  const date = `${p.year}-${p.month}-${p.day}`;
  const time = `${p.hour}:${p.minute}`;
  return { date, time, dateTime: `${date}T${time}`, month: Number(p.month), hour: Number(p.hour) };
}

export const today = (): string => tirane().date;
export const nowIso = (): string => new Date().toISOString();

export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Whether a local wall-clock time 'YYYY-MM-DDTHH:MM' exists in Europe/Tirane: false for an
 * impossible date and inside the spring-forward gap (2027-03-28T02:30 never happens). Tirane is
 * UTC+1 or UTC+2, so the time exists iff one of those two instants shows it.
 */
export function wallTimeExists(dt: string): boolean {
  if (!DATETIME_RE.test(dt)) return false;
  const wall = Date.parse(dt + ':00Z');
  if (!Number.isFinite(wall)) return false;
  return [60, 120].some((off) => tirane(new Date(wall - off * 60_000)).dateTime === dt);
}

export function isDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return new Date(date + 'T00:00:00Z').getUTCDay();
}

/** Longest range any caller may expand night by night (booking horizon max 1100 days + margin). */
export const MAX_RANGE_DAYS = 1200;

/**
 * Nights of a stay: from (inclusive) to `to` (exclusive). Throws for a range longer than
 * MAX_RANGE_DAYS (defence in depth: every caller validates its own, much smaller, limit first;
 * an unbounded range from user input would otherwise keep the single thread busy).
 */
export function nights(from: string, to: string): string[] {
  if (to > from && daysBetween(from, to) > MAX_RANGE_DAYS) throw new RangeError(`date range too long: ${from}..${to}`);
  const out: string[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthDays(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function hhmm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Day key (Europe/Tirane) of an ISO instant. */
export function dayOf(iso: string): string {
  return tirane(new Date(iso)).date;
}
