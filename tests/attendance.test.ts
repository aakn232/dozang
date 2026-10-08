import {test} from 'node:test';
import assert from 'node:assert/strict';
import {koreaDay,previousDay,currentStreak} from '../lib/attendance.ts';
test('Korean midnight changes the attendance day',()=>{
 assert.equal(koreaDay(new Date('2026-10-08T14:59:59Z')),'2026-10-08');
 assert.equal(koreaDay(new Date('2026-10-08T15:00:00Z')),'2026-10-09');
});
test('streak spans month and leap year boundaries',()=>{
 assert.equal(previousDay('2024-03-01'),'2024-02-29');
 assert.equal(currentStreak(['2026-09-30','2026-10-01'],'2026-10-02'),2);
 assert.equal(currentStreak(['2026-09-30','2026-10-01'],'2026-10-03'),0);
 assert.equal(currentStreak(['2026-10-01','2026-10-02'],'2026-10-02'),2);
 assert.equal(currentStreak([],'2026-10-02'),0);
});
