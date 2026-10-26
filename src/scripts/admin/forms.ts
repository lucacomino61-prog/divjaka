/**
 * Declarative admin forms and action buttons (T6).
 *
 *   <form data-api="/api/admin/faq/3" data-method="PATCH" data-after="reload|none|go:/admin/x/{id}"
 *         data-confirm="admin.key or text" data-danger data-success="admin.saved"
 *         data-reauth="payments.iban,payments.mode" data-field-prefix="payments.">
 *     <input name="business.phone"> <input name="units" data-type="int" data-nullable>
 *   </form>
 *   <button data-action="/api/admin/orders/9" data-method="PATCH" data-body='{"status":"cancelled"}'
 *           data-confirm="admin.order.c.cancel" data-danger>…</button>
 *
 * Field types (data-type): text (default) · int · num · bool (checkbox) · list (checkboxes with the
 * same name, or comma text) · intlist · lines (textarea, one per line) · json.
 * Empty values are left out, or sent as null with data-nullable. Dotted names nest.
 * Submit is never pre-disabled; a second press while saving is ignored.
 */
import { api, ApiFail, confirmDialog, flash, reloadWith, flashNext } from './api';
import { tc } from '../../i18n/client';

type El = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const text = (keyOrText: string | undefined, vars?: Record<string, string | number>) => {
  if (!keyOrText) return '';
  return keyOrText.startsWith('admin.') ? tc(keyOrText, vars) : keyOrText;
};

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function valueOf(el: El, form: HTMLFormElement | HTMLElement): unknown {
  const type = el.dataset.type ?? 'text';
  const nullable = el.hasAttribute('data-nullable');
  const empty = () => (nullable ? null : undefined);
  if (type === 'bool') return (el as HTMLInputElement).checked;
  if (type === 'list' || type === 'intlist') {
    const conv = (v: string) => (type === 'intlist' ? Number(v) : v);
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      return [...form.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${CSS.escape(el.name)}"]`)].filter((c) => c.checked).map((c) => conv(c.value));
    }
    if (el instanceof HTMLSelectElement && el.multiple) return [...el.selectedOptions].map((o) => conv(o.value));
    const same = [...form.querySelectorAll<El>(`[name="${CSS.escape(el.name)}"]`)].filter((x) => !x.disabled);
    return same.flatMap((x) => x.value.split(',')).map((s) => s.trim()).filter(Boolean).map(conv);
  }
  const raw = el.value.trim();
  if (type === 'lines') return el.value.split('\n').map((s) => s.trim()).filter(Boolean);
  if (raw === '') return empty();
  if (type === 'int') { const n = Number(raw.replace(/[\s ]/g, '')); return Number.isFinite(n) ? Math.round(n) : raw; }
  if (type === 'num') { const n = Number(raw.replace(',', '.')); return Number.isFinite(n) ? n : raw; }
  if (type === 'json') { try { return JSON.parse(raw); } catch { return raw; } }
  return el.value;
}

/** Serialize a form (or any container) into a nested object. */
export function serialize(root: HTMLFormElement | HTMLElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const seen = new Set<string>();
  for (const el of root.querySelectorAll<El>('input[name], select[name], textarea[name]')) {
    if (el.disabled || el.closest('[data-ignore]')) continue;
    if (el instanceof HTMLInputElement && el.type === 'radio' && !el.checked) continue;
    const type = el.dataset.type ?? 'text';
    if ((type === 'list' || type === 'intlist') && seen.has(el.name)) continue;
    seen.add(el.name);
    const v = valueOf(el, root);
    if (v === undefined) continue;
    setPath(out, el.name, v);
  }
  return out;
}

function statusEl(form: HTMLElement): HTMLElement {
  let s = form.querySelector<HTMLElement>('[data-form-status]');
  if (!s) {
    s = document.createElement('p');
    s.className = 'form-status';
    s.setAttribute('data-form-status', '');
    s.setAttribute('role', 'status');
    form.append(s);
  }
  return s;
}

export function clearErrors(form: HTMLElement): void {
  for (const el of form.querySelectorAll('[aria-invalid="true"]')) el.removeAttribute('aria-invalid');
  for (const el of form.querySelectorAll('.fld__err')) el.remove();
  const s = form.querySelector<HTMLElement>('[data-form-status]');
  if (s) { s.textContent = ''; s.dataset.tone = ''; }
}

export function showError(form: HTMLElement, e: unknown, prefix = ''): void {
  const fail = e instanceof ApiFail ? e : new ApiFail(0, 'error', tc('admin.error.generic'));
  const s = statusEl(form);
  s.dataset.tone = 'error';
  s.textContent = (fail.fields.length ? `${fail.message} ${tc('admin.error.fields')}` : fail.message).trim();
  let first: HTMLElement | null = null;
  for (const f of fail.fields) {
    const name = prefix + f.path;
    const el = form.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`) ?? form.querySelector<HTMLElement>(`[data-path="${CSS.escape(name)}"]`);
    if (!el) { s.textContent += ` (${f.path}: ${f.message})`; continue; }
    el.setAttribute('aria-invalid', 'true');
    const msg = document.createElement('p');
    msg.className = 'fld__err mono';
    msg.textContent = f.message;
    (el.closest('.fld') ?? el.parentElement)?.append(msg);
    first ??= el;
  }
  (first ?? s).scrollIntoView({ block: 'center' });
  first?.focus({ preventScroll: true });
}

/** Required fields that are empty: mark them and say so (the server still validates everything). */
export function checkRequired(form: HTMLElement): boolean {
  const empty = [...form.querySelectorAll<El>('[required]')].filter((el) => !el.disabled && !el.closest('[hidden], [data-ignore]') && !el.value.trim());
  if (!empty.length) return true;
  showError(form, new ApiFail(400, 'required', '', empty.map((el) => ({ path: el.name, message: tc('admin.required') }))));
  return false;
}

function after(spec: string | undefined, data: Record<string, unknown>, success: string): void {
  const s = spec ?? 'reload';
  if (s === 'none') { flash(success); return; }
  if (s.startsWith('go:')) {
    const item = (data.item ?? data) as Record<string, unknown>;
    const url = s.slice(3).replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(String(item[k] ?? data[k] ?? '')));
    flashNext(success);
    location.href = url;
    return;
  }
  reloadWith(success);
}

const busy = new WeakSet<HTMLElement>();

async function run(owner: HTMLElement, url: string, method: string, body: unknown, form: HTMLElement | null): Promise<void> {
  if (busy.has(owner)) return;
  const d = owner.dataset;
  if (d.confirm) {
    const ok = await confirmDialog({ body: text(d.confirm), danger: d.danger !== undefined, ok: d.confirmOk ? text(d.confirmOk) : undefined });
    if (!ok) return;
  }
  busy.add(owner);
  owner.setAttribute('aria-busy', 'true');
  const submit = form?.querySelector<HTMLButtonElement>('button[type=submit], button:not([type])');
  const label = submit?.textContent;
  if (submit && form) submit.dataset.label = label ?? '';
  if (submit) { submit.textContent = tc('admin.saving'); if (submit.hasAttribute('aria-label')) submit.setAttribute('aria-label', tc('admin.saving')); }
  try {
    const data = await api<Record<string, unknown>>(url, method, body);
    owner.dispatchEvent(new CustomEvent('adm:done', { bubbles: true, detail: data }));
    after(d.after, data, text(d.success ?? 'admin.saved', data as Record<string, string | number>));
  } catch (e) {
    if (form) showError(form, e, d.fieldPrefix ?? '');
    else flash(e instanceof Error ? e.message : tc('admin.error.generic'), 'error');
  } finally {
    busy.delete(owner);
    owner.removeAttribute('aria-busy');
    if (submit && label !== undefined && label !== null) { submit.textContent = label; if (submit.hasAttribute('aria-label')) submit.setAttribute('aria-label', label.trim()); }
  }
}

/** Snapshot of a form's values, for "did a password-guarded field change?". */
const initial = new WeakMap<HTMLFormElement, Record<string, unknown>>();
const getPath = (o: unknown, p: string) => p.split('.').reduce<unknown>((c, k) => (c && typeof c === 'object' ? (c as Record<string, unknown>)[k] : undefined), o);

export function initForms(root: ParentNode = document): void {
  for (const form of root.querySelectorAll<HTMLFormElement>('form[data-api]')) {
    if (form.dataset.bound) continue;
    form.dataset.bound = '1';
    form.noValidate = true; // the server validates; errors are shown inline with its messages
    if (form.dataset.reauth) initial.set(form, serialize(form));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      clearErrors(form);
      if (!checkRequired(form)) return;
      const body = serialize(form);
      const payload: Record<string, unknown> = form.dataset.wrap ? { [form.dataset.wrap]: body } : body;
      if (form.dataset.reauth) {
        const before = initial.get(form) ?? {};
        const changed = form.dataset.reauth.split(',').some((p) => JSON.stringify(getPath(before, p.trim())) !== JSON.stringify(getPath(body, p.trim())));
        if (changed) {
          const pw = await confirmDialog({ body: tc('admin.settings.payments.help'), password: true });
          if (pw === false) return;
          payload.current_password = pw;
        }
      }
      form.dispatchEvent(new CustomEvent('adm:payload', { detail: payload }));
      await run(form, form.dataset.api!, (form.dataset.method ?? 'POST').toUpperCase(), payload, form);
    });
  }
  for (const btn of root.querySelectorAll<HTMLElement>('[data-action]')) {
    if (btn.dataset.bound) continue;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      let body: unknown;
      try { body = btn.dataset.body ? JSON.parse(btn.dataset.body) : undefined; } catch { body = undefined; }
      run(btn, btn.dataset.action!, (btn.dataset.method ?? 'POST').toUpperCase(), body, btn.closest<HTMLElement>('[data-action-scope]'));
    });
  }
}
