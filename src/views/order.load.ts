/**
 * Order route loader (T5). The order itself is opened by Order.astro with the access token
 * (?t=…) or the guest's e-mail — so this loader answers the same for every well-formed code,
 * whether it exists or not (a 200 with the "open with your e-mail" form): the URL alone never
 * tells a stranger that an order code is real. Malformed codes → 404.
 */
import type { Lang } from '../i18n/routes';

export interface OrderPageData { code: string }

export async function load(params: Record<string, string>, _lang: Lang): Promise<OrderPageData | null> {
  const code = (params.code ?? '').trim().toUpperCase();
  if (!/^DV-[A-Z0-9]{4,12}$/.test(code)) return null;
  return { code };
}
