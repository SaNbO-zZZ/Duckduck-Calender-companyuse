// Run against scripts/preview-phase3.cjs, which serves synthetic data on loopback.
const assert = require('node:assert/strict');
const test = require('node:test');
const { chromium } = require('playwright');

test('calendar detail stays in bounds across month and desktop / phone transitions', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    await page.clock.setFixedTime(new Date('2026-11-25T12:00:00+08:00'));
    const writes = [];
    await page.route('**/api/**', async (route) => {
      if (route.request().method() !== 'GET') {
        writes.push(route.request().method());
        return route.abort();
      }
      if (new URL(route.request().url()).pathname === '/api/auth/me')
        return route.fulfill({
          json: {
            user: { open_id: 'demo1', name: '示例成员', role: 'member' },
          },
        });
      if (!route.request().url().includes('/calendar/month?month=2026-12'))
        return route.continue();
      const response = await route.fetch();
      const month = await response.json();
      month.birthdays = [
        { date: '2026-12-01', userId: 'demo1', name: '示例成员' },
      ];
      month.events = Array.from({ length: 24 }, (_, i) => ({
        id: 'example-' + i,
        type: ['晚到', '提前离开', '事假'][i % 3],
        userIds: ['demo1'],
        start: Date.parse('2026-12-01T10:00:00+08:00'),
        end: Date.parse('2026-12-01T14:00:00+08:00'),
      }));
      return route.fulfill({ json: month });
    });
    await page.goto(
      'http://127.0.0.1:' +
        Number(process.env.DUCKY_LOCAL_PREVIEW_PORT || 4173),
    );
    const button = page.getByRole('button', {
      name: '2026-12-01',
      exact: true,
    });
    await button.click();
    const pop = page.locator('.day-pop');
    await pop.getByText('生日快乐').waitFor();
    assert.equal(await pop.locator('.detail-group p').count(), 24);
    assert(await pop.evaluate((el) => el.scrollHeight > el.clientHeight));
    assert(
      await pop.evaluate((el) => {
        const panel = el.getBoundingClientRect();
        const grid = document
          .querySelector('.date-grid')
          .getBoundingClientRect();
        return (
          panel.left >= grid.left &&
          panel.right <= grid.right &&
          panel.top >= grid.top &&
          panel.bottom <= grid.bottom
        );
      }),
    );

    await page.setViewportSize({ width: 360, height: 800 });
    await page.locator('.phone-dock').waitFor();
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden' });
    await button.click();
    const sheet = page.locator('.day-sheet');
    await sheet.getByText('生日快乐').waitFor();
    await sheet.locator('.detail-group p').last().scrollIntoViewIfNeeded();
    assert(
      await sheet.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          el.querySelector('.sheet-scroll').scrollTop > 0 &&
          r.left >= 0 &&
          r.right <= innerWidth + 1 &&
          r.bottom <= innerHeight + 1
        );
      }),
    );
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'hidden' });
    assert(await button.evaluate((el) => document.activeElement === el));

    await page.getByRole('button', { name: '日历菜单' }).click();
    const menu = page.locator('.sky-menu');
    assert.equal(
      await menu.getByRole('button', { name: '节日预览' }).count(),
      0,
    );
    for (const type of ['雨', '雪']) {
      await menu.getByLabel('天空', { exact: true }).selectOption(type);
      for (const level of [1, 2, 3, 4, 5]) {
        await menu.getByLabel('降水强度').selectOption(String(level));
        const label = ['', '小', '中', '大', '暴', '特大暴'][level] + type;
        assert(
          (await page.locator('.planner-weather').innerText()).includes(label),
        );
      }
    }
    await menu.getByLabel('风力').selectOption('3');
    assert(
      (await page.locator('.planner-weather').innerText()).includes('强风'),
    );
    await menu.getByRole('button', { name: '恢复合肥实时天气' }).click();
    assert.equal(
      await menu.getByLabel('天空', { exact: true }).inputValue(),
      '实时',
    );
    assert.match(
      await page.locator('.planner-weather').innerText(),
      /合肥.*多云/,
    );
    assert.deepEqual(writes, []);
  } finally {
    await browser.close();
  }
});
