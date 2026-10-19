import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBank,importReviewedQuizzes} from '../scripts/import-week8-9-quizzes.mjs';
const question = i => ({prompt:`Question ${i}`,options:['Alpha','Bravo','Delta','Gamma'],correctIndex:i%4,source:'Reviewed lesson'});
const bank = () => ({version:1,quizzes:[8,9].map(week=>({week,title:`Week ${week}`,materialId:week,moduleTitle:'Course',materials:[{id:week,title:'Lesson',resourceUrl:'',contentSha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}],questions:Array.from({length:40},(_,i)=>question(i))}))});
test('rejects unbalanced answers, duplicate options and incomplete banks',()=>{
 for(const change of [b=>b.quizzes[0].questions.pop(),b=>b.quizzes[0].questions[0].correctIndex=1,b=>b.quizzes[0].questions[0].options[1]='Alpha',b=>b.quizzes[0].questions[0].source='']) {const b=bank();change(b);assert.throws(()=>validateBank(b));}
 assert.equal(validateBank(bank()).quizzes.length,2);
});
test('reruns preserve staff edits and do not read the bank or insert duplicates',async()=>{
 const calls=[];const client={query:async(sql)=>{calls.push(sql);return {rows:sql.startsWith('SELECT value_text')?[{value_text:JSON.stringify({quizzes:[{id:123}]})}]:[]}}};
 const result=await importReviewedQuizzes(client,()=>{throw new Error('Must not read bank');});
 assert.equal(result.applied,false);assert.equal(calls.at(-1),'COMMIT');assert.ok(!calls.some(x=>x.startsWith('INSERT')));
});
test('changed source material rolls back before any quiz is created',async()=>{
 const calls=[];const client={query:async(sql)=>{calls.push(sql);return {rows:sql.startsWith('SELECT id FROM lw_users')?[{id:1}]:sql.startsWith('SELECT l.id')?[{id:8,week_number:8,title:'Changed lesson'}]:[]}}};
 await assert.rejects(importReviewedQuizzes(client,bank),/materials changed/);
 assert.equal(calls.at(-1),'ROLLBACK');assert.ok(!calls.some(x=>x.startsWith('INSERT')));
});
test('successful import saves exactly eighty verified questions in two unscheduled drafts',async()=>{
 const calls=[],saved=new Map();let nextId=100;
 const client={query:async(sql,p=[])=>{
  calls.push(sql);
  if(sql.startsWith('SELECT id FROM lw_users'))return{rows:[{id:1}]};
  if(sql.startsWith('SELECT l.id'))return{rows:[{id:p[0],week_number:p[0],title:'Lesson',module_title:'Course',resource_url:'',lesson_content:''}]};
  if(sql.startsWith('INSERT INTO lw_quizzes')){assert.match(sql,/'draft',60,'manual',FALSE,NULL/);saved.set(++nextId,[]);return{rows:[{id:nextId}]};}
  if(sql.startsWith('INSERT INTO lw_quiz_questions'))saved.get(p[0]).push({prompt:p[1],options_json:JSON.parse(p[3]),correct_index:p[4],sequence_no:p[5]});
  if(sql.startsWith('SELECT prompt'))return{rows:saved.get(p[0])};
  return{rows:[]};
 }};
 const r=await importReviewedQuizzes(client,bank);assert.equal(r.applied,true);assert.deepEqual(r.quizzes.map(q=>q.questionCount),[40,40]);assert.equal(calls.filter(x=>x.startsWith('INSERT INTO lw_quiz_questions')).length,80);assert.equal(calls.at(-1),'COMMIT');assert.ok(!calls.some(x=>/notifications|attempts|UPDATE|DELETE/.test(x)));
});
