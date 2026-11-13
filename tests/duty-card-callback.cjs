const assert = require('node:assert/strict');
const { parseDutyCardCallback } = require('../dist/shared/duty-card-callback');

const raw = {
  schema: '2.0',
  header: { event_id: 'evt-controlled-1', event_type: 'card.action.trigger' },
  event: {
    operator: { open_id: 'ou_controlled' },
    action: { tag: 'button', value: { key: 'exchange_confirm', request_id: 'req-1' } },
  },
  context: { open_message_id: 'om-test', open_chat_id: 'oc-test' },
};
const parsed = parseDutyCardCallback(raw);
assert.equal(parsed.ok, true);
assert.equal(parsed.value.eventId, 'evt-controlled-1');
assert.equal(parsed.value.operatorId, 'ou_controlled');
assert.equal(parsed.value.exchangeAction, 'confirm');
assert.equal(parsed.value.requestId, 'req-1');

const flattened = parseDutyCardCallback({
  type: 'card.action.trigger',
  event_id: 'evt-controlled-2',
  operator_id: 'ou_flattened',
  action_tag: 'button',
  action_value: JSON.stringify({ action: 'exchange_reject', requestId: 'req-2' }),
});
assert.equal(flattened.ok, true);
assert.equal(flattened.value.exchangeAction, 'reject');
assert.equal(flattened.value.requestId, 'req-2');

for (const value of [null, {}, { type: 'im.message.receive_v1', event_id: 'x', operator_id: 'y' }, { type: 'card.action.trigger', operator_id: 'y' }]) {
  assert.equal(parseDutyCardCallback(value).ok, false);
}
console.log('duty card callback parser passed');
