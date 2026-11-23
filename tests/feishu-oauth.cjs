const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const test = require('node:test');
const login = require('../dist/auth/api/auth/feishu/login').default;
const callback = require('../dist/auth/api/auth/feishu/callback').default;
const me = require('../dist/auth/api/auth/me').default;

const origin = 'https://calendar.example.test';
Object.assign(process.env, {
  APP_BASE_URL: origin, FEISHU_APP_ID: 'cli_aa35caedff78dcc5',
  FEISHU_APP_SECRET: 'fixture', FEISHU_TENANT_KEY: 'example-tenant',
  SESSION_JWT_SECRET: randomBytes(48).toString('hex'),
  SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture',
});
async function request(route, url, cookie = '', method = 'GET') {
  const headers = {};
  const res = {
    headers, setHeader(k, v) { headers[k] = v; },
    writeHead(code, values) { this.status = code; Object.assign(headers, values); return this; },
    end(body) { this.body = body; },
  };
  await route({ method, url, headers: { cookie } }, res);
  return res;
}
async function start(returnTo) {
  const res = await request(login, '/api/auth/feishu/login?' + new URLSearchParams({ returnTo }));
  assert.equal(res.status, 302);
  assert.match(res.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
  const authorization = new URL(res.headers.Location);
  assert.equal(authorization.searchParams.has('scope'), false);
  assert.equal(authorization.origin, 'https://accounts.feishu.cn');
  assert.equal(authorization.searchParams.get('redirect_uri'), origin + '/api/auth/feishu/callback');
  return { authorization, cookie: res.headers['Set-Cookie'].split(';')[0],
    url: '/api/auth/feishu/callback?code=mock&state=' + authorization.searchParams.get('state') };
}

function provider(t, authorization, tenant = 'example-tenant', enabled = true) {
  const identity = { open_id: 'ou_test', role: 'member', name: 'Demo', avatar_url: null };
  const stub = t.mock.method(global, 'fetch', async (url, init) => {
    const target = new URL(url);
    if (target.pathname.endsWith('/oauth/token')) {
      assert.equal(target.host, 'open.feishu.cn');
      const data = JSON.parse(init.body);
      assert.equal(data.code, 'mock');
      assert.equal(data.redirect_uri, origin + '/api/auth/feishu/callback');
      assert.equal(createHash('sha256').update(data.code_verifier).digest('base64url'),
        authorization.searchParams.get('code_challenge'));
      return Response.json({ code: 0, access_token: 'fixture-token' });
    }
    if (target.pathname.endsWith('/user_info')) {
      assert.equal(init.headers.Authorization, 'Bearer fixture-token');
      return Response.json({ code: 0, data: { ...identity, tenant_key: tenant } });
    }
    assert.equal(target.origin, process.env.SUPABASE_URL);
    assert.equal(init.headers.apikey, process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (target.pathname.includes('/rpc/')) {
      assert.equal(JSON.parse(init.body).p_open_id, identity.open_id);
    } else {
      assert.equal(target.searchParams.get('is_active'), 'eq.true');
      assert.equal(target.searchParams.get('open_id'), 'eq.' + identity.open_id);
    }
    return Response.json(enabled ? [identity] : []);
  });
  return stub;
}

test('login, callback and me preserve the requested page and verify account activity', async t => {
  const flow = await start('/charter?tab=all#docs');
  provider(t, flow.authorization);
  const res = await request(callback, flow.url, flow.cookie);
  assert.equal(res.status, 302);
  assert.equal(res.headers.Location, '/charter?tab=all#docs');
  const [cleared, session] = res.headers['Set-Cookie'];
  assert.match(cleared, /Max-Age=0$/);
  assert.match(session, /Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800$/);
  const loggedIn = await request(me, '/api/auth/me', session.split(';')[0]);
  assert.equal(loggedIn.status, 200);
  assert.equal(JSON.parse(loggedIn.body).user.open_id, 'ou_test');
  assert.equal(loggedIn.headers['Cache-Control'], 'private, no-store');
});
test('invalid state, absent credentials and unsupported methods stop before network access', async t => {
  const flow = await start('/');
  const stub = t.mock.method(global, 'fetch');
  assert.equal((await request(callback, flow.url, '')).status, 400);
  assert.equal((await request(callback, flow.url + 'x', flow.cookie)).status, 400);
  assert.equal((await request(me, '/api/auth/me', flow.cookie.replace('ducky_oauth=', 'ducky_session='))).status, 401);
  assert.equal((await request(me, '/api/auth/me')).status, 401);
  assert.equal((await request(login, '/', '', 'POST')).status, 405);
  assert.equal(stub.mock.callCount(), 0);
});
test('foreign tenants cannot create accounts', async t => {
  const flow = await start('/');
  const stub = provider(t, flow.authorization, 'other');
  const res = await request(callback, flow.url, flow.cookie);
  assert.equal(res.status, 403);
  assert.equal(stub.mock.callCount(), 2);
});
test('disabled members cannot receive a session', async t => {
  const flow = await start('/');
  provider(t, flow.authorization, 'example-tenant', false);
  const res = await request(callback, flow.url, flow.cookie);
  assert.equal(res.status, 403);
  assert.doesNotMatch(res.headers['Set-Cookie'], /ducky_session/);
});
test('return paths after normalization stay on the calendar origin', async t => {
  const flow = await start('/section/..//elsewhere.example');
  provider(t, flow.authorization);
  assert.equal((await request(callback, flow.url, flow.cookie)).headers.Location, '/');
});
