/**
 * Admin API client (T6). Same-origin fetch (the browser sends Sec-Fetch-Site: same-origin, which
 * the middleware requires for admin mutations). Errors come back as ApiFail with the message in
 * the admin's language and, for validation errors, the failing field paths.
 */
import { tc, lang } from '../../i18n/client';

export interface FieldError { path: string; message: string }
export class ApiFail extends Error {
  constructor(public status: number, public code: string, message: string, public fields: FieldError[] = [], public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, method = 'GET', body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { ...(body instanceof FormData ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' }), ...extraHeaders },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiFail(0, 'network', tc('admin.error.network'));
  }
  let data: Record<string, unknown> = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const e = (data.error ?? {}) as Record<string, unknown>;
    if (res.status === 401 && e.code === 'unauthorized') {
      location.href = `/admin/login/?next=${encodeURIComponent(location.pathname + location.search)}`;
    }
    const msg = (lang() === 'en' ? e.message_en : e.message_sq) as string | undefined;
    throw new ApiFail(res.status, String(e.code ?? 'error'), msg || tc('admin.error.generic'), (e.fields as FieldError[]) ?? [], e);
  }
  return data as T;
}

/** A message for the status line after a reload (sessionStorage, read once by shell.ts). */
export function flashNext(message: string): void {
  try { sessionStorage.setItem('dv-admin-flash', message); } catch { /* private mode */ }
}

let flashTimer = 0;
/** Show the logbook slip at the corner (role=status). */
export function flash(message: string, tone: 'ok' | 'error' = 'ok'): void {
  const el = document.getElementById('adm-flash');
  if (!el) return;
  el.textContent = message;
  el.dataset.tone = tone;
  el.hidden = false;
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => { el.hidden = true; }, tone === 'error' ? 9000 : 4000);
}

export interface ConfirmOpts { body: string; ok?: string; list?: string[]; password?: boolean; danger?: boolean }

/** The shared confirm dialog. Resolves false on cancel, true (or the password) on confirm. */
export function confirmDialog(o: ConfirmOpts): Promise<false | true | string> {
  const d = document.getElementById('adm-confirm') as HTMLDialogElement | null;
  if (!d) return Promise.resolve(window.confirm(o.body));
  const body = d.querySelector<HTMLElement>('[data-confirm-body]')!;
  const list = d.querySelector<HTMLElement>('[data-confirm-list]')!;
  const pwWrap = d.querySelector<HTMLElement>('[data-confirm-password]')!;
  const pw = pwWrap.querySelector('input')!;
  const ok = d.querySelector<HTMLButtonElement>('[data-confirm-ok]')!;
  body.textContent = o.body;
  list.replaceChildren(...(o.list ?? []).map((s) => { const li = document.createElement('li'); li.textContent = s; return li; }));
  list.hidden = !o.list?.length;
  pwWrap.hidden = !o.password;
  pw.value = '';
  pw.required = false; // checked below in the admin's language (the native bubble would be English)
  pw.removeAttribute('aria-invalid');
  const pwErr = d.querySelector<HTMLElement>('#adm-confirm-pw-err');
  const pwOk = () => {
    if (pwErr) pwErr.hidden = true;
    pw.removeAttribute('aria-invalid');
    pw.setAttribute('aria-describedby', 'adm-confirm-pw-why');
  };
  pwOk();
  const form = d.querySelector('form')!;
  form.noValidate = true;
  ok.textContent = o.ok ?? tc('admin.confirm');
  ok.classList.toggle('pill--signal', !!o.danger);
  const back = d.querySelector<HTMLButtonElement>('[data-confirm-back]');
  return new Promise((resolve) => {
    const ac = new AbortController();
    back?.addEventListener('click', () => d.close('cancel'), { signal: ac.signal });
    form.addEventListener('submit', (e) => {
      if (o.password && !pw.value) {
        // WCAG 3.3.1: say what is wrong, in words, tied to the field (role=alert announces it once)
        e.preventDefault();
        pw.setAttribute('aria-invalid', 'true');
        if (pwErr) {
          pwErr.textContent = tc('admin.confirm.password.empty');
          pwErr.hidden = false;
          pw.setAttribute('aria-describedby', 'adm-confirm-pw-err adm-confirm-pw-why');
        }
        pw.focus();
      }
    }, { signal: ac.signal });
    pw.addEventListener('input', () => { if (pw.value) pwOk(); }, { signal: ac.signal });
    d.addEventListener('close', () => {
      ac.abort();
      const yes = d.returnValue === 'ok';
      resolve(yes ? (o.password ? pw.value : true) : false);
    }, { signal: ac.signal });
    d.returnValue = '';
    d.showModal();
    // a password goes first; on a destructive confirm the safe answer ("Jo, kthehu") takes focus,
    // so Enter pressed twice never cancels an order or releases its inventory
    (o.password ? pw : o.danger && back ? back : ok).focus();
  });
}

/** Reload the page, keeping the scroll position, and show `message` after it. */
export function reloadWith(message?: string): void {
  if (message) flashNext(message);
  try { sessionStorage.setItem('dv-admin-scroll', `${location.pathname}|${Math.round(scrollY)}`); } catch { /* ignore */ }
  location.reload();
}
