import test from 'node:test';import assert from 'node:assert/strict';
import {scheduleInput,scheduleInstant} from './quiz-schedule-time.ts';
test('academy wall time is independent of the device timezone and round-trips for editing',()=>{
 assert.equal(scheduleInstant('2030-01-01T20:00','Africa/Lagos'),'2030-01-01T19:00:00.000Z');
 assert.equal(scheduleInput('2030-01-01T19:00Z','Africa/Lagos'),'2030-01-01T20:00');
 assert.equal(scheduleInstant('2030-07-01T20:00','Europe/London'),'2030-07-01T19:00:00.000Z');
 assert.equal(scheduleInstant('2030-01-01T20:00','Europe/London'),'2030-01-01T20:00:00.000Z');
 assert.equal(scheduleInstant('2030-01-01T00:15','Asia/Tokyo'),'2029-12-31T15:15:00.000Z');
 assert.equal(scheduleInstant('','Africa/Lagos'),null);
 assert.throws(()=>scheduleInstant('2030-03-31T01:30','Europe/London'),/does not exist/);
 assert.throws(()=>scheduleInstant('invalid','Africa/Lagos'));
});
