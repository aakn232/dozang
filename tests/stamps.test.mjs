import { test } from 'node:test';
import assert from 'node:assert/strict';
import { koreaDay, deletionPassword } from '../lib/stamps.ts';

test('password examples use the digits of the day of month', () => {
  assert.equal(deletionPassword(new Date('2026-10-21T03:00:00Z')), '63');
  assert.equal(deletionPassword(new Date('2026-10-03T03:00:00Z')), '9');
  assert.equal(deletionPassword(new Date('2026-10-08T03:00:00Z')), '64');
});
test('all days 1 through 31 follow the requested password formula', () => {
  for (let day = 1; day <= 31; day++) {
    const date = new Date(`2026-10-${String(day).padStart(2, '0')}T03:00:00Z`);
    const expected = String((Math.floor(day / 10) + day % 10) * day);
    assert.equal(deletionPassword(date), expected);
  }
});
test('password rolls over at Korean midnight, including the next month', () => {
  assert.equal(koreaDay(new Date('2026-10-08T14:59:59Z')), '2026-10-08');
  assert.equal(deletionPassword(new Date('2026-10-08T14:59:59Z')), '64');
  assert.equal(koreaDay(new Date('2026-10-08T15:00:00Z')), '2026-10-09');
  assert.equal(deletionPassword(new Date('2026-10-08T15:00:00Z')), '81');
  assert.equal(deletionPassword(new Date('2026-10-31T14:59:59Z')), '124');
  assert.equal(deletionPassword(new Date('2026-10-31T15:00:00Z')), '1');
});
