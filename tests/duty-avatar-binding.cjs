const assert = require('node:assert/strict');
const { DutyService } = require('../dist/server/modules/duty/duty.service');

(async () => {
  const service = new DutyService(null, {
    listUsersByIds: async ids => ids.map(id => ({ miaodaUserID: id, name: { zh_cn: '绑定员工' } })),
  });
  service.rules = async () => [{ weekday: 1, personId: 'person-1', duckKey: 'caishen' }];
  service.overrides = async () => [];
  service.avatarBinding = async () => ({ personId: 'person-1', duckKey: 'lion', manifestVersion: 'duty-ducks-v2.1', status: 'active' });
  const result = await service.day('2026-11-16');
  assert.equal(result.personName, '绑定员工');
  assert.equal(result.duty.personId, 'person-1');
  assert.equal(result.duty.duckKey, 'lion');
  console.log('duty avatar binding runtime passed');
})();
