const assert = require('node:assert/strict');
const { buildDutyNotificationPlan } = require('../dist/server/modules/duty/duty-notification');

const plan = buildDutyNotificationPlan(
  { date: '2026-11-15', weekday: 7, personId: 'stable-person-7', duckKey: 'role-07', source: 'weekly' },
  '受运行时 profile 解析的负责人',
  '/app/app_17fstqsqv1c',
);

assert.equal(plan.idempotencyKey, '2026-11-15:stable-person-7');
assert.equal(plan.state, 'pending');
assert.match(plan.title, /2026-11-15/);
assert.match(plan.content, /值日提醒/);
assert.match(plan.content, /app_17fstqsqv1c/);
console.log('duty notification plan passed');
