import test from 'node:test';
import assert from 'node:assert/strict';
import { classSessionStatus } from './class-schedule.ts';
const schedule={classTime:'20:00',classTimezone:'Africa/Lagos',classDays:[1,3,5],classDurationMinutes:60};
test('Lagos class schedule respects start, end, days and changed duration',()=>{
 const status=classSessionStatus(new Date('2026-10-19T19:30:00Z'),schedule);assert.equal(status.isLive,true);assert.equal(status.date.toISOString(),'2026-10-19T19:00:00.000Z');
 const ended=classSessionStatus(new Date('2026-10-19T20:00:00Z'),schedule);assert.equal(ended.isLive,false);assert.equal(ended.date.toISOString(),'2026-10-21T19:00:00.000Z');
 assert.equal(classSessionStatus(new Date('2026-10-19T20:00:00Z'),{...schedule,classDurationMinutes:120}).isLive,true);
 assert.equal(classSessionStatus(new Date('2026-10-18T19:30:00Z'),{...schedule,classDays:[0,5,6]}).isLive,true);
});
test('schedule accounts for timezone daylight-saving changes and overnight classes',()=>{
 const london={...schedule,classTimezone:'Europe/London',classDays:[0]};
 assert.equal(classSessionStatus(new Date('2026-10-18T18:00:00Z'),london).date.toISOString(),'2026-10-18T19:00:00.000Z');
 assert.equal(classSessionStatus(new Date('2026-10-25T18:00:00Z'),london).date.toISOString(),'2026-10-25T20:00:00.000Z');
 assert.equal(classSessionStatus(new Date('2026-10-20T00:00:00Z'),{...schedule,classTime:'23:30',classDurationMinutes:120}).isLive,true);
});
