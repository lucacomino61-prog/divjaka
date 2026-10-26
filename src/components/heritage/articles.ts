/**
 * articles.ts — the heritage sheets (src/content/heritage/<slug>.<sq|en>.md), server side.
 * Same files and slug/lang rules as src/lib/content.ts (search + sitemap read them too); this
 * module also reads the sheet's own frontmatter (order, topic, hero, pins, related, place) and
 * parses the body:
 *   paragraphs (blank-line separated) · "## " headings (get ids) · "- " lists
 *   inline **bold**, *italic*, [text](/path or https://…), footnote refs [^fact-id]
 *   block directives on their own line:
 *     ::photo <slug> [| note]      a plate with its verified caption (+ an optional note)
 *     ::chart <poi> <poi>* …       a mini chart with those pins (a trailing * = closed zone)
 *     ::seasons                    the month-by-month table from research/seasons.json
 *     ::distances                  the drive-distance table (facts prac-01…07, hist-13/16/17)
 * Footnote ids are research/heritage.json fact ids; only verified facts become sources, an
 * unknown id renders nothing (and warns in dev) — never an invented citation.
 */
import { fact } from './facts';
import type { Source } from '../site/SourceList.astro';

const files = import.meta.glob('/src/content/heritage/**/*.{md,mdx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export type Lang = 'sq' | 'en';
export interface Sheet {
  slug: string; lang: Lang; title: string; description: string; updated: string | null;
  order: number; topic: string; kicker: string; hero: string | null;
  pins: string[]; related: string[]; place: string | null; minutes: number;
  body: string;
}

function frontmatter(src: string): { data: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src);
  if (!m) return { data: {}, body: src };
  const data: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { data, body: m[2] };
}
const list = (v?: string) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

let cache: Sheet[] | null = null;
export function sheets(): Sheet[] {
  if (cache && !import.meta.env.DEV) return cache;
  const out: Sheet[] = [];
  for (const [file, raw] of Object.entries(files)) {
    const { data, body } = frontmatter(raw);
    if (data.draft === 'true') continue;
    const base = file.split('/').pop()!.replace(/\.(md|mdx)$/, '');
    const lang = (data.lang || /\.(sq|en)$/.exec(base)?.[1] || 'sq') as Lang;
    const words = body.replace(/::\w+.*$/gm, '').replace(/\[\^[\w-]+\]/g, '').split(/\s+/).filter(Boolean).length;
    out.push({
      slug: data.slug || base.replace(/\.(sq|en)$/, ''), lang,
      title: data.title || base, description: data.description || '', updated: data.updated || null,
      order: Number(data.order) || 99, topic: data.topic || '', kicker: data.kicker || '',
      hero: data.hero || null, pins: list(data.pins), related: list(data.related), place: data.place || null,
      minutes: Math.max(1, Math.round(words / 200)), body,
    });
  }
  out.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  cache = out;
  return out;
}
export const sheetsFor = (lang: Lang): Sheet[] => sheets().filter((s) => s.lang === lang);
export const sheet = (slug: string, lang: Lang): Sheet | undefined => sheets().find((s) => s.slug === slug && s.lang === lang);

/* ---------------- body → blocks ---------------- */

export type Block =
  | { type: 'p'; html: string }
  | { type: 'h2'; html: string; id: string }
  | { type: 'ul'; items: string[] }
  | { type: 'photo'; slug: string; note: string | null }
  | { type: 'chart'; pins: { id: string; zone: boolean }[] }
  | { type: 'seasons' }
  | { type: 'distances' };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/**
 * Parse a sheet body. `cite(id)` returns the footnote number for a fact id (or null to drop it).
 */
export function parse(body: string, cite: (id: string) => number | null, refLabel: (n: number) => string): Block[] {
  const inline = (text: string) => {
    let s = esc(text);
    s = s.replace(/\[\^([\w-]+)\]/g, (_, id: string) => {
      const n = cite(id);
      if (n == null) { if (import.meta.env.DEV) console.warn(`[heritage] unknown or unverified fact "${id}"`); return ''; }
      return `<sup class="ref"><a href="#burimet" aria-label="${esc(refLabel(n))}">${n}</a></sup>`;
    });
    // two facts from the same source side by side print one number
    s = s.replace(/(<sup class="ref"><a [^>]*>(\d+)<\/a><\/sup>)(?:<sup class="ref"><a [^>]*>\2<\/a><\/sup>)+/g, '$1');
    s = s.replace(/\[([^\]]+)\]\(((?:\/|https:\/\/)[^)\s]+)\)/g, (_, txt: string, href: string) => `<a href="${href}"${href.startsWith('https://') ? ' rel="noopener"' : ''}>${txt}</a>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    return s;
  };
  const blocks: Block[] = [];
  const ids = new Set<string>();
  for (const chunk of body.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const text = chunk.trim();
    if (!text) continue;
    const dir = /^::(\w+)\s*(.*)$/.exec(text);
    if (dir) {
      const [, name, arg] = dir;
      if (name === 'photo') { const [slug, note] = arg.split('|').map((x) => x.trim()); if (slug) blocks.push({ type: 'photo', slug, note: note || null }); }
      else if (name === 'chart') blocks.push({ type: 'chart', pins: arg.split(/\s+/).filter(Boolean).map((p) => ({ id: p.replace(/\*$/, ''), zone: p.endsWith('*') })) });
      else if (name === 'seasons') blocks.push({ type: 'seasons' });
      else if (name === 'distances') blocks.push({ type: 'distances' });
      continue;
    }
    if (text.startsWith('## ')) {
      const raw = text.slice(3).trim();
      let id = slugify(raw) || 'pjesa';
      while (ids.has(id)) id += '-2';
      ids.add(id);
      blocks.push({ type: 'h2', html: inline(raw), id });
      continue;
    }
    if (/^- /.test(text)) {
      blocks.push({ type: 'ul', items: text.split(/\n(?=- )/).map((l) => inline(l.replace(/^- /, '').replace(/\n/g, ' '))) });
      continue;
    }
    blocks.push({ type: 'p', html: inline(text.replace(/\n/g, ' ')) });
  }
  return blocks;
}

/** Footnote numbering by first appearance; facts with the same URL share a number. */
export function citations() {
  const order: Source[] = [];
  const byUrl = new Map<string, number>();
  const cite = (id: string): number | null => {
    const f = fact(id);
    if (!f) return null;
    const hit = byUrl.get(f.source.url);
    if (hit) return hit;
    order.push(f.source);
    byUrl.set(f.source.url, order.length);
    return order.length;
  };
  const add = (s: Source) => { if (!byUrl.has(s.url)) { order.push(s); byUrl.set(s.url, order.length); } };
  return { cite, add, sources: order };
}
