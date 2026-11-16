const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('client/src/pages/Calendar/DutyDuckStage.tsx', 'utf8');
assert.match(source, /UserSelect/);
assert.match(source, /url:\s*['"]\/api\/duty\/exchange-requests['"]/);
assert.match(source, /method:\s*['"]POST['"]/);
assert.match(source, /data:\s*\{ dutyDate: selectedDate, inviteeId: exchangeInviteeId \}/);
assert.match(source, /window\.location\.assign\(response\.data\.openUrl\)/);
assert.match(source, /创建并打开确认页/);
console.log('duty stage exchange entry contract passed');
