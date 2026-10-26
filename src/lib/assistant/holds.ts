/**
 * holds.ts — FAQ answers may name the hold times the owner sets in the admin: {card_min},
 * {bank_h}, {hotel_h}, {short_h} (settings.payments.*_hold_* and inventory.short_hold_hours).
 * They are filled in when the text is shown (assistant replies, site search snippets), so a
 * changed hold time never leaves an old deadline in the assistant next to the terms page.
 */
import { getSetting } from '../db/repo/settings';

export function faqText(text: string): string {
  if (!text || !text.includes('{')) return text;
  let vars: Record<string, number> = { card_min: 30, bank_h: 72, hotel_h: 24, short_h: 2 };
  try {
    const p = getSetting('payments');
    const inv = getSetting('inventory');
    vars = { card_min: p.card_hold_minutes || 30, bank_h: p.bank_hold_hours || 72, hotel_h: p.hotel_hold_hours || 24, short_h: inv.short_hold_hours || 2 };
  } catch { /* the defaults above (same as lib/orders.ts) */ }
  return text.replace(/\{(card_min|bank_h|hotel_h|short_h)\}/g, (_, k: string) => String(vars[k]));
}
