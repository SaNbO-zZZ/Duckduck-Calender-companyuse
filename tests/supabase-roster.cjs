const test = require('node:test');
const assert = require('node:assert/strict');

const env = {
  FEISHU_APP_ID: 'cli_aa35caedff78dcc5',
  FEISHU_APP_SECRET: 'test',
  SUPABASE_URL: 'https://ozmgmihgrasammeprolk.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
};
const person = (n) => ({ open_id: 'ou_test' + n, is_agent: false });
const page = (items, extra) => ({ has_more: false, items, ...extra });

async function run(args = [], read, config = env) {
  const { refreshRoster } = await import('../scripts/refresh_supabase_roster.mjs');
  let rpc;
  const result = await refreshRoster(['v3.4.0', ...args], config, async (url, options) => {
    const endpoint = new URL(url);
    if (endpoint.pathname.endsWith('/internal')) return { code: 0, tenant_access_token: 'fake' };
    if (endpoint.pathname === '/rest/v1/rpc/ducky_stage_release_roster') {
      rpc = JSON.parse(options.body);
      return rpc.p_ids.length;
    }
    assert.equal(endpoint.hostname, 'open.feishu.cn');
    assert.equal(options.method, undefined);
    if (read) return { code: 0, data: read(endpoint) };
    if (endpoint.pathname.endsWith('/0/children')) return { code: 0, data: page([{ department_id: 'team' }]) };
    if (endpoint.pathname.endsWith('/children')) return { code: 0, data: page([]) };
    assert.equal(endpoint.searchParams.get('user_id_type'), 'open_id');
    if (endpoint.searchParams.get('department_id') === 'team') return { code: 0, data: page([person(2)]) };
    if (endpoint.searchParams.get('page_token')) return { code: 0, data: page([
      person(2), { is_agent: true }, { ...person(3), status: { is_frozen: true } },
    ]) };
    return { code: 0, data: page([person(1)], { has_more: true, page_token: 'two' }) };
  });
  return { result, rpc };
}

test('跨部门、分页、筛选人员及去重，默认只预演，写入时核验本批人数', async () => {
  const { result, rpc } = await run();
  assert.deepEqual(result, { version: 'v3.4.0', departmentCount: 2, recipientCount: 2, applied: false });
  assert.deepEqual(rpc, { p_version: 'v3.4.0', p_ids: ['ou_test1', 'ou_test2'], p_apply: false });
  assert.equal((await run(['--apply', '--expect-count', '2'])).rpc.p_apply, true);
  await assert.rejects(run(['--apply']), /本批人数/);
  await assert.rejects(run(['--apply', '--expect-count', '3']), /人数不一致/);
});

test('拒绝错应用、错项目、空名单、畸形响应和缺失或循环翻页', async () => {
  await assert.rejects(run([], null, { ...env, FEISHU_APP_ID: 'wrong' }), /应用或/);
  await assert.rejects(run([], null, { ...env, SUPABASE_URL: 'https://other.invalid' }), /项目/);
  await assert.rejects(run([], () => page([])), /空名单/);
  await assert.rejects(run([], () => ({ has_more: false })), /分页数据不完整/);
  await assert.rejects(run([], () => page([], { has_more: true })), /下一页/);
  await assert.rejects(run([], () => page([], { has_more: true, page_token: 'again' })), /下一页/);
});
