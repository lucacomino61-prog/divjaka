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
  run.addEventListener('click', async () => {
    if (!last) return;
    const ok = await confirmDialog({ body: tc('admin.orders.flood.confirm', { n: last.codes.length }), list: last.codes, danger: true });
    if (!ok) return;
    try {
      const r = await api<{ count: number }>('/api/admin/orders/cancel-unconfirmed', 'POST', { minutes: last.minutes, methods: last.methods, dry_run: false });
      reloadWith(tc('admin.orders.flood.done', { n: r.count }));
    } catch (err) { showError(form, err); }
  });
}
