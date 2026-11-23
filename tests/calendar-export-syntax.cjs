const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
test('calendar entry renders native layout without a host scroll lock', () => {
  const source = fs.readFileSync('client/src/pages/Calendar/Calendar.tsx', 'utf8');
  assert.doesNotMatch(source, /<iframe|srcDoc|stopHostWheel|createPortal/);
  assert.match(source, /<DutyDuckStage/);
});
