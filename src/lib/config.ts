/** Public subset of settings, for pages (SSR) and GET /api/config. Placeholder fields are left out. */
import { getSetting } from './db/repo/settings';
import { paymentAvailability } from './payments/mode';

export function publicConfig() {
  const b = getSetting('business');
  const placeholders = new Set(b.placeholders ?? []);
  const business: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(b)) {
    if (k === 'placeholders' || placeholders.has(k) || v === '' || v === null) continue;
    business[k] = v as string | number;
  }
  const cur = getSetting('currency');
  const pay = getSetting('payments');
  const avail = paymentAvailability();
  return {
    business,
    social: Object.fromEntries(Object.entries(getSetting('social')).filter(([, v]) => !!v)),
    // card: usable now (false when mode is 'live' without POK keys, or 'test' where test
    // payments are not allowed); bank.enabled: only with an IBAN and a beneficiary.
    payments: { ...avail, bank: { enabled: avail.bank, bank_name: pay.bank_name || null, iban_set: !!pay.iban } },
    currency: { eur_rate: cur.eur_rate, eur_rate_date: cur.eur_rate_date || null },
  };
}
