/**
 * booking/server.ts — server-side data for the booking widgets (T4). Reads only, through T1's
 * lib (availability.ts, pricing rules) so the first paint of a calendar shows exactly what
 * GET /api/availability/... returns; the client (src/scripts/booking.ts) takes over from there.
 *
 * Day cells: { date, status, price?, seats? }
 *   status 'past' | 'open' | 'full' | 'closed' | 'none' (no session that day) | 'far' (beyond the
 *   booking horizon). Room counts are never sent to the page (rooms_verified rule, PLAN §2);
 *   seats left are real numbers from the sessions table.
 */
import { all, get } from '../../lib/db/index';
import { roomMonth, roomNights, sessionsMonth, nextSessions, type SessionInfo } from '../../lib/availability';
import { getSetting } from '../../lib/db/repo/settings';
import { listProducts, type Product } from '../../lib/db/repo/products';
import { addDays, tirane } from '../../lib/time';
import { daysBetween } from '../../i18n/format';

export type DayStatus = 'past' | 'open' | 'full' | 'closed' | 'none' | 'far';
export interface DayCell { date: string; status: DayStatus; price?: number; seats?: number }
export interface SessionCell { id: number; date: string; time: string; left: number; status: SessionInfo['status']; note: string | null }

export const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const todayLocal = (): string => tirane().date;
export const ymOf = (d: string) => d.slice(0, 7);
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Furthest arrival date sold online (settings.inventory.booking_horizon_days, T1 pricing rule). */
export function horizonDate(): string {
  const days = getSetting('inventory').booking_horizon_days || 548;
  return addDays(todayLocal(), days);
}
export const maxNights = 30; // pricing.ts MAX_NIGHTS
export function maxPeoplePerSlot(): number {
  return getSetting('inventory').max_people_per_session_line || 10;
}

/** A month param from the URL, clamped to [this month, last]; anything else → fallback. */
export function pickMonth(param: string | null | undefined, fallback: string, last: string): string {
  const first = ymOf(todayLocal());
  const v = param && YM_RE.test(param) ? param : fallback;
  if (v < first) return first;
  if (v > last) return last;
  return v;
}

/** Monday-first weeks of a month: null = padding cell. */
export function monthWeeks(ym: string): (string | null)[][] {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= last; d++) cells.push(`${ym}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Room calendar for one room type (same shape as the API's `days`, units never exposed). */
export function roomDays(p: Product, ym: string): DayCell[] {
  const far = horizonDate();
  return roomMonth(p, ym).map((d) => ({
    date: d.date,
    status: d.status === 'open' && d.date > far ? 'far' : d.status,
    ...(d.status === 'open' && d.date <= far ? { price: d.price } : {}),
  }));
}

/** Stay search calendar: a day is open when any room type has a room; price = the lowest open one. */
export function stayDays(rooms: Product[], ym: string): DayCell[] {
  const per = rooms.map((r) => roomDays(r, ym));
  if (!per.length) return [];
  return per[0].map((d, i) => {
    const open = per.map((list) => list[i]).filter((x) => x.status === 'open');
    if (open.length) return { date: d.date, status: 'open' as const, price: Math.min(...open.map((x) => x.price ?? Infinity)) };
    const statuses = per.map((list) => list[i].status);
    const status: DayStatus = statuses.includes('past') ? 'past' : statuses.includes('far') ? 'far' : statuses.every((s) => s === 'closed') ? 'closed' : 'full';
    return { date: d.date, status };
  });
}

/** Experience calendar: seats free per day (open sessions only) + the sessions themselves. */
export function experienceMonth(p: Product, ym: string): { days: DayCell[]; sessions: SessionCell[] } {
  const list = sessionsMonth(p, ym);
  const notes = new Map<number, string | null>();
  if (list.length) {
    for (const r of all<{ id: number; note: string | null }>(`SELECT id, note FROM sessions WHERE id IN (${list.map(() => '?').join(',')})`, ...list.map((s) => s.id))) notes.set(r.id, r.note);
  }
  const sessions: SessionCell[] = list.map((s) => ({ id: s.id, date: s.date, time: s.time, left: s.left, status: s.status, note: lightNote(notes.get(s.id) ?? null) }));
  const today = todayLocal();
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days: DayCell[] = [];
  for (let d = 1; d <= last; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    const mine = sessions.filter((s) => s.date === date);
    if (date < today) { days.push({ date, status: 'past' }); continue; }
    if (!mine.length) { days.push({ date, status: 'none' }); continue; }
    const open = mine.filter((s) => s.status === 'open');
    if (open.length) days.push({ date, status: 'open', seats: open.reduce((n, s) => n + s.left, 0) });
    else if (mine.every((s) => s.status === 'past')) days.push({ date, status: 'past' });
    else days.push({ date, status: mine.some((s) => s.status === 'full') ? 'full' : 'closed' });
  }
  return { days, sessions };
}

/** Only the light-linked keys are public; staff free-text notes never reach the page. */
const lightNote = (n: string | null) => (n === 'sunrise' || n === 'sunset' ? n : null);

/** The month of the last session on sale (experience calendars stop there). */
export function lastSessionMonth(p: Product): string {
  const r = get<{ m: string | null }>("SELECT MAX(starts_at) AS m FROM sessions WHERE product_id = ? AND status = 'open'", p.id);
  const fallback = addMonths(ymOf(todayLocal()), 2);
  return r?.m ? (r.m.slice(0, 7) > fallback ? r.m.slice(0, 7) : fallback) : fallback;
}

/** First night from today (within `days`) with a room of this type free: its date and price. */
export function nextFreeNight(p: Product, days = 60): { night: string; price: number } | null {
  const from = todayLocal();
  const hit = roomNights(p, from, addDays(from, days)).find((n) => n.left > 0 && !n.closed);
  return hit ? { night: hit.night, price: hit.price } : null;
}

/** Next bookable session (for "from" lines and JSON-LD). */
export const nextSession = (p: Product): SessionInfo | null => nextSessions(p.id, 1)[0] ?? null;

/**
 * "Best rate when you book direct" may be claimed only after the owner confirms it
 * (NEEDS_VERIFICATION). There is no admin field for it yet: this reads an optional settings row
 * key 'booking' → { best_rate_direct: true } and defaults to false.
 */
export function bestRateConfirmed(): boolean {
  try {
    const r = get<{ value: string }>("SELECT value FROM settings WHERE key = 'booking'");
    return !!r && JSON.parse(r.value)?.best_rate_direct === true;
  } catch { return false; }
}

/** Published room types in sort order. */
export const publishedRooms = (): Product[] => listProducts({ kind: 'room' });

/** UTC offset of Europe/Tirane at a local wall-clock time, as "+01:00" / "+02:00" (JSON-LD). */
export function tiraneOffset(localDateTime: string): string {
  const wall = Date.parse(localDateTime.length === 16 ? `${localDateTime}:00Z` : `${localDateTime}T12:00:00Z`);
  for (const off of [120, 60]) {
    const t = tirane(new Date(wall - off * 60_000));
    if (`${t.date}T${t.time}` === (localDateTime.length === 16 ? localDateTime : `${localDateTime}T12:00`)) return `+0${off / 60}:00`;
  }
  return '+01:00';
}

/** Valid stay range from URL params (nga/deri), else null. */
export function rangeFromParams(from: string | null, to: string | null): { from: string; to: string } | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!from || !to || !re.test(from) || !re.test(to) || to <= from) return null;
  if (from < todayLocal() || from > horizonDate() || daysBetween(from, to) > maxNights) return null;
  return { from, to };
}

/** Duration "2 orë 30 min" / "2 h 30 min". */
export function duration(min: number | null, lang: 'sq' | 'en'): string {
  if (!min) return '';
  const h = Math.floor(min / 60), r = min % 60;
  return lang === 'sq'
    ? [h ? `${h} orë` : '', r ? `${r} min` : ''].filter(Boolean).join(' ')
    : [h ? `${h} h` : '', r ? `${r} min` : ''].filter(Boolean).join(' ');
}
