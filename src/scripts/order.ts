/**
 * order.ts — the order page and "Rezervimet e mia" (T5).
 *
 * initOrder(): add-to-calendar (an .ics file built here from the server's event list: stays as
 * all-day events arrival → departure, sessions in Europe/Tirane time with their length), copy
 * buttons for the IBAN and the reference, print, and the "open with your e-mail" form through
 * POST /api/lookup (the form also works without JavaScript: it posts to the page).
 *
 * initBookings(): find a booking (code + e-mail → /api/lookup → the order page; without
 * JavaScript the page handles the POST itself), "Interesat e mia" chips (dv-prefs), "Parë së
 * fundi" from dv-viewed (server-rendered rows, shown here in the viewed order) and "clear my
 * data": every dv-* key in localStorage and sessionStorage, after an inline confirmation.
 */
import { tc, lang } from '../i18n/client';
import { getPrefs, getViewed, onPrefs, setInterests, toggleInterest } from './prefs';
import { setMotion, userStopped } from './motion';

/* ------------------------------------------------------------------ shared lookup */

async function lookup(code: string, email: string): Promise<{ url?: string; error?: string }> {
  try {
    const r = await fetch('/api/lookup', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ code, email, lang: lang() }),
    });
    if (r.ok) return { url: (await r.json()).url };
    if (r.status === 429) return { error: tc('account.err.rate') };
    if (r.status === 404 || r.status === 400) return { error: tc('account.err.notfound') };
    return { error: tc('account.err.network') };
  } catch {
    return { error: tc('account.err.network') };
  }
}

const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const normCode = (s: string) => {
  const c = s.trim().toUpperCase().replace(/\s+/g, '');
  return /^DV-?[A-Z0-9]{4,12}$/.test(c) ? c.replace(/^DV(?!-)/, 'DV-') : '';
};

/* ------------------------------------------------------------------ order page */

interface IcsEvent { uid: string; title: string; start: string; end: string; allDay: boolean; location: string; desc: string }

const VTZ = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Tirane',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const d8 = (iso: string) => iso.slice(0, 10).replace(/-/g, '');
const dt = (iso: string) => `${d8(iso)}T${iso.slice(11, 13)}${iso.slice(14, 16)}00`;
/** RFC 5545 lines are folded at 75 octets. */
const fold = (line: string) => {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 74) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
};

export function buildIcs(events: IcsEvent[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hotel Pelikan//Divjaka//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...VTZ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@hotel-pelikan.divjaka`, `DTSTAMP:${stamp}`);
    if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${d8(e.start)}`, `DTEND;VALUE=DATE:${d8(e.end)}`);
    else lines.push(`DTSTART;TZID=Europe/Tirane:${dt(e.start)}`, `DTEND;TZID=Europe/Tirane:${dt(e.end)}`);
    lines.push(`SUMMARY:${esc(e.title)}`, `LOCATION:${esc(e.location)}`, `DESCRIPTION:${esc(e.desc)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function initOrder(): void {
  const say = document.querySelector<HTMLElement>('[data-order-say]');
  const announce = (m: string) => { if (say) { say.textContent = ''; window.setTimeout(() => { say.textContent = m; }, 60); } };

  const icsData = document.querySelector<HTMLScriptElement>('script[data-ics]');
  const icsBtn = document.querySelector<HTMLButtonElement>('[data-ics-all]');
  if (icsData && icsBtn) {
    let events: IcsEvent[] = [];
    try { events = JSON.parse(icsData.textContent || '[]'); } catch { events = []; }
    if (events.length) {
      icsBtn.hidden = false;
      icsBtn.addEventListener('click', () => {
        const blob = new Blob([buildIcs(events)], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = tc('order.ics.file');
        document.body.append(a); a.click(); a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      });
    }
  }
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy || ''); announce(tc('order.copied')); b.dataset.state = 'done'; }
    catch { const r = document.createRange(); const v = b.previousElementSibling; if (v) { r.selectNodeContents(v); getSelection()?.removeAllRanges(); getSelection()?.addRange(r); } }
  }));
  const pr = document.querySelector<HTMLButtonElement>('[data-print]');
  if (pr) { pr.hidden = false; pr.addEventListener('click', () => window.print()); }

  // clean ?pay=… from the address once its banner has been shown (a reload shows the status only)
  const u = new URL(location.href);
  if (u.searchParams.has('pay')) { u.searchParams.delete('pay'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); }

  const locked = document.querySelector<HTMLFormElement>('[data-order-locked]');
  if (locked) {
    const err = locked.querySelector<HTMLElement>('[data-lookup-err]')!;
    locked.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = String(new FormData(locked).get('email') ?? '').trim();
      const input = locked.querySelector<HTMLInputElement>('input[name="email"]')!;
      if (!emailOk(email)) { err.textContent = tc('account.err.email'); err.hidden = false; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
      input.removeAttribute('aria-invalid');
      const r = await lookup(locked.dataset.code || '', email);
      if (r.url) { location.assign(r.url); return; }
      err.textContent = r.error ?? ''; err.hidden = false;
    });
  }
}

/* ------------------------------------------------------------------ bookings page */

export function initBookings(): void {
  const form = document.querySelector<HTMLFormElement>('[data-lookup]');
  if (form) {
    const codeIn = form.querySelector<HTMLInputElement>('input[name="code"]')!;
    const emailIn = form.querySelector<HTMLInputElement>('input[name="email"]')!;
    const errCode = form.querySelector<HTMLElement>('[data-err="code"]')!;
    const errEmail = form.querySelector<HTMLElement>('[data-err="email"]')!;
    const out = form.querySelector<HTMLElement>('[data-lookup-out]')!;
    let busy = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      [errCode, errEmail].forEach((x) => { x.hidden = true; x.textContent = ''; });
      [codeIn, emailIn].forEach((x) => x.removeAttribute('aria-invalid'));
      out.textContent = '';
      const code = normCode(codeIn.value);
      const email = emailIn.value.trim();
      let first: HTMLInputElement | null = null;
      if (!code) { errCode.textContent = tc('account.err.code'); errCode.hidden = false; codeIn.setAttribute('aria-invalid', 'true'); first ??= codeIn; }
      if (!emailOk(email)) { errEmail.textContent = tc('account.err.email'); errEmail.hidden = false; emailIn.setAttribute('aria-invalid', 'true'); first ??= emailIn; }
      if (first) { first.focus(); return; }
      busy = true;
      const t = window.setTimeout(() => { out.textContent = tc('account.searching'); }, 200);
      const r = await lookup(code, email);
      clearTimeout(t);
      busy = false;
      if (r.url) { out.textContent = tc('account.found', { code }); location.assign(r.url); return; }
      out.textContent = r.error ?? '';
    });
  }

  // interests
  const chips = [...document.querySelectorAll<HTMLButtonElement>('[data-acc-interest]')];
  const saved = document.querySelector<HTMLElement>('[data-acc-saved]');
  const paint = () => {
    const on = new Set(getPrefs().interests);
    chips.forEach((c) => c.setAttribute('aria-pressed', String(on.has(c.dataset.accInterest!))));
  };
  chips.forEach((c) => c.addEventListener('click', () => {
    toggleInterest(c.dataset.accInterest!);
    if (saved) { saved.textContent = ''; window.setTimeout(() => { saved.textContent = tc('account.interests.saved'); }, 60); }
  }));
  paint();
  onPrefs(paint);
  document.querySelector('[data-acc-interest-clear]')?.addEventListener('click', () => setInterests([]));

  // recently viewed
  const pool = document.querySelector<HTMLElement>('[data-viewed-pool]');
  const list = document.querySelector<HTMLElement>('[data-viewed-list]');
  const empty = document.querySelector<HTMLElement>('[data-viewed-empty]');
  const paintViewed = () => {
    if (!pool || !list || !empty) return;
    const rows = new Map([...pool.querySelectorAll<HTMLElement>('[data-viewed]'), ...list.querySelectorAll<HTMLElement>('[data-viewed]')].map((r) => [r.dataset.viewed!, r]));
    const v = getViewed().filter((s) => rows.has(s)).slice(0, 12);
    rows.forEach((r) => pool.append(r));
    v.forEach((s, i) => { const r = rows.get(s)!; r.querySelector<HTMLElement>('[data-viewed-n]')!.textContent = String(i + 1).padStart(2, '0'); list.append(r); });
    empty.hidden = v.length > 0;
    list.hidden = v.length === 0;
  };
  paintViewed();
  onPrefs(paintViewed);

  // clear my data
  const clearBtn = document.querySelector<HTMLButtonElement>('[data-clear]');
  const confirmBox = document.querySelector<HTMLElement>('[data-clear-confirm]');
  const done = document.querySelector<HTMLElement>('[data-clear-done]');
  clearBtn?.addEventListener('click', () => {
    if (!confirmBox) return;
    confirmBox.hidden = false;
    clearBtn.setAttribute('aria-expanded', 'true');
    confirmBox.querySelector<HTMLButtonElement>('[data-clear-yes]')?.focus();
  });
  confirmBox?.querySelector('[data-clear-no]')?.addEventListener('click', () => {
    confirmBox.hidden = true; clearBtn?.setAttribute('aria-expanded', 'false'); clearBtn?.focus();
  });
  confirmBox?.querySelector('[data-clear-yes]')?.addEventListener('click', () => {
    for (const store of [localStorage, sessionStorage]) {
      try {
        const keys: string[] = [];
        for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k && k.startsWith('dv-')) keys.push(k); }
        keys.forEach((k) => store.removeItem(k));
      } catch { /* storage blocked */ }
    }
    // the rest of the page follows: counters, prefs, motion back to the default
    if (userStopped()) setMotion(false);
    document.documentElement.dataset.cur = 'ALL';
    window.dispatchEvent(new CustomEvent('dv:cart', { detail: { count: 0 } }));
    window.dispatchEvent(new CustomEvent('dv:prefs', { detail: getPrefs() }));
    confirmBox.hidden = true;
    clearBtn?.setAttribute('aria-expanded', 'false');
    if (done) { done.hidden = false; done.textContent = tc('account.data.done'); done.focus(); }
  });
}
