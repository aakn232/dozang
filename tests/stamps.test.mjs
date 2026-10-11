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

test('selected dates must be real dates on or before today', async () => {
  const { isValidStampDay } = await import('../lib/stamps.ts');
  const today = '2026-10-11';
  assert.ok(isValidStampDay(today, today));
  assert.ok(isValidStampDay('2026-10-10', today));
  assert.ok(isValidStampDay('2024-02-29', today));
  for (const invalid of ['2026-10-12','2025-02-29','2026-02-30','2026-13-01','2026-00-01','2026-10-00','2026-10-32','2026-1-1','0000-01-01',null,123,'']) {
    assert.ok(!isValidStampDay(invalid, today), String(invalid));
  }
});
test('records sort by selected date before their actual creation time', async () => {
  const { stampOrder } = await import('../lib/stamps.ts');
  const records = [
    {id:'a',day:'2026-10-10',created_at:'2026-10-11T05:00:00Z',content:''},
    {id:'b',day:'2026-10-11',created_at:'2026-10-11T04:00:00Z',content:''},
    {id:'c',day:'2026-10-10',created_at:'2026-10-11T06:00:00Z',content:''},
  ];
  assert.deepEqual(records.sort(stampOrder).map(r=>r.id), ['b','c','a']);
});
