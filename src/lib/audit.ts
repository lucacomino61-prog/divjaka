/**
 * Audit trail for admin-side events (table audit_log, migration 003) plus one structured console
 * line per event, so a log collector sees it too. Never pass secrets: no passwords, tokens,
 * IBAN values or customer data beyond ids.
 *
 * Actions: login_ok, login_fail (first failure per account per 15 min), login_lockout,
 *   password_change, settings_change {keys, payment_details}, price_change {product_id, from, to},
 *   offer_create/offer_update/offer_delete {id, code?}, rate_change, customers_export {consent, rows},
 *   customer_erase {id}, units_change {product_id, from, to},
 *   (round 3) settings_change.iban {from, to: last 4 characters}, reauth_fail {action, failures},
 *   reauth_lockout {action}, login_ceiling_hit, product_create {product_id, slug, status, price,
 *   compare_at, forced_draft?}, product_status {product_id, from, to}, price_options_change
 *   {product_id, keys, from, to}, rate_change {op, id, product_id, date_from, date_to, from, to},
 *   offer_update {id, code, active, changes:{field:{from,to}}}, offer_delete {id, code, type, value,
 *   active}, orders_mass_cancel {minutes, methods, count}.
 */
import { all, get, run, toJson } from './db/index';
import { nowIso } from './time';
import { auditIp } from './security';

export interface AuditEntry { id: number; ts: string; admin_id: number | null; action: string; ip: string | null; detail: string | null }

export function audit(action: string, o: { adminId?: number | null; ip?: string | null; detail?: Record<string, unknown> } = {}): void {
  const ts = nowIso();
  const ip = o.ip ? auditIp(o.ip) : null;
  try {
    run('INSERT INTO audit_log (ts, admin_id, action, ip, detail) VALUES (?, ?, ?, ?, ?)', ts, o.adminId ?? null, action, ip, o.detail ? toJson(o.detail) : null);
  } catch (e) {
    console.error('[audit] write failed', (e as Error)?.message ?? e);
  }
  console.info(JSON.stringify({ audit: action, ts, admin: o.adminId ?? null, ip, ...(o.detail ?? {}) }));
}

export function listAudit(f: { action?: string; limit?: number; offset?: number } = {}): AuditEntry[] {
  const limit = Math.max(1, Math.min(500, f.limit ?? 100));
  const offset = Math.max(0, f.offset ?? 0);
  return f.action
    ? all<AuditEntry>('SELECT * FROM audit_log WHERE action = ? ORDER BY id DESC LIMIT ? OFFSET ?', f.action, limit, offset)
    : all<AuditEntry>('SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?', limit, offset);
}

/** When the IBAN / beneficiary / bank was last changed (ISO), or null. */
export function lastPaymentDetailsChange(): string | null {
  return get<{ ts: string }>("SELECT ts FROM audit_log WHERE action = 'settings_change' AND detail LIKE '%\"payment_details\":true%' ORDER BY id DESC LIMIT 1")?.ts ?? null;
}
