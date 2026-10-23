/**
 * Promo-code guessing limit: at most 10 failed codes per address (IPv6 per /64) in 10 minutes.
 * After that, codes are not looked up at all until the window ends (quote: the code is reported
 * invalid with a "too many tries" message; checkout: 429 promo_rate). Valid codes never count.
 */
import { ApiError } from './http';
import { rateCount, rateFactor, rateLimit } from './security';

const MAX = 10;
const WINDOW = 10 * 60_000;

export const PROMO_TOO_MANY = {
  sq: 'Shumë kode të pasakta. Provoni përsëri pas 10 minutash.',
  en: 'Too many invalid codes. Please try again in 10 minutes.',
};

export const promoBlocked = (ip: string): boolean => rateCount('promo-fail', ip) >= MAX * rateFactor();

export function promoFailed(ip: string): void {
  try { rateLimit('promo-fail', ip, MAX, WINDOW); } catch { /* already blocked */ }
}

/** Checkout: refuse a promo code while the address is blocked; returns the code to use. */
export function promoGate(ip: string, promo: string | null | undefined): string | null | undefined {
  if (promo && promoBlocked(ip)) throw new ApiError(429, 'promo_rate', PROMO_TOO_MANY.sq, PROMO_TOO_MANY.en, { retry_after: 600 });
  return promo;
}

export function promoResult(ip: string, ok: boolean): void {
  if (!ok) promoFailed(ip);
}
