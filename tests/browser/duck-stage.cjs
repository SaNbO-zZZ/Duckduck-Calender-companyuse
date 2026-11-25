// Run against the local synthetic preview.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
test('weather ducks respond independently and the duty duck walks home before replay', async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    await page.goto(
      'http://127.0.0.1:' +
        Number(process.env.DUCKY_LOCAL_PREVIEW_PORT || 4173),
    );
    const flock = page.locator('.toy-stage'),
      buttons = flock.getByRole('button');
    await page.locator('[data-renderer="three"]').waitFor();
    assert.equal(
      new Set(
        await buttons.evaluateAll((nodes) =>
          nodes.map((n) => n.dataset.outfit),
        ),
      ).size,
      3,
    );
    const actions = new Set();
    for (let i = 0; i < 12; i++) {
      await buttons.nth(1).click();
      actions.add(await buttons.nth(1).getAttribute('data-action'));
    }
    assert.equal(actions.size, 12);
    assert.equal(await buttons.nth(0).getAttribute('data-action'), null);
    assert.equal(await flock.innerText(), '');
    const button = page.locator('.duty-sprite:enabled');
    await button.waitFor();
    const frames = await button.evaluate(
      (el) =>
        new Promise((resolve) => {
          const history = [],
            start = performance.now();
          el.click();
          function capture() {
            const r = el.getBoundingClientRect(),
              rail = el.parentElement.getBoundingClientRect();
            const t = performance.now() - start;
            history.push({
              action: el.dataset.action,
              x: r.left,
              inside:
                r.left >= rail.left - 1 &&
                r.right <= rail.right + 1 &&
                r.top >= rail.top - 1 &&
                r.bottom <= rail.bottom + 1,
              t,
            });
            if (t > 4200) resolve(history);
            else requestAnimationFrame(capture);
          }
          requestAnimationFrame(capture);
        }),
    );
    assert(frames.every((s) => s.inside));
    assert.deepEqual(
      [...new Set(frames.map((s) => s.action).filter((s) => s !== 'idle'))],
      ['react', 'walkLeft', 'peek', 'jump'],
    );
    assert(
      Math.min(...frames.filter((s) => s.action === 'peek').map((s) => s.x)) <
        frames.at(-1).x - 30,
    );
    const finished = frames.find((s) => s.action === 'idle' && s.t > 2900);
    assert(finished.t >= 3800 && finished.t <= 4200);
    assert.match(await page.locator('.stage-caption').innerText(), /巡场完成/);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.toy-stage img').length === 3 &&
        Array.from(document.querySelectorAll('.toy-stage img')).every(
          (img) => img.complete && img.naturalWidth >= 256,
        ),
    );
    assert.equal(await flock.locator('canvas').count(), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('[data-renderer="three"]').waitFor();
    await flock
      .locator('canvas')
      .evaluate((c) =>
        c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext(),
      );
    await page.locator('[data-renderer="still"] img').first().waitFor();
  } finally {
    await browser.close();
  }
});
