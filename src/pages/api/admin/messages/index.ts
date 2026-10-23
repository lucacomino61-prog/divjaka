import type { APIRoute } from 'astro';
import { handle, json, limitParam, offsetParam } from '../../../../lib/http';
import { requireAdmin } from '../../../../lib/auth';
import { listMessages, type Message } from '../../../../lib/db/repo/misc';

/** GET /api/admin/messages?status&kind&limit&offset → { items, total, unread } */
export const GET: APIRoute = handle(async ({ locals, url }) => {
  requireAdmin(locals);
  const sp = url.searchParams;
  return json(listMessages({
    status: (sp.get('status') || undefined) as Message['status'] | undefined,
    kind: (sp.get('kind') || undefined) as Message['kind'] | undefined,
    limit: limitParam(sp.get('limit'), 50, 200),
    offset: offsetParam(sp.get('offset')),
  }));
});
