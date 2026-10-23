/**
 * Date-range parsing for the assistant, Albanian and English, on accent-folded text.
 * Understands: "12-14 korrik", "nga 12 deri 14 korrik", "12 korrik - 14 korrik", "July 12-14",
 * "12/07 - 14/07", "2026-07-12 to 2026-07-14", "sonte", "nesër", "this weekend",
 * "e premte për 2 netë", "2 nights from Friday", "për një javë", plus guests ("2 persona", "3 people").
 */
import { fold } from '../text';
import { addDays, daysBetween, isDate, weekday } from '../time';

/**
 * problem: 'invalid' — a date was written that does not exist (30 shkurt, 31/02, 2026-02-30) or
 * an absurd year; 'order' — the end is not after the start (2026-11-01 to 2026-11-01, 14-12
 * korrik); 'past' — the start has passed (dje / yesterday, an explicit past date). The assistant
 * then asks again instead of answering for dates nobody asked about.
 */
export interface ParsedDates { from: string | null; to: string | null; nights: number | null; guests: number | null; explicit: boolean; problem: 'invalid' | 'order' | 'past' | null }

const MONTHS: [string, number][] = [
  ['january', 1], ['janar', 1], ['jan', 1], ['february', 2], ['shkurt', 2], ['feb', 2], ['march', 3], ['mars', 3], ['mar', 3],
  ['april', 4], ['prill', 4], ['apr', 4], ['may', 5], ['maj', 5], ['june', 6], ['qershor', 6], ['jun', 6], ['july', 7], ['korrik', 7], ['jul', 7],
  ['august', 8], ['gusht', 8], ['aug', 8], ['september', 9], ['shtator', 9], ['sept', 9], ['sep', 9], ['october', 10], ['tetor', 10], ['oct', 10],
  ['november', 11], ['nentor', 11], ['nov', 11], ['december', 12], ['dhjetor', 12], ['dec', 12],
];

export function monthOf(word: string): number | null {
  const w = word.toLowerCase();
  for (const [k, m] of MONTHS) {
    if (k.length <= 3 ? w === k || (w.startsWith(k) && w.length <= k.length + 1) : w.startsWith(k)) return m;
  }
  return null;
}

const NUM_WORDS: Record<string, number> = {
  one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  nje: 1, dy: 2, tre: 3, tri: 3, kater: 4, pese: 5, gjashte: 6, shtate: 7, tete: 8, nente: 9, dhjete: 10,
};
const num = (s: string): number | null => (/^\d+$/.test(s) ? Number(s) : NUM_WORDS[s] ?? null);

const WEEKDAYS: [RegExp, number][] = [
  [/\b(e )?hene?n?\b|\bmonday\b|\bmon\b/, 1],
  [/\b(e )?marte?n?\b|\btuesday\b/, 2],
  [/\b(e )?merkure?n?\b|\bwednesday\b/, 3],
  [/\b(e )?enjte?n?\b|\bthursday\b/, 4],
  [/\b(e )?premte?n?\b|\bfriday\b/, 5],
  [/\b(e )?shtune?n?\b|\bsaturday\b/, 6],
  [/\b(e )?diele?n?\b|\bsunday\b/, 0],
];

const MONTH_WORD = '([a-z]{3,9})';
const DAY = '(\\d{1,2})(?:st|nd|rd|th)?';
const SEP = '\\s*(?:-|–|—|deri ne|deri me|deri|to|until|till|through|and)\\s*';

function mkDate(y: number, m: number, d: number): string | null {
  const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isDate(s) ? s : null;
}

/** Explicit years further than this from today's are ignored (nobody books for 0001 or 9999). */
const YEAR_SPAN = 2;
const yearOk = (y: number, today: string) => Math.abs(y - Number(today.slice(0, 4))) <= YEAR_SPAN;

/** A day/month without a year: this year, or next year if already past. */
function resolve(today: string, m: number, d: number, y?: number): string | null {
  const year = y ? (y < 100 ? 2000 + y : y) : Number(today.slice(0, 4));
  if (!yearOk(year, today)) return null;
  const s = mkDate(year, m, d);
  if (!s) return null;
  if (!y && s < today) return mkDate(year + 1, m, d);
  return s;
}

export function parseDates(text: string, today: string): ParsedDates {
  const t = ' ' + fold(text).replace(/[,!?]/g, ' ').replace(/\s+/g, ' ') + ' ';
  // Initialised through a cast so control-flow narrowing survives the closures below.
  let from = null as string | null;
  let to = null as string | null;
  let invalid = false;
  let order = false;
  let m: RegExpExecArray | null;
  /** resolve(), remembering a date that was clearly meant but does not exist. */
  const res = (base: string, mo: number, d: number, y?: number): string | null => {
    const r = resolve(base, mo, d, y);
    if (!r) invalid = true;
    return r;
  };
  /** Second day of a same-month range ("12-14 korrik"): same year as the start, must be after it. */
  const sameMonthEnd = (start: string, mo: number, d: number): string | null => {
    const r = mkDate(Number(start.slice(0, 4)), mo, d);
    if (!r) { invalid = true; return null; }
    if (r <= start) { order = true; return null; }
    return r;
  };

  // ISO dates (any ISO-shaped token that is not a real date, or has an absurd year, is a problem)
  const isoAll = [...t.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map((x) => x[1]);
  const iso = isoAll.filter((s) => isDate(s) && yearOk(Number(s.slice(0, 4)), today));
  if (iso.length !== isoAll.length) invalid = true;
  if (iso.length) {
    from = iso[0]; to = iso[1] ?? null;
    if (to && to <= from) { order = true; to = null; }
  }

  // d/m(/y) or d.m(.y) — only what looks like a date (day ≤ 31, month ≤ 12) counts, so "12.30"
  // (a time) is not taken for one.
  if (!from && !invalid) {
    const nums = [...t.matchAll(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/g)]
      .filter((x) => Number(x[1]) >= 1 && Number(x[1]) <= 31 && Number(x[2]) >= 1 && Number(x[2]) <= 12);
    const ds = nums.map((x) => res(today, Number(x[2]), Number(x[1]), x[3] ? Number(x[3]) : undefined));
    if (ds.length && ds.every(Boolean)) { from = ds[0]; to = ds[1] ?? null; }
  }

  const each = (re: string, fn: (x: RegExpExecArray) => boolean) => {
    for (const x of t.matchAll(new RegExp(re, 'g'))) if (fn(x as RegExpExecArray)) return;
  };
  // "12 korrik - 14 korrik" / "12 july to 14 august"
  if (!from && !invalid) each(`\\b${DAY}\\s+${MONTH_WORD}${SEP}${DAY}\\s+${MONTH_WORD}`, (x) => {
    const m1 = monthOf(x[2]); const m2 = monthOf(x[4]);
    if (!m1 || !m2) return false;
    from = res(today, m1, Number(x[1])); to = from ? res(from, m2, Number(x[3])) : null;
    if (!from || !to) { from = null; to = null; return true; }
    return true;
  });
  // "12-14 korrik" / "nga 12 deri 14 korrik"
  if (!from && !invalid && !order) each(`\\b${DAY}${SEP}${DAY}\\s+(?:e |te |i )?${MONTH_WORD}`, (x) => {
    const mo = monthOf(x[3]);
    if (!mo) return false;
    from = res(today, mo, Number(x[1])); to = from ? sameMonthEnd(from, mo, Number(x[2])) : null;
    if (!to) from = null;
    return true;
  });
  // "July 12-14" / "july 12 to 15"
  if (!from && !invalid && !order) each(`\\b${MONTH_WORD}\\s+${DAY}${SEP}${DAY}\\b`, (x) => {
    const mo = monthOf(x[1]);
    if (!mo) return false;
    from = res(today, mo, Number(x[2])); to = from ? sameMonthEnd(from, mo, Number(x[3])) : null;
    if (!to) from = null;
    return true;
  });
  // single "12 korrik" / "july 12"
  if (!from && !invalid && !order) each(`\\b${DAY}\\s+(?:e |te )?${MONTH_WORD}`, (x) => {
    const mo = monthOf(x[2]);
    if (!mo) return false;
    from = res(today, mo, Number(x[1]));
    return true;
  });
  if (!from && !invalid && !order) each(`\\b${MONTH_WORD}\\s+${DAY}\\b`, (x) => {
    const mo = monthOf(x[1]);
    if (!mo) return false;
    from = res(today, mo, Number(x[2]));
    return true;
  });

  // Relative words
  let weekend = false;
  let past = false;
  if (!from && !invalid && !order) {
    if (/\b(dje|pardje|yesterday)\b/.test(t)) { from = addDays(today, -1); past = true; }
    else if (/\b(pasneser|day after tomorrow)\b/.test(t)) from = addDays(today, 2);
    else if (/\b(neser|tomorrow)\b/.test(t)) from = addDays(today, 1);
    else if (/\b(sot|sonte|today|tonight)\b/.test(t)) from = today;
    else if (/\b(fundjav\w*|weekend)\b/.test(t)) {
      const wd = weekday(today);
      const toFri = (5 - wd + 7) % 7;
      from = wd === 6 ? today : wd === 0 ? addDays(today, 5) : addDays(today, toFri);
      weekend = true;
    } else {
      for (const [re, d] of WEEKDAYS) {
        if (re.test(t)) {
          const wd = weekday(today);
          from = addDays(today, (d - wd + 7) % 7);
          break;
        }
      }
    }
  }

  // Nights and guests
  let nights: number | null = null;
  if ((m = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|nje|dy|tre|tri|kater|pese|gjashte|shtate|tete|nente|dhjete)\s*(?:net|nete|nate|nata|naten|night|nights)\b/.exec(t))) nights = num(m[1]);
  else if (/\b(nje jave|a week|one week|1 week|1 jave)\b/.test(t)) nights = 7;
  else if (/\b(sonte|tonight)\b/.test(t)) nights = 1;
  let guests: number | null = null;
  if ((m = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|nje|dy|tre|tri|kater|pese|gjashte|shtate|tete|nente|dhjete)\s*(?:persona|person|personat|vete|veta|njerez|people|persons|guests|guest|adults|adult|te rritur|pax)\b/.exec(t))) guests = num(m[1]);

  if (from && to && to <= from) { order = true; to = null; }
  if (from && from < today) past = true;
  const problem = invalid ? 'invalid' : order ? 'order' : past ? 'past' : null;
  if (problem) return { from: problem === 'past' ? from : null, to: null, nights: null, guests, explicit: true, problem };
  if (from && !to) {
    const n = nights ?? (weekend ? 2 : 1);
    to = addDays(from, n);
  }
  if (from && to) nights = daysBetween(from, to);
  return { from, to, nights, guests, explicit: !!from, problem: null };
}
