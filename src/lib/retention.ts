/**
 * Data retention (settings.privacy), run 1 minute after boot and then every 6 hours:
 *   events     days older than events_days (180) are rolled up into events_daily
 *              (day, type, product → count, distinct tabs, value sum) and the raw rows deleted;
 *   messages   handled messages (status 'done') older than messages_days (730) are deleted;
 *   sessions   expired admin sessions and remembered devices are deleted;
 *   audit_log  rows older than 2 years are deleted;
 *   orders     cancelled, never-paid orders older than orders_days (90) are anonymised and
 *              customers left without any order deleted (anonymiseDeadOrders);
 *   inventory_log  rows older than inventory_log_days (730) are deleted.
 * Raw rows are deleted in chunks of 5 000 with a pause between chunks, so a large backlog never
 * blocks checkout for long.
 */
import { get, run, tx } from './db/index';
import { getSetting } from './db/repo/settings';
import { addDays, nowIso, today } from './time';

const CHUNK = 5000;
const pause = () => new Promise<void>((r) => setTimeout(r, 25));

export async function runRetention(): Promise<{ events: number; messages: number }> {
  const priv = getSetting('privacy');
  const eventsDays = Math.max(30, Number(priv.events_days) || 180);
  const cutoffDay = addDays(today(), -eventsDays);
  // Roll up whole days not rolled up yet (a day already in events_daily is never recomputed, so
  // an interrupted delete cannot overwrite a full count with a partial one).
  tx(() => run(
    `INSERT OR IGNORE INTO events_daily (day, type, product_id, n, sids, value_sum)
     SELECT day, type, COALESCE(product_id, 0), COUNT(*), COUNT(DISTINCT sid), COALESCE(SUM(value), 0) FROM events
     WHERE day < ? AND day NOT IN (SELECT DISTINCT day FROM events_daily) GROUP BY day, type, COALESCE(product_id, 0)`,
    cutoffDay,
  ));
  let events = 0;
  for (;;) {
    const n = run('DELETE FROM events WHERE id IN (SELECT id FROM events WHERE day < ? LIMIT ?)', cutoffDay, CHUNK).changes;
    events += n;
    if (n < CHUNK) break;
    await pause();
  }
  let messages = 0;
  const msgDays = Number(priv.messages_days) || 0;
  if (msgDays > 0) {
    const cut = new Date(Date.now() - msgDays * 86_400_000).toISOString();
    messages = run("DELETE FROM messages WHERE status = 'done' AND created_at < ?", cut).changes;
  }
  const now = nowIso();
  run('DELETE FROM admin_sessions WHERE expires_at < ?', now);
  run('DELETE FROM admin_devices WHERE expires_at < ?', now);
  run('DELETE FROM audit_log WHERE ts < ?', new Date(Date.now() - 730 * 86_400_000).toISOString());
  const { orders, customers } = anonymiseDeadOrders(Number(priv.orders_days) || 0);
  let invLog = 0;
  const invDays = Number(priv.inventory_log_days) || 0;
  if (invDays > 0) invLog = run('DELETE FROM inventory_log WHERE ts < ?', new Date(Date.now() - Math.max(90, invDays) * 86_400_000).toISOString()).changes;
  if (events || messages || orders || customers || invLog) {
    console.info(`[retention] deleted ${events} raw events before ${cutoffDay} (rolled up), ${messages} old messages, ${invLog} inventory log rows; anonymised ${orders} dead orders, deleted ${customers} customers without orders`);
  }
  return { events, messages };
}

export const ANON_EMAIL = 'anonymised@invalid';

/**
 * Orders that never became real — cancelled (by the sweep or by staff) and never paid — keep a
 * typed name, e-mail and phone that may belong to someone who never booked (anyone can type
 * anyone's address into a checkout). After `days` they are anonymised: name, e-mail, phone,
 * country, notes and the customer link cleared, access token replaced (the link dies). Amounts,
 * items and dates stay for the statistics. Customers left with no order at all, no confirmed
 * marketing consent and no staff notes are then deleted. days = 0 keeps everything.
 */
export function anonymiseDeadOrders(days: number): { orders: number; customers: number } {
  if (!(days > 0)) return { orders: 0, customers: 0 };
  const cut = new Date(Date.now() - Math.max(30, days) * 86_400_000).toISOString();
  return tx(() => {
    const orders = run(
      `UPDATE orders SET name = '', email = ?, email_key = NULL, phone = NULL, phone_key = NULL, country = NULL, notes = NULL,
         customer_id = NULL, access_token = lower(hex(randomblob(32))), updated_at = ?
       WHERE status = 'cancelled' AND payment_status IN ('unpaid', 'failed') AND demo = 0
         AND COALESCE(cancelled_at, updated_at) < ? AND email != ?`,
      ANON_EMAIL, nowIso(), cut, ANON_EMAIL,
    ).changes;
    const customers = run(
      `DELETE FROM customers WHERE demo = 0 AND created_at < ? AND consent_at IS NULL AND (notes IS NULL OR notes = '')
         AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = customers.id)`,
      cut,
    ).changes;
    return { orders, customers };
  });
}

/** Timer (one per process; replaced on dev reloads). */
export function startRetention(): void {
  const G = globalThis as unknown as { __dvRetention?: ReturnType<typeof setInterval>; __dvRetentionBoot?: ReturnType<typeof setTimeout> };
  if (G.__dvRetention) clearInterval(G.__dvRetention);
  if (G.__dvRetentionBoot) clearTimeout(G.__dvRetentionBoot);
  const go = () => { runRetention().catch((e) => console.error('[retention]', e)); };
  G.__dvRetentionBoot = setTimeout(go, 60_000);
  G.__dvRetentionBoot.unref?.();
  G.__dvRetention = setInterval(go, 6 * 3600_000);
  G.__dvRetention.unref?.();
}

/** Rows still in the raw events table (for the admin "data" panel / tests). */
export const rawEventCount = () => Number(get<{ n: number }>('SELECT COUNT(*) AS n FROM events')?.n ?? 0);
