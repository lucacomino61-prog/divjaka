import type { APIRoute } from 'astro';
import { handle } from '../../../../lib/http';
import { requireOwner } from '../../../../lib/auth';
import { listCustomers } from '../../../../lib/db/repo/customers';
import { today } from '../../../../lib/time';
import { audit } from '../../../../lib/audit';
import { clientIp } from '../../../../lib/security';

/** A plain number: optional minus, digits, one decimal separator. */
const PLAIN_NUMBER = /^-?\d+(?:[.,]\d+)?$/;
/** A phone number: optional leading +, then digits with spaces, dots, dashes, brackets; ≥ 7 digits. */
const PHONE = /^\+?\d[\d\s().-]*$/;
const isPhone = (t: string) => PHONE.test(t) && t.replace(/\D/g, '').length >= 7;

/**
 * CSV injection guard. The test runs on the NFKC form (so a full-width ＝ ＋ － ＠ counts as
 * = + - @, as spreadsheets read them): a cell starting with = or @ (spaces allowed before them)
 * always gets a leading apostrophe; one starting with + or - gets it unless it is a plain number
 * (-12, 3.5) or a phone number (+355 69 123 4567) — '-1-1', '+1+1' and '+HYPERLINK(…)' are
 * prefixed.
 */
function cell(v: unknown): string {
  // Line breaks and tabs become spaces first: Excel/LibreOffice treat a bare CR as a row break,
  // which would start a new cell after it (and slip past the formula guard below).
  let s = (v === null || v === undefined ? '' : String(v)).replace(/[\r\n\t\v\f]+/g, ' ');
  const t = s.normalize('NFKC').trim();
  if (/^[=@]/.test(t) || (/^[+-]/.test(t) && !PLAIN_NUMBER.test(t) && !isPhone(t))) s = "'" + s;
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * GET /api/admin/customers/export?consent=1 (owner only) → CSV (UTF-8 with BOM for Excel).
 * consent=1 = marketing list only: customers whose consent was confirmed by a paid order or by
 * staff, never a box ticked on an unverified checkout. revenue_confirmed = paid or
 * staff-confirmed orders (TEST orders never count). Every export is written to the audit log.
 */
export const GET: APIRoute = handle(async (ctx) => {
  const admin = requireOwner(ctx.locals);
  const consent = ctx.url.searchParams.get('consent') === '1';
  const { items } = listCustomers({ consent, limit: 100000 });
  const head = ['email', 'name', 'phone', 'country', 'lang', 'marketing_consent', 'consent_at', 'orders', 'revenue_confirmed', 'first_order', 'last_order', 'created_at'];
  const rows = items.map((c) => [c.email, c.name, c.phone, c.country, c.lang, c.marketing_consent, c.consent_at, c.orders, c.revenue, c.first_order, c.last_order, c.created_at].map(cell).join(','));
  const csv = '﻿' + [head.join(','), ...rows].join('\r\n') + '\r\n';
  audit('customers_export', { adminId: admin.id, ip: clientIp(ctx), detail: { consent, rows: items.length } });
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="klientet-${consent ? 'marketing-' : ''}${today()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
