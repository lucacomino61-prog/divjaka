/** Sign-in form: show/hide password, POST /api/admin/login, rate-limit message, then `next`. */
import { tc } from '../../i18n/client';

const form = document.getElementById('login') as HTMLFormElement | null;
if (form) {
  const status = form.querySelector<HTMLElement>('[data-form-status]')!;
  const email = form.querySelector<HTMLInputElement>('input[name=email]')!;
  const pw = form.querySelector<HTMLInputElement>('input[name=password]')!;
  const toggle = form.querySelector<HTMLButtonElement>('[data-pw-toggle]')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const label = submit.textContent;

  toggle.addEventListener('click', () => {
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    toggle.textContent = show ? toggle.dataset.hide! : toggle.dataset.show!;
    toggle.setAttribute('aria-label', show ? toggle.dataset.hideAria! : toggle.dataset.showAria!);
    pw.focus();
  });

  let busy = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    status.textContent = '';
    for (const el of [email, pw]) el.removeAttribute('aria-invalid');
    if (!email.value.trim() || !pw.value) {
      (email.value.trim() ? pw : email).setAttribute('aria-invalid', 'true');
      status.dataset.tone = 'error';
      status.textContent = tc('admin.error.fields');
      (email.value.trim() ? pw : email).focus();
      return;
    }
    busy = true;
    submit.textContent = tc('admin.login.busy');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ email: email.value.trim(), password: pw.value }),
      });
      if (res.ok) { location.href = form.dataset.next || '/admin/'; return; }
      const data = await res.json().catch(() => ({}));
      const err = data.error ?? {};
      status.dataset.tone = 'error';
      if (res.status === 429) {
        const s = Number(err.retry_after);
        status.textContent = s > 0 ? tc('admin.login.rate', { s: Math.ceil(s) }) : tc('admin.login.rate.soon');
      } else {
        status.textContent = (document.documentElement.lang === 'en' ? err.message_en : err.message_sq) || tc('admin.error.generic');
        if (res.status === 401) { pw.setAttribute('aria-invalid', 'true'); pw.select(); }
      }
    } catch {
      status.dataset.tone = 'error';
      status.textContent = tc('admin.error.network');
    } finally {
      busy = false;
      submit.textContent = label;
    }
  });
}
