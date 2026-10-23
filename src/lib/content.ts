/**
 * Heritage articles as plain data for search and the sitemap (T3 owns src/content/heritage/**).
 * Reads every .md/.mdx file there at build/dev time. Language from frontmatter `lang`, a
 * `/sq/` or `/en/` folder, or a `.sq.md` / `.en.md` suffix; slug from frontmatter `slug` or the
 * file name. Drafts (`draft: true`) are skipped.
 */
const files = import.meta.glob('/src/content/heritage/**/*.{md,mdx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface ArticleDoc { slug: string; lang: 'sq' | 'en'; title: string; description: string; body: string; updated: string | null }

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

let cache: ArticleDoc[] | null = null;

export function articles(): ArticleDoc[] {
  if (cache && !import.meta.env.DEV) return cache;
  const out: ArticleDoc[] = [];
  for (const [file, raw] of Object.entries(files)) {
    const { data, body } = frontmatter(raw);
    if (data.draft === 'true') continue;
    const base = file.split('/').pop()!.replace(/\.(md|mdx)$/, '');
    const suffix = /\.(sq|en)$/.exec(base)?.[1];
    const folder = /\/(sq|en)\//.exec(file)?.[1];
    const lang = (data.lang || suffix || folder || 'sq') as 'sq' | 'en';
    const slug = data.slug || base.replace(/\.(sq|en)$/, '');
    out.push({
      slug, lang,
      title: data.title || slug,
      description: data.description || data.summary || '',
      body: body.slice(0, 20000),
      updated: data.updated || data.date || null,
    });
  }
  cache = out;
  return out;
}

/** Slugs that exist in both languages (sitemap pairs). */
export function articleSlugs(): string[] {
  return [...new Set(articles().map((a) => a.slug))];
}
