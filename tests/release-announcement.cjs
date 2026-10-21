const test = require('node:test');
const assert = require('node:assert/strict');
const { ReleaseAnnouncementService } = require('../dist/server/modules/calendar/release-announcement.service');

function fixture(pages) {
  const calls = [];
  const authz = {search: {search: async input => {
    calls.push(input);
    return pages[input.page - 1];
  }}};
  return {service: new ReleaseAnnouncementService(authz, {}, {}), calls};
}
const result = (total, ids) => ({data: {result: {userResult: {total, items: ids.map(userID => ({userID}))}}}});

test('preflight pages through all internal employees and excludes external contacts', async () => {
  const f = fixture([result(3, ['3', '1']), result(3, ['2'])]);
  const preview = await f.service.preview();
  assert.equal(preview.recipientCount, 3);
  assert.match(preview.wikiUrl, /I6uzwNwd7izfPCkQHJDcoxdRnRb/);
  assert.deepEqual(f.calls.map(call => call.page), [1, 2]);
  assert(f.calls.every(call => call.includeExternalUser === false && call.query === ''));
});

test('preflight refuses partial, inconsistent or malformed directory data', async () => {
  for (const pages of [
    [result(3, ['1']), result(3, [])],
    [result(3, ['1']), result(4, ['2'])],
    [result(1, ['ou_external'])],
    [result(0, [])],
  ]) {
    await assert.rejects(fixture(pages).service.preview());
  }
});

test('invalid release details are rejected before any directory lookup or notification', async () => {
  const f = fixture([]);
  await assert.rejects(f.service.publish({version: 'v3.2.1', highlights: []}, '123'), /请填写有效版本号/);
  assert.equal(f.calls.length, 0);
});