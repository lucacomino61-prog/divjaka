/** customers: one row per e-mail (case-insensitive). */
import { all, get, run, type Param } from '../index';
import { nowIso } from '../../time';

export interface Customer {
  id: number; email: string; name: string | null; phone: string | null; country: string | null; lang: string | null;
  marketing_consent: number; consent_at: string | null; created_at: string; notes: string | null; demo: number;
}

export const getCustomer = (id: number) => get<Customer>('SELECT * FROM customers WHERE id = ?', id);
export const customerByEmail = (email: string) => get<Customer>('SELECT * FROM customers WHERE email = ? COLLATE NOCASE', email.trim());

/**
 * Find or create the customer for an e-mail, from an UNAUTHENTICATED checkout. Anyone can type
 * any address, so an existing row is never overwritten: only empty fields are filled (the
 * order row keeps the name/phone given with that order). Marketing consent is NOT set here —
 * the order records it (orders.marketing_consent) and confirmOrderConsent() copies it once the
 * order is paid or confirmed by staff. `trusted` (seed only) writes consent directly.
 */
export function upsertCustomer(c: { email: string; name?: string | null; phone?: string | null; country?: string | null; lang?: string | null; marketing_consent?: boolean; trusted?: boolean; demo?: boolean; at?: string }): number {
  const email = c.email.trim().toLowerCase();
  const at = c.at ?? nowIso();
  const cur = customerByEmail(email);
  const consent = c.trusted && c.marketing_consent ? 1 : 0;
  if (cur) {
    run(
      `UPDATE customers SET name = COALESCE(name, ?), phone = COALESCE(phone, ?), country = COALESCE(country, ?), lang = COALESCE(lang, ?),
       marketing_consent = CASE WHEN ? THEN 1 ELSE marketing_consent END,
       consent_at = CASE WHEN ? AND marketing_consent = 0 THEN ? ELSE consent_at END WHERE id = ?`,
      c.name || null, c.phone || null, c.country || null, c.lang || null, consent, consent, at, cur.id,
    );
    return cur.id;
  }
  return run(
    'INSERT INTO customers (email, name, phone, country, lang, marketing_consent, consent_at, created_at, demo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    email, c.name || null, c.phone || null, c.country || null, c.lang || null, consent, consent ? at : null, at, c.demo ? 1 : 0,
  ).id;
}

/**
 * The consent ticked on an order counts once the order is real: paid, or confirmed/completed by
 * staff (who have been in touch with the guest). Withdrawal stays an admin action.
 */
export function confirmOrderConsent(order: { customer_id: number | null; marketing_consent: number }, at = nowIso()): void {
  if (!order.customer_id || !order.marketing_consent) return;
  run('UPDATE customers SET marketing_consent = 1, consent_at = COALESCE(consent_at, ?) WHERE id = ? AND marketing_consent = 0', at, order.customer_id);
}

/**
 * orders  = the customer's orders that are not cancelled and not TEST;
 * revenue = total of those that are paid or confirmed/completed by staff (an unverified
 *           pending order is not money, and TEST orders never are).
 */
export interface CustomerStats extends Customer { orders: number; revenue: number; first_order: string | null; last_order: string | null }

export function listCustomers(f: { q?: string; consent?: boolean; limit?: number; offset?: number } = {}): { items: CustomerStats[]; total: number } {
  const w: string[] = [];
  const p: Param[] = [];
  if (f.q) { w.push('(c.email LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)'); const q = `%${f.q}%`; p.push(q, q, q); }
  if (f.consent) w.push('c.marketing_consent = 1');
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const total = Number(get<{ n: number }>(`SELECT COUNT(*) AS n FROM customers c ${where}`, ...p)?.n ?? 0);
  const items = all<CustomerStats>(
    `SELECT c.*, COUNT(o.id) AS orders,
            COALESCE(SUM(CASE WHEN o.payment_status = 'paid' OR o.status IN ('confirmed','completed') THEN o.total ELSE 0 END), 0) AS revenue,
            MIN(o.created_at) AS first_order, MAX(o.created_at) AS last_order
     FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.status != 'cancelled' AND o.test = 0
     ${where} GROUP BY c.id ORDER BY last_order DESC NULLS LAST, c.id DESC LIMIT ? OFFSET ?`,
    ...p, f.limit ?? 50, f.offset ?? 0,
  );
  return { items, total };
}

/**
 * Erase a customer (a guest's deletion request): the customer row is
 * deleted and every order of theirs keeps its totals, items and dates but loses name, e-mail,
 * phone, country and notes. Their messages (same e-mail) are deleted. Returns false when unknown.
 */
export function eraseCustomer(id: number): { orders: number; messages: number } | null {
  const c = getCustomer(id);
  if (!c) return null;
  const anon = `erased-${id}@invalid`;
  const orders = run(
    `UPDATE orders SET name = 'erased', email = ?, email_key = ?, phone = NULL, phone_key = NULL, country = NULL, notes = NULL,
       marketing_consent = 0, customer_id = NULL, updated_at = ? WHERE customer_id = ? OR email = ? COLLATE NOCASE`,
    anon, anon, nowIso(), id, c.email,
  ).changes;
  const messages = run('DELETE FROM messages WHERE email = ? COLLATE NOCASE', c.email).changes;
  run('DELETE FROM customers WHERE id = ?', id);
  return { orders, messages };
}

export function updateCustomer(id: number, patch: { name?: string | null; phone?: string | null; country?: string | null; notes?: string | null; marketing_consent?: boolean }): boolean {
  const cur = getCustomer(id);
  if (!cur) return false;
  const consent = patch.marketing_consent === undefined ? cur.marketing_consent : patch.marketing_consent ? 1 : 0;
  run(
    'UPDATE customers SET name = ?, phone = ?, country = ?, notes = ?, marketing_consent = ?, consent_at = ? WHERE id = ?',
    patch.name !== undefined ? patch.name : cur.name,
    patch.phone !== undefined ? patch.phone : cur.phone,
    patch.country !== undefined ? patch.country : cur.country,
    patch.notes !== undefined ? patch.notes : cur.notes,
    consent,
    consent ? cur.consent_at ?? nowIso() : null,
    id,
  );
  return true;
}
