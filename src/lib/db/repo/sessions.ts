/** sessions: dated departures of an experience with a seat capacity. */
import { all, get, run, type Param } from '../index';

export type SessionStatus = 'open' | 'closed' | 'cancelled';
export interface Session { id: number; product_id: number; starts_at: string; capacity: number; booked: number; status: SessionStatus; note: string | null }

export const getSession = (id: number) => get<Session>('SELECT * FROM sessions WHERE id = ?', id);

export function listSessions(f: { product_id?: number; from?: string; to?: string; status?: SessionStatus } = {}): Session[] {
  const w: string[] = [];
  const p: Param[] = [];
  if (f.product_id) { w.push('product_id = ?'); p.push(f.product_id); }
  if (f.from) { w.push('starts_at >= ?'); p.push(f.from); }
  if (f.to) { w.push('starts_at < ?'); p.push(f.to); }
  if (f.status) { w.push('status = ?'); p.push(f.status); }
  return all<Session>(`SELECT * FROM sessions ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY starts_at, product_id`, ...p);
}

export function createSession(s: { product_id: number; starts_at: string; capacity: number; status?: SessionStatus; note?: string | null }): number | null {
  const r = run(
    'INSERT OR IGNORE INTO sessions (product_id, starts_at, capacity, status, note) VALUES (?, ?, ?, ?, ?)',
    s.product_id, s.starts_at, s.capacity, s.status ?? 'open', s.note ?? null,
  );
  return r.changes ? r.id : null;
}

export function updateSession(id: number, patch: Partial<Pick<Session, 'starts_at' | 'capacity' | 'status' | 'note'>>): boolean {
  const cur = getSession(id);
  if (!cur) return false;
  const n = { ...cur, ...patch };
  run('UPDATE sessions SET starts_at = ?, capacity = ?, status = ?, note = ? WHERE id = ?', n.starts_at, n.capacity, n.status, n.note ?? null, id);
  return true;
}

/** Delete only when nobody booked; otherwise the caller should cancel instead. */
export function deleteSession(id: number): 'deleted' | 'has_bookings' | 'missing' {
  const s = getSession(id);
  if (!s) return 'missing';
  if (s.booked > 0) return 'has_bookings';
  run('DELETE FROM sessions WHERE id = ?', id);
  return 'deleted';
}
