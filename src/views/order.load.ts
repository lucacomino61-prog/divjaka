/**
 * Data loader for the order route — PLACEHOLDER from T2. The feature task replaces the body.
 * Return the view's data, or null to answer 404 (the route shell renders NotFound with status 404).
 * Until then it answers 200 only for a slug/code that really exists (T1 catalogue / content /
 * orders), so made-up URLs are 404s, not indexable soft-404 placeholder pages.
 */
import type { Lang } from '../i18n/routes';
import { orderByCode } from '../lib/db/repo/orders';

export async function load(params: Record<string, string>, _lang: Lang): Promise<{ params: Record<string, string> } | null> {
  const v = params.code ?? '';
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/i.test(v)) return null;
  return orderByCode(v) ? { params } : null;
}
