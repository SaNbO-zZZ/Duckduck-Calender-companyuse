import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HttpError, setting } from './feishu-auth.js';

export const openId = z.string().regex(/^ou_[A-Za-z0-9]+$/);
export const tables = {
  leave: 'tbl8QsErHASp6bc8',
  attendance: 'tbl1LXmtRrR93JYe',
  holiday: 'tblfqwLbqOGfVGrC',
  settings: 'tblBKqnFexIQ9E8p',
} as const;
const baseRecord = z.object({ record_id: z.string().min(1), fields: z.record(z.string(), z.unknown()) });
export type BaseRecord = z.infer<typeof baseRecord>;
const page = z.object({
  items: z.array(baseRecord).default([]),
  has_more: z.boolean(),
  page_token: z.string().optional(),
});
type Condition = { field_name: string; operator: string; value: string[] };
type RichTag =
  | { tag: 'text'; text: string }
  | { tag: 'at'; user_id: string }
  | { tag: 'a'; text: string; href: string };
type Message = { title: string; content: RichTag[][] };

export function messageUuid(key: string) {
  const hex = createHash('sha256').update(key).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    '8' + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join('-');
}

async function tenantToken() {
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'error',
    body: JSON.stringify({ app_id: setting('FEISHU_APP_ID'), app_secret: setting('FEISHU_APP_SECRET') }),
    signal: AbortSignal.timeout(6500),
  });
  const result = await response.json();
  if (!response.ok || result.code !== 0 || !result.tenant_access_token)
    throw new HttpError(502, '飞书应用认证失败。');
  return String(result.tenant_access_token);
}

// Each instance lives for one incoming request. Never retain a tenant token between requests.
export class Feishu {
  private token?: Promise<string>;

  private async call(path: string, method: string, body?: unknown, retryConflict = false) {
    const headers = {
      Authorization: 'Bearer ' + (await (this.token ??= tenantToken())),
      'Content-Type': 'application/json',
    };
    for (let attempt = 0; ; attempt++) {
      const response = await fetch('https://open.feishu.cn/open-apis/' + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      const result = await response.json();
      if (response.ok && result.code === 0) return result.data;
      if (!retryConflict || result.code !== 1254291 || attempt >= 3) {
        throw new HttpError(
          502,
          '飞书接口未确认操作，错误码 ' + (Number(result.code) || response.status) + '。',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 120 * 2 ** attempt + Math.random() * 60));
    }
  }

  private recordsUrl(table: string, suffix = '', query: Record<string, string> = {}) {
    return (
      'bitable/v1/apps/' +
      encodeURIComponent(setting('FEISHU_BITABLE_APP_TOKEN')) +
      '/tables/' +
      encodeURIComponent(table) +
      '/records' +
      suffix +
      '?' +
      new URLSearchParams({ user_id_type: 'open_id', ...query })
    );
  }

  async search(table: string, fields: string[], conditions: Condition[] = []) {
    const records: BaseRecord[] = [];
    const seen = new Set<string>();
    let cursor = '';
    do {
      const params: Record<string, string> = { page_size: '500' };
      if (cursor) params.page_token = cursor;
      const body = {
        field_names: fields,
        ...(conditions.length && { filter: { conjunction: 'and', conditions } }),
      };
      const result = page.parse(
        await this.call(this.recordsUrl(table, '/search', params), 'POST', body),
      );
      records.push(...result.items);
      if (!result.has_more) return records;
      cursor = result.page_token || '';
      if (!cursor || seen.has(cursor) || seen.size >= 100)
        throw new HttpError(502, '飞书分页响应不完整。');
      seen.add(cursor);
    } while (cursor);
    return records;
  }

  async charterSource() {
    const node = await this.call('wiki/v2/spaces/get_node?token=PH9ZwxfOwi1cJdksnjxcCf1Snzf', 'GET');
    if (node.node?.obj_type !== 'docx') throw new HttpError(502, '公约来源文档类型不符。');
    const path = 'docx/v1/documents/' + encodeURIComponent(node.node.obj_token);
    const { document } = await this.call(path, 'GET');
    const revision = z.number().int().positive().parse(document.revision_id);
    const blocks: unknown[] = [];
    let cursor = '';
    const seen = new Set<string>();
    do {
      const params = new URLSearchParams({ page_size: '500' });
      if (cursor) params.set('page_token', cursor);
      const page = await this.call(path + '/blocks?' + params, 'GET');
      if (!Array.isArray(page.items)) throw new HttpError(502, '公约文档内容不完整。');
      blocks.push(...page.items);
      if (!page.has_more) break;
      cursor = page.page_token;
      if (!cursor || seen.has(cursor)) throw new HttpError(502, '公约分页不完整。');
      seen.add(cursor);
    } while (cursor);
    const after = await this.call(path, 'GET');
    if (after.document?.revision_id !== revision)
      throw new HttpError(409, '读取期间飞书公约有更新，请重新同步。');
    return { revision, blocks };
  }

  async hr() {
    const records = await this.search(
      tables.settings,
      ['人事人员'],
      [{ field_name: '设置项', operator: 'is', value: ['全局人事配置'] }],
    );
    if (records.length > 1) throw new HttpError(502, '人事配置重复。');
    const row =
      records[0] ??
      baseRecord.parse(
        (await this.call(this.recordsUrl(tables.settings, '/reczz28HhfCiJdot'), 'GET')).record,
      );
    const users = z
      .array(z.object({ id: openId }))
      .length(1)
      .safeParse(row.fields['人事人员']);
    if (!users.success) throw new HttpError(502, '须配置一位有效人事。');
    return users.data[0].id;
  }

  async create(table: string, fields: Record<string, unknown>, key: string) {
    const data = await this.call(
      this.recordsUrl(table, '', { client_token: key }),
      'POST',
      { fields },
      true,
    );
    return z.string().min(1).parse(data.record.record_id);
  }

  async update(table: string, recordId: string, fields: Record<string, unknown>) {
    const data = await this.call(
      this.recordsUrl(table, '/' + encodeURIComponent(recordId)),
      'PUT',
      { fields },
      true,
    );
    if (data.record?.record_id !== recordId) throw new HttpError(502, '飞书更新回执不匹配。');
  }

  async send(recipient: string, key: string, message: Message) {
    const data = await this.call('im/v1/messages?receive_id_type=open_id', 'POST', {
      receive_id: openId.parse(recipient),
      uuid: messageUuid(key),
      msg_type: 'post',
      content: JSON.stringify({ zh_cn: message }),
    });
    return z.string().min(1).parse(data.message_id);
  }
}
