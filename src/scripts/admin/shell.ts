/**
 * Admin shell (T6): language toggle, sign-out, the phone menu dialog, the flash slip after a
 * reload, scroll restore, declarative forms/actions, chart hover readouts and copy buttons.
 * No animation loop: every change is a CSS state transition of ≤ 150 ms.
 */
import { api, flash } from './api';
import { initForms } from './forms';
import { initCharts } from './charts';
import { tc } from '../../i18n/client';

function setLang(l: string): void {
  try { localStorage.setItem('dv-admin-lang', l); sessionStorage.removeItem('dv-admin-lang-sync'); } catch { /* ignore */ }
  document.cookie = `dv_admin_lang=${l}; path=/admin; max-age=31536000; samesite=strict${location.protocol === 'https:' ? '; secure' : ''}`;
  location.reload();
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-admin-lang-toggle]')) {
  b.addEventListener('click', () => setLang(b.dataset.adminLangToggle === 'en' ? 'en' : 'sq'));
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-admin-logout]')) {
  b.addEventListener('click', async () => {
    try { await api('/api/admin/logout', 'POST', {}); } catch { /* signed out anyway */ }
    try { sessionStorage.setItem('dv-admin-flash', tc('admin.login.out')); } catch { /* ignore */ }
    location.href = '/admin/login/';
  });
}

/* phone menu: <dialog id="adm-menu"> opened by [data-open], closed by [data-close], Esc, or a link */
for (const opener of document.querySelectorAll<HTMLElement>('[data-open]')) {
  const d = document.getElementById(opener.dataset.open!) as HTMLDialogElement | null;
  if (!d) continue;
  opener.addEventListener('click', () => {
    d.showModal();
    opener.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('adm-locked');
  });
  d.addEventListener('close', () => {
    opener.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('adm-locked');
    opener.focus();
  });
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
}
for (const closer of document.querySelectorAll<HTMLElement>('[data-close]')) {
  closer.addEventListener('click', () => (document.getElementById(closer.dataset.close!) as HTMLDialogElement | null)?.close());
}

/* the flash message left by the previous page */
try {
  const msg = sessionStorage.getItem('dv-admin-flash');
  if (msg) { sessionStorage.removeItem('dv-admin-flash'); flash(msg); }
  const sc = sessionStorage.getItem('dv-admin-scroll');
  if (sc) {
    sessionStorage.removeItem('dv-admin-scroll');
    const [p, y] = sc.split('|');
    if (p === location.pathname && !location.hash) window.scrollTo({ top: Number(y) || 0, behavior: 'instant' });
  }
} catch { /* ignore */ }

/* copy buttons: <button data-copy="#id"> copies the target's value or text */
document.addEventListener('click', async (e) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-copy]');
  if (!b) return;
  const t = document.querySelector<HTMLInputElement | HTMLElement>(b.dataset.copy!);
  const v = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement ? t.value : t?.textContent ?? '';
  try { await navigator.clipboard.writeText(v); flash(tc('admin.copied')); } catch {
    if (t instanceof HTMLInputElement) { t.select(); }
  }
});

/* auto-submit filter forms when a select changes (the submit button stays for keyboard and JS-off) */
for (const f of document.querySelectorAll<HTMLFormElement>('form[data-autosubmit]')) {
  f.addEventListener('change', (e) => { if ((e.target as Element).matches('select, input[type=checkbox], input[type=radio]')) f.requestSubmit(); });
}

/* print buttons */
for (const b of document.querySelectorAll<HTMLElement>('[data-print]')) b.addEventListener('click', () => window.print());

/* Controls inside a closed <details> are not rendered, so tools that read innerText find no name:
   give them their visible text as aria-label (same words, so the name still matches the label). */
for (const el of document.querySelectorAll<HTMLElement>('details a[href], details button')) {
  const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (txt && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', txt);
}

initForms();
initCharts();

/* the "new product" menu (a <details>): closes on Esc and on a click outside */
document.addEventListener('click', (e) => {
  for (const d of document.querySelectorAll<HTMLDetailsElement>('details.newmenu[open]')) if (!d.contains(e.target as Node)) d.open = false;
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  for (const d of document.querySelectorAll<HTMLDetailsElement>('details.newmenu[open]')) { d.open = false; d.querySelector('summary')?.focus(); }
});
