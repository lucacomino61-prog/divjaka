/**
 * stay/facts.ts — the hotel's practical details for the Stay and room pages, server side.
 * Only research/business.json entries with verified: true are used; a value the owner saved in
 * Cilësimet (settings.business, not flagged as a placeholder) wins and is labelled as confirmed
 * by the hotel. Every row carries its source (PLAN §2). Nothing here is shown when its research
 * entry is missing or unverified.
 */
import { readResearch, business, confirmed } from '../site/site-data';
import type { Source } from '../site/SourceList.astro';
import { t } from '../../i18n/ui';
import type { Lang } from '../../i18n/routes';

type Raw = Record<string, unknown>;
interface Entry { value?: unknown; sources?: string[]; verified?: boolean; confidence?: string }

export const ACCESSED = '2026-10-23';
const PUBLISHER: Record<string, string> = {
  'www.booking.com': 'Booking.com', 'booking.com': 'Booking.com',
  'stay.albaniavisit.com': 'AlbaniaVisit', 'albaniatravelguide.net': 'Albania Travel Guide',
  'www.kayak.com': 'Kayak', 'www.google.com': 'Google Maps', 'koreascience.kr': 'KoreaScience',
  'faolex.fao.org': 'FAO FAOLEX', 'restaurantguru.com': 'RestaurantGuru',
};
const host = (u: string) => { try { return new URL(u.split(' ')[0]).hostname; } catch { return ''; } };
export const publisher = (u: string) => PUBLISHER[host(u)] ?? host(u).replace(/^www\./, '');

function entry(key: string): Entry | null {
  const b = readResearch<Raw>('business.json');
  const e = (b?.hotel as Raw | undefined)?.[key] as Entry | undefined;
  return e && e.verified === true ? e : null;
}
const firstSource = (e: Entry | null): Source | null => {
  const u = e?.sources?.find((s) => /^https:\/\//.test(s) && !/google\.com\/maps/.test(s))?.split(' ')[0];
  return u ? { title: 'Hotel Pelikan', url: u, publisher: publisher(u), accessed: ACCESSED } : null;
};

export interface InfoRow { key: string; label: string; value: string; source: string; owner: boolean }

/** "13:00-23:30" → "13:00–23:30"; "until 11:00" → "11:00". */
const dash = (s: string) => s.replace(/\s*-\s*/g, '–');
const timeOf = (s: string) => (s.match(/\d{1,2}:\d{2}/g) ?? []);

export interface HotelInfo {
  rows: InfoRow[];
  /** times shown on the page (owner's, else the sourced listing's) */
  checkin: string | null; checkout: string | null;
  /** times the owner saved in Cilësimet: only these go to JSON-LD */
  checkinOwner: string | null; checkoutOwner: string | null;
  /** language codes from the verified listing (JSON-LD availableLanguage) */
  languages: string[];
  sources: Source[];
}
const LANG_CODE: Record<string, string> = { english: 'en', italian: 'it', albanian: 'sq', german: 'de', french: 'fr', greek: 'el' };

export async function hotelInfo(lang: Lang): Promise<HotelInfo> {
  const b = await business();
  const rows: InfoRow[] = [];
  const sources: Source[] = [];
  const addSrc = (e: Entry | null) => { const s = firstSource(e); if (s && !sources.some((x) => x.url === s.url)) sources.push(s); return s; };
  const srcLabel = (s: Source | null) => (s ? `${s.publisher} · 23.10.2026` : '');

  const fac = entry('facilities');
  if (fac) { const s = addSrc(fac); rows.push({ key: 'facilities', label: t(lang, 'stay.info.facilities'), value: t(lang, 'stay.info.facilities.v'), source: srcLabel(s), owner: false }); }

  // check-in / check-out: the owner's saved value wins; else the verified public listing
  let checkin: string | null = null, checkout: string | null = null;
  const ownIn = confirmed(b, 'checkin' as never), ownOut = confirmed(b, 'checkout' as never);
  const ci = entry('check_in'), co = entry('check_out');
  if (ownIn || ci) {
    const v = ownIn || String(ci!.value ?? '');
    const s = ownIn ? null : addSrc(ci);
    checkin = timeOf(v)[0] ?? null;
    rows.push({ key: 'checkin', label: t(lang, 'stay.info.checkin'), value: dash(v.replace(/^from\s+/i, '')), source: ownIn ? t(lang, 'stay.info.owner') : srcLabel(s), owner: !!ownIn });
  }
  if (ownOut || co) {
    const v = ownOut || String(co!.value ?? '');
    const s = ownOut ? null : addSrc(co);
    const tm = timeOf(v)[0] ?? '';
    checkout = tm || null;
    rows.push({ key: 'checkout', label: t(lang, 'stay.info.checkout'), value: tm ? t(lang, 'stay.info.checkout.v', { time: tm }) : v, source: ownOut ? t(lang, 'stay.info.owner') : srcLabel(s), owner: !!ownOut });
  }
  const simple: [string, string][] = [['breakfast', 'breakfast'], ['pets', 'pets'], ['children_policy', 'children'], ['languages', 'languages'], ['airport_shuttle', 'shuttle']];
  for (const [rk, k] of simple) {
    const e = entry(rk);
    if (!e) continue;
    const s = addSrc(e);
    rows.push({ key: k, label: t(lang, `stay.info.${k}`), value: t(lang, `stay.info.${k}.v`), source: srcLabel(s), owner: false });
  }
  // the restaurant line and the setting are cited in the page text: list their sources too
  for (const k of ['restaurant', 'setting', 'room_types']) {
    const e = entry(k);
    for (const u of e?.sources ?? []) {
      const url = u.split(' ')[0];
      if (!/^https:\/\//.test(url) || /google\.com\/maps|restaurantguru/.test(url) || sources.some((x) => x.url === url)) continue;
      sources.push({ title: 'Hotel Pelikan', url, publisher: publisher(url), accessed: ACCESSED });
    }
  }
  const le = entry('languages');
  const languages = Array.isArray(le?.value) ? (le!.value as string[]).map((x) => LANG_CODE[String(x).toLowerCase()]).filter(Boolean) : [];
  return {
    rows, checkin, checkout, sources, languages,
    checkinOwner: ownIn ? timeOf(ownIn)[0] ?? null : null,
    checkoutOwner: ownOut ? timeOf(ownOut)[0] ?? null : null,
  };
}

/**
 * Facilities for JSON-LD amenityFeature (verified list only). Restaurant and bar are left out:
 * Base's Hotel node (same @id) already carries "Bar-restorant", and the two merge.
 */
export function amenities(lang: Lang): string[] {
  const e = entry('facilities');
  if (!e || !Array.isArray(e.value)) return [];
  const sq: Record<string, string> = {
    garden: 'Kopsht', 'free private parking on site': 'Parkim privat falas',
    '24-hour front desk': 'Recepsion 24 orë', '24-hour security': 'Siguri 24 orë', 'daily housekeeping': 'Pastrim i përditshëm',
    'currency exchange': 'Këmbim valutor', 'family rooms': 'Dhoma familjare', 'non-smoking rooms': 'Dhoma për jo-duhanpirës',
    'free WiFi in all areas': 'Wi-Fi falas kudo', 'air conditioning': 'Ajër i kondicionuar',
  };
  return (e.value as string[]).filter((v) => !/^(restaurant|bar)$/i.test(v)).map((v) => (lang === 'sq' ? sq[v] ?? v : v.charAt(0).toUpperCase() + v.slice(1)));
}

/** settings.proof (only when the owner shows it): "9.5/10 · Booking.com · 601 vlerësime". */
export async function proofLine(): Promise<{ value: string; site: string; count: number | null; url: string; date: string } | null> {
  try {
    const { getSetting } = await import('../../lib/db/repo/settings');
    const p = getSetting('proof');
    const it = p.show ? p.items?.[0] : null;
    if (!it || !/^https:\/\//.test(it.source_url)) return null;
    return { value: it.value, site: publisher(it.source_url), count: it.count ?? null, url: it.source_url, date: it.date };
  } catch { return null; }
}
