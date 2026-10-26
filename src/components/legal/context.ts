/**
 * context.ts — the live values the legal drafts quote (T7): controller details only when the
 * owner confirmed them (placeholders never shown), retention days and hold times from settings,
 * the payment methods on, and whether the AI fallback of the assistant can run.
 */
import { getSetting } from '../../lib/db/repo/settings';
import { paymentAvailability } from '../../lib/payments/mode';
import type { LegalContext } from './content';

export async function legalContext(lang: 'sq' | 'en' = 'sq'): Promise<LegalContext> {
  const b = getSetting('business');
  const ph = new Set(b.placeholders ?? []);
  const ok = (k: keyof typeof b) => (typeof b[k] === 'string' && (b[k] as string).trim() && !ph.has(k as string) ? String(b[k]) : '');
  const pay = getSetting('payments');
  const priv = getSetting('privacy');
  const inv = getSetting('inventory');
  const asst = getSetting('assistant');
  return {
    controller: { name: b.name || 'Hotel Pelikan', legal: ok('legal_name'), nipt: ok('nipt'), address: ok(lang === 'en' ? 'address_en' : 'address_sq') || ok('address') },
    // the values lib/retention.ts really applies: events at least 30 days (0 → 180), messages and
    // dead orders 0 = kept (null here), dead orders at least 30 days
    privacy: (() => {
      const ev = Number(priv.events_days) || 180, msg = Number(priv.messages_days) || 0, ord = Number(priv.orders_days) || 0;
      return { events_days: Math.max(30, ev), messages_days: msg > 0 ? msg : null, orders_days: ord > 0 ? Math.max(30, ord) : null };
    })(),
    holds: { card_min: pay.card_hold_minutes ?? 30, bank_h: pay.bank_hold_hours ?? 72, hotel_h: pay.hotel_hold_hours ?? 24, short_h: inv.short_hold_hours ?? 2 },
    // the same rule as /api/config: what checkout really offers right now
    methods: (() => { const a = paymentAvailability(); return { hotel: !!a.hotel, bank: !!a.bank, card: !!a.card }; })(),
    ai: !!process.env.ANTHROPIC_API_KEY && asst.use_claude !== false,
  };
}
