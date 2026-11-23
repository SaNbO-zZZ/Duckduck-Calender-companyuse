const test = require('node:test'),
  assert = require('node:assert/strict');
const { splitCharter } = require('../dist/auth/lib/charter');
const text = (content) => ({ elements: [{ text_run: { content } }] });
test('charter sync preserves table columns, section order, callouts and checkboxes', () => {
  const blocks = [
    { block_id: 'root', block_type: 1, children: ['h', 't', 'c'] },
    { block_id: 'h', block_type: 4, heading2: text('工作约定') },
    {
      block_id: 't',
      block_type: 31,
      table: { property: { column_size: 2 } },
      children: ['a', 'b', 'c1', 'c2'],
    },
    ...['a', 'b', 'c1', 'c2'].flatMap((id, i) => [
      { block_id: id, block_type: 32, children: [id + 'p'] },
      { block_id: id + 'p', block_type: 2, text: text(['左', '右', '甲', '乙'][i]) },
    ]),
    { block_id: 'c', block_type: 19, children: ['todo'] },
    { block_id: 'todo', block_type: 17, todo: { ...text('核对'), style: { done: false } } },
  ];
  const [doc] = splitCharter(blocks, 22);
  assert.match(doc.markdown_content, /\| 左 \| 右 \|\n\| --- \| --- \|\n\| 甲 \| 乙 \|/);
  assert.match(doc.markdown_content, /- \[ \] 核对/);
  assert.equal(doc.title, '工作约定');
  assert.equal(doc.is_pinned, true);
  assert.throws(
    () => splitCharter([...blocks.slice(0, -1), { block_id: 'todo', block_type: 999 }], 22),
    /支持/,
  );
});

test('members can acknowledge the current revision but cannot edit chapters or approve a theme', async (t) => {
  const { SignJWT } = require('jose'),
    { randomBytes } = require('node:crypto');
  const charter = require('../dist/auth/api/charter').default,
    festivals = require('../dist/auth/api/festivals').default;
  const origin = 'https://calendar.example.test',
    id = 'ou_fixture';
  Object.assign(process.env, {
    APP_BASE_URL: origin,
    FEISHU_APP_ID: 'cli_aa35caedff78dcc5',
    SUPABASE_URL: 'https://db.example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture',
    SESSION_JWT_SECRET: randomBytes(48).toString('hex'),
  });
  const session = await new SignJWT({ sub: id })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('ducky_session')
    .setIssuer(origin)
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(new TextEncoder().encode(process.env.SESSION_JWT_SECRET));
  const recorded = new Set();
  t.mock.method(global, 'fetch', async (raw, opts) => {
    const url = new URL(raw);
    if (url.pathname.endsWith('feishu_users'))
      return Response.json([{ open_id: id, role: 'member', name: 'Fixture' }]);
    if (url.pathname.endsWith('company_charter_docs')) return Response.json([{ version: 'r1' }]);
    if (url.pathname.endsWith('charter_acknowledgements')) {
      assert.equal(opts.headers.Prefer, 'resolution=ignore-duplicates,return=representation');
      assert.equal(url.searchParams.get('on_conflict'), 'user_open_id,charter_version');
      const data = JSON.parse(opts.body);
      assert.deepEqual(data, { user_open_id: id, charter_version: 'r1' });
      recorded.add(data.user_open_id + data.charter_version);
      return Response.json([]);
    }
    throw Error('unexpected upstream');
  });
  async function post(route, url, body) {
    const res = {
      setHeader() {},
      writeHead(n) {
        this.status = n;
        return this;
      },
      end() {},
    };
    await route(
      {
        method: 'POST',
        headers: { origin, cookie: 'ducky_session=' + session, 'content-type': 'application/json' },
        url,
        body,
      },
      res,
    );
    return res.status;
  }
  assert.equal(await post(charter, '/api/charter?action=sync', {}), 403);
  assert.equal(await post(charter, '/api/charter?action=edit', {}), 403);
  assert.equal(
    await post(festivals, '/api/festivals', { key: 'spring', enabled: true, confirmed: true }),
    403,
  );
  assert.equal(await post(charter, '/api/charter?action=ack', { version: 'old' }), 409);
  for (let i = 0; i < 2; i++)
    assert.equal(await post(charter, '/api/charter?action=ack', { version: 'r1' }), 200);
  assert.equal(recorded.size, 1);
});
