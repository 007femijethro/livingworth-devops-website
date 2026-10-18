import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarDateKey,calendarICS} from './learning-calendar-utils.ts';
test('calendar groups events by academy timezone across day and month boundaries',()=>{
 assert.equal(calendarDateKey(new Date('2026-10-31T23:30:00Z'),'Africa/Lagos'),'2026-11-01');
 assert.equal(calendarDateKey(new Date('2026-10-31T23:30:00Z'),'America/New_York'),'2026-10-31');
});
test('calendar export is stable, escapes event text and folds Unicode lines by bytes',()=>{
 const event={id:3,type:'class',title:'Class, one; notes\nEND:VEVENT '+ '🌍'.repeat(30),startsAt:'2026-10-19T19:00:00Z',endsAt:'2026-10-19T20:00:00Z',status:'scheduled',actionTarget:'Live class'};
 const data=calendarICS([event],new Date('2026-10-18T20:00:00Z'));
 assert.ok(data.includes('DTSTART:20261019T190000Z'));assert.ok(data.includes('DTEND:20261019T200000Z'));assert.ok(data.includes('UID:class-3@livingworthacademy.com'));
 assert.ok(data.includes('SUMMARY:Class\\, one\\; notes\\nEND:VEVENT'));
 assert.equal(data.match(/^BEGIN:VEVENT$/gm).length,1);assert.equal(data.match(/^END:VEVENT\r?$/gm).length,1);
 for(const line of data.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
});
