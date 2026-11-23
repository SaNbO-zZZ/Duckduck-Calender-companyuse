import { z } from 'zod';
import { db, currentUser, handler, HttpError } from '../lib/feishu-auth.js';
import { body, input, insert, json, method, query } from '../lib/business-http.js';
import { chapters, syncCharter } from '../lib/charter.js';

export default handler(
  async (ctx) => {
    const user = await currentUser(ctx),
      action = ctx.url.searchParams.get('action');
    if (!action) {
      method(ctx, 'GET');
      const docs = await chapters(),
        version = docs[0]?.version;
      const active = await db<{ open_id: string }[]>('feishu_users?select=open_id&is_active=eq.true');
      const read = version
        ? await db<{ user_open_id: string }[]>(
            query('charter_acknowledgements', {
              select: 'user_open_id',
              charter_version: 'eq.' + version,
            }),
          )
        : [];
      const ids = new Set(read.map((r) => r.user_open_id));
      return json(ctx, {
        docs,
        version,
        acknowledged: ids.has(user.open_id),
        total: active.length,
        read: active.filter((p) => ids.has(p.open_id)).length,
      });
    }
    method(ctx, 'POST');
    if (action === 'ack') {
      const { version } = input(z.object({ version: z.string().max(30) }).strict(), await body(ctx));
      if ((await chapters())[0]?.version !== version)
        throw new HttpError(409, '公约版本已更新，请重新阅读。');
      await insert('charter_acknowledgements', 'user_open_id,charter_version', {
        user_open_id: user.open_id,
        charter_version: version,
      });
      return json(ctx, { acknowledged: true });
    }
    if (user.role !== 'admin') throw new HttpError(403, '需要管理员权限。');
    if (action === 'sync') return json(ctx, await syncCharter(user.open_id));
    if (action === 'edit') {
      const { slug, duck_sticker_id, is_pinned } = input(
        z
          .object({
            slug: z.string().max(100),
            duck_sticker_id: z.string().regex(/^(0[1-9]|1[0-9]|2[0-4])$/),
            is_pinned: z.boolean(),
          })
          .strict(),
        await body(ctx),
      );
      if (!(await chapters()).some((d) => d.slug === slug)) throw new HttpError(409, '章节版本已更新。');
      await db(query('company_charter_docs', { slug: 'eq.' + slug }), 'PATCH', {
        duck_sticker_id,
        is_pinned,
        updated_by: user.open_id,
        updated_at: new Date().toISOString(),
      });
      return json(ctx, { saved: true });
    }
    throw new HttpError(404, '操作不存在。');
  },
  ['GET', 'POST'],
);
