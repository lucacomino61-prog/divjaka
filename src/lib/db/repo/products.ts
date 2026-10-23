/** products + categories + bundle_items. */
import { all, get, run, parseJson, toJson, type Param } from '../index';
import { nowIso } from '../../time';

export type Kind = 'room' | 'experience' | 'bundle' | 'gift' | 'goods';
export const KINDS: Kind[] = ['room', 'experience', 'bundle', 'gift', 'goods'];
export type Status = 'draft' | 'published' | 'archived';

export interface ProductImage { slug?: string; src?: string; alt_sq?: string; alt_en?: string; w?: number; h?: number }

export interface Product {
  id: number; slug: string; kind: Kind; category: string | null;
  name_sq: string; name_en: string;
  summary_sq: string | null; summary_en: string | null; body_sq: string | null; body_en: string | null;
  includes_sq: string[]; includes_en: string[];
  price: number; compare_at: number | null; stock: number | null; units: number | null; capacity: number | null;
  duration_min: number | null; poi: string | null;
  tags: string[]; seasons: number[]; images: ProductImage[]; options: Record<string, unknown>;
  status: Status; featured: boolean; sort: number; demo: boolean;
  created_at: string; updated_at: string;
}

type ProductRow = Omit<Product, 'includes_sq' | 'includes_en' | 'tags' | 'seasons' | 'images' | 'options' | 'featured' | 'demo'> & {
  includes_sq: string; includes_en: string; tags: string; seasons: string; images: string; options: string; featured: number; demo: number;
};

export function mapProduct(r: ProductRow): Product {
  return {
    ...r,
    includes_sq: parseJson<string[]>(r.includes_sq, []),
    includes_en: parseJson<string[]>(r.includes_en, []),
    tags: parseJson<string[]>(r.tags, []),
    seasons: parseJson<number[]>(r.seasons, []),
    images: parseJson<ProductImage[]>(r.images, []),
    options: parseJson<Record<string, unknown>>(r.options, {}),
    featured: !!r.featured,
    demo: !!r.demo,
  };
}

export const pname = (p: Pick<Product, 'name_sq' | 'name_en'>, lang: string) => (lang === 'en' ? p.name_en : p.name_sq);
export const psummary = (p: Pick<Product, 'summary_sq' | 'summary_en'>, lang: string) =>
  (lang === 'en' ? p.summary_en : p.summary_sq) ?? '';

export interface ProductFilter {
  kind?: Kind; category?: string; tag?: string; status?: Status | 'any'; ids?: number[]; slugs?: string[];
  featured?: boolean; q?: string;
}

export function listProducts(f: ProductFilter = {}): Product[] {
  const where: string[] = [];
  const params: Param[] = [];
  if (f.status && f.status !== 'any') { where.push('status = ?'); params.push(f.status); }
  if (!f.status) where.push("status = 'published'");
  if (f.kind) { where.push('kind = ?'); params.push(f.kind); }
  if (f.category) { where.push('category = ?'); params.push(f.category); }
  if (f.featured) where.push('featured = 1');
  if (f.tag) { where.push('EXISTS (SELECT 1 FROM json_each(products.tags) WHERE value = ?)'); params.push(f.tag); }
  if (f.ids?.length) { where.push(`id IN (${f.ids.map(() => '?').join(',')})`); params.push(...f.ids); }
  if (f.slugs?.length) { where.push(`slug IN (${f.slugs.map(() => '?').join(',')})`); params.push(...f.slugs); }
  const sql = `SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY sort, id`;
  return all<ProductRow>(sql, ...params).map(mapProduct);
}

export function getProductBySlug(slug: string): Product | undefined {
  const r = get<ProductRow>('SELECT * FROM products WHERE slug = ?', slug);
  return r ? mapProduct(r) : undefined;
}

export function getProduct(id: number): Product | undefined {
  const r = get<ProductRow>('SELECT * FROM products WHERE id = ?', id);
  return r ? mapProduct(r) : undefined;
}

export type ProductInput = Partial<Omit<Product, 'id' | 'created_at' | 'updated_at'>> & { slug: string; kind: Kind; name_sq: string; name_en: string; price: number };

const JSON_FIELDS = new Set(['includes_sq', 'includes_en', 'tags', 'seasons', 'images', 'options']);
const BOOL_FIELDS = new Set(['featured', 'demo']);
const COLUMNS = [
  'slug', 'kind', 'category', 'name_sq', 'name_en', 'summary_sq', 'summary_en', 'body_sq', 'body_en', 'includes_sq', 'includes_en',
  'price', 'compare_at', 'stock', 'units', 'capacity', 'duration_min', 'poi', 'tags', 'seasons', 'images', 'options',
  'status', 'featured', 'sort', 'demo',
] as const;

function toCol(k: string, v: unknown): Param {
  if (JSON_FIELDS.has(k)) return toJson(v ?? (k === 'options' ? {} : []));
  if (BOOL_FIELDS.has(k)) return v ? 1 : 0;
  if (v === undefined) return null;
  return v as Param;
}

export function createProduct(p: ProductInput): number {
  const now = nowIso();
  const cols = COLUMNS.filter((c) => (p as Record<string, unknown>)[c] !== undefined);
  const r = run(
    `INSERT INTO products (${cols.join(',')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(',')}, ?, ?)`,
    ...cols.map((c) => toCol(c, (p as Record<string, unknown>)[c])),
    now,
    now,
  );
  return r.id;
}

export function updateProduct(id: number, patch: Partial<ProductInput>): boolean {
  const cols = COLUMNS.filter((c) => (patch as Record<string, unknown>)[c] !== undefined);
  if (!cols.length) return !!getProduct(id);
  const r = run(
    `UPDATE products SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    ...cols.map((c) => toCol(c, (patch as Record<string, unknown>)[c])),
    nowIso(),
    id,
  );
  return r.changes > 0;
}

export interface Category { id: string; name_sq: string; name_en: string; sort: number }
export const listCategories = (): Category[] => all<Category>('SELECT * FROM categories ORDER BY sort, id');

export function bundleItems(bundleId: number): { product_id: number; qty: number; slug: string; name_sq: string; name_en: string; kind: Kind }[] {
  return all('SELECT b.product_id, b.qty, p.slug, p.name_sq, p.name_en, p.kind FROM bundle_items b JOIN products p ON p.id = b.product_id WHERE b.bundle_id = ? ORDER BY p.sort', bundleId);
}

export function setBundleItems(bundleId: number, items: { product_id: number; qty: number }[]): void {
  run('DELETE FROM bundle_items WHERE bundle_id = ?', bundleId);
  for (const it of items) run('INSERT INTO bundle_items (bundle_id, product_id, qty) VALUES (?, ?, ?)', bundleId, it.product_id, it.qty);
}

/** First image reference for API payloads: a photos.json slug, or a /media URL for uploads. */
export function primaryImage(p: Pick<Product, 'images'>): string | null {
  const im = p.images[0];
  if (!im) return null;
  if (im.src) return im.src.startsWith('/media/') && !/\.\w+$/.test(im.src) ? `${im.src}-960.webp` : im.src;
  return im.slug ?? null;
}
