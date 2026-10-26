/** Orders list: the "cancel unconfirmed" tool — dry run first, show the codes, confirm, cancel. */
import { api, confirmDialog, reloadWith } from './api';
import { showError, clearErrors } from './forms';
import { tc } from '../../i18n/client';

const form = document.querySelector<HTMLFormElement>('form[data-flood]');
if (form) {
  const run = form.querySelector<HTMLButtonElement>('[data-flood-run]')!;
  const status = form.querySelector<HTMLElement>('[data-form-status]')!;
  let last: { minutes: number; methods: string[]; codes: string[] } | null = null;
  const body = () => ({
    minutes: Number((form.elements.namedItem('minutes') as HTMLSelectElement).value),
    methods: [...form.querySelectorAll<HTMLInputElement>('input[name=methods]:checked')].map((c) => c.value),
  });
  form.addEventListener('change', () => { run.hidden = true; last = null; status.textContent = ''; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const b = body();
    try {
      const r = await api<{ count: number; codes: string[] }>('/api/admin/orders/cancel-unconfirmed', 'POST', { ...b, dry_run: true });
      status.dataset.tone = '';
      if (!r.count) { status.textContent = tc('admin.orders.flood.zero'); run.hidden = true; return; }
      status.textContent = tc('admin.orders.flood.found', { n: r.count, codes: r.codes.slice(0, 30).join(', ') + (r.codes.length > 30 ? ' …' : '') });
      last = { ...b, codes: r.codes };
      run.textContent = tc('admin.orders.flood.run', { n: r.count });
      run.hidden = false;
    } catch (err) { showError(form, err); }
  });
  // One run at a time: a second tap while the dialog is open or the request is in flight is ignored.
  let busy = false;
  run.addEventListener('click', async () => {
    if (!last || busy) return;
    busy = true;
    run.setAttribute('aria-busy', 'true');
    const label = run.textContent;
    try {
      const approved = last;
      const ok = await confirmDialog({ body: tc('admin.orders.flood.confirm', { n: approved.codes.length }), list: approved.codes, danger: true, ok: tc('admin.orders.flood.ok', { n: approved.codes.length }) });
      if (!ok) return;
      run.textContent = tc('admin.saving');
      // Only the codes the owner saw and approved: an order placed after the check is never touched.
      const r = await api<{ count: number; requested: number }>('/api/admin/orders/cancel-unconfirmed', 'POST', { minutes: approved.minutes, methods: approved.methods, codes: approved.codes, dry_run: false });
      reloadWith(r.count === approved.codes.length ? tc('admin.orders.flood.done', { n: r.count }) : tc('admin.orders.flood.done.part', { n: r.count, m: approved.codes.length }));
    } catch (err) { showError(form, err); } finally {
      busy = false;
      run.removeAttribute('aria-busy');
      run.textContent = label;
    }
  });
}
