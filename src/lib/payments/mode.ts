/**
 * Which payment methods can actually be used right now (settings + environment).
 *
 *   hotel  settings.payments.methods.hotel
 *   bank   methods.bank AND an IBAN and a beneficiary are filled in (else the customer would
 *          get an order they cannot pay)
 *   card   methods.card AND
 *            mode 'live' → POK keys present            → 'pok'
 *            mode 'test' → test payments allowed here  → 'test'  (TEST simulator)
 *            otherwise                                 → 'off'   (card hidden, checkout refuses it)
 *
 * Test payments are allowed only on the dev server or when ALLOW_TEST_PAYMENTS=1 is set
 * explicitly (never by default in a production build), because the simulator lets the
 * customer mark their own order paid.
 */
import { getSetting, type PaymentSettings } from '../db/repo/settings';
import { pokConfigured } from './pok';

export type CardMode = 'pok' | 'test' | 'off';

export const testPaymentsAllowed = (): boolean => import.meta.env.DEV || process.env.ALLOW_TEST_PAYMENTS === '1';

export function cardMode(p: PaymentSettings = getSetting('payments')): CardMode {
  if (p.mode === 'live') return pokConfigured() ? 'pok' : 'off';
  return testPaymentsAllowed() ? 'test' : 'off';
}

export const bankConfigured = (p: PaymentSettings = getSetting('payments')): boolean => !!(p.iban?.trim() && p.beneficiary?.trim());

export interface PaymentAvailability { hotel: boolean; bank: boolean; card: boolean; card_mode: CardMode }

export function paymentAvailability(): PaymentAvailability {
  const p = getSetting('payments');
  const mode = cardMode(p);
  return {
    hotel: !!p.methods.hotel,
    bank: !!p.methods.bank && bankConfigured(p),
    card: !!p.methods.card && mode !== 'off',
    card_mode: mode,
  };
}

/** Setup problems the owner should see in the admin (GET /api/admin/me → env.warnings). */
export function paymentWarnings(): string[] {
  const p = getSetting('payments');
  const w: string[] = [];
  if (p.methods.bank && !bankConfigured(p)) w.push('bank_without_iban');
  if (p.methods.card && p.mode === 'live' && !pokConfigured()) w.push('card_live_without_pok');
  if (p.methods.card && p.mode === 'test' && !testPaymentsAllowed()) w.push('card_test_mode_hidden');
  if (!import.meta.env.DEV && process.env.ALLOW_TEST_PAYMENTS === '1') w.push('test_payments_enabled');
  return w;
}
