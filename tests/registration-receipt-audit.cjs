const test = require('node:test');
const assert = require('node:assert/strict');
const { tables } = require('../dist/auth/lib/feishu-platform');
const { compareRegistrations } = require('../scripts/audit_registration_receipts.cjs');

test('receipt audit distinguishes missing keys, duplicate keys, people and notification discrepancies', () => {
  const receipt = { kind: 'leave', record_id: 'record1', request_key: 'key1', record_state: 'created',
    applicant: 'applicant', mentor: 'mentor', hr: 'hr', mentor_state: 'sent', hr_state: 'sent' };
  const fields = { '登记编号': [{ text: 'key1' }], '申请人': [{ id: 'applicant' }], Mentor: [{ id: 'mentor' }],
    '人事': [{ id: 'hr' }], '通知状态': '已发送' };
  const record = { table: tables.leave, record_id: 'record1', fields };
  assert.equal(compareRegistrations([receipt], [record]).matched, 1);
  const report = compareRegistrations([receipt, { ...receipt, record_id: 'absent' }], [
    { ...record, fields: { ...fields, Mentor: [], '通知状态': '发送中' } },
    { ...record, record_id: 'record2' },
    { ...record, record_id: 'record3', fields: {} },
    { ...record, record_id: 'record4', fields: { '登记编号': 'another' } },
  ]);
  assert.deepEqual(report, { receipts: 2, baseRows: 4, matched: 0, unfinished: 0, missingRecord: 1,
    keyMismatch: 1, personMismatch: 1, notificationMismatch: 1, duplicateKey: 1, baseOnlyWithKey: 1, baseWithoutKey: 1 });
});
