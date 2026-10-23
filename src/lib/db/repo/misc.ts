/** faq, messages, categories, inventory_log. */
import { all, get, run, toJson, type Param } from '../index';
import { nowIso } from '../../time';

export interface Faq { id: number; q_sq: string | null; q_en: string | null; a_sq: string | null; a_en: string | null; keywords: string | null; links: unknown[]; sort: number; active: boolean }
type FaqRow = Omit<Faq, 'links' | 'active'> & { links: string | null; active: number };
const mapFaq = (r: FaqRow): Faq => {
  let links: unknown[] = [];
  try { links = JSON.parse(r.links || '[]'); } catch { /* keep [] */ }
  return { ...r, links, active: !!r.active };
};

export const listFaq = (activeOnly = false): Faq[] => all<FaqRow>(`SELECT * FROM faq ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY sort, id`).map(mapFaq);
export const getFaq = (id: number) => { const r = get<FaqRow>('SELECT * FROM faq WHERE id = ?', id); return r ? mapFaq(r) : undefined; };

export type FaqInput = Partial<Omit<Faq, 'id'>>;
const FAQ_COLS = ['q_sq', 'q_en', 'a_sq', 'a_en', 'keywords', 'links', 'sort', 'active'] as const;
const faqVal = (k: string, v: unknown): Param => (k === 'links' ? toJson(v ?? []) : k === 'active' ? (v === false ? 0 : 1) : ((v ?? null) as Param));

export function createFaq(f: FaqInput): number {
  const cols = FAQ_COLS.filter((c) => (f as Record<string, unknown>)[c] !== undefined);
  return run(`INSERT INTO faq (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map((c) => faqVal(c, (f as Record<string, unknown>)[c]))).id;
}
export function updateFaq(id: number, f: FaqInput): boolean {
  const cols = FAQ_COLS.filter((c) => (f as Record<string, unknown>)[c] !== undefined);
  if (!cols.length) return !!getFaq(id);
  return run(`UPDATE faq SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...cols.map((c) => faqVal(c, (f as Record<string, unknown>)[c])), id).changes > 0;
}
export const deleteFaq = (id: number) => run('DELETE FROM faq WHERE id = ?', id).changes > 0;

export interface Message { id: number; kind: 'contact' | 'assistant' | 'callback'; name: string | null; email: string | null; phone: string | null; lang: string | null; subject: string | null; body: string; status: 'new' | 'read' | 'done'; created_at: string }

export function createMessage(m: Omit<Message, 'id' | 'status' | 'created_at'>): number {
  return run(
    "INSERT INTO messages (kind, name, email, phone, lang, subject, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)",
    m.kind, m.name, m.email, m.phone, m.lang, m.subject, m.body, nowIso(),
  ).id;
}

export function listMessages(f: { status?: Message['status']; kind?: Message['kind']; limit?: number; offset?: number } = {}): { items: Message[]; total: number; unread: number } {
  const w: string[] = [];
  const p: Param[] = [];
  if (f.status) { w.push('status = ?'); p.push(f.status); }
  if (f.kind) { w.push('kind = ?'); p.push(f.kind); }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const total = Number(get<{ n: number }>(`SELECT COUNT(*) AS n FROM messages ${where}`, ...p)?.n ?? 0);
  const unread = Number(get<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE status = 'new'")?.n ?? 0);
  const items = all<Message>(`SELECT * FROM messages ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, ...p, f.limit ?? 50, f.offset ?? 0);
  return { items, total, unread };
}

export const setMessageStatus = (id: number, status: Message['status']) => run('UPDATE messages SET status = ? WHERE id = ?', status, id).changes > 0;

export interface CategoryInput { id: string; name_sq: string; name_en: string; sort?: number }
export const getCategory = (id: string) => get<CategoryInput>('SELECT * FROM categories WHERE id = ?', id);
export const createCategory = (c: CategoryInput) => run('INSERT INTO categories (id, name_sq, name_en, sort) VALUES (?, ?, ?, ?)', c.id, c.name_sq, c.name_en, c.sort ?? 0);
export const updateCategory = (id: string, c: Partial<CategoryInput>) => {
  const cur = getCategory(id);
  if (!cur) return false;
  const n = { ...cur, ...c };
  run('UPDATE categories SET name_sq = ?, name_en = ?, sort = ? WHERE id = ?', n.name_sq, n.name_en, n.sort ?? 0, id);
  return true;
};
export const deleteCategory = (id: string) => run('DELETE FROM categories WHERE id = ?', id).changes > 0;

export function inventoryLog(f: { product_id?: number; order_id?: number; limit?: number } = {}) {
  const w: string[] = [];
  const p: Param[] = [];
  if (f.product_id) { w.push('l.product_id = ?'); p.push(f.product_id); }
  if (f.order_id) { w.push('l.order_id = ?'); p.push(f.order_id); }
  return all(
    `SELECT l.*, p.slug, p.name_sq, o.code AS order_code FROM inventory_log l LEFT JOIN products p ON p.id = l.product_id LEFT JOIN orders o ON o.id = l.order_id
     ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY l.id DESC LIMIT ?`,
    ...p, f.limit ?? 200,
  );
}

export function logInventory(e: { product_id?: number | null; session_id?: number | null; night?: string | null; delta: number; reason: string; admin_id?: number | null }) {
  run('INSERT INTO inventory_log (product_id, session_id, night, delta, reason, order_id, admin_id, ts) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)',
    e.product_id ?? null, e.session_id ?? null, e.night ?? null, e.delta, e.reason, e.admin_id ?? null, nowIso());
}
