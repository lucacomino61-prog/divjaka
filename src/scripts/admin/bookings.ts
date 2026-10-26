/** Bookings grid: click a night → dialog to close/open units → POST /api/admin/room-nights. */
import { api, reloadWith } from './api';
import { showError, clearErrors } from './forms';
import { tc } from '../../i18n/client';

const dlg = document.getElementById('night-dlg') as HTMLDialogElement | null;
const form = dlg?.querySelector<HTMLFormElement>('[data-night-form]');
let current: { product: number; night: string; opener: HTMLElement } | null = null;

const nextDay = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

if (dlg && form) {
  const sel = form.querySelector<HTMLSelectElement>('select[name=closed]')!;
  document.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.ncell');
    if (!b) return;
    const units = Number(b.dataset.units), booked = Number(b.dataset.booked), closed = Number(b.dataset.closed);
    current = { product: Number(b.dataset.product), night: b.dataset.night!, opener: b };
    form.querySelector('[data-night-title]')!.textContent = tc('admin.bookings.night.title', { room: b.dataset.room ?? '', date: b.dataset.date ?? b.dataset.night! });
    form.querySelector('[data-night-reading]')!.textContent = b.title;
    sel.replaceChildren();
    for (let n = 0; n <= Math.max(0, units - booked); n++) {
      const o = document.createElement('option');
      o.value = String(n);
      o.textContent = String(n);
      o.selected = n === closed;
      sel.append(o);
    }
    clearErrors(form);
    dlg.showModal();
    sel.focus();
  });
  dlg.addEventListener('close', () => current?.opener.focus());
  const save = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const saveLabel = save.textContent;
  let busy = false; // a double tap on Save sends one request
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!current || busy) return;
    clearErrors(form);
    busy = true;
    save.textContent = tc('admin.saving');
    form.setAttribute('aria-busy', 'true');
    try {
      const r = await api<{ partially: string[] }>('/api/admin/room-nights', 'POST', { product_id: current.product, from: current.night, to: nextDay(current.night), closed: Number(sel.value) });
      dlg.close();
      current = null; // the page reloads: stay busy
      reloadWith(r.partially?.length ? tc('admin.bookings.night.partial', { nights: r.partially.join(', ') }) : tc('admin.saved'));
    } catch (err) {
      showError(form, err);
      busy = false;
      save.textContent = saveLabel;
      form.removeAttribute('aria-busy');
    }
  });
}
