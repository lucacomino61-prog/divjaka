/**
 * Declarative admin forms and action buttons (T6).
 *
 *   <form data-api="/api/admin/faq/3" data-method="PATCH" data-after="reload|none|go:/admin/x/{id}"
 *         data-confirm="admin.key or text" data-danger data-success="admin.saved"
 *         data-reauth="payments.iban,payments.mode" data-reauth-body="admin.key" data-field-prefix="payments.">
 *     <input name="business.phone"> <input name="units" data-type="int" data-nullable>
 *   </form>
 *   <button data-action="/api/admin/orders/9" data-method="PATCH" data-body='{"status":"cancelled"}'
 *           data-confirm="admin.order.c.cancel" data-danger>…</button>
 *
 * data-plus-day on a date input sends the next day (inclusive "last night" → exclusive API end).
 * Field types (data-type): text (default) · int · num · bool (checkbox) · list (checkboxes with the
 * same name, or comma text) · intlist · lines (textarea, one per line) · json.
 * Empty values are left out, or sent as null with data-nullable. Dotted names nest.
 * Submit is never pre-disabled; a second press while saving is ignored.
 */
import { api, ApiFail, confirmDialog, flash, reloadWith, flashNext, type FieldError } from './api';
import { tc, lang } from '../../i18n/client';
import { formatDate, formatRange, addDays } from '../../i18n/format';

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
    const conv = (v: string) => (type === 'intlist' ? Number(v.replace(/[\s  .]/g, '')) : v); // "5 000" / "5.000" → 5000
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      return [...form.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${CSS.escape(el.name)}"]`)].filter((c) => c.checked).map((c) => conv(c.value));
    }
    if (el instanceof HTMLSelectElement && el.multiple) return [...el.selectedOptions].map((o) => conv(o.value));
    const same = [...form.querySelectorAll<El>(`[name="${CSS.escape(el.name)}"]`)].filter((x) => !x.disabled);
    return same.flatMap((x) => x.value.split(type === 'intlist' ? /[,;]/ : ',')).map((s) => s.trim()).filter(Boolean).map(conv);
  }
  const raw = el.value.trim();
  if (type === 'lines') return el.value.split('\n').map((s) => s.trim()).filter(Boolean);
  if (raw === '') return empty();
  // an inclusive 'last night' field for an API whose end date is exclusive (room-nights)
  if (el.hasAttribute('data-plus-day') && ISO.test(raw)) return addDays(raw, 1);
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
  for (const el of form.querySelectorAll('[aria-describedby^="err-"]')) el.removeAttribute('aria-describedby');
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
    const named = form.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`);
    // a checkbox group reports on its fieldset, never inside one chip
    const el = (named?.matches('input[type=checkbox]') ? named.closest<HTMLElement>('fieldset[data-path]') : null) ?? named ?? form.querySelector<HTMLElement>(`[data-path="${CSS.escape(name)}"]`);
    const text = fail.code === 'required' ? f.message : fieldMessage(f.message); // 'required' = checked here, already in the admin's language
    if (!el) { s.textContent += ` (${f.path}: ${text})`; continue; }
    el.setAttribute('aria-invalid', 'true');
    const msg = document.createElement('p');
    msg.className = 'fld__err mono';
    msg.textContent = text;
    if (el.tagName === 'FIELDSET') {
      // a group of checkboxes: the message goes inside it and is read with the first box
      msg.id = `err-${Math.random().toString(36).slice(2, 8)}`;
      el.append(msg);
      const box = el.querySelector<HTMLElement>('input');
      box?.setAttribute('aria-describedby', msg.id);
      first ??= box ?? el;
      continue;
    }
    (el.closest('.fld') ?? el.parentElement)?.append(msg);
    first ??= el;
  }
  (first ?? s).scrollIntoView({ block: 'center' });
  first?.focus({ preventScroll: true });
}

/**
 * Required fields that are empty, and fields whose value breaks their data-pattern: mark them and
 * say so in the admin's language (the server still validates everything). No native `pattern`
 * attributes: Chrome's own bubble/tooltip ("Please match the requested format.") is English only.
 */
export function checkRequired(form: HTMLElement): boolean {
  const live = (el: El) => !el.disabled && !el.closest('[hidden], [data-ignore]');
  const bad: FieldError[] = [];
  for (const el of form.querySelectorAll<El>('[required], [data-pattern]')) {
    if (!live(el)) continue;
    const v = el.value.trim();
    if (el.hasAttribute('required') && !v) { bad.push({ path: el.name, message: tc('admin.required') }); continue; }
    const pat = el.dataset.pattern;
    if (pat && v) {
      let ok = true;
      try { ok = new RegExp(pat).test(v); } catch { /* a broken pattern never blocks */ }
      if (!ok) bad.push({ path: el.name, message: tc(el.dataset.patternMsg || 'admin.field.e.invalid') });
    }
  }
  // <fieldset data-path="weekdays" data-min-checked="admin.key">: at least one box must be ticked
  for (const fs of form.querySelectorAll<HTMLFieldSetElement>('fieldset[data-min-checked]')) {
    if (fs.disabled || fs.closest('[hidden], [data-ignore]')) continue;
    if (!fs.querySelector('input[type=checkbox]:checked')) bad.push({ path: fs.dataset.path ?? '', message: tc(fs.dataset.minChecked!) });
  }
  if (!bad.length) return true;
  showError(form, new ApiFail(400, 'required', '', bad));
  return false;
}

/**
 * Server field messages are short English identifiers from the zod schemas (admin-schemas.ts) or
 * zod defaults. Show them in the admin's language: known ones by key, the rest as a generic line
 * (English admins still see the original detail).
 */
const FIELD_MSG: Record<string, string> = {
  required_for_bundle: 'admin.field.e.bundle_stock',
  control_characters: 'admin.field.e.control',
  'slug or src required': 'admin.field.e.image',
  'lowercase-with-dashes': 'admin.field.e.slug',
  time_does_not_exist_in_europe_tirane: 'admin.field.e.dst',
  'to >= from, at most 400 days': 'admin.field.e.range400',
  'date_to >= date_from, at most 1100 days': 'admin.field.e.range1100',
  'to > from, at most 400 nights': 'admin.field.e.nights400',
  'at least 8 letters, digits, - or _': 'admin.field.e.code',
  'percent <= 100': 'admin.field.e.percent',
  url_must_be_path_or_https: 'admin.field.e.url',
  image_must_be_on_this_site: 'admin.field.e.share_image',
  password_too_short: 'admin.field.e.password',
  email_taken: 'admin.field.e.email_taken',
};
function fieldMessage(message: string): string {
  const key = FIELD_MSG[message];
  if (key) return tc(key);
  if (/^(Required|Invalid input: expected .*received undefined)/i.test(message)) return tc('admin.required');
  return lang() === 'en' ? message : tc('admin.field.e.invalid');
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

/**
 * Date inputs: Chrome has no Albanian locale, so a native date field shows mm/dd/yyyy even on the
 * Albanian admin (05/06/2027 reads as 5 June but is 6 May). Each one gets the chosen date in words
 * under it ("e enjte, 6 maj 2027"), live, and as its description for screen readers. CSS reserves
 * the line (.js .fld:has(input[type=date])) so adding it moves nothing.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function initDateWords(root: ParentNode = document): void {
  for (const inp of root.querySelectorAll<HTMLInputElement>('.fld input[type=date]')) {
    if (inp.dataset.words) continue;
    inp.dataset.words = '1';
    inp.parentElement?.querySelector(':scope > .fld__date')?.remove(); // a cloned row brings a stale copy
    const out = document.createElement('span');
    out.className = 'fld__date mono';
    out.id = `${inp.id || `d${Math.random().toString(36).slice(2, 8)}`}-words`;
    const upd = () => { out.textContent = ISO.test(inp.value) ? formatDate(inp.value, lang(), 'long') : ''; };
    inp.after(out);
    const by = (inp.getAttribute('aria-describedby') ?? '').split(' ').filter((x) => x && !x.endsWith('-words'));
    inp.setAttribute('aria-describedby', [...by, out.id].join(' '));
    inp.addEventListener('input', upd);
    inp.addEventListener('change', upd);
    upd();
  }
  /* range pickers: the range in words follows the inputs; the end can never be set before the start */
  for (const f of root.querySelectorAll<HTMLFormElement>('form[data-range-live]')) {
    if (f.dataset.bound) continue;
    f.dataset.bound = '1';
    const from = f.querySelector<HTMLInputElement>('input[name=from]');
    const to = f.querySelector<HTMLInputElement>('input[name=to]');
    const now = f.parentElement?.querySelector<HTMLElement>('[data-range-now]');
    const span = Number(f.dataset.span) || 0;
    const upd = () => {
      if (!from || !ISO.test(from.value)) return;
      if (to) { to.min = from.value; if (ISO.test(to.value)) from.max = to.value; }
      const end = to ? to.value : span ? addDays(from.value, span - 1) : '';
      if (now && ISO.test(end) && end >= from.value) now.textContent = formatRange(from.value, end, lang());
    };
    f.addEventListener('input', upd);
    f.addEventListener('change', upd);
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
          const pw = await confirmDialog({ body: tc(form.dataset.reauthBody || 'admin.settings.payments.confirm'), password: true });
          if (pw === false) {
            const st = statusEl(form);
            st.dataset.tone = 'error';
            st.textContent = tc('admin.notsaved');
            return;
          }
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
