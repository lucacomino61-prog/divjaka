/**
 * Settings page (T6): business form sends only changed or explicitly confirmed fields, ratings
 * rows into proof.items, extra social network, UTM link builder.
 */
import { serialize } from './forms';

/* business: only what changed, plus placeholders the owner confirms as correct */
for (const form of document.querySelectorAll<HTMLFormElement>('form[data-changed-only]')) {
  const before = serialize(form);
  form.addEventListener('adm:payload', (e) => {
    const payload = (e as CustomEvent<Record<string, unknown>>).detail;
    for (const [group, values] of Object.entries(payload)) {
      if (!values || typeof values !== 'object') continue;
      const prev = (before[group] ?? {}) as Record<string, unknown>;
      const keep: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
        const confirmed = form.querySelector<HTMLInputElement>(`[data-confirm-field="${group}.${k}"]`)?.checked;
        if (confirmed || JSON.stringify(v) !== JSON.stringify(prev[k])) keep[k] = v;
      }
      // a cleared field is sent as '' so it is really emptied
      for (const k of Object.keys(prev)) if (!(k in (values as object)) && prev[k] !== undefined && prev[k] !== null) keep[k] = typeof prev[k] === 'number' ? null : '';
      payload[group] = keep;
    }
  });
}

/* verified ratings */
const proof = document.querySelector<HTMLFormElement>('form[data-proof-form]');
if (proof) {
  const list = proof.querySelector<HTMLElement>('[data-proof-items]')!;
  proof.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('[data-proof-remove]')) t.closest('li')!.remove();
    if (t.closest('[data-proof-add]')) {
      const first = list.querySelector('li');
      if (first) {
        const row = first.cloneNode(true) as HTMLElement;
        row.dataset.extra = '{}';
        for (const i of row.querySelectorAll('input')) i.value = '';
        list.append(row);
        row.querySelector('input')!.focus();
      }
    }
  });
  proof.addEventListener('adm:payload', (e) => {
    const payload = (e as CustomEvent<Record<string, unknown>>).detail;
    const items = [...list.querySelectorAll<HTMLElement>('[data-proof-row]')].map((row) => {
      const v = (k: string) => row.querySelector<HTMLInputElement>(`[data-k=${k}]`)!.value.trim();
      let extra: Record<string, unknown> = {};
      try { extra = JSON.parse(row.dataset.extra || '{}'); } catch { /* ignore */ }
      const it: Record<string, unknown> = { ...extra, label_sq: v('label_sq'), label_en: v('label_en'), value: v('value'), source_url: v('source_url'), date: v('date') };
      if (v('count')) it.count = Number(v('count'));
      for (const k of Object.keys(it)) if (it[k] === undefined || it[k] === null) delete it[k];
      return it;
    }).filter((it) => it.label_sq || it.value || it.source_url);
    payload.proof = { ...(payload.proof as object), items };
  });
}

/* one more social network */
const social = document.querySelector<HTMLFormElement>('form[data-social-form]');
social?.addEventListener('adm:payload', (e) => {
  const payload = (e as CustomEvent<Record<string, unknown>>).detail;
  const k = social.querySelector<HTMLInputElement>('[data-social-key]')!.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const v = social.querySelector<HTMLInputElement>('[data-social-url]')!.value.trim();
  const s = (payload.social ?? {}) as Record<string, string>;
  if (k && v) s[k] = v;
  payload.social = s;
});

/* UTM builder: identifiers only ([a-z0-9._~-], lower case) — the same rule the analytics ingest keeps */
const utm = document.querySelector<HTMLFormElement>('form[data-utm]');
if (utm) {
  const out = utm.querySelector<HTMLInputElement>('#u-out')!;
  const clean = (s: string) => s.trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9._~-]/g, '').slice(0, 60);
  const build = () => {
    const u = new URL(utm.querySelector<HTMLSelectElement>('[data-u=page]')!.value, utm.dataset.origin);
    for (const el of utm.querySelectorAll<HTMLInputElement>('input[data-u]')) {
      const v = clean(el.value);
      if (v) u.searchParams.set(el.dataset.u!, v);
    }
    out.value = u.href;
  };
  utm.addEventListener('input', build);
  utm.addEventListener('change', build);
  utm.addEventListener('submit', (e) => e.preventDefault());
  build();
}
