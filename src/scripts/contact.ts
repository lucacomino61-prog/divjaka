/**
 * contact.ts — the contact form with JavaScript (T7): validate inline, POST /api/contact as JSON
 * (honeypot `website` + `elapsed_ms` time trap), success state in place, error state that keeps
 * every typed character. Without JavaScript the form posts to the page itself (Contact.astro).
 */
import { tc } from '../i18n/client';

export function initContact() {
  const form = document.querySelector<HTMLFormElement>('[data-contact-form]');
  if (!form) return;
  const box = form.closest<HTMLElement>('[data-contact]')!;
  const sent = box.querySelector<HTMLElement>('[data-sent]')!;
  const summary = form.querySelector<HTMLElement>('[data-form-error]');
  const shownAt = Date.now();
  const field = (n: string) => form.elements.namedItem(n) as HTMLInputElement | null;
  const val = (n: string) => (field(n)?.value ?? '').trim();
  const setErr = (n: string, msg: string) => {
    const out = form.querySelector<HTMLElement>(`[data-err="${n}"]`);
    if (out) out.textContent = msg;
    const f = field(n);
    if (f) { if (msg) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid'); }
  };
  const setSummary = (msg: string) => { if (summary) { summary.textContent = msg; summary.hidden = !msg; } };

  // clear a field's error as soon as it is corrected
  form.addEventListener('input', (e) => {
    const n = (e.target as HTMLInputElement).name;
    if (n === 'phone') setErr('email', '');
    else if (n) setErr(n, '');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = val('name'), email = val('email'), phone = val('phone'), message = val('message'), subject = val('subject');
    ['name', 'email', 'message'].forEach((n) => setErr(n, ''));
    setSummary('');
    let first: string | null = null;
    const err = (n: string, k: string) => { setErr(n, tc(k)); first ??= n; };
    if (!name) err('name', 'contact.form.err.name');
    if (!email && !phone) err('email', 'contact.form.err.contact');
    else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) err('email', 'contact.form.err.email');
    if (message.length < 2) err('message', 'contact.form.err.message');
    if (first) { setSummary(tc('contact.form.err.summary')); field(first)?.focus(); return; }

    const btn = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    const label = btn.querySelector<HTMLElement>('[data-send-label]')!;
    const idle = label.textContent;
    const slow = window.setTimeout(() => { label.textContent = tc('contact.form.sending'); btn.setAttribute('aria-busy', 'true'); }, 250);
    const subjectText = subject ? form.querySelector<HTMLOptionElement>(`#cf-subject option[value="${subject}"]`)?.textContent ?? subject : undefined;
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          kind: 'contact', name, email, phone, message, lang: document.documentElement.lang === 'en' ? 'en' : 'sq',
          ...(subjectText ? { subject: subjectText.slice(0, 160) } : {}),
          website: val('website'), elapsed_ms: Math.min(864e5, Date.now() - shownAt),
        }),
      });
      if (res.status === 429) throw new Error('rate');
      if (!res.ok) throw new Error('server');
      sent.querySelector('[data-sent-body]')!.textContent = tc('contact.form.sent.body', { name });
      form.reset();
      form.hidden = true;
      sent.hidden = false;
      sent.focus();
    } catch (x) {
      setSummary(tc((x as Error).message === 'rate' ? 'contact.form.err.rate' : 'contact.form.err.server'));
      summary?.focus?.();
    } finally {
      clearTimeout(slow);
      label.textContent = idle;
      btn.removeAttribute('aria-busy');
    }
  });

  sent.querySelector('[data-again]')?.addEventListener('click', (e) => {
    e.preventDefault();
    sent.hidden = true;
    form.hidden = false;
    field('name')?.focus();
  });
}
