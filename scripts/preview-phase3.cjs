// Local visual acceptance. All mutations live in this process and use synthetic data.
const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../dist/client');
const {
  addBeijingDays,
  beijingDate,
  planDutySelection,
  weekdayOf,
} = require('../dist/shared/duty-calendar');
const { weeklyDutyDuckKeys } = require('../dist/shared/duty-assets');
const { festivals } = require('../dist/shared/festivals');
const people = ['预览同事', '小栗', '阿芦', '小麦', '青禾', '小满', '海盐'].map((name, i) => ({
  id: 'demo' + i,
  name,
}));
const rules = people.map((p, i) => ({ weekday: i + 1, personId: p.id, duckKey: weeklyDutyDuckKeys[i] }));
const docData = ['办公时间', '值日与换班', '团队协作'].map((title, i) => ({
  title,
  category: i === 2 ? '专项约定' : '日常约定',
  slug: 'sample-' + i,
  version: 'r000000000001',
  duck_sticker_id: ['01', '03', '08'][i],
  is_pinned: i === 0,
  summary: title,
  markdown_content: [
    '本页使用示例条款供预览。选择日期可以查看团队当天的登记情况。',
    '开始值日前，请核对当日排班。需要换班时，从值日鸭鸭卡片发起邀请。',
    '- 准备好沟通主题。\n- [ ] 阅读并了解本期公约。',
  ][i],
}));
const sessions = new Map(),
  mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.gif': 'image/gif',
  };
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (body, status = 200) => {
      res
        .writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(body));
    };
    try {
      if (!url.pathname.startsWith('/api/')) {
        const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        if (file !== root && !file.startsWith(root + path.sep)) return res.writeHead(403).end();
        const target = ['/', '/charter', '/release-announcement', '/duty-exchange'].includes(
          url.pathname,
        )
          ? path.join(root, 'index.html')
          : file;
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return res.writeHead(404).end();
        res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
        fs.createReadStream(target).pipe(res);
        return;
      }
      let sid = req.headers.cookie?.match(/(?:^|; )ducky_preview=([a-f0-9-]+)/)?.[1];
      if (!sid || !sessions.has(sid)) {
        sid = randomUUID();
        sessions.set(sid, {
          themes: festivals.map((f) => ({ key: f.key, enabled: false })),
          docs: structuredClone(docData),
          ack: false,
          records: new Map(),
          exchanges: new Map(),
        });
        res.setHeader('Set-Cookie', 'ducky_preview=' + sid + '; Path=/; HttpOnly; SameSite=Strict');
      }
      const state = sessions.get(sid);
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 20000) return send({ error: '请求过大' }, 413);
      }
      const body = raw ? JSON.parse(raw) : {};
      const now = Date.now(),
        today = beijingDate(),
        date = url.searchParams.get('date') || today,
        actor = people[weekdayOf(today) - 1],
        who = { open_id: actor.id, name: '预览同事', role: 'admin' };
      const events = [
        {
          id: 'sample',
          type: '出差',
          start: Date.parse(today + 'T00:00:00+08:00'),
          end: Date.parse(addBeijingDays(today, 1) + 'T00:00:00+08:00'),
          userIds: [people[(weekdayOf(today) + 1) % 7].id],
        },
      ];
      switch (url.pathname) {
        case '/api/auth/me':
          return send({ user: who });
        case '/api/calendar/month':
          return send({
            events: events.filter((e) => beijingDate(e.start).startsWith(url.searchParams.get('month'))),
            todayEvents: events,
            activeEvents: events,
            people,
            holidays: [],
            birthdays: [],
            serverTime: now,
          });
        case '/api/calendar/people':
          return send(people);
        case '/api/calendar/config':
          return send({ hrUserId: people[1].id, serverTime: now });
        case '/api/calendar/weather':
          return send({ available: true, scene: 'partly', description: '多云', temperature: 18, windSpeed: 5, windFrom: 20, windDir: -1, windLevel: 0, cloud: 0.48, cloudCover: 0.48, precipType: 'none', precipLevel: 0 });
        case '/api/calendar/register': {
          const receipt = {
            recorded: true,
            recordId: 'sample',
            processing: false,
            notifications: 'sent',
            message: '预览登记完成。',
          };
          state.records.set(body.requestKey, receipt);
          return send(receipt);
        }
        case '/api/calendar/registration-status':
          return send({ result: state.records.get(url.searchParams.get('requestKey')) || null });
        case '/api/duty/day': {
          const day = planDutySelection(date, today, rules);
          return send({
            ...day,
            personValid: !!day.duty,
            personName: people.find((p) => p.id === day.duty?.personId)?.name,
          });
        }
        case '/api/duty/exchange-requests': {
          const id = body.requestId || randomUUID();
          state.exchanges.set(id, {
            requestId: id,
            state: 'awaiting_confirmation',
            dutyDate: body.dutyDate,
            viewerRole: 'invitee',
            initiatorName: '预览同事',
            inviteeName: '示例接班人',
            replacementPersonName: '示例接班人',
            expiresAt: body.dutyDate + 'T16:00:00+08:00',
          });
          return send({ openUrl: '/duty-exchange?requestId=' + id });
        }
        case '/api/festivals':
          if (req.method === 'POST') state.themes.find((t) => t.key === body.key).enabled = body.enabled;
          return send(state.themes);
        case '/api/charter': {
          const action = url.searchParams.get('action');
          if (action === 'ack') state.ack = true;
          if (action === 'edit')
            Object.assign(
              state.docs.find((d) => d.slug === body.slug),
              body,
            );
          return send({
            docs: state.docs,
            version: docData[0].version,
            acknowledged: state.ack,
            read: state.ack ? 1 : 0,
            total: 7,
          });
        }
        default: {
          const m = url.pathname.match(/^\/api\/duty\/exchange-requests\/([^/]+)(\/decision)?$/);
          if (m && state.exchanges.has(m[1])) {
            const r = state.exchanges.get(m[1]);
            if (m[2]) r.state = body.decision === 'confirm' ? 'applied' : 'rejected';
            return send(r);
          }
          return send({ error: '此操作未配置示例数据。' }, 404);
        }
      }
    } catch {
      return send({ error: '预览请求失败。' }, 400);
    }
  })
  .listen(Number(process.argv[2] || 4173), '127.0.0.1', () =>
    console.log('鸭鸭日历本地示例预览已启动。'),
  );
