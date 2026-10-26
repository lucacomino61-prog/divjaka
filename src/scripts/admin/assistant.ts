/** Assistant admin: FAQ link rows (route key or address) into the payload, and the test box. */
import { api, ApiFail } from './api';
import { tc } from '../../i18n/client';

/* links: rows → [{key, params?, label_sq, label_en}] or [{url, label_sq, label_en}] */
for (const form of document.querySelectorAll<HTMLFormElement>('form[data-faq-form]')) {
  const list = form.querySelector<HTMLElement>('[data-links]')!;
  const tpl = form.querySelector<HTMLTemplateElement>('template[data-link-template]')!;
  const sync = (row: HTMLElement) => {
    const page = row.querySelector<HTMLSelectElement>('[data-k=page]')!;
    row.querySelector<HTMLInputElement>('[data-k=url]')!.hidden = !!page.value;
  };
  form.addEventListener('change', (e) => { const row = (e.target as Element).closest<HTMLElement>('[data-link-row]'); if (row) sync(row); });
  form.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('[data-link-add]')) { const row = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement; list.append(row); row.querySelector('select')!.focus(); }
    const rm = t.closest('[data-link-remove]');
    if (rm) rm.closest('li')!.remove();
  });
  form.addEventListener('adm:payload', (e) => {
    const payload = (e as CustomEvent<Record<string, unknown>>).detail;
    payload.links = [...list.querySelectorAll<HTMLElement>('[data-link-row]')].map((row) => {
      const v = (k: string) => row.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-k=${k}]`)!.value.trim();
      const out: Record<string, unknown> = {};
      if (v('page')) { out.key = v('page'); if (row.dataset.params) { try { out.params = JSON.parse(row.dataset.params); } catch { /* ignore */ } } } else if (v('url')) out.url = v('url');
      if (v('label_sq')) out.label_sq = v('label_sq');
      if (v('label_en')) out.label_en = v('label_en');
      return out;
    }).filter((l) => l.key || l.url);
  });
}

/* test box */
const test = document.querySelector<HTMLFormElement>('form[data-assistant-test]');
if (test) {
  const q = test.querySelector<HTMLTextAreaElement>('textarea')!;
  const l = test.querySelector<HTMLSelectElement>('select')!;
  const out = test.querySelector<HTMLElement>('[data-out]')!;
  const status = test.querySelector<HTMLElement>('[data-form-status]')!;
  let busy = false;
  test.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy || !q.value.trim()) { q.focus(); return; }
    busy = true;
    status.textContent = tc('admin.assistant.test.busy');
    status.dataset.tone = '';
    try {
      const r = await api<{ reply: string; chips: string[]; links: { label: string; url: string }[]; intent?: string }>('/api/assistant', 'POST', { lang: l.value, message: q.value.trim() });
      status.textContent = '';
      out.hidden = false;
      out.querySelector('[data-reply]')!.textContent = r.reply;
      out.querySelector('[data-intent]')!.textContent = r.intent ? `· ${r.intent}` : '';
      out.querySelector('[data-chips]')!.replaceChildren(...(r.chips ?? []).map((c) => { const li = document.createElement('li'); li.className = 'chip'; li.textContent = c; return li; }));
      out.querySelector('[data-links]')!.replaceChildren(...(r.links ?? []).filter((x) => /^\/(?![/\\])|^https:\/\//.test(x.url)).map((x) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = x.url; a.textContent = `${x.label} → ${x.url}`; a.target = '_blank'; a.rel = 'noopener';
        li.append(a);
        return li;
      }));
    } catch (err) {
      status.dataset.tone = 'error';
      status.textContent = err instanceof ApiFail ? err.message : tc('admin.error.generic');
    } finally { busy = false; }
  });
}
