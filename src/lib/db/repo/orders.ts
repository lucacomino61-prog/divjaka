/** orders + order_items (reads and simple writes; holds and releases live in src/lib/orders.ts). */
import { all, get, parseJson, type Param } from '../index';

export type OrderStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';
export type PaymentMethod = 'hotel' | 'bank' | 'card';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded' | 'failed';

export interface Order {
  id: number; code: string; access_token: string; customer_id: number | null;
  email: string; name: string; phone: string | null; country: string | null; lang: string;
  status: OrderStatus; payment_method: PaymentMethod; payment_status: PaymentStatus; payment_provider: string | null; payment_ref: string | null;
  subtotal: number; discount: number; total: number; promo_code: string | null; notes: string | null; source: string | null; sid: string | null; demo: number;
  created_at: string; updated_at: string; paid_at: string | null; cancelled_at: string | null;
  /** migration 002 */
  test: number; marketing_consent: number; hold_until: string | null;
  /** migration 003 */
  email_key: string | null; phone_key: string | null; staff_hold: number;
  /** migration 004: why the order got the short hold (comma list: far_or_long, surge, address_share, person_open_orders) */
  review: string | null;
  /** migration 005: the checkout page's draft id (repeated POSTs answer with this order) */
  checkout_id: string | null;
}

/** Order columns safe for the admin list (no access_token, no analytics sid). */
const LIST_COLS = `o.id, o.code, o.customer_id, o.email, o.name, o.phone, o.country, o.lang, o.status, o.payment_method, o.payment_status,
  o.payment_provider, o.payment_ref, o.subtotal, o.discount, o.total, o.promo_code, o.notes, o.source, o.demo, o.test, o.marketing_consent,
  o.hold_until, o.staff_hold, o.review, o.created_at, o.updated_at, o.paid_at, o.cancelled_at`;

export interface OrderItem {
  id: number; order_id: number; product_id: number | null; kind: string; name: string; unit_price: number; qty: number; line_total: number;
  date_from: string | null; date_to: string | null; session_id: number | null; guests: number | null; meta: Record<string, unknown>;
}

export const getOrder = (id: number) => get<Order>('SELECT * FROM orders WHERE id = ?', id);
export const orderByCode = (code: string) => get<Order>('SELECT * FROM orders WHERE code = ?', code.trim().toUpperCase());

export function orderItems(orderId: number): OrderItem[] {
  return all<OrderItem & { meta: string }>('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', orderId).map((r) => ({ ...r, meta: parseJson(r.meta, {}) }));
}

export interface OrderFilter { status?: OrderStatus; payment_status?: PaymentStatus; payment_method?: PaymentMethod; q?: string; from?: string; to?: string; kind?: string; limit?: number; offset?: number }

export type OrderListRow = Omit<Order, 'access_token' | 'sid'> & { items_count: number; kinds: string };

export function listOrders(f: OrderFilter = {}): { items: OrderListRow[]; total: number } {
  const w: string[] = [];
  const p: Param[] = [];
  if (f.status) { w.push('o.status = ?'); p.push(f.status); }
  if (f.payment_status) { w.push('o.payment_status = ?'); p.push(f.payment_status); }
  if (f.payment_method) { w.push('o.payment_method = ?'); p.push(f.payment_method); }
  if (f.from) { w.push('o.created_at >= ?'); p.push(f.from); }
  if (f.to) { w.push('o.created_at < ?'); p.push(f.to); }
  if (f.q) { w.push('(o.code LIKE ? OR o.email LIKE ? OR o.name LIKE ? OR o.phone LIKE ?)'); const q = `%${f.q}%`; p.push(q, q, q, q); }
  if (f.kind) { w.push('EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.kind = ?)'); p.push(f.kind); }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const total = Number(get<{ n: number }>(`SELECT COUNT(*) AS n FROM orders o ${where}`, ...p)?.n ?? 0);
  const items = all<OrderListRow>(
    `SELECT ${LIST_COLS}, (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS items_count,
            (SELECT GROUP_CONCAT(DISTINCT i.kind) FROM order_items i WHERE i.order_id = o.id) AS kinds
     FROM orders o ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`,
    ...p, f.limit ?? 50, f.offset ?? 0,
  );
  return { items, total };
}
