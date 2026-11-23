const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { Feishu, messageUuid } = require('../dist/auth/lib/feishu-platform');
const { register } = require('../dist/auth/lib/registration');
const { db } = require('../dist/auth/lib/feishu-auth');
const cron = require('../dist/auth/api/cron/duty-reminder').default;

Object.assign(process.env, {
  FEISHU_APP_ID: 'cli_aa35caedff78dcc5',
  FEISHU_APP_SECRET: 'fixture',
  FEISHU_BITABLE_APP_TOKEN: 'fixture',
  SUPABASE_URL: 'https://database.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture',
  CRON_SECRET: randomUUID(),
  APP_BASE_URL: 'https://calendar.example.test',
});

test('Base write contention retries with the same person fields and client token', async (t) => {
  const calls = [],
    fields = { 申请人: [{ id: 'ou_fixture' }] },
    key = messageUuid('example');
  t.mock.method(global, 'fetch', async (url, init) => {
    if (url.includes('tenant_access_token'))
      return Response.json({ code: 0, tenant_access_token: 'fixture' });
    calls.push({ url, body: init.body });
    return Response.json(
      calls.length === 1 ? { code: 1254291 } : { code: 0, data: { record: { record_id: 'rec1' } } },
    );
  });
  assert.equal(await new Feishu().create('table', fields, key), 'rec1');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(JSON.parse(calls[0].body), { fields });
  const params = new URL(calls[0].url).searchParams;
  assert.equal(params.get('user_id_type'), 'open_id');
  assert.equal(params.get('client_token'), key);
});

test('registration replays one receipt after a status mirror failure and mentions a shared recipient once', async (t) => {
  const actor = 'ou_fixture',
    form = {
      requestKey: randomUUID(),
      mentorId: actor,
      kind: 'early',
      start: '',
      end: '',
      arrivalTime: '',
      leaveType: '',
    };
  let saved,
    creations = 0,
    sends = 0;
  t.mock.method(global, 'fetch', async (url, init) => {
    if (new URL(url).pathname.endsWith('/feishu_users'))
      return Response.json([{ open_id: actor, name: 'Fixture' }]);
    if (init.method === 'GET') return Response.json(saved ? [saved] : []);
    if (init.method === 'POST')
      saved = { id: 'receipt', record_state: 'creating', ...JSON.parse(init.body) };
    else Object.assign(saved, JSON.parse(init.body));
    return Response.json([saved]);
  });
  const api = {
    hr: async () => actor,
    create: async () => {
      creations++;
      return 'rec1';
    },
    send: async (to, key, post) => {
      sends++;
      assert.equal(to, actor);
      assert.deepEqual(
        post.content.flat().filter((tag) => tag.tag === 'at'),
        [{ tag: 'at', user_id: actor }],
      );
    },
    update: async () => {
      throw Error('mirror busy');
    },
  };
  const first = await register(api, actor, form);
  assert.equal(first.recorded, true);
  assert.equal(first.notifications, 'sent');
  assert.match(first.message, /待同步/);
  assert.equal((await register(api, actor, form)).recordId, first.recordId);
  assert.equal(creations, 1);
  assert.equal(sends, 1);
  await assert.rejects(register(api, actor, { ...form, kind: 'late' }), { status: 409 });
});

test('cron rejects missing authorization before contacting the database', async (t) => {
  const fetch = t.mock.method(global, 'fetch', () => {
    throw Error('unexpected upstream');
  });
  const res = {
    setHeader() {},
    writeHead(code) {
      this.status = code;
      return this;
    },
    end() {},
  };
  await cron({ method: 'GET', url: '/api/cron/duty-reminder', headers: {} }, res);
  assert.equal(res.status, 401);
  assert.equal(fetch.mock.callCount(), 0);
});

test('PostgREST void RPC accepts an empty response', async (t) => {
  t.mock.method(global, 'fetch', async () => new Response(null, { status: 204 }));
  assert.equal(await db('rpc/ducky_prepare_notice', 'POST', {}), null);
});
