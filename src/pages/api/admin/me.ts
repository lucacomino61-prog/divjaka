import type { APIRoute } from 'astro';
import { handle, json } from '../../../lib/http';
import { requireAdmin } from '../../../lib/auth';
import { cardMode, paymentWarnings, testPaymentsAllowed } from '../../../lib/payments/mode';
import { pokConfigured } from '../../../lib/payments/pok';
import { claudeEnabled } from '../../../lib/assistant/claude';
import { configuredOrigin } from '../../../lib/urls';
import { loginCeilingHitAt, proxyWarning, rateFactorWarning } from '../../../lib/security';
import { lastPaymentDetailsChange } from '../../../lib/audit';
import { heldSince, surgeLimits } from '../../../lib/orders';
import { getSetting } from '../../../lib/db/repo/settings';
import { liveContactMissing } from '../../../lib/live';

/**
 * GET /api/admin/me → { user, env: { card_mode, pok_configured, test_payments, claude, site_url,
 *   warnings[], pending_last_hour, held_last_hour:{orders, roomNights, seats, units},
 *   surge_limits:{roomNights, seats, units}, payment_details_changed_at, login_ceiling_hit_at } }
 * warnings (show them on the dashboard): site_url_missing, bank_without_iban, card_live_without_pok,
 * card_test_mode_hidden, test_payments_enabled, proxy_not_trusted,
 * rate_limit_factor_set (RATE_LIMIT_FACTOR on a production server: every limit is multiplied),
 * pending_surge (in the last hour unconfirmed pay-at-hotel / bank orders reached
 *   settings.inventory.pending_alert_per_hour, or took half of a surge threshold in room-nights,
 *   seats or units — check them, someone may be holding inventory with fake bookings; POST
 *   /api/admin/orders/cancel-unconfirmed cancels them in one go),
 * payment_details_changed (IBAN / beneficiary / bank / SWIFT changed in the last 7 days — check
 *   that it was you; the audit log has who, when and the last 4 IBAN characters),
 * live_contact_missing (MET Norway gets no contact e-mail: set LIVE_CONTACT or confirm business.email),
 * login_ceiling_hit (in the last hour so many wrong passwords arrived that sign-ins from new
 *   browsers were refused for a while; remembered browsers kept working).
 */
export const GET: APIRoute = handle(async ({ locals }) => {
  const user = requireAdmin(locals);
  const site = configuredOrigin();
  const held = heldSince(new Date(Date.now() - 3600_000).toISOString());
  const lim = surgeLimits();
  const surge = held.orders >= (getSetting('inventory').pending_alert_per_hour || 5)
    || held.roomNights >= lim.roomNights / 2 || held.seats >= lim.seats / 2 || held.units >= lim.units / 2;
  const changedAt = lastPaymentDetailsChange();
  const recentChange = !!changedAt && Date.now() - Date.parse(changedAt) < 7 * 86_400_000;
  const ceilingAt = loginCeilingHitAt();
  const ceilingRecent = ceilingAt > 0 && Date.now() - ceilingAt < 3600_000;
  const warnings = [
    ...(site ? [] : ['site_url_missing']),
    ...paymentWarnings(),
    ...(proxyWarning() ? ['proxy_not_trusted'] : []),
    ...(rateFactorWarning() ? ['rate_limit_factor_set'] : []),
    ...(surge ? ['pending_surge'] : []),
    ...(recentChange ? ['payment_details_changed'] : []),
    ...(ceilingRecent ? ['login_ceiling_hit'] : []),
    // MET Norway (weather on /tani/ and the home log) wants a contact in the User-Agent (T7)
    ...(liveContactMissing() ? ['live_contact_missing'] : []),
  ];
  return json({
    user,
    env: {
      card_mode: cardMode(), pok_configured: pokConfigured(), test_payments: testPaymentsAllowed(), claude: claudeEnabled(), site_url: site, warnings,
      pending_last_hour: held.orders, held_last_hour: held, surge_limits: lim,
      payment_details_changed_at: recentChange ? changedAt : null,
      login_ceiling_hit_at: ceilingRecent ? new Date(ceilingAt).toISOString() : null,
    },
  });
});
