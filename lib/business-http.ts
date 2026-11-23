import { z } from 'zod';
import { db, HttpError, type Context, type DirectoryUser } from './feishu-auth.js';
import { openId } from './feishu-platform.js';

export function json(ctx: Context, value: unknown, shared = false) {
  ctx.res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (shared) ctx.res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
  ctx.res.writeHead(200).end(JSON.stringify(value));
}

export function input<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, '请求参数无效。');
  return parsed.data;
}

export function resource(ctx: Context, prefix: string) {
  const route = ctx.url.pathname.startsWith(prefix + '/')
    ? ctx.url.pathname.slice(prefix.length + 1)
    : ctx.url.searchParams.get('route');
  if (!route) throw new HttpError(404, '接口不存在。');
  return route;
}

export function method(ctx: Context, expected: string) {
  if (ctx.req.method !== expected) {
    ctx.res.setHeader('Allow', expected);
    throw new HttpError(405, '请求方式不支持。');
  }
}

export async function body(ctx: Context) {
  if (ctx.req.headers['content-type']?.split(';')[0].trim() !== 'application/json')
    throw new HttpError(415, '请提交 JSON。');
  const req = ctx.req as typeof ctx.req & { body?: unknown };
  if (req.body !== undefined && typeof req.body !== 'string') return req.body;
  let raw = typeof req.body === 'string' ? req.body : '';
  if (req.body === undefined) {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > 16384) throw new HttpError(413, '请求过大。');
      chunks.push(buffer);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (raw.length > 16384) throw new HttpError(413, '请求过大。');
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'JSON 格式无效。');
  }
}

export function query(table: string, params: Record<string, string>) {
  return table + '?' + new URLSearchParams(params);
}
export function insert<T>(table: string, conflict: string, row: object) {
  return db<T[]>(
    query(table, { on_conflict: conflict }),
    'POST',
    row,
    'resolution=ignore-duplicates,return=representation',
  );
}
export function patch<T>(table: string, filter: Record<string, string>, changes: object) {
  return db<T[]>(
    query(table, filter),
    'PATCH',
    { ...changes, _updated_at: new Date().toISOString() },
    'return=representation',
  );
}

export async function directory(ids?: string[]) {
  const params: Record<string, string> = {
    select: 'open_id,name,avatar_url,role',
    is_active: 'eq.true',
    order: 'name.asc.nullslast,open_id',
  };
  if (ids) {
    const unique = [...new Set(ids.map((id) => openId.parse(id)))];
    if (!unique.length) return [];
    params.open_id = 'in.(' + unique.join(',') + ')';
  }
  return db<DirectoryUser[]>(query('feishu_users', params));
}
