/**
 * Tiny in-memory cache for public, non-personal reads (catalog, month calendars) so a flood of
 * GETs does not keep the single SQLite thread busy. An entry lives at most TTL_MS AND only
 * while the database is unchanged: the key includes SQLite's total_changes() for this
 * connection (every write in this process goes through it), so a booking, a cancellation or an
 * admin edit shows up on the very next read.
 */
import { get } from './db/index';

const TTL_MS = 10_000;
const MAX = 500;

const G = globalThis as unknown as { __dvCache?: Map<string, { at: number; v: unknown }> };
const store = G.__dvCache ?? (G.__dvCache = new Map());

const version = () => Number(get<{ n: number }>('SELECT total_changes() AS n')?.n ?? 0);

export function cached<T>(key: string, compute: () => T): T {
  const k = `${version()}|${key}`;
  const now = Date.now();
  const hit = store.get(k);
  if (hit && now - hit.at < TTL_MS) return hit.v as T;
  const v = compute();
  if (store.size >= MAX) {
    for (const [kk, e] of store) if (now - e.at >= TTL_MS || !kk.startsWith(`${k.split('|')[0]}|`)) store.delete(kk);
    if (store.size >= MAX) store.clear();
  }
  store.set(k, { at: now, v });
  return v;
}
