/**
 * The site's navigation in one place: the header's four links, the menu legend (01–09) and the
 * footer columns. `poi` ties a legend entry to a pin on the mini chart — one distinct place per
 * entry (MiniChart: hotel, tower = pelican-tower, island = pelican-island, heritage =
 * st-cosmas-monastery, lagoon = the lagoon's centre); entries without a place drop no pin.
 */
import type { RouteKey } from '../../i18n/routes';

export interface NavItem { key: RouteKey; label: string; sub?: string; poi?: string }

export const HEADER_NAV: NavItem[] = [
  { key: 'stay', label: 'nav.stay' },
  { key: 'experiences', label: 'nav.experiences' },
  { key: 'shop', label: 'nav.shop' },
  { key: 'heritage', label: 'nav.heritage' },
];

export const LEGEND: NavItem[] = [
  { key: 'home', label: 'nav.home', sub: 'menu.sub.home', poi: 'lagoon' },
  { key: 'stay', label: 'nav.stay', sub: 'menu.sub.stay', poi: 'hotel' },
  { key: 'experiences', label: 'nav.experiences', sub: 'menu.sub.experiences', poi: 'tower' },
  { key: 'shop', label: 'nav.shop', sub: 'menu.sub.shop' },
  { key: 'itinerary', label: 'nav.itinerary', sub: 'menu.sub.itinerary', poi: 'island' },
  { key: 'heritage', label: 'nav.heritage', sub: 'menu.sub.heritage', poi: 'heritage' },
  { key: 'now', label: 'nav.now', sub: 'menu.sub.now' },
  { key: 'account', label: 'nav.account', sub: 'menu.sub.account' },
  { key: 'contact', label: 'nav.contact', sub: 'menu.sub.contact' },
];

export const FOOTER_COLS: { title: string; items: NavItem[] }[] = [
  { title: 'footer.explore', items: [{ key: 'stay', label: 'nav.stay' }, { key: 'experiences', label: 'nav.experiences' }, { key: 'heritage', label: 'nav.heritage' }, { key: 'now', label: 'nav.now' }] },
  { title: 'footer.plan', items: [{ key: 'itinerary', label: 'nav.itinerary' }, { key: 'shop', label: 'nav.shop' }, { key: 'cart', label: 'nav.cart' }, { key: 'account', label: 'nav.account' }] },
  { title: 'footer.info', items: [{ key: 'contact', label: 'nav.contact' }, { key: 'terms', label: 'nav.terms' }, { key: 'privacy', label: 'nav.privacy' }, { key: 'credits', label: 'nav.credits' }] },
];

/**
 * aria-current for a nav link: "page" only on the page itself; "true" on the section link
 * while inside it (a room page marks Qëndrimi as the current section, not the current page).
 */
export function ariaCurrent(routeKey: string, linkKey: RouteKey): 'page' | 'true' | undefined {
  if (routeKey === linkKey) return 'page';
  return sectionOf(routeKey) === linkKey ? 'true' : undefined;
}

/** Which top-level section a route belongs to. */
export function sectionOf(key: string): RouteKey | null {
  const map: Record<string, RouteKey> = {
    stay: 'stay', room: 'stay', experiences: 'experiences', experience: 'experiences',
    shop: 'shop', product: 'shop', heritage: 'heritage', article: 'heritage',
  };
  return map[key] ?? (key as RouteKey);
}
