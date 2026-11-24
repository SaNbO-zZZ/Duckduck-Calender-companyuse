// Run after npm run build:auth with the target application's server environment.
// Read-only. Report totals so employee identities and registration details stay private.
const { db } = require('../dist/auth/lib/feishu-auth');
const { Feishu, tables } = require('../dist/auth/lib/feishu-platform');

function fieldText(value) {
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? value.map(part => part?.text || '').join('') : '';
}

function compareRegistrations(receipts, records) {
  const counts = {
    receipts: receipts.length, baseRows: records.length, matched: 0, unfinished: 0,
    missingRecord: 0, keyMismatch: 0, personMismatch: 0, notificationMismatch: 0,
    duplicateKey: 0, baseOnlyWithKey: 0, baseWithoutKey: 0,
  };
  const byRecord = new Map();
  const keyCounts = new Map();
  const receiptKeys = new Set(receipts.map(row => row.request_key));
  for (const { table, record_id, fields } of records) {
    byRecord.set(table + '/' + record_id, fields);
    const key = fieldText(fields['登记编号']);
    if (!key) counts.baseWithoutKey++;
    else {
      keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
      if (!receiptKeys.has(key)) counts.baseOnlyWithKey++;
    }
  }
  counts.duplicateKey = [...keyCounts.values()].filter(count => count > 1).length;
  for (const row of receipts) {
    if (row.record_state !== 'created' || !row.record_id) { counts.unfinished++; continue; }
    const table = row.kind === 'leave' ? tables.leave : tables.attendance;
    const fields = byRecord.get(table + '/' + row.record_id);
    if (!fields) { counts.missingRecord++; continue; }
    const key = fieldText(fields['登记编号']);
    const keyMatches = key === row.request_key && keyCounts.get(key) === 1;
    const peopleMatch = [['申请人', row.applicant], ['Mentor', row.mentor], ['人事', row.hr]]
      .every(([name, id]) => id && Array.isArray(fields[name]) && fields[name].length === 1 && fields[name][0]?.id === id);
    const states = [row.mentor_state, row.hr_state];
    const pending = states.some(s => ['pending', 'sending'].includes(s));
    const expected = pending ? '发送中' : states.every(s => s === 'sent') ? '已发送' : '待核对';
    const statusMatches = fieldText(fields['通知状态']) === expected;
    if (pending) counts.unfinished++;
    if (!keyMatches) counts.keyMismatch++;
    if (!peopleMatch) counts.personMismatch++;
    if (!statusMatches) counts.notificationMismatch++;
    if (!pending && keyMatches && peopleMatch && statusMatches) counts.matched++;
  }
  return counts;
}

async function audit() {
  const receipts = [];
  const columns = 'request_key,kind,record_id,record_state,applicant,mentor,hr,mentor_state,hr_state';
  for (;;) {
    const page = await db('calendar_submission?' + new URLSearchParams({
      select: columns, order: 'id.asc', offset: String(receipts.length), limit: '100',
    }));
    receipts.push(...page);
    if (page.length < 100) break;
  }
  const api = new Feishu();
  const records = [];
  for (const table of [tables.attendance, tables.leave]) {
    const rows = await api.search(table, ['登记编号', '申请人', 'Mentor', '人事', '通知状态']);
    records.push(...rows.map(row => ({ ...row, table })));
  }
  const report = compareRegistrations(receipts, records);
  console.log(JSON.stringify(report));
  if (report.matched !== report.receipts || report.duplicateKey || report.baseOnlyWithKey) process.exitCode = 2;
}

if (require.main === module) audit().catch(() => {
  console.error('Registration audit could not read both sources. Check the application configuration and read permissions.');
  process.exitCode = 1;
});
module.exports = { compareRegistrations };
