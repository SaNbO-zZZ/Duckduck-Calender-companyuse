const assert = require('node:assert/strict');
const test = require('node:test');
const { inFestival } = require('../dist/shared/festivals');
test('holiday weeks cross Gregorian years and follow the lunar calendar', () => {
  for (const [key, yes, no] of [
    ['halloween', '2027-10-25', '2027-11-01'],
    ['winter', '2027-01-03', '2027-01-04'],
    ['spring', '2026-02-16', '2026-02-15'],
    ['spring', '2026-03-03', '2026-03-04'],
    ['dragon', '2026-06-19', '2026-06-22'],
    ['moon', '2026-09-25', '2026-09-28'],
  ]) {
    assert.equal(inFestival(key, yes), true, key + yes);
    assert.equal(inFestival(key, no), false, key + no);
  }
});
