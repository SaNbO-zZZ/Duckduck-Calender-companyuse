import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  WIKI_URL,
  releaseTitle,
  ENTRY_NOTICE_KEY,
  ENTRY_NOTICE_TITLE,
  ENTRY_NOTICE_CONTENT,
} from '../shared/release-copy.js';
import { db, HttpError, type Context, type DirectoryUser } from './feishu-auth.js';
import { body, input, json, method, patch, query } from './business-http.js';
import { Feishu, openId } from './feishu-platform.js';

const version = z
  .string()
  .regex(/^v\d+\.\d+\.\d+$/)
  .max(32);
const form = z
  .object({ version, highlights: z.array(z.string().trim().min(2).max(90)).min(1).max(5) })
  .strict();
async function summary(key: string) {
  const where = { version: 'eq.' + key };
  const [batches, rows] = await Promise.all([
    db<{ expected_count: number }[]>(
      query('calendar_release_announcement', { ...where, select: 'expected_count' }),
    ),
    db<{ state: string }[]>(query('calendar_release_delivery', { ...where, select: 'state' })),
  ]);
  if (!batches[0]) throw new HttpError(404, '该批通知尚未创建。');
  const expected = batches[0].expected_count,
    accepted = rows.filter((r) => r.state === 'accepted').length;
  return {
    version: key,
    wikiUrl: WIKI_URL,
    expected,
    accepted,
    needsReview: expected - accepted,
    message: expected === accepted ? '全部通知请求已被平台受理。' : '部分投递尚待确认。',
  };
}
export async function notice(ctx: Context, route: string, user: DirectoryUser, api: Feishu) {
  if (user.role !== 'admin') throw new HttpError(403, '仅管理员可访问。');
  const [resource, action] = route.split('/');
  const entry = resource === 'entry-notice';
  method(ctx, action === 'publish' ? 'POST' : 'GET');
  const f = !entry && action === 'publish' ? input(form, await body(ctx)) : null;
  const key = entry
    ? ENTRY_NOTICE_KEY
    : (f?.version ?? input(version, ctx.url.searchParams.get('version')));
  if (action === 'status') return json(ctx, await summary(key));
  if (action === 'preview') {
    const [row] = await db<
      { recipient_ids: string[]; recipient_count: number; verified_at: string; source: string }[]
    >(query('calendar_release_roster', { version: 'eq.' + key }));
    const age = Date.now() - Date.parse(row?.verified_at || '');
    if (
      !row ||
      !(age >= 0 && age <= 86400000) ||
      row.source !== 'feishu-contact-v3' ||
      !z.array(openId).min(1).safeParse(row.recipient_ids).success ||
      new Set(row.recipient_ids).size !== row.recipient_count ||
      row.recipient_ids.length !== row.recipient_count
    )
      throw new HttpError(409, '需重新核对该批通知名单。');
    return json(ctx, {
      recipientCount: row.recipient_count,
      wikiUrl: WIKI_URL,
      ...(entry && { title: ENTRY_NOTICE_TITLE, content: ENTRY_NOTICE_CONTENT }),
    });
  }
  if (action !== 'publish') throw new HttpError(404, '接口不存在。');
  if (process.env.APPROVED_BROADCAST_VERSION !== key) throw new HttpError(403, '该批全员通知尚未批准。');
  const title = entry ? ENTRY_NOTICE_TITLE : releaseTitle;
  const content = entry ? ENTRY_NOTICE_CONTENT : key + ' 更新说明\n' + f!.highlights.join('\n');
  const hash = createHash('sha256')
    .update(JSON.stringify(f || { messageTitle: title, messageContent: content }))
    .digest('hex');
  await db('rpc/ducky_prepare_notice', 'POST', { p_version: key, p_hash: hash, p_actor: user.open_id });
  const pending = await db<{ id: string; recipient: string }[]>(
    query('calendar_release_delivery', {
      version: 'eq.' + key,
      state: 'eq.pending',
      select: 'id,recipient',
    }),
  );
  for (const row of pending) {
    const [claim] = await patch(
      'calendar_release_delivery',
      { id: 'eq.' + row.id, state: 'eq.pending' },
      { state: 'sending' },
    );
    if (!claim) continue;
    let state = 'accepted';
    try {
      await api.send(row.recipient, 'notice:' + key + ':' + row.recipient, {
        title,
        content: [
          [{ tag: 'text', text: content }],
          [{ tag: 'a', text: '查看完整更新说明', href: WIKI_URL }],
        ],
      });
    } catch {
      state = 'needs_review';
    }
    await patch('calendar_release_delivery', { id: 'eq.' + row.id }, { state });
  }
  const report = await summary(key);
  await patch(
    'calendar_release_announcement',
    { version: 'eq.' + key },
    { status: report.needsReview ? 'needs_review' : 'accepted' },
  );
  json(ctx, report);
}
