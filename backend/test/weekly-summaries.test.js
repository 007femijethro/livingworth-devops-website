import test from 'node:test';
import assert from 'node:assert/strict';
import {applyWeeklySummaries,weeklySummaries} from '../dist/weekly-summaries.js';
function fixture({already=false,mismatch=false,fail=false}={}) {
 const rows=weeklySummaries.map((week,index)=>({id:index+100,weekNumber:week.week,title:week.title,summary:'Original summary',published:index<13}));
 if(mismatch)rows[0].title='Different course';
 const original=structuredClone(rows),calls=[];let marker;
 const connection={beginTransaction:async()=>calls.push('begin'),commit:async()=>calls.push('commit'),rollback:async()=>{calls.push('rollback');rows.splice(0,rows.length,...structuredClone(original))},release:()=>calls.push('release'),query:async sql=>{calls.push(sql);if(sql.includes('pg_advisory'))return [[]];return [structuredClone(rows)]},execute:async(sql,params)=>{calls.push(sql);if(sql.startsWith('SELECT value_text'))return [already?[{valueText:'previous'}]:[]];if(sql.startsWith('UPDATE learning_modules')){if(fail)throw new Error('write failed');rows.find(row=>row.id===params[1]).summary=params[0];return [{affectedRows:1}]};if(sql.startsWith('INSERT INTO system_settings')){marker=JSON.parse(params[1]);return [{affectedRows:1}]};throw new Error(sql)}};
 return {pool:{getConnection:async()=>connection},rows,original,calls,getMarker:()=>marker};
}
test('all 16 summaries save atomically, preserve publication and retain prior summaries',async()=>{
 const f=fixture();assert.deepEqual(await applyWeeklySummaries(f.pool),{applied:true,verifiedWeeks:16,publishedWeeks:13,draftWeeks:3});assert.ok(f.rows.every((row,index)=>row.summary===weeklySummaries[index].summary));assert.deepEqual(f.rows.map(row=>row.published),f.original.map(row=>row.published));assert.deepEqual(f.getMarker().before,f.original);assert.equal(f.calls.filter(call=>call.startsWith('UPDATE learning_modules')).length,16);assert.ok(f.calls.includes('commit'));assert.equal(f.calls.at(-1),'release');
});
test('completed update is not reapplied, preserving later admin edits',async()=>{const f=fixture({already:true});assert.equal((await applyWeeklySummaries(f.pool)).applied,false);assert.equal(f.calls.some(call=>call.startsWith('UPDATE')),false);assert.equal(f.calls.at(-1),'release')});
test('changed curriculum or failed writes abort the entire update and release the connection',async()=>{for(const option of [{mismatch:true},{fail:true}]){const f=fixture(option);await assert.rejects(applyWeeklySummaries(f.pool));assert.deepEqual(f.rows,f.original);assert.ok(f.calls.includes('rollback'));assert.equal(f.calls.includes('commit'),false);assert.equal(f.calls.at(-1),'release')}});
