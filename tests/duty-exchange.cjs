const assert = require('node:assert/strict');
const { exchangeCutoffMs, exchangeOpenUrl, reduceExchange } = require('../dist/shared/duty-exchange');
const { buildDutyExchangeOpenCard } = require('../dist/shared/duty-exchange-card');

const requestId = '11111111-1111-4111-8111-111111111111';
const employeeId = 'ou_employee_should_not_be_in_url';
const url = exchangeOpenUrl(requestId);
assert.match(url, /duty-exchange\?requestId=/);
assert.equal(url.includes(employeeId), false);

assert.equal(exchangeCutoffMs('2026-11-14'), Date.parse('2026-11-14T16:00:00+08:00'));
assert.deepEqual(reduceExchange('draft', 'submit'), { state: 'awaiting_confirmation', idempotent: false, applyOverride: false });
assert.deepEqual(reduceExchange('awaiting_confirmation', 'confirm'), { state: 'confirmed', idempotent: false, applyOverride: false });
assert.deepEqual(reduceExchange('confirmed', 'apply'), { state: 'applied', idempotent: false, applyOverride: true });
assert.deepEqual(reduceExchange('awaiting_confirmation', 'reject'), { state: 'rejected', idempotent: false, applyOverride: false });
assert.deepEqual(reduceExchange('awaiting_confirmation', 'cancel'), { state: 'cancelled', idempotent: false, applyOverride: false });
assert.deepEqual(reduceExchange('awaiting_confirmation', 'expire', Date.parse('2026-11-14T16:00:00+08:00'), Date.parse('2026-11-14T16:00:00+08:00')), { state: 'expired', idempotent: false, applyOverride: false });
assert.deepEqual(reduceExchange('applied', 'confirm'), { state: 'applied', idempotent: true, applyOverride: false });
assert.throws(() => reduceExchange('draft', 'confirm'));

const card = buildDutyExchangeOpenCard({ title: '值日换班确认', text: '受控测试', requestId });
const button = card.body.elements.find((item) => item.tag === 'button');
assert.equal(button.behaviors[0].type, 'open_url');
assert.equal(button.behaviors[0].value.url, url);
console.log('duty exchange open_url and state machine passed');
