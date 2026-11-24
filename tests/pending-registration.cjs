const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  pendingRegistration,
  confirmedRegistration,
} = require('../dist/shared/pending-registration');

function storage() {
  const data = new Map();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

test('重新打开只恢复同一账号和登记种类的编号，旧窗口无法清掉下一笔', () => {
  const store = storage(),
    open = (actor = 'demoA', kind = 'leave') => pendingRegistration(actor, kind, () => store);
  const first = randomUUID(),
    next = randomUUID();
  assert.equal(open().remember(first), first);
  assert.deepEqual([...store.data.values()], [first]);
  assert.equal(open('demoB').read(), null);
  assert.equal(open('demoA', 'late').read(), null);
  assert.equal(open().remember(next), first);
  open().clear(first);
  assert.equal(open().remember(next), next);
  open().clear(first);
  assert.equal(open().read(), next);
});

test('存储被禁用、无法持久化或已有内容损坏时拒绝创建未保存的编号', () => {
  const first = randomUUID(),
    store = storage();
  const denied = pendingRegistration('demo', 'early', () => {
    throw new Error('SecurityError');
  });
  assert.throws(() => denied.remember(first), /存储/);
  const lost = pendingRegistration('demo', 'early', () => ({ ...store, setItem() {} }));
  assert.throws(() => lost.remember(first), /存储/);
  const invalid = pendingRegistration('demo', 'early', () => ({
    ...store,
    getItem: () => 'unexpected',
  }));
  assert.throws(() => invalid.remember(first), /异常/);
});

test('仅已落表且处理结束的登记可以释放编号', () => {
  for (const recorded of [true, false])
    for (const processing of [true, false]) {
      assert.equal(confirmedRegistration({ recorded, processing }), recorded && !processing);
    }
});
