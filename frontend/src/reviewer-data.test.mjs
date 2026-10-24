import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewerRoute,reviewQuestions,reviewAnswerCorrect,sampleQuizResult,reviewLearners} from './reviewer-data.ts';

test('reviewer bookmarks resolve only valid sample perspectives and sections',()=>{
 assert.deepEqual(reviewerRoute('/review/student/quiz'),{role:'student',section:'quiz'});
 assert.deepEqual(reviewerRoute('/review/admin/settings/'),{role:'admin',section:'settings'});
 for(const path of ['/review','/review/student/students','/review/student/settings','/portal/admin/students','/review/admin/unknown','/review/admin/settings/extra','/reviewer/admin/settings','/review/%61dmin/settings'])assert.equal(reviewerRoute(path),null,path);
});
test('sample assessments accept exact answer sets and case-insensitive command alternatives',()=>{
 assert.equal(reviewAnswerCorrect(reviewQuestions[0],[1]),true);assert.equal(reviewAnswerCorrect(reviewQuestions[0],[0,1]),false);
 assert.equal(reviewAnswerCorrect(reviewQuestions[1],[0]),true);
 for(const text of ['docker ps','DOCKER PS','  Docker   Container LS  ','docker container list'])assert.equal(reviewAnswerCorrect(reviewQuestions[2],text),true,text);
 for(const text of ['docker ps -a','docker images','docker ps && echo extra',''])assert.equal(reviewAnswerCorrect(reviewQuestions[2],text),false,text);
 assert.equal(reviewAnswerCorrect(reviewQuestions[3],[2,0,1]),true);assert.equal(reviewAnswerCorrect(reviewQuestions[3],[0,1,2,3]),false);assert.equal(reviewAnswerCorrect(reviewQuestions[3],[0,1]),false);
});
test('demo results are explicitly fictional, include unanswered questions and preserve tied ranks',()=>{
 const perfect=sampleQuizResult([[1],[0],'DOCKER PS',[0,1,2]]);assert.equal(perfect.demo,true);assert.equal(perfect.self.percentage,100);assert.equal(perfect.self.position,1);assert.equal(perfect.self.unansweredCount,0);
 const empty=sampleQuizResult([]);assert.equal(empty.self.percentage,0);assert.equal(empty.self.position,3);assert.equal(empty.self.unansweredCount,4);
 const tie=sampleQuizResult([[1],[0]]);assert.equal(tie.self.percentage,50);assert.equal(tie.self.position,2);assert.equal(tie.leaderboard.find(row=>row.studentId===9002).position,2);
 assert.ok(perfect.leaderboard.filter(row=>!row.isCurrentStudent).every(row=>row.fullName.startsWith('Demo learner')));
});
test('sample learner grades are internally consistent and contact addresses cannot identify real accounts',()=>{
 for(const learner of reviewLearners){assert.match(learner.email,/@example\.test$/);assert.equal(learner.score,Math.round((learner.quiz+learner.activity+learner.assignment+learner.attendance)/4));assert.equal(learner.status==='Probation',learner.score<50)}
});
