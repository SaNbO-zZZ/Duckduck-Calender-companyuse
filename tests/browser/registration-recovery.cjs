const assert = require('node:assert/strict');
// Run against the synthetic preview from scripts/preview-phase3.cjs.
// Set NODE_PATH to an existing Playwright installation if it is installed separately.
const { chromium } = require('playwright');
const { test } = require('node:test');
const port = Number(process.env.DUCKY_LOCAL_PREVIEW_PORT || 4173);
test('移动端断网、重开、回执核对与存储禁用', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    page.setDefaultTimeout(6000);
    const requests = [],
      ids = [];
    const receipt = {
      recorded: true,
      processing: false,
      recordId: 'synthetic',
      notifications: 'sent',
      message: '合成登记已经完成',
    };
    let post = 'fail',
      status = 'missing';
    const json = (r, data, code = 200) =>
      r.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(data) });
    await page.route('**/api/calendar/register', async (r) => {
      requests.push('POST');
      ids.push(r.request().postDataJSON().requestKey);
      if (post === 'fail') return r.abort('failed');
      if (post === 'reject') return json(r, { error: '合成校验拒绝' }, 400);
      return json(r, receipt);
    });
    await page.route('**/api/calendar/registration-status*', async (r) => {
      requests.push('GET');
      if (status === 'fail') return r.abort('failed');
      return json(r, {
        result:
          status === 'missing'
            ? null
            : status === 'review'
              ? {
                  ...receipt,
                  recorded: false,
                  recordId: null,
                  notifications: 'pending_review',
                  message: '待核对',
                }
              : receipt,
      });
    });
    const open = () => page.getByRole('button', { name: '提前离开', exact: true }).click();
    const fill = () => page.getByRole('combobox', { name: '选择 Mentor' }).selectOption('demo1');
    const submit = () => page.getByRole('button', { name: '登记并通知', exact: true }).click();
    const again = () => page.getByRole('button', { name: '核对本次登记结果', exact: true }).click();
    const close = () => page.getByRole('button', { name: /^(取消|完成)$/ }).click();
    const storage = () =>
      page.evaluate(() =>
        Object.fromEntries(
          Object.entries(localStorage).filter(([k]) => k.startsWith('ducky:pending-registration:')),
        ),
      );
    await page.goto('http://127.0.0.1:' + port + '/');
    await open();
    await fill();
    await submit();
    await page.getByRole('alert').waitFor();
    assert.deepEqual(Object.values(await storage()), [ids[0]]);
    await page.reload();
    status = 'fail';
    await open();
    await page.getByRole('alert').waitFor();
    assert.deepEqual(requests, ['POST', 'GET']);
    assert(await page.getByRole('combobox', { name: '选择 Mentor' }).isDisabled());
    status = 'review';
    await again();
    await page.getByText('待核对', { exact: false }).first().waitFor();
    assert.deepEqual(Object.values(await storage()), [ids[0]]);
    status = 'missing';
    await again();
    await page.getByText(/暂未查到这笔登记/).waitFor();
    await fill();
    post = 'reject';
    await submit();
    await page.getByText('合成校验拒绝').waitFor();
    assert.deepEqual(Object.values(await storage()), []);
    assert.equal(ids[0], ids[1]);
    post = 'fail';
    await submit();
    await page.getByRole('button', { name: '核对本次登记结果', exact: true }).waitFor();
    assert.notEqual(ids[2], ids[1]);
    await close();
    status = 'done';
    await open();
    await page.getByText(/合成登记已经完成/).waitFor();
    assert.deepEqual(Object.values(await storage()), []);
    assert.equal(ids.length, 3);
    await close();
    await open();
    await fill();
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error('synthetic quota');
      };
    });
    await submit();
    await page.getByText(/当前无法安全保存登记编号/).waitFor();
    assert.equal(ids.length, 3);
  } finally {
    await browser.close();
  }
});
