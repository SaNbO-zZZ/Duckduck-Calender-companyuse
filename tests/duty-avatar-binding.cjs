const assert = require('node:assert/strict');
const { DutyService } = require('../dist/server/modules/duty/duty.service');
const { beijingDate, weekdayOf } = require('../dist/shared/duty-calendar');

(async () => {
  const binding = { personId: 'person-1', duckKey: 'lion', manifestVersion: 'duty-ducks-v2.1', status: 'active' };
  const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [binding] }) }) }) };
  const service = new DutyService(db, {
    listUsersByIds: async ids => ids.map(id => ({ miaodaUserID: id, name: { zh_cn: '绑定员工' } })),
  });
  const date = beijingDate();
  service.rules = async () => [{ weekday: weekdayOf(date), personId: 'person-1', duckKey: 'caishen' }];
  service.overrides = async () => [];
  const result = await service.day(date);
  assert.equal(result.personName, '绑定员工');
  assert.equal(result.duty.personId, 'person-1');
  assert.equal(result.duty.duckKey, 'lion');
  console.log('duty avatar binding runtime passed');
})();
