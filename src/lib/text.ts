/** Text helpers shared by search and the assistant: accent folding, tokens, stop words. */

/** Lower-case and strip diacritics: ë→e, ç→c, é→e … */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');
}

export const STOP_SQ = new Set([
  'a', 'e', 'i', 'te', 'se', 'ne', 'me', 'per', 'nga', 'dhe', 'ose', 'nje', 'ka', 'kam', 'keni', 'kemi', 'jam', 'jeni', 'eshte', 'jane',
  'qe', 'si', 'cfare', 'cili', 'cila', 'cilat', 'ku', 'kur', 'sa', 'pse', 'a', 'mund', 'do', 'te', 'ju', 'une', 'na', 'me', 'ti', 'atij',
  'kete', 'ky', 'kjo', 'keto', 'ato', 'ai', 'ajo', 'por', 'edhe', 'mos', 'nuk', 'jo', 'po', 'ju', 'juaj', 'ime', 'im', 'tim', 'time',
  'deri', 'pa', 'mbi', 'nen', 'tek', 'tani', 'pak', 'shume', 'gjithe', 'cdo', 'faleminderit', 'pershendetje', 'ju', 'lutem', 'mire',
]);
export const STOP_EN = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'from', 'with', 'by', 'is', 'are', 'was', 'be', 'do', 'does', 'did',
  'can', 'could', 'would', 'will', 'i', 'we', 'you', 'it', 'my', 'our', 'your', 'me', 'us', 'there', 'this', 'that', 'these', 'those',
  'what', 'which', 'who', 'how', 'when', 'where', 'why', 'have', 'has', 'any', 'some', 'please', 'thanks', 'thank', 'hi', 'hello', 'about',
  'is', 'am', 'if', 'so', 'not', 'no', 'yes', 'get', 'need', 'want', 'like',
]);

export function tokens(s: string, opts: { keepStop?: boolean; min?: number } = {}): string[] {
  const min = opts.min ?? 2;
  return fold(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= min && (opts.keepStop || (!STOP_SQ.has(t) && !STOP_EN.has(t))));
}

/** Light stemming so "pelikanet", "pelikanëve", "pelicans" meet "pelikan"/"pelican". */
export function stem(t: string): string {
  if (t.length <= 4) return t;
  return t
    .replace(/(eve|ave|ive|it|in|ise|es|et|at|ut|ja|ra|ve|ne|s)$/,'')
    .replace(/(ing|ed)$/, '');
}

export function stems(s: string): string[] {
  return tokens(s).map(stem).filter((t) => t.length >= 2);
}

/** Short snippet around the first matching token. */
export function snippet(text: string, qTokens: string[], len = 160): string {
  const clean = text.replace(/[#*_`>\[\]]/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= len) return clean;
  const f = fold(clean);
  let at = -1;
  for (const t of qTokens) {
    const i = f.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  const start = Math.max(0, at < 0 ? 0 : at - 40);
  const s = clean.slice(start, start + len);
  return (start > 0 ? '…' : '') + s.replace(/\s\S*$/, '') + '…';
}
