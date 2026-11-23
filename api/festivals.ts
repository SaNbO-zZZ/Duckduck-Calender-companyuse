import { z } from 'zod';
import { festivals } from '../shared/festivals.js';
import { db, currentUser, handler, HttpError } from '../lib/feishu-auth.js';
import { body, input, json, query } from '../lib/business-http.js';
export default handler(
  async (ctx) => {
    const user = await currentUser(ctx);
    if (ctx.req.method === 'GET') return json(ctx, await db('festival_themes?select=key,name,enabled'));
    if (user.role !== 'admin') throw new HttpError(403, '需要管理员批准。');
    const f = input(
      z
        .object({
          key: z.enum(festivals.map((t) => t.key)),
          enabled: z.boolean(),
          confirmed: z.literal(true),
        })
        .strict(),
      await body(ctx),
    );
    const rows = await db<unknown[]>(
      query('festival_themes', { key: 'eq.' + f.key }),
      'PATCH',
      { enabled: f.enabled, updated_at: new Date().toISOString() },
      'return=representation',
    );
    if (rows.length !== 1) throw new HttpError(409, '主题尚未初始化。');
    return json(ctx, { enabled: f.enabled });
  },
  ['GET', 'POST'],
);
