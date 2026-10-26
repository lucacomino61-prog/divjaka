/**
 * Product editor (T6): language tabs, markdown-lite preview, list editors (includes/excludes,
 * bundle contents), image list (library picker + browser-side WebP resize and upload), payload
 * builder that keeps unknown `options` keys, save (POST/PATCH) with inline errors, and an
 * unsaved-changes guard.
 */
import { api, ApiFail, flash, flashNext, reloadWith } from './api';
import { serialize, showError, clearErrors, checkRequired } from './forms';
import { tc } from '../../i18n/client';

interface Img { slug?: string; src?: string; alt_sq?: string; alt_en?: string; w?: number; h?: number; thumb?: string | null }
interface Seed { id: number | null; kind: string; options: Record<string, unknown>; images: Img[]; owner: boolean }

const form = document.querySelector<HTMLFormElement>('form[data-product-form]');
const seedEl = document.getElementById('product-seed');
if (form && seedEl) {
  const seed = JSON.parse(seedEl.textContent || '{}') as Seed;
  let images: Img[] = seed.images ?? [];
  let dirty = false;
  const markDirty = () => { dirty = true; };
  form.addEventListener('input', markDirty);
  form.addEventListener('change', markDirty);
  addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); } });

  /* ---------- tabs (arrow keys move between them) ---------- */
  const tabs = [...form.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  const select = (t: HTMLButtonElement) => {
    for (const x of tabs) {
      const on = x === t;
      x.setAttribute('aria-selected', String(on));
      x.tabIndex = on ? 0 : -1;
      form.querySelector<HTMLElement>(`[data-panel="${x.dataset.tab}"]`)!.hidden = !on;
    }
  };
  for (const t of tabs) {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(t);
      const n = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length] : null;
      if (n) { e.preventDefault(); select(n); n.focus(); }
    });
  }
  const warnTabs = () => {
    for (const t of tabs) {
      const l = t.dataset.tab!;
      const name = form.querySelector<HTMLInputElement>(`[name="name_${l}"]`)!;
      t.querySelector<HTMLElement>('[data-tab-warn]')!.hidden = !!name.value.trim();
    }
  };
  form.addEventListener('input', warnTabs);
  warnTabs();

  /* ---------- markdown-lite preview (DOM nodes only, never innerHTML) ---------- */
  function inline(text: string, into: HTMLElement): void {
    const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(((?:https:\/\/|\/)[^)\s]+)\)/g;
    let last = 0;
    for (const m of text.matchAll(re)) {
      into.append(text.slice(last, m.index));
      if (m[1]) { const b = document.createElement('strong'); b.textContent = m[1]; into.append(b); }
      else if (m[2]) { const i = document.createElement('em'); i.textContent = m[2]; into.append(i); }
      else { const a = document.createElement('a'); a.textContent = m[3]; a.href = m[4]; a.rel = 'noopener'; a.target = '_blank'; into.append(a); }
      last = (m.index ?? 0) + m[0].length;
    }
    into.append(text.slice(last));
  }
  function render(src: string, out: HTMLElement): void {
    out.replaceChildren();
    for (const block of src.replace(/\r/g, '').split(/\n\s*\n/)) {
      const lines = block.split('\n').filter((l) => l.trim());
      if (!lines.length) continue;
      if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
        const ul = document.createElement('ul');
        for (const l of lines) { const li = document.createElement('li'); inline(l.replace(/^\s*[-•]\s+/, ''), li); ul.append(li); }
        out.append(ul);
      } else {
        const p = document.createElement('p');
        lines.forEach((l, i) => { if (i) p.append(document.createElement('br')); inline(l, p); });
        out.append(p);
      }
    }
  }
  for (const b of form.querySelectorAll<HTMLButtonElement>('[data-preview]')) {
    b.addEventListener('click', () => {
      const l = b.dataset.preview!;
      const ta = form.querySelector<HTMLTextAreaElement>(`[name="body_${l}"]`)!;
      const out = form.querySelector<HTMLElement>(`[data-preview-out="${l}"]`)!;
      const on = b.getAttribute('aria-pressed') !== 'true';
      if (on) render(ta.value, out);
      out.hidden = !on;
      ta.hidden = on;
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? b.dataset.labelWrite! : b.dataset.labelPreview!;
    });
  }

  /* ---------- list editors ---------- */
  const tpl = document.querySelector<HTMLTemplateElement>('template[data-list-template]');
  form.addEventListener('click', (e) => {
    const t = e.target as Element;
    const add = t.closest<HTMLElement>('[data-add]');
    if (add && tpl) {
      const list = form.querySelector<HTMLElement>(`[data-list="${add.dataset.add}"]`)!;
      const row = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
      row.querySelector('input')!.setAttribute('aria-label', add.textContent?.replace('+', '').trim() ?? '');
      list.append(row);
      row.querySelector('input')!.focus();
      markDirty();
      return;
    }
    const bt = document.querySelector<HTMLTemplateElement>('template[data-bundle-template]');
    if (t.closest('[data-add-bundle]') && bt) {
      const row = bt.content.firstElementChild!.cloneNode(true) as HTMLElement;
      form.querySelector('[data-bundle]')!.append(row);
      row.querySelector('select')!.focus();
      markDirty();
      return;
    }
    const rm = t.closest('[data-remove]');
    if (rm && !rm.closest('[data-images]')) { const row = rm.closest('li')!; const next = (row.nextElementSibling ?? row.previousElementSibling)?.querySelector<HTMLElement>('input, select'); row.remove(); next?.focus(); markDirty(); return; }
    const up = t.closest('[data-up]');
    if (up && !up.closest('[data-images]')) { const row = up.closest('li')!; if (row.previousElementSibling) row.parentElement!.insertBefore(row, row.previousElementSibling); (up as HTMLElement).focus(); markDirty(); }
  });
  const listValues = (name: string) => [...form.querySelectorAll<HTMLInputElement>(`[data-list="${name}"] input`)].map((i) => i.value.trim()).filter(Boolean);

  /* ---------- images ---------- */
  const imgList = form.querySelector<HTMLElement>('[data-images]')!;
  const imgEmpty = form.querySelector<HTMLElement>('[data-images-empty]')!;
  const field = (label: string, value: string, onInput: (v: string) => void, lang: string) => {
    const wrap = document.createElement('div');
    wrap.className = 'fld';
    const id = `img-${Math.random().toString(36).slice(2, 8)}`;
    const lab = document.createElement('label');
    lab.className = 'fld__label mono';
    lab.htmlFor = id;
    lab.textContent = label;
    const inp = document.createElement('input');
    inp.className = 'fld__input fld__input--s';
    inp.id = id;
    inp.value = value;
    inp.maxLength = 300;
    inp.lang = lang;
    inp.style.inlineSize = '100%';
    inp.addEventListener('input', () => onInput(inp.value));
    wrap.append(lab, inp);
    return wrap;
  };
  const iconBtn = (text: string, label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-icon';
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    return b;
  };
  function drawImages(focusIndex?: number): void {
    imgList.replaceChildren();
    imgEmpty.hidden = images.length > 0;
    images.forEach((im, i) => {
      const li = document.createElement('li');
      li.className = 'imgs__row';
      const img = document.createElement('img');
      img.src = im.thumb ?? (im.src ? `${im.src}-480.webp` : '');
      img.alt = '';
      img.width = 120; img.height = 90;
      const box = document.createElement('div');
      box.className = 'imgs__fields';
      box.append(
        field(tc('admin.product.images.alt_sq'), im.alt_sq ?? '', (v) => { im.alt_sq = v; markDirty(); }, 'sq'),
        field(tc('admin.product.images.alt_en'), im.alt_en ?? '', (v) => { im.alt_en = v; markDirty(); }, 'en'),
      );
      const tools = document.createElement('div');
      tools.className = 'row';
      const up = iconBtn('↑', tc('admin.product.up'), () => { if (i > 0) { [images[i - 1], images[i]] = [images[i], images[i - 1]]; markDirty(); drawImages(i - 1); } });
      const down = iconBtn('↓', tc('admin.product.down'), () => { if (i < images.length - 1) { [images[i + 1], images[i]] = [images[i], images[i + 1]]; markDirty(); drawImages(i + 1); } });
      const rm = iconBtn('×', tc('admin.remove'), () => { images.splice(i, 1); markDirty(); drawImages(Math.min(i, images.length - 1)); });
      up.disabled = i === 0; down.disabled = i === images.length - 1;
      tools.append(up, down, rm);
      box.append(tools);
      li.append(img, box);
      imgList.append(li);
    });
    if (focusIndex !== undefined && focusIndex >= 0) imgList.children[focusIndex]?.querySelector('input')?.focus();
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-lib-add]')) {
      const has = images.some((x) => x.slug === b.dataset.libAdd);
      b.disabled = has;
      b.textContent = has ? b.dataset.labelAdded! : tc('admin.product.images.library.add');
    }
  }
  drawImages();

  const lib = document.getElementById('lib-dlg') as HTMLDialogElement | null;
  form.querySelector('[data-open-lib]')?.addEventListener('click', () => lib?.showModal());
  lib?.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-lib-add]');
    if (e.target === lib) lib.close();
    if (!b) return;
    images.push({ slug: b.dataset.libAdd, alt_sq: b.dataset.altSq, alt_en: b.dataset.altEn, thumb: b.dataset.thumb, w: Number(b.dataset.w) || undefined, h: Number(b.dataset.h) || undefined });
    markDirty();
    drawImages();
    flash(tc('admin.product.images.library.added'));
  });

  /* upload: orient, resize to 480/960/1600 WebP in the browser, then POST /api/admin/upload */
  const upStatus = form.querySelector<HTMLElement>('[data-upload-status]')!;
  const MAX = 4 * 1024 * 1024;
  const toBlob = (c: HTMLCanvasElement, q: number) => new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', q));
  async function encode(bmp: ImageBitmap, width: number): Promise<Blob> {
    const w = Math.min(width, bmp.width);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round((bmp.height * w) / bmp.width);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.72, 0.6]) {
      const b = await toBlob(c, q);
      if (!b || b.type !== 'image/webp') throw new Error('no_webp');
      if (b.size <= MAX) return b;
    }
    throw new Error('too_big');
  }
  form.querySelector<HTMLInputElement>('[data-upload]')?.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    upStatus.dataset.tone = '';
    upStatus.textContent = tc('admin.product.images.uploading');
    try {
      if (!file.type.startsWith('image/')) throw new Error('not_image');
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      try {
        if (bmp.width < 480) throw new Error('too_small');
        const fd = new FormData();
        for (const w of [480, 960, 1600]) fd.set(`w${w}`, await encode(bmp, w), `w${w}.webp`);
        const r = await api<{ src: string; widths: { w: number; url: string }[] }>('/api/admin/upload', 'POST', fd);
        images.push({ src: r.src, alt_sq: '', alt_en: '', w: bmp.width, h: bmp.height, thumb: r.widths[0]?.url ?? `${r.src}-480.webp` });
      } finally { bmp.close(); }
      markDirty();
      drawImages(images.length - 1);
      upStatus.textContent = tc('admin.product.images.uploaded');
    } catch (err) {
      upStatus.dataset.tone = 'error';
      const code = err instanceof Error ? err.message : '';
      upStatus.textContent = err instanceof ApiFail ? err.message
        : code === 'no_webp' ? tc('admin.product.images.no_webp')
        : code === 'too_small' ? tc('admin.product.images.too_small')
        : code === 'not_image' ? tc('admin.product.images.not_image')
        : tc('admin.error.generic');
    }
  });

  /* ---------- payload + save ---------- */
  function payload(): Record<string, unknown> {
    const body = serialize(form!);
    for (const k of Object.keys(body)) if (k === 'options') delete body[k];
    const edited = (serialize(form!).options ?? {}) as Record<string, unknown>;
    const options: Record<string, unknown> = { ...seed.options, ...edited };
    for (const l of ['sq', 'en']) {
      if (form!.querySelector(`[data-list="excludes_${l}"]`)) {
        const v = listValues(`excludes_${l}`);
        if (v.length) options[`excludes_${l}`] = v; else delete options[`excludes_${l}`];
      }
      body[`includes_${l}`] = listValues(`includes_${l}`);
    }
    body.options = options;
    body.images = images.map(({ thumb: _t, ...rest }) => Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== '')));
    if (!seed.id) body.kind = seed.kind;
    const bundle = form!.querySelector('[data-bundle]');
    if (bundle) {
      body.bundle_items = [...bundle.querySelectorAll('li')].map((li) => ({
        product_id: Number(li.querySelector<HTMLSelectElement>('[data-bundle-product]')!.value),
        qty: Math.max(1, Number(li.querySelector<HTMLInputElement>('[data-bundle-qty]')!.value) || 1),
      })).filter((b, i, a) => a.findIndex((x) => x.product_id === b.product_id) === i);
    }
    return body;
  }

  let saving = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    clearErrors(form);
    form.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => { p.dataset.wasHidden = String(p.hidden); p.hidden = false; });
    const ok = checkRequired(form);
    form.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => { p.hidden = p.dataset.wasHidden === 'true'; });
    if (!ok) { const bad = form.querySelector<HTMLElement>('[aria-invalid="true"]'); const panel = bad?.closest<HTMLElement>('[data-panel]'); if (panel?.hidden) { const t = tabs.find((x) => x.dataset.tab === panel.dataset.panel); if (t) select(t); } bad?.focus(); return; }
    const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
    const label = submit.textContent;
    saving = true;
    submit.textContent = tc('admin.saving');
    try {
      const r = await api<{ item: { id: number }; forced_draft?: boolean }>(form.dataset.endpoint!, form.dataset.method!, payload());
      dirty = false;
      if (!seed.id) {
        flashNext(r.forced_draft ? `${tc('admin.product.created')} ${tc('admin.product.forced_draft')}` : tc('admin.product.created'));
        location.href = `/admin/produktet/${r.item.id}/`;
      } else reloadWith(tc('admin.saved'));
    } catch (err) {
      if (err instanceof ApiFail && err.code === 'below_booked') {
        const nights = ((err.extra.nights as { night: string }[]) ?? []).slice(0, 10).map((n) => n.night).join(', ');
        showError(form, new ApiFail(409, err.code, tc('admin.product.below_booked', { nights })));
      } else showError(form, err);
      // a field error in the hidden language panel: show that panel
      const bad = form.querySelector<HTMLElement>('[aria-invalid="true"]');
      const panel = bad?.closest<HTMLElement>('[data-panel]');
      if (panel?.hidden) { const t = tabs.find((x) => x.dataset.tab === panel.dataset.panel); if (t) select(t); bad?.focus(); }
    } finally {
      saving = false;
      submit.textContent = label;
    }
  });

  /* slug from the Albanian name for a new product */
  const slug = form.querySelector<HTMLInputElement>('[data-slug]');
  const nameSq = form.querySelector<HTMLInputElement>('[name="name_sq"]');
  let slugTouched = !!slug?.value;
  slug?.addEventListener('input', () => { slugTouched = true; });
  nameSq?.addEventListener('input', () => {
    if (seed.id || slugTouched || !slug) return;
    slug.value = nameSq.value.toLowerCase().replace(/ë/g, 'e').replace(/ç/g, 'c').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  });
}
