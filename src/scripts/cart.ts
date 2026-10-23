/**
 * cart.ts — the cart store (localStorage 'dv-cart' = { v:1, items }). Prices are NEVER kept
 * here: every displayed total comes from POST /api/quote (src/lib/pricing.ts is the only price
 * authority). Emits window 'dv:cart' { count } after every change (also for other tabs).
 *
 *   import { addItem } from '../scripts/cart';
 *   addItem({ slug: 'dhome-dyshe', kind: 'room', qty: 1, from: '2026-11-02', to: '2026-11-04', guests: 2 }, { name: 'Dhomë dyshe' });
 */
import { toast } from './toast';
import { track } from './track';
import { tc } from '../i18n/client';

export type Kind = 'room' | 'experience' | 'bundle' | 'gift' | 'goods';
export interface CartItem {
  key: string; slug: string; kind: Kind; qty: number;
  from?: string; to?: string; session_id?: number; guests?: number; amount?: number;
}
export type NewItem = Omit<CartItem, 'key'> & { key?: string };
export interface Opts { toast?: boolean; name?: string; value?: number }

const KEY = 'dv-cart';
const MAX_QTY = 99;
const KINDS = new Set<Kind>(['room', 'experience', 'bundle', 'gift', 'goods']);

/** Same product + same dates/session/amount = same line (qty adds up). */
export function itemKey(i: Omit<CartItem, 'key' | 'qty'>): string {
  return [i.kind, i.slug, i.from ?? '', i.to ?? '', i.session_id ?? '', i.guests ?? '', i.amount ?? ''].join('|');
}

function clean(raw: unknown): CartItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.slug !== 'string' || !KINDS.has(r.kind as Kind)) return null;
  const item: CartItem = {
    key: '', slug: r.slug, kind: r.kind as Kind,
    qty: Math.min(MAX_QTY, Math.max(1, Math.trunc(Number(r.qty) || 1))),
  };
  if (typeof r.from === 'string') item.from = r.from;
  if (typeof r.to === 'string') item.to = r.to;
  if (Number.isFinite(Number(r.session_id)) && r.session_id != null) item.session_id = Number(r.session_id);
  if (Number.isFinite(Number(r.guests)) && r.guests != null) item.guests = Math.max(1, Math.trunc(Number(r.guests)));
  if (Number.isFinite(Number(r.amount)) && r.amount != null) item.amount = Math.max(0, Math.trunc(Number(r.amount)));
  item.key = typeof r.key === 'string' && r.key ? r.key : itemKey(item);
  return item;
}

export function getCart(): CartItem[] {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!data || data.v !== 1 || !Array.isArray(data.items)) return [];
    return data.items.map(clean).filter(Boolean) as CartItem[];
  } catch { return []; }
}

function save(items: CartItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, items })); } catch { /* private mode */ }
  emit(items);
}
function emit(items = getCart()) {
  window.dispatchEvent(new CustomEvent('dv:cart', { detail: { count: countOf(items) } }));
}

/*
 * Lines the server reported as no longer sold (quote problem 'unavailable': retired or unknown
 * slug). They stay in the cart until the visitor removes them (the drawer offers "Hiqe"), but
 * the header/drawer counts leave them out. Kept apart from 'dv-cart' (localStorage 'dv-cart-x',
 * an array of line keys) so the /api/quote item shape never changes; set after every quote.
 */
const GONE = 'dv-cart-x';
function goneKeys(): Set<string> {
  try { const a = JSON.parse(localStorage.getItem(GONE) || '[]'); return new Set(Array.isArray(a) ? a.filter((k) => typeof k === 'string') : []); }
  catch { return new Set(); }
}
/** Record which line keys the latest quote found unavailable (replaces the previous set). */
export function setUnavailable(keys: string[]) {
  const live = new Set(getCart().map((i) => i.key));
  const next = [...new Set(keys)].filter((k) => live.has(k)).sort();
  const prev = [...goneKeys()].sort();
  if (next.join('\n') === prev.join('\n')) return;
  try { next.length ? localStorage.setItem(GONE, JSON.stringify(next)) : localStorage.removeItem(GONE); } catch { /* private mode */ }
  emit();
}
export function isUnavailable(key: string): boolean { return goneKeys().has(key); }

function countOf(items: CartItem[]) {
  const gone = goneKeys();
  return items.reduce((n, i) => n + (gone.has(i.key) ? 0 : i.qty), 0);
}
export function count(): number { return countOf(getCart()); }

export function addItem(input: NewItem, opts: Opts = {}): CartItem | null {
  const item = clean(input);
  if (!item) return null;
  const items = getCart();
  const hit = items.find((i) => i.key === item.key);
  const before = hit ? { ...hit } : null;
  if (hit && (item.kind === 'goods' || item.kind === 'gift' || item.kind === 'bundle')) {
    hit.qty = Math.min(MAX_QTY, hit.qty + item.qty);
  } else if (hit) {
    Object.assign(hit, item); // a room/session line is replaced, not doubled
  } else {
    items.push(item);
  }
  save(items);
  track('add_to_cart', { product: item.slug, value: opts.value, meta: { kind: item.kind, qty: item.qty } });
  if (opts.toast !== false) {
    toast(opts.name ? `${tc('cart.added')} · ${opts.name}` : tc('cart.added'), {
      label: tc('cart.undo'),
      run: () => {
        const now = getCart();
        if (before) { save(now.map((i) => (i.key === item.key ? before : i))); return; }
        save(now.filter((i) => i.key !== item.key));
      },
    });
  }
  return item;
}

/** Removes a line; returns it and its position so a caller can offer its own undo (restoreItem). */
export function removeItem(key: string, opts: Opts = {}): { item: CartItem; index: number } | null {
  const items = getCart();
  const idx = items.findIndex((i) => i.key === key);
  if (idx < 0) return null;
  const [gone] = items.splice(idx, 1);
  save(items);
  track('remove_from_cart', { product: gone.slug, meta: { kind: gone.kind, qty: gone.qty } });
  if (opts.toast !== false) {
    toast(opts.name ? `${tc('cart.removed')} · ${opts.name}` : tc('cart.removed'), {
      label: tc('cart.undo'),
      run: () => restoreItem(gone, idx),
    });
  }
  return { item: gone, index: idx };
}

/** Undo a removal: put the line back at its old position (merged if it was added again since). */
export function restoreItem(item: CartItem, index: number) {
  const now = getCart();
  if (now.some((i) => i.key === item.key)) return;
  now.splice(Math.min(index, now.length), 0, item);
  save(now);
}

export function setQty(key: string, qty: number, opts: Opts = {}) {
  const items = getCart();
  const it = items.find((i) => i.key === key);
  if (!it) return;
  const q = Math.trunc(qty);
  if (q <= 0) { removeItem(key, opts); return; }
  it.qty = Math.min(MAX_QTY, q);
  save(items);
}

/** Patch a line (dates, guests, session). Recomputes its key. */
export function updateItem(key: string, patch: Partial<Omit<CartItem, 'key'>>) {
  const items = getCart();
  const i = items.findIndex((x) => x.key === key);
  if (i < 0) return;
  const next = clean({ ...items[i], ...patch, key: '' });
  if (!next) return;
  items[i] = next;
  save(items);
}

export function clear() { save([]); }

/** The body for POST /api/quote. */
export function quoteBody(lang: 'sq' | 'en', promo?: string) {
  return { lang, items: getCart(), ...(promo ? { promo } : {}) };
}

export function onChange(cb: (count: number, items: CartItem[]) => void): () => void {
  const h = () => { const items = getCart(); cb(countOf(items), items); };
  const s = (e: StorageEvent) => { if (e.key === KEY || e.key === GONE) { h(); } };
  window.addEventListener('dv:cart', h);
  window.addEventListener('storage', s);
  return () => { window.removeEventListener('dv:cart', h); window.removeEventListener('storage', s); };
}
