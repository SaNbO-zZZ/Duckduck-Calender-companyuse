// Prepare a roster only. This operator command has no IM or publish endpoint.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const appId = 'cli_aa35caedff78dcc5';
const project = 'https://ozmgmihgrasammeprolk.supabase.co';

function requireValue(ok, message) {
  if (!ok) throw new Error(message);
}

async function request(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000), redirect: 'error' });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    // Only operator-facing, fixed messages from the roster RPC may be printed.
    if (response.status === 409 && error.code === 'PT409' &&
        ['该批名单已冻结。', '名单含未知或停用人员。'].includes(error.message)) throw new Error(error.message);
    throw new Error('接口返回 HTTP ' + response.status + '，请核对配置与迁移版本。');
  }
  return response.json().catch(() => { throw new Error('接口响应不是有效的 JSON。'); });
}

async function* pages(read, path, params) {
  const query = new URLSearchParams({ department_id_type: 'department_id', page_size: '50', ...params });
  const seen = new Set();
  while (true) {
    const page = await read(path + '?' + query);
    requireValue(Array.isArray(page?.items) && typeof page.has_more === 'boolean', '飞书分页数据不完整。');
    yield* page.items;
    if (!page.has_more) return;
    requireValue(typeof page.page_token === 'string' && page.page_token.trim() && !seen.has(page.page_token),
      '飞书分页缺少有效的下一页。');
    seen.add(page.page_token);
    query.set('page_token', page.page_token);
  }
}

export async function refreshRoster(args, env, http = request) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true,
    options: { apply: { type: 'boolean', default: false }, 'expect-count': { type: 'string' } } });
  const [version] = positionals;
  requireValue(positionals.length === 1 && version.length <= 32 && /^(v\d+\.\d+\.\d+|notice-entry-20261025)$/.test(version),
    '请传入一个版本号（如 v3.4.0）或已支持的入口知会批次。');
  const expected = values['expect-count'];
  requireValue((!values.apply && expected === undefined) || /^[1-9]\d*$/.test(expected || ''),
    '写入名单需要 --expect-count 并提供独立核实的本批人数。');
  requireValue(env.FEISHU_APP_ID === appId && env.SUPABASE_URL?.replace(/\/$/, '') === project,
    '目标飞书应用或 Supabase 项目不符。');
  requireValue(env.FEISHU_APP_SECRET && env.SUPABASE_SERVICE_ROLE_KEY, '缺少飞书应用或 Supabase 服务端配置。');

  const base = 'https://open.feishu.cn/open-apis/';
  const auth = await http(base + 'auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: env.FEISHU_APP_SECRET }),
  });
  requireValue(auth?.code === 0 && auth.tenant_access_token, '目标飞书应用认证失败。');
  async function read(path) {
    const result = await http(base + 'contact/v3/' + path, {
      headers: { Authorization: 'Bearer ' + auth.tenant_access_token },
    });
    requireValue(result?.code === 0, '飞书通讯录读取失败。');
    return result.data;
  }

  const recipients = new Set();
  const departments = new Set(['0']);
  for (const id of departments) {
    for await (const child of pages(read, 'departments/' + encodeURIComponent(id) + '/children', {})) {
      requireValue(typeof child?.department_id === 'string' && child.department_id.trim(), '部门数据不完整。');
      departments.add(child.department_id);
    }
    for await (const user of pages(read, 'users/find_by_department', { department_id: id, user_id_type: 'open_id' })) {
      requireValue(typeof user?.is_agent === 'boolean', '通讯录缺少人员类型。');
      if (user.is_agent || user.status?.is_resigned || user.status?.is_frozen ||
          user.status?.is_exited || user.status?.is_unjoin || user.status?.is_activated === false) continue;
      requireValue(typeof user.open_id === 'string' && /^ou_[A-Za-z0-9]+$/.test(user.open_id), '通讯录人员身份无效。');
      recipients.add(user.open_id);
    }
  }
  requireValue(recipients.size > 0, '通讯录返回空名单。');
  requireValue(expected === undefined || Number(expected) === recipients.size, '通讯录人数与本批核实人数不一致。');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const count = await http(project + '/rest/v1/rpc/ducky_stage_release_roster', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key,
      ...(!key.startsWith('sb_secret_') && { Authorization: 'Bearer ' + key }) },
    body: JSON.stringify({ p_version: version, p_ids: [...recipients].sort(), p_apply: values.apply }),
  });
  requireValue(count === recipients.size, '目标数据库未确认名单人数。');
  return { version, departmentCount: departments.size, recipientCount: count, applied: values.apply };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  refreshRoster(process.argv.slice(2), process.env)
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => {
      console.error(error.code?.startsWith('ERR_PARSE_ARGS') ? '命令参数无效。' : error.message);
      process.exitCode = 1;
    });
}
