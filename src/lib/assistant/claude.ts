/**
 * Optional Claude grounding for the assistant. Active only when ANTHROPIC_API_KEY is set (and
 * settings.assistant.use_claude is not false). Raw fetch to the Messages API — no SDK in this
 * project. Model claude-haiku-5-5; no temperature (rejected by the API since 2026-10-21);
 * low effort for short answers. The model may only use the facts we pass; when they do not
 * answer the question it must reply exactly NO_ANSWER so the rule engine hands off to staff.
 *
 * Spend limits (in memory, per process):
 *   - settings.assistant.daily_cap calls per Europe/Tirane day for the whole site (default 300),
 *   - 10 calls per hour per client address,
 *   - identical questions (same language, no history) are answered from a 10-minute cache,
 *   - max_tokens 300 (answers are at most 3 short sentences).
 * Past a limit the caller gets null and the rule engine hands off to staff.
 */
import { today } from '../time';

const MODEL = 'claude-haiku-5-5';
const PER_CLIENT_HOUR = 10;
const CACHE_MS = 10 * 60_000;

export const claudeEnabled = (): boolean => !!process.env.ANTHROPIC_API_KEY;

const G = globalThis as unknown as { __dvClaude?: { day: string; calls: number; perClient: Map<string, { n: number; until: number }>; cache: Map<string, { at: number; text: string | null }> } };
const st = G.__dvClaude ?? (G.__dvClaude = { day: '', calls: 0, perClient: new Map(), cache: new Map() });

/** Calls made today (for the admin). */
export const claudeCallsToday = () => (st.day === today() ? st.calls : 0);

function allow(client: string, dailyCap: number): boolean {
  const d = today();
  if (st.day !== d) { st.day = d; st.calls = 0; st.perClient.clear(); }
  if (st.calls >= dailyCap) return false;
  const now = Date.now();
  const c = st.perClient.get(client);
  if (c && c.until > now && c.n >= PER_CLIENT_HOUR) return false;
  if (!c || c.until <= now) st.perClient.set(client, { n: 1, until: now + 3600_000 });
  else c.n++;
  st.calls++;
  return true;
}

export async function askClaude(o: {
  lang: 'sq' | 'en'; question: string; facts: string; history?: { role: 'user' | 'assistant'; content: string }[];
  client?: string; dailyCap?: number;
}): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const cacheKey = !o.history?.length ? `${o.lang}|${o.question.trim().toLowerCase().replace(/\s+/g, ' ')}` : null;
  if (cacheKey) {
    const hit = st.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;
  }
  if (!allow(o.client ?? 'unknown', Math.max(0, o.dailyCap ?? 300))) return null;
  const system = [
    'You are the booking assistant of Hotel Pelikan in Divjakë, Albania, on the hotel\'s own website.',
    `Answer in ${o.lang === 'en' ? 'English' : 'Albanian (standard, natural)'}; at most 3 short sentences; plain text, no markdown.`,
    'Use ONLY the facts below. Never invent prices, opening hours, phone numbers, distances, dates or policies.',
    'If the facts do not answer the question, reply with exactly NO_ANSWER and nothing else.',
    '',
    'FACTS:',
    o.facts,
  ].join('\n');
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        output_config: { effort: 'low' },
        system,
        messages: [...(o.history ?? []).slice(-6), { role: 'user', content: o.question.slice(0, 1000) }],
      }),
    });
    if (!res.ok) {
      console.warn('[assistant] claude HTTP', res.status);
      return null;
    }
    const data = (await res.json()) as { stop_reason?: string; content?: { type: string; text?: string }[] };
    let text: string | null = null;
    if (data.stop_reason !== 'refusal') {
      const t = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
      if (t && !/^NO_ANSWER\b/.test(t)) text = t.slice(0, 1200);
    }
    if (cacheKey) {
      st.cache.set(cacheKey, { at: Date.now(), text });
      if (st.cache.size > 500) for (const [k, v] of st.cache) if (Date.now() - v.at >= CACHE_MS) st.cache.delete(k);
    }
    return text;
  } catch (e) {
    console.warn('[assistant] claude failed', (e as Error)?.message ?? e);
    return null;
  }
}
