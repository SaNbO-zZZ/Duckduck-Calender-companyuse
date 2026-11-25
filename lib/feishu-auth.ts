import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { JWTPayload } from 'jose';

const APP_ID = 'cli_aa35caedff78dcc5';
const CALLBACK = '/api/auth/feishu/callback';
const WEEK = 7 * 24 * 60 * 60;
const OPEN_ID = /^ou_[A-Za-z0-9]+$/;
const OAUTH = 'ducky_oauth';
const SESSION = 'ducky_session';
export type Context = { req: IncomingMessage; res: ServerResponse; url: URL; origin: string };
type Route = (ctx: Context) => Promise<void>;

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export class MissingColumnError extends Error {
  constructor(readonly column: string) { super('Database column is unavailable'); }
}

export function setting(name: string) {
  const value = process.env[name];
  if (!value) throw new Error('Missing server configuration');
  return value;
}

function localPath(value: unknown, origin: string) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 1600 ||
      /[\\\u0000-\u001f\u007f]/.test(value)) return '/';
  const url = new URL(value, origin);
  if (url.origin !== origin || url.pathname.startsWith('//') || url.pathname.startsWith('/api/')) return '/';
  return url.pathname + url.search + url.hash;
}

function readCookie(req: IncomingMessage, name: string) {
  const prefix = name + '=';
  const matches = (req.headers.cookie || '').split(';').map(v => v.trim()).filter(v => v.startsWith(prefix));
  return matches.length === 1 ? matches[0].slice(prefix.length) : '';
}

function cookie(name: string, token: string, seconds: number) {
  const path = name === OAUTH ? CALLBACK : '/';
  return `${name}=${token}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}

function key() {
  const secret = new TextEncoder().encode(process.env.SESSION_JWT_SECRET || setting('DUCKY_SESSION_SECRET'));
  if (secret.length < 32) throw new Error('Short signing secret');
  return secret;
}

async function sign(data: JWTPayload, audience: string, seconds: number, origin: string) {
  const { SignJWT } = await import('jose');
  return new SignJWT(data).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer(origin)
    .setAudience(audience).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + seconds).sign(key());
}

async function verify(raw: string, audience: string, seconds: number, origin: string) {
  const secret = key();
  const { jwtVerify } = await import('jose');
  try {
    const { payload } = await jwtVerify(raw, secret, {
      algorithms: ['HS256'], issuer: origin, audience, requiredClaims: ['iat', 'exp'], maxTokenAge: seconds,
    });
    return payload;
  } catch { throw new HttpError(audience === OAUTH ? 400 : 401, audience === OAUTH ? '登录请求已失效，请重新登录。' : '请先登录。'); }
}

function redirect(res: ServerResponse, location: string) {
  res.writeHead(302, { Location: location }).end();
}

export function previewReadOnly() {
  return process.env.VERCEL_ENV === 'preview' || process.env.DUCKY_READ_ONLY === '1';
}

export function requireBusinessWrites() {
  if (previewReadOnly()) throw new HttpError(403, '当前为只读预览，暂不可提交变更。');
}

export function handler(route: Route, methods: string[] = ['GET']) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      if (!methods.includes(req.method || '')) {
        res.setHeader('Allow', methods.join(', '));
        throw new HttpError(405, '请求方式不支持。');
      }
      const base = new URL(setting('APP_BASE_URL'));
      if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && base.hostname === 'localhost')) ||
          base.username || base.password || setting('FEISHU_APP_ID') !== APP_ID) throw new Error('Invalid configuration');
      if (req.method === 'POST' && req.headers.origin && req.headers.origin !== base.origin) throw new HttpError(403, '请求来源无效。');
      if (req.method === 'POST') requireBusinessWrites();
      await route({ req, res, url: new URL(req.url || '/', base.origin), origin: base.origin });
    } catch (error) {
      const known = error instanceof HttpError;
      res.writeHead(known ? error.status : 503, { 'Content-Type': 'application/json; charset=utf-8' })
        .end(JSON.stringify({ error: known ? error.message : '服务暂时不可用，请稍后重试。' }));
    }
  };
}

export const login: Route = async ({ res, url, origin }) => {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const returnTo = localPath(url.searchParams.get('returnTo'), origin);
  res.setHeader('Set-Cookie', cookie(OAUTH, await sign({ state, verifier, returnTo }, OAUTH, 600, origin), 600));
  const authorize = new URL('https://accounts.feishu.cn/open-apis/authen/v1/authorize');
  // The login-only user_info endpoint needs no incremental API scopes.
  authorize.search = new URLSearchParams({
    client_id: APP_ID, response_type: 'code', redirect_uri: origin + CALLBACK, state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
  }).toString();
  redirect(res, authorize.toString());
};

async function jsonRequest(url: URL | string, init: RequestInit) {
  const result = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!result.ok) {
    const error = await result.json().catch(() => ({}));
    if (['PT400','PT403','PT404','PT409'].includes(error.code)) throw new HttpError(Number(error.code.slice(2)), error.message);
    if (result.status === 400 && error.code === '42703') {
      const column = /^column ([a-z_]+\.[a-z_]+) does not exist$/.exec(error.message);
      if (column) throw new MissingColumnError(column[1]);
    }
    throw new Error('Upstream unavailable');
  }
  if (result.status === 204) return null;
  const payload = await result.text();
  return payload ? JSON.parse(payload) : null;
}

export async function db<T>(path: string, method = 'GET', body?: unknown, prefer?: string): Promise<T> {
  const url = new URL(setting('SUPABASE_URL'));
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid database URL');
  const serviceKey = setting('SUPABASE_SERVICE_ROLE_KEY');
  const headers: Record<string, string> = { apikey: serviceKey, 'Content-Type': 'application/json' };
  if (!serviceKey.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + serviceKey;
  if (prefer) headers.Prefer = prefer;
  return jsonRequest(new URL('/rest/v1/' + path, url), {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const callback: Route = async ({ req, res, url, origin }) => {
  const cleared = cookie(OAUTH, '', 0);
  res.setHeader('Set-Cookie', cleared);
  const transient = await verify(readCookie(req, OAUTH), OAUTH, 600, origin);
  const params = url.searchParams;
  if (params.getAll('state').length !== 1 || !transient.state || params.get('state') !== transient.state ||
      typeof transient.verifier !== 'string' || params.has('error') || params.getAll('code').length !== 1 ||
      !params.get('code')) throw new HttpError(400, '登录请求无效或已取消。');
  const token = await jsonRequest('https://open.feishu.cn/open-apis/authen/v2/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'authorization_code', client_id: APP_ID,
      client_secret: setting('FEISHU_APP_SECRET'), code: params.get('code'), redirect_uri: origin + CALLBACK,
      code_verifier: transient.verifier }),
  });
  if ((token.code !== undefined && token.code !== 0) || !token.access_token) throw new HttpError(401, '飞书授权已失效，请重新登录。');
  const profile = await jsonRequest('https://open.feishu.cn/open-apis/authen/v1/user_info', {
    headers: { Authorization: 'Bearer ' + token.access_token },
  });
  const person = profile.data;
  if (profile.code !== 0 || !person || !OPEN_ID.test(person.open_id) || typeof person.name !== 'string') {
    throw new HttpError(401, '无法核实飞书身份。');
  }
  if (person.tenant_key !== setting('FEISHU_TENANT_KEY')) throw new HttpError(403, '仅限本企业成员登录。');
  const users = previewReadOnly()
    ? await activeUsers(person.open_id)
    : await db<DirectoryUser[]>('rpc/sync_feishu_login', 'POST', {
      p_open_id: person.open_id, p_union_id: person.union_id || null,
      p_name: person.name, p_avatar_url: person.avatar_url || null,
    });
  if (!Array.isArray(users)) throw new Error('Invalid directory response');
  if (!users.length) throw new HttpError(403, '账号未获访问权限。');
  if (users.length !== 1 || users[0].open_id !== person.open_id) throw new Error('Directory identity mismatch');
  const jwt = await sign({ sub: person.open_id }, SESSION, WEEK, origin);
  res.setHeader('Set-Cookie', [cleared, cookie(SESSION, jwt, WEEK)]);
  redirect(res, localPath(transient.returnTo, origin));
};

export interface DirectoryUser { open_id: string; name: string | null; avatar_url: string | null; role: 'member' | 'admin' }

function activeUsers(openId: string) {
  return db<DirectoryUser[]>('feishu_users?' + new URLSearchParams({
    open_id: 'eq.' + openId, is_active: 'eq.true', select: 'open_id,name,avatar_url,role',
  }));
}

export async function currentUser({ req, res, origin }: Context): Promise<DirectoryUser> {
  const session = await verify(readCookie(req, SESSION), SESSION, WEEK, origin);
  if (!session.sub || !OPEN_ID.test(session.sub)) throw new HttpError(401, '请先登录。');
  const users = await activeUsers(session.sub);
  if (!Array.isArray(users)) throw new Error('Invalid directory response');
  if (users.length !== 1 || users[0].open_id !== session.sub) {
    res.setHeader('Set-Cookie', cookie(SESSION, '', 0));
    throw new HttpError(403, '账号已停用。');
  }
  return users[0];
}

export const me: Route = async ctx => {
  const user = await currentUser(ctx);
  ctx.res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    .end(JSON.stringify({ user, readOnly: previewReadOnly() }));
};
