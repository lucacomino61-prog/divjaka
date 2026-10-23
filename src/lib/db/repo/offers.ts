/** offers: automatic offers (code NULL) and promo codes. */
import { all, get, run, parseJson, toJson, type Param } from '../index';

export interface OfferScope { kinds?: string[]; categories?: string[]; products?: (string | number)[] }
export interface Offer {
  id: number; name_sq: string | null; name_en: string | null; type: 'percent' | 'fixed'; value: number;
  scope: OfferScope; min_nights: number | null; min_total: number | null; starts_on: string | null; ends_on: string | null;
  code: string | null; max_uses: number | null; used: number; active: boolean; demo: boolean;
}

type OfferRow = Omit<Offer, 'scope' | 'active' | 'demo'> & { scope: string; active: number; demo: number };
const map = (r: OfferRow): Offer => ({ ...r, scope: parseJson<OfferScope>(r.scope, {}), active: !!r.active, demo: !!r.demo });

export const listOffers = (): Offer[] => all<OfferRow>('SELECT * FROM offers ORDER BY code IS NOT NULL, id').map(map);
export const automaticOffers = (): Offer[] => all<OfferRow>('SELECT * FROM offers WHERE code IS NULL AND active = 1 ORDER BY id').map(map);
export const getOffer = (id: number): Offer | undefined => { const r = get<OfferRow>('SELECT * FROM offers WHERE id = ?', id); return r ? map(r) : undefined; };
export const offerByCode = (code: string): Offer | undefined => {
  const r = get<OfferRow>('SELECT * FROM offers WHERE code = ? COLLATE NOCASE', code.trim());
  return r ? map(r) : undefined;
};

export type OfferInput = Omit<Offer, 'id' | 'used' | 'demo'> & { used?: number; demo?: boolean };
const COLS = ['name_sq', 'name_en', 'type', 'value', 'scope', 'min_nights', 'min_total', 'starts_on', 'ends_on', 'code', 'max_uses', 'used', 'active', 'demo'] as const;

function val(k: string, v: unknown): Param {
  if (k === 'scope') return toJson(v ?? {});
  if (k === 'active' || k === 'demo') return v ? 1 : 0;
  if (k === 'code') return v ? String(v).trim().toUpperCase() : null;
  return (v ?? null) as Param;
}

export function createOffer(o: OfferInput): number {
  const cols = COLS.filter((c) => (o as Record<string, unknown>)[c] !== undefined);
  return run(`INSERT INTO offers (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map((c) => val(c, (o as Record<string, unknown>)[c]))).id;
}

export function updateOffer(id: number, patch: Partial<OfferInput>): boolean {
  const cols = COLS.filter((c) => (patch as Record<string, unknown>)[c] !== undefined);
  if (!cols.length) return !!getOffer(id);
  return run(`UPDATE offers SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...cols.map((c) => val(c, (patch as Record<string, unknown>)[c])), id).changes > 0;
}

export const deleteOffer = (id: number) => run('DELETE FROM offers WHERE id = ?', id).changes > 0;
