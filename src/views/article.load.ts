/**
 * Data for a heritage sheet (/trashegimia/[slug]/, /en/heritage/[slug]/). null → the route
 * shell answers 404. The body is parsed here (components/heritage/articles.ts) so the view only
 * renders blocks; footnotes become numbered sources in order of first use.
 */
import type { Lang } from '../i18n/routes';
import { sheet, sheetsFor, parse, citations, type Block, type Sheet } from '../components/heritage/articles';
import { seasonMonths, seasonYearRound, sourcesFor } from '../components/heritage/facts';
import { DISTANCE_FACTS } from '../components/heritage/distances';
import { findPublished } from '../lib/catalog';
import type { Product } from '../lib/db/repo/products';
import type { Source } from '../components/site/SourceList.astro';
import { t } from '../i18n/ui';

export interface ArticleData {
  sheet: Sheet; blocks: Block[]; sources: Source[];
  index: number; total: number; prev: Sheet | null; next: Sheet | null;
  related: Product[];
  pins: { id: string; zone: boolean }[];
}

export async function load(params: Record<string, string>, lang: Lang): Promise<ArticleData | null> {
  const slug = params.slug ?? '';
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return null;
  const s = sheet(slug, lang);
  if (!s) return null;
  const all = sheetsFor(lang);
  const i = all.findIndex((x) => x.slug === slug);
  const c = citations();
  const blocks = parse(s.body, c.cite, (n) => t(lang, 'article.ref', { n: String(n) }));
  // tables carry their own sources: add them after the prose citations, in table order
  if (blocks.some((b) => b.type === 'seasons')) {
    for (const m of seasonMonths()) for (const it of m.items) c.add(it.source);
    for (const it of seasonYearRound()) c.add(it.source);
  }
  if (blocks.some((b) => b.type === 'distances')) for (const src of sourcesFor(DISTANCE_FACTS.map((d) => d.fact))) c.add(src);
  return {
    sheet: s, blocks, sources: c.sources,
    index: i + 1, total: all.length,
    prev: i > 0 ? all[i - 1] : null, next: i < all.length - 1 ? all[i + 1] : null,
    related: s.related.map((r) => findPublished(r)).filter(Boolean) as Product[],
    pins: s.pins.map((p) => ({ id: p.replace(/\*$/, ''), zone: p.endsWith('*') })),
  };
}
