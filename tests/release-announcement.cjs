const test = require('node:test');
const assert = require('node:assert/strict');
const { ReleaseAnnouncementService } = require('../dist/server/modules/calendar/release-announcement.service');

function fixture(snapshot) {
  let reads = 0;
  const db = {select: () => ({from: () => ({where: () => ({limit: async () => {
    reads += 1;
    return snapshot ? [snapshot] : [];
  }})})})};
  return {service: new ReleaseAnnouncementService({}, db), reads: () => reads};
}
const good = () => ({recipientIds: ['3', '1', '2'], recipientCount: 3,
  verifiedAt: new Date(), source: 'feishu-contact-v3'});

test('preflight accepts a fresh, complete and unique official-contact snapshot', async () => {
  const f = fixture(good());
  const preview = await f.service.preview('v3.2.1');
  assert.equal(preview.recipientCount, 3);
  assert.match(preview.wikiUrl, /I6uzwNwd7izfPCkQHJDcoxdRnRb/);
  assert.equal(f.reads(), 1);
});

test('preflight refuses missing, stale, duplicate and malformed snapshots', async () => {
  const stale = {...good(), verifiedAt: new Date(Date.now() - 25 * 60 * 60 * 1000)};
  for (const snapshot of [null, stale,
    {...good(), recipientIds: ['1', '1', '2']},
    {...good(), recipientCount: 4},
    {...good(), recipientIds: ['ou_external', '1', '2']},
    {...good(), source: 'unverified'}]) {
    await assert.rejects(fixture(snapshot).service.preview('v3.2.1'));
  }
});

test('invalid release details are rejected before directory lookup or notification', async () => {
  const f = fixture(good());
  await assert.rejects(f.service.publish({version: 'v3.2.1', highlights: []}, '123'), /请填写有效版本号/);
  assert.equal(f.reads(), 0);
});
