/**
 * format.ts — money, numbers, dates and times for sq/en. Pure functions, server + client.
 * Chrome ships no Albanian Intl data, so nothing here calls Intl with an 'sq' locale:
 * Albanian names come from the tables below; digits are grouped by hand.
 * Europe/Tirane wall-clock parts use Intl with the 'en-GB' locale + timeZone (numbers only).
 */
import type { Lang } from './routes';

export const TZ = 'Europe/Tirane';
const NBSP = ' ';
const NNBSP = ' ';

export const MONTHS: Record<Lang, string[]> = {
  sq: ['janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor', 'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
export const MONTHS_SHORT: Record<Lang, string[]> = {
  sq: ['jan', 'shk', 'mar', 'pri', 'maj', 'qer', 'kor', 'gus', 'sht', 'tet', 'nën', 'dhj'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
/** Index 0 = Monday (ISO). */
export const WEEKDAYS: Record<Lang, string[]> = {
  sq: ['e hënë', 'e martë', 'e mërkurë', 'e enjte', 'e premte', 'e shtunë', 'e diel'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};
export const WEEKDAYS_SHORT: Record<Lang, string[]> = {
  sq: ['hën', 'mar', 'mër', 'enj', 'pre', 'sht', 'die'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};
/** One-letter column heads for calendars (Monday first). */
export const WEEKDAYS_MIN: Record<Lang, string[]> = {
  sq: ['H', 'M', 'M', 'E', 'P', 'S', 'D'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
};

/* ---------------- numbers ---------------- */

/** Group digits by hand: sq "6 500" (no-break space), en "6,500". */
export function number(n: number, lang: Lang, decimals = 0): string {
  if (!Number.isFinite(n)) return '—';
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const sep = lang === 'sq' ? NBSP : ',';
  const dec = lang === 'sq' ? ',' : '.';
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return (neg ? '−' : '') + grouped + (frac ? dec + frac : '');
}

export interface MoneyOpts { currency?: 'ALL' | 'EUR'; rate?: number; approx?: boolean }

/**
 * Lek amounts (whole lek). sq "6 500 lekë" · en "ALL 6,500".
 * currency 'EUR' with a rate (lek per euro): sq "≈ 65 €" · en "≈ €65".
 */
export function money(lek: number, lang: Lang, opts: MoneyOpts = {}): string {
  const { currency = 'ALL', rate } = opts;
  if (currency === 'EUR' && rate && rate > 0) {
    const eur = Math.round(lek / rate);
    return lang === 'sq' ? `≈${NBSP}${number(eur, lang)}${NBSP}€` : `≈${NBSP}€${number(eur, lang)}`;
  }
  if (lang === 'sq') return `${number(lek, 'sq')}${NBSP}lekë`;
  return `ALL${NBSP}${number(lek, 'en')}`;
}

/** Short lek for tight mono readouts: "6 500 L" / "ALL 6,500". */
export function moneyShort(lek: number, lang: Lang): string {
  return lang === 'sq' ? `${number(lek, 'sq')}${NBSP}L` : `ALL${NBSP}${number(lek, 'en')}`;
}

export function percent(n: number, lang: Lang): string {
  return lang === 'sq' ? `${number(n, lang)}${NNBSP}%` : `${number(n, lang)}%`;
}

/** Zero-padded count for mono readouts: 2 → "02". */
export function pad2(n: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(2, '0');
}

/* ---------------- dates ---------------- */

export interface YMD { y: number; m: number; d: number }

/** Parse 'YYYY-MM-DD' (or the date part of an ISO string) without time-zone drift. */
export function parseYMD(iso: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}
export function toISODate({ y, m, d }: YMD): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(p: YMD): number {
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0 = Sunday
  return (dow + 6) % 7;
}
export function addDays(iso: string, days: number): string {
  const p = parseYMD(iso);
  if (!p) return iso;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return toISODate({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}
export function daysBetween(fromIso: string, toIso: string): number {
  const a = parseYMD(fromIso), b = parseYMD(toIso);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export interface TiraneParts extends YMD { hh: number; mm: number; iso: string; time: string }

/** Wall-clock parts in Europe/Tirane for an instant (defaults to now). */
export function tirane(at: Date | string | number = new Date()): TiraneParts {
  const date = at instanceof Date ? at : new Date(at);
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts: Record<string, string> = {};
  for (const p of f.formatToParts(date)) parts[p.type] = p.value;
  const y = +parts.year, m = +parts.month, d = +parts.day, hh = +parts.hour % 24, mm = +parts.minute;
  return { y, m, d, hh, mm, iso: toISODate({ y, m, d }), time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}
export function todayISO(): string { return tirane().iso; }

/** 24 h time. Accepts 'HH:MM', an ISO datetime (shown in Tirane time) or a Date. */
export function time(v: string | Date): string {
  if (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v)) return v.padStart(5, '0');
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) return v.slice(11, 16); // naive local (Tirane) time
  return tirane(v).time;
}

export type DateStyle = 'long' | 'medium' | 'short' | 'day-month' | 'month-year' | 'weekday' | 'weekday-short' | 'numeric';

/**
 * sq long "e enjte, 23 tetor 2026" · medium "23 tetor 2026" · short "23 tet" · day-month "23 tetor"
 *    month-year "tetor 2026" · weekday "e enjte" · numeric "23.10.2026"
 * en long "Thursday 23 October 2026" · medium "23 October 2026" · short "23 Oct" · day-month "23 October"
 *    month-year "October 2026" · weekday "Thursday" · numeric "23/10/2026"
 */
export function formatDate(iso: string, lang: Lang, style: DateStyle = 'medium'): string {
  const p = parseYMD(iso);
  if (!p) return iso;
  const M = MONTHS[lang][p.m - 1], Ms = MONTHS_SHORT[lang][p.m - 1];
  const W = WEEKDAYS[lang][weekdayIndex(p)], Ws = WEEKDAYS_SHORT[lang][weekdayIndex(p)];
  switch (style) {
    case 'long': return lang === 'sq' ? `${W}, ${p.d} ${M} ${p.y}` : `${W} ${p.d} ${M} ${p.y}`;
    case 'medium': return `${p.d} ${M} ${p.y}`;
    case 'short': return `${p.d} ${Ms}`;
    case 'day-month': return `${p.d} ${M}`;
    case 'month-year': return lang === 'sq' ? `${M} ${p.y}` : `${M} ${p.y}`;
    case 'weekday': return W;
    case 'weekday-short': return Ws;
    case 'numeric': return lang === 'sq'
      ? `${String(p.d).padStart(2, '0')}.${String(p.m).padStart(2, '0')}.${p.y}`
      : `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`;
  }
}

/** "23–25 tetor 2026" · "30 tetor – 2 nëntor 2026" · across years in full. */
export function formatRange(fromIso: string, toIso: string, lang: Lang): string {
  const a = parseYMD(fromIso), b = parseYMD(toIso);
  if (!a || !b) return `${fromIso} – ${toIso}`;
  const M = MONTHS[lang];
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${M[a.m - 1]} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${M[a.m - 1]} – ${b.d} ${M[b.m - 1]} ${b.y}`;
  return `${formatDate(fromIso, lang, 'medium')} – ${formatDate(toIso, lang, 'medium')}`;
}

/** "sot" / "nesër" / "dje" (en today/tomorrow/yesterday), else the short date. */
export function relativeDay(iso: string, lang: Lang, today: string = todayISO()): string {
  const diff = daysBetween(today, iso.slice(0, 10));
  const words = lang === 'sq' ? { 0: 'sot', 1: 'nesër', [-1]: 'dje' } : { 0: 'today', 1: 'tomorrow', [-1]: 'yesterday' };
  return (words as Record<number, string>)[diff] ?? formatDate(iso, lang, 'short');
}

/** "2 netë" / "2 nights" and friends. */
export function plural(n: number, lang: Lang, forms: { sq: [string, string]; en: [string, string] }): string {
  const [one, many] = forms[lang];
  return `${number(n, lang)}${NBSP}${n === 1 ? one : many}`;
}
export const nights = (n: number, lang: Lang) => plural(n, lang, { sq: ['natë', 'netë'], en: ['night', 'nights'] });
export const guests = (n: number, lang: Lang) => plural(n, lang, { sq: ['person', 'persona'], en: ['guest', 'guests'] });
export const seats = (n: number, lang: Lang) => plural(n, lang, { sq: ['vend', 'vende'], en: ['seat', 'seats'] });

/* ---------------- coordinates ---------------- */

/** 40.9667 → "40°58′N". */
export function dms(value: number, axis: 'lat' | 'lon', withSeconds = false): string {
  const hemi = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.floor((abs - deg) * 60);
  let sec = Math.round(((abs - deg) * 60 - min) * 60);
  if (!withSeconds) {
    min = Math.round((abs - deg) * 60);
    if (min === 60) { deg += 1; min = 0; }
    return `${deg}°${String(min).padStart(2, '0')}′${hemi}`;
  }
  if (sec === 60) { sec = 0; min += 1; }
  if (min === 60) { min = 0; deg += 1; }
  return `${deg}°${String(min).padStart(2, '0')}′${String(sec).padStart(2, '0')}″${hemi}`;
}
export function coords(lat: number, lon: number, withSeconds = false): string {
  return `${dms(lat, 'lat', withSeconds)} ${dms(lon, 'lon', withSeconds)}`;
}

/** Compass point for a wind direction in degrees: sq uses V/J/L/P (veri, jug, lindje, perëndim). */
export function compass(deg: number, lang: Lang): string {
  const en = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const sq = ['V', 'VL', 'L', 'JL', 'J', 'JP', 'P', 'VP'];
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return (lang === 'sq' ? sq : en)[i];
}
