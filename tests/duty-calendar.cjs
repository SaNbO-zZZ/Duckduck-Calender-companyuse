const assert = require('node:assert/strict');
const {
  addBeijingDays, weekdayOf, queueAfter, planDutySelection, resolveDuty,
  notificationIdempotencyKey, canTransitionExchange, isAnimationLocked, applyAvatarBinding,
} = require('../dist/shared/duty-calendar');
const rules = [1,2,3,4,5,6,7].map((weekday) => ({weekday, personId:`p${weekday}`, duckKey:`duck-${weekday}`}));
const monday = '2026-11-09';
for (let i=0;i<7;i++) {
  const date = addBeijingDays(monday, i);
  assert.equal(weekdayOf(date), i + 1);
  assert.deepEqual(queueAfter(i + 1), [...Array(6)].map((_, j) => ((i + j + 1) % 7) + 1));
}
const today = '2026-11-14';
assert.equal(planDutySelection(today, today, rules).mode, 'queue');
assert.deepEqual(planDutySelection(today, today, rules).queue, [7,1,2,3,4,5]);
assert.equal(planDutySelection('2026-11-21', today, rules).mode, 'dialogue');
assert.equal(planDutySelection('2026-11-15', today, rules).mode, 'queue');
assert.equal(planDutySelection('2026-11-13', today, rules).mode, 'hidden');
const override = {dutyDate:'2026-11-15', originalPersonId:'p7', replacementPersonId:'p9', replacementDuckKey:'duck-9', status:'active'};
assert.equal(resolveDuty('2026-11-15', rules, [override]).personId, 'p9');
assert.equal(resolveDuty('2026-11-15', rules, [{...override,status:'cancelled'}]).personId, 'p7');
const resolvedForBinding = resolveDuty('2026-11-15', rules, [override]);
assert.equal(applyAvatarBinding(resolvedForBinding, {personId:'p9', duckKey:'kunduck'}).duckKey, 'kunduck');
assert.equal(applyAvatarBinding(resolvedForBinding, {personId:'p9', duckKey:'kunduck', status:'inactive'}).duckKey, 'duck-9');
assert.equal(notificationIdempotencyKey('2026-11-15','p9'), '2026-11-15:p9');
assert.equal(isAnimationLocked('reacting'), true);
assert.equal(isAnimationLocked('idle'), false);
assert.equal(canTransitionExchange('draft','submit'), 'awaiting_confirmation');
assert.equal(canTransitionExchange('awaiting_confirmation','confirm'), 'confirmed');
assert.equal(canTransitionExchange('confirmed','apply'), 'applied');
assert.equal(canTransitionExchange('awaiting_confirmation','expire'), 'expired');
assert.throws(() => canTransitionExchange('rejected','apply'));
console.log('duty calendar matrix passed');
