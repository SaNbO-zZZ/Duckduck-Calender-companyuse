const assert = require('node:assert/strict');
const { DutyNotificationHandler } = require('../dist/server/modules/duty/duty-notification.handler');

function makeDb() {
  const rows = [];
  return {
    rows,
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => rows.slice(0, 1) }),
      }),
    }),
    insert: () => ({
      values: value => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (rows.some(row => row.idempotencyKey === value.idempotencyKey)) return [];
            const row = { id: `delivery-${rows.length + 1}`, ...value };
            rows.push(row);
            return [row];
          },
        }),
      }),
    }),
    update: () => ({
      set: changes => ({
        where: async () => { Object.assign(rows[0], changes); },
      }),
    }),
  };
}

function makeHandler({ personId = 'person-1', db = makeDb() } = {}) {
  const calls = [];
  const duty = {
    day: async date => ({
      duty: { date, weekday: 5, personId, duckKey: 'lion', source: 'weekly' },
      personName: '受控测试负责人',
      personValid: true,
    }),
  };
  const authn = { getBatchLarkUserIds: async ids => ids.map(id => `lark-${id}`) };
  const capability = { load: () => ({ call: async (action, input) => { calls.push({ action, input }); return { success: true }; } }) };
  return { handler: new DutyNotificationHandler(db, capability, authn, duty), calls, db };
}

(async () => {
  const fixture = makeHandler();
  const first = await fixture.handler.run('2026-11-13', { controlledRecipient: 'test-person' });
  assert.equal(first.state, 'accepted');
  assert.deepEqual(fixture.calls.map(call => call.input.recipients), [['lark-test-person']]);
  assert.equal(fixture.calls[0].input.recipients.length, 1);
  const second = await fixture.handler.run('2026-11-13', { controlledRecipient: 'test-person' });
  assert.equal(second.state, 'accepted');
  assert.equal(fixture.calls.length, 1, 'same date/person must not send twice');

  const noLive = makeHandler();
  const previewOnly = await noLive.handler.run('2026-11-14');
  assert.equal(previewOnly.state, 'needs_review');
  assert.equal(noLive.calls.length, 0, 'default local path must not call the real send capability');
  console.log('single recipient controlled notification passed');
})();
