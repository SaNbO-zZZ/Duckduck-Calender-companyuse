const test = require('node:test');
const assert = require('node:assert/strict');
const { conditions, hefeiWeather } = require('../dist/auth/shared/hefei-weather');
const { dayInfo, skyAt, projectSun } = require('../dist/auth/shared/hefei-sky');
const { calendarLabels } = require('../dist/shared/lunar-festivals');
const { dailyQuote } = require('../dist/shared/daily-quotes');
const { monthData } = require('../dist/auth/lib/calendar-reads');

test('Hefei sunshine and cloud cover are independent of wind, with five rain and snow levels', () => {
  for (const [type, suffix] of [['rain', '雨'], ['snow', '雪']]) {
    ['小', '中', '大', '暴', '特大暴'].forEach((prefix, i) => {
      const w = conditions(prefix + suffix, 0);
      assert.equal(w.precipType, type);
      assert.equal(w.precipLevel, i + 1);
      assert.ok(w.cloudCover >= 0.85);
    });
  }
  assert.equal(conditions('晴', 0).cloudCover, 0.1);
  assert.equal(conditions('多云', 0).cloudCover, 0.48);
  assert.equal(conditions('阴', 0).cloudCover, 0.92);
  assert.equal(conditions('-', 9999).precipLevel, 0);
});

test('missing observation falls back to warm clear without inventing temperature or timestamps', async (t) => {
  t.mock.method(global, 'fetch', async () => { throw Error('timeout'); });
  const w = await hefeiWeather();
  assert.deepEqual([w.available, w.description, w.scene, w.temperature, w.cloud, w.precipLevel, w.validTime],
    [false, '暖晴', 'clear', null, 0.12, 0, '']);
  assert.match(w.sunrise, /^\d\d:\d\d$/);
  assert.match(w.sunset, /^\d\d:\d\d$/);
});

test('Hefei solar position crosses east, transit and west in different seasons', () => {
  const winter = dayInfo(Date.parse('2026-12-21T04:00Z'));
  const summer = dayInfo(Date.parse('2026-06-21T04:00Z'));
  assert.ok(summer.rise < winter.rise - 90 && summer.set > winter.set + 80);
  for (const info of [winter, summer]) {
    const states = [info.rise, info.noon, info.set].map((m) => skyAt(info.midnight + m * 60000));
    assert.deepEqual(states.map((s) => s.phase), ['dawn', 'day', 'dusk']);
    assert.ok(Math.abs(states[0].elev + 0.833) < 0.01);
    assert.ok(Math.abs(states[2].elev + 0.833) < 0.01);
    for (const [w, h] of [[390, 844], [1440, 900]]) {
      const [a, b, c] = states.map((s) => projectSun(s.elev, s.az, w, h));
      assert.ok(a.x < b.x && b.x < c.x && b.y > a.y && b.y > c.y);
    }
    assert.equal(skyAt(info.midnight).phase, 'night');
  }
});

test('lunar new years, leap months, seasonal terms and movable festivals use Beijing dates', () => {
  for (const date of ['2025-01-29','2026-02-17','2027-02-06','2030-02-03','2033-01-31','2035-02-08'])
    assert.equal(calendarLabels(date).festival, '春节', date);
  assert.equal(calendarLabels('2027-02-05').festival, '除夕');
  assert.equal(calendarLabels('2025-07-25').lunar, '闰六月');
  assert.equal(calendarLabels('2026-04-05').term, '清明');
  assert.equal(calendarLabels('2025-04-20').festival, '复活节');
  assert.equal(calendarLabels('2026-11-26').festival, '感恩节');
  assert.equal(calendarLabels('2026-09-25').festival, '中秋节');
});

test('daily quotes rotate only at Beijing midnight with at least sixty distinct days', () => {
  const start = Date.parse('2026-04-22T00:00:00+08:00');
  assert.equal(dailyQuote(start), dailyQuote(start + 86399999));
  assert.notEqual(dailyQuote(start), dailyQuote(start - 1));
  assert.ok(new Set(Array.from({length: 64}, (_, i) => dailyQuote(start + i * 86400000))).size >= 60);
});

test('month read selects only active birthdays for that month and observes leap years', async (t) => {
  process.env.SUPABASE_URL = 'https://birthday.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture';
  t.mock.method(global, 'fetch', async (url) => {
    const params = new URL(url).searchParams;
    assert.equal(params.get('is_active'), 'eq.true');
    assert.equal(params.get('select'), 'open_id,name,avatar_url,birth_day');
    return Response.json(params.get('birth_month') === 'eq.2'
      ? [{ open_id: 'ou_fixture', name: '示例成员', avatar_url: null, birth_day: 29 }] : []);
  });
  for (const [month, day] of [['2027-02', 28], ['2028-02', 29], ['2028-03', 0]]) {
    const data = await monthData({ search: async () => [] }, month);
    const rows = JSON.parse(JSON.stringify(data.birthdays));
    assert.deepEqual(rows, day ? [{ date: month + '-' + day, userId: 'ou_fixture', name: '示例成员' }] : []);
  }
});

test('missing NMC description keeps usable wind and temperature, without claiming observed sunshine', async (t) => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-25T14:20:00+08:00'));
  t.mock.method(global, 'fetch', async () => Response.json({ code: 0, data: { real: {
    publish_time: '2026-11-25 14:15', station: { city: '合肥' },
    weather: { info: '-', rain: 0, temperature: 17.1 }, wind: { speed: 3.3, degree: 169 },
  } } }));
  const w = await hefeiWeather();
  assert.deepEqual([w.available, w.description, w.temperature, w.cloudCover, w.windDir], [false, '暖晴', 17.1, 0.12, -1]);
});
