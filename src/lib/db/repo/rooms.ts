/** room_rates + room_nights (rows created lazily). */
import { all, get, run } from '../index';

export interface RoomRate { id: number; product_id: number; date_from: string; date_to: string; price: number; note: string | null }
export interface RoomNight { product_id: number; night: string; booked: number; closed: number }

export const listRates = (productId?: number): RoomRate[] =>
  productId
    ? all<RoomRate>('SELECT * FROM room_rates WHERE product_id = ? ORDER BY date_from, id', productId)
    : all<RoomRate>('SELECT * FROM room_rates ORDER BY product_id, date_from, id');

export const getRate = (id: number) => get<RoomRate>('SELECT * FROM room_rates WHERE id = ?', id);

/** Rates overlapping [from, to] (inclusive). */
export const ratesBetween = (productId: number, from: string, to: string): RoomRate[] =>
  all<RoomRate>('SELECT * FROM room_rates WHERE product_id = ? AND date_to >= ? AND date_from <= ? ORDER BY id', productId, from, to);

export function createRate(r: Omit<RoomRate, 'id' | 'note'> & { note?: string | null }): number {
  return run('INSERT INTO room_rates (product_id, date_from, date_to, price, note) VALUES (?, ?, ?, ?, ?)', r.product_id, r.date_from, r.date_to, r.price, r.note ?? null).id;
}

export function updateRate(id: number, r: Partial<Omit<RoomRate, 'id'>>): boolean {
  const cur = getRate(id);
  if (!cur) return false;
  const n = { ...cur, ...r };
  run('UPDATE room_rates SET product_id = ?, date_from = ?, date_to = ?, price = ?, note = ? WHERE id = ?', n.product_id, n.date_from, n.date_to, n.price, n.note ?? null, id);
  return true;
}

export const deleteRate = (id: number) => run('DELETE FROM room_rates WHERE id = ?', id).changes > 0;

export const nightsBetween = (productId: number, from: string, toExclusive: string): RoomNight[] =>
  all<RoomNight>('SELECT * FROM room_nights WHERE product_id = ? AND night >= ? AND night < ? ORDER BY night', productId, from, toExclusive);

export const ensureNight = (productId: number, night: string) =>
  run('INSERT OR IGNORE INTO room_nights (product_id, night, booked, closed) VALUES (?, ?, 0, 0)', productId, night);
