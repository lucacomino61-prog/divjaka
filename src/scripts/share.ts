/**
 * share.ts — the share row on product pages (PLAN §1: social integration). The links are real
 * <a href> printed by the server (WhatsApp, Viber, Facebook — each URL carries
 * utm_source=share&utm_medium=<channel>), so they work without JavaScript. With it: the Web Share
 * API button appears where the browser has one, "Copy link" copies the share URL (falls back to
 * selecting the visible URL field), and every share sends a 'share' event {channel, kind}.
 */
import { track } from './track';
import { tc } from '../i18n/client';

export function initShare(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-share]').forEach((row) => {
    if (row.dataset.ready) return;
    row.dataset.ready = '1';
    const kind = row.dataset.kind || 'page';
    const product = row.dataset.product || undefined;
    const title = row.dataset.title || document.title;
    const text = row.dataset.text || title;
    const url = (channel: string) => {
      const u = new URL(row.dataset.url || location.href);
      u.searchParams.set('utm_source', 'share');
      u.searchParams.set('utm_medium', channel);
      return u.href;
    };
    const say = row.querySelector<HTMLElement>('[data-share-status]');
    const announce = (msg: string) => { if (say) { say.textContent = ''; window.setTimeout(() => { say.textContent = msg; }, 60); } };

    const native = row.querySelector<HTMLButtonElement>('[data-share-native]');
    if (native && typeof navigator.share === 'function') {
      native.hidden = false;
      native.addEventListener('click', async () => {
        try {
          await navigator.share({ title, text, url: url('native') });
          track('share', { product, meta: { channel: 'native', kind } });
        } catch { /* dismissed */ }
      });
    }
    row.querySelectorAll<HTMLAnchorElement>('a[data-share-channel]').forEach((a) => {
      a.addEventListener('click', () => track('share', { product, meta: { channel: a.dataset.shareChannel, kind } }));
    });
    const copy = row.querySelector<HTMLButtonElement>('[data-share-copy]');
    const field = row.querySelector<HTMLInputElement>('[data-share-field]');
    copy?.addEventListener('click', async () => {
      const link = url('copy');
      try {
        await navigator.clipboard.writeText(link);
        announce(tc('share.copied'));
        copy.dataset.state = 'done';
        window.setTimeout(() => { delete copy.dataset.state; }, 1600);
        track('share', { product, meta: { channel: 'copy', kind } });
      } catch {
        if (field) {
          field.value = link;
          field.hidden = false;
          field.focus();
          field.select();
        }
        announce(tc('share.copyFail'));
      }
    });
  });
}
