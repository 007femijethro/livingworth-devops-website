import test from 'node:test';
import assert from 'node:assert/strict';
import { continueLearning } from './continue-learning.ts';
const week = (extra = {}) => ({id:7, weekNumber:3, title:'Linux', materials:[{id:10,title:'Shell basics',progressStatus:'not_started'}], assignments:[], activity:null, isComplete:false,...extra});
test('uses server order and picks the first unfinished material without skipping a week',()=>{
 const n=continueLearning([week({isComplete:true}),week({id:8,weekNumber:4,materials:[{id:11,title:'Git',progressStatus:'done'},{id:12,title:'Branches',progressStatus:'in_progress'}]})],5);
 assert.equal(n.kind,'material');assert.equal(n.week.weekNumber,4);assert.equal(n.percentage,50);assert.equal(n.completedWeeks,1);assert.equal(n.totalWeeks,7);assert.equal(n.href,'/portal/student/learning?week=4&material=12');assert.equal(n.label,'Continue material');
});
test('completed materials point to the private class activity before assignments',()=>{
 const n=continueLearning([week({materials:[{id:10,title:'Shell',progressStatus:'done'}],activity:{title:'Linux knowledge check'},assignments:[{id:8,title:'Lab'}]})],2);
 assert.equal(n.kind,'activity');assert.equal(n.href,'/portal/student/class-activity?week=3');assert.equal(n.completed,1);assert.equal(n.total,3);assert.equal(n.percentage,33);
});
test('completed activity leads to the unsubmitted portal assignment, ignoring manual and closed work',()=>{
 const n=continueLearning([week({materials:[],activity:{submittedAt:'2026-10-18'},assignments:[{id:1,title:'DM',assignmentType:'manual'},{id:2,title:'Closed',closedAt:'2026-10-18'},{id:3,title:'Sent',submissionId:90},{id:4,title:'Lab',assignmentType:'portal'}]})]);
 assert.equal(n.kind,'assignment');assert.equal(n.href,'/portal/student/assignments?week=3&assignment=4');assert.equal(n.completed,3);assert.equal(n.total,4);
});
test('empty, incomplete empty week, and all completed weeks have honest states',()=>{
 assert.equal(continueLearning([]).kind,'empty');
 const waiting=continueLearning([week({materials:[]})],3);assert.equal(waiting.kind,'waiting');assert.equal(waiting.percentage,0);
 const complete=continueLearning([week({isComplete:true})]);assert.equal(complete.kind,'complete');assert.equal(complete.completedWeeks,1);
});
test('a new learner starts at the first unlocked material and does not count manual assignments',()=>{
 const n=continueLearning([week({assignments:[{id:30,title:'DM',assignmentType:'manual'}]})],8);
 assert.equal(n.label,'Start next material');assert.equal(n.completed,0);assert.equal(n.total,1);assert.equal(n.totalWeeks,9);assert.equal(n.percentage,0);
});
