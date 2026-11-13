const assert = require('node:assert/strict');
const { DutyNotificationHandler } = require('../dist/server/modules/duty/duty-notification.handler');
const { readDutyNotificationTestConfig } = require('../dist/shared/duty-notification-test');

function makeDb() {
  const rows = [];
  return {
    rows,
    select: () => ({ from: () => ({ where: () => ({ limit: async () => rows.slice(0, 1) }) }) }),
    insert: () => ({ values: value => ({ onConflictDoNothing: () => ({ returning: async () => {
      if (rows.some(row => row.idempotencyKey === value.idempotencyKey)) return [];
      const row = { id: `controlled-${rows.length + 1}`, ...value }; rows.push(row); return [row];
    } }) }) }),
    update: () => ({ set: changes => ({ where: async () => { Object.assign(rows[0], changes); } }) }),
  };
}

(async () => {
  const config = readDutyNotificationTestConfig();
  const db = makeDb();
  const calls = [];
  const duty = { day: async date => ({ duty: { date, weekday: 5, personId: 'stable-person-5', duckKey: 'lion', source: 'weekly' }, personName: '受控测试负责人', personValid: true }) };
  const authn = { getBatchLarkUserIds: async ids => ids.map(id => `mapped-${id}`) };
  const capability = { load: () => ({ call: async (action, input) => { calls.push({ action, input }); return { success: true }; } }) };
  const handler = new DutyNotificationHandler(db, capability, authn, duty);
  const first = await handler.run('2026-11-13', { controlledRecipient: config.controlledRecipient });
  const second = await handler.run('2026-11-13', { controlledRecipient: config.controlledRecipient });
  assert.equal(first.state, 'accepted');
  assert.equal(second.state, 'accepted');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.recipients.length, 1);
  assert.equal(calls[0].input.recipients[0], `mapped-${config.controlledRecipient}`);
  console.log(`controlled single-recipient simulation passed: recipientCount=1, idempotentCalls=${calls.length}`);
})();
