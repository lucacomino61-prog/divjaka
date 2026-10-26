import type { APIRoute } from 'astro';
import { z } from 'zod';
import { handle, json, readJson, zEmail, zLine } from '../../lib/http';
import { createMessage } from '../../lib/db/repo/misc';
import { assertSameOrigin, clientIp, rateLimit } from '../../lib/security';

const Body = z
  .object({
    kind: z.enum(['contact', 'callback']).default('contact'),
    name: zLine(120).pipe(z.string().min(1)),
    email: zEmail.optional().or(z.literal('')),
    phone: zLine(40).optional().or(z.literal('')),
    subject: zLine(160).optional(),
    message: z.string().trim().min(2).max(5000),
    lang: z.enum(['sq', 'en']).default('sq'),
    website: z.string().max(200).optional(), // honeypot
    elapsed_ms: z.number().int().min(0).max(864e5).optional(), // time trap (T7): ms between page render and submit
  })
  .refine((b) => !!(b.email || b.phone), { message: 'email_or_phone', path: ['email'] });

/** POST /api/contact { kind, name, email?, phone?, subject?, message, lang, website(honeypot) } → 201 { ok:true, id } */
export const POST: APIRoute = handle(async (ctx) => {
  assertSameOrigin(ctx.request, ctx.url);
  const b = await readJson(ctx.request, Body, 16 * 1024);
  // Bots fill the hidden field: pretend success, store nothing.
  if (b.website) return json({ ok: true, id: 0 }, { status: 201 });
  // Time trap (T7, 2026-10-23): a form sent less than 2.5 s after it was shown is a script.
  if (b.elapsed_ms != null && b.elapsed_ms < 2500) return json({ ok: true, id: 0 }, { status: 201 });
  // Only messages that would be stored count towards the limit.
  rateLimit('contact', clientIp(ctx), 5, 10 * 60_000);
  const id = createMessage({ kind: b.kind, name: b.name, email: b.email || null, phone: b.phone || null, lang: b.lang, subject: b.subject ?? null, body: b.message });
  return json({ ok: true, id }, { status: 201 });
});
