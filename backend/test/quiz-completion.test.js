import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {rankQuizParticipants,privateQuizCompletion,saveQuizCompletion,registerQuizCompletionRoutes} from '../dist/quiz-completion.js';
import {configureQuizSockets} from '../dist/quiz.js';

test('session ranking includes zero answers, stable ties and the learner outside the top twenty',()=>{
 const participants=rankQuizParticipants(Array.from({length:25},(_,i)=>({studentId:i+1,attemptId:100+i,fullName:`Learner Number ${i+1}`,score:i<2?10000:10000-i*400,correctCount:i<2?10:0,totalQuestions:10})));
 assert.deepEqual(participants.slice(0,3).map(row=>row.position),[1,1,3]);
 const summary={quizId:9,title:'Test',participantCount:25,participants};
 const result=privateQuizCompletion(summary,25,'full');assert.equal(result.self.position,25);assert.equal(result.leaderboard.length,21);assert.equal(result.leaderboard.at(-1).fullName,'You');assert.equal(result.leaderboard.at(-1).position,25);
 const zero=rankQuizParticipants([{studentId:2,score:0,correctCount:0,totalQuestions:40},{studentId:1,score:0,correctCount:0,totalQuestions:40}]);assert.deepEqual(zero.map(row=>[row.studentId,row.position,row.percentage]),[[1,1,0],[2,1,0]]);
});
test('private and initials rankings never disclose other learners names, and later privacy changes only restrict saved summaries',()=>{
 const summary={quizId:9,title:'Test',participantCount:2,participants:rankQuizParticipants([{studentId:1,fullName:'Ada Learner',score:100,correctCount:1,totalQuestions:1},{studentId:2,fullName:'Ben Example',score:0,correctCount:0,totalQuestions:1}])};
 const own=privateQuizCompletion(summary,2,'private');assert.equal(own.self.position,2);assert.equal(own.leaderboard.length,1);assert.equal(own.leaderboard[0].fullName,'You');assert.ok(!JSON.stringify(own).includes('Ada'));
 const masked=privateQuizCompletion(summary,2,'initials');assert.equal(masked.leaderboard[0].fullName,'AL');assert.ok(!JSON.stringify(masked).includes('Ada'));
 assert.equal(privateQuizCompletion(masked,2,'initials').leaderboard[0].fullName,'AL');
 assert.equal(privateQuizCompletion(own,2,'full').leaderboard.length,1);
 const restricted=privateQuizCompletion(privateQuizCompletion(summary,2,'full'),2,'private');assert.equal(restricted.leaderboard.length,1);
});
test('completion snapshots cover disconnected and unanswered attempts in this run, without changing answers or historical attempts',async()=>{
 const writes=[];const pool={query:async()=>[[{id:1,fullName:'Learner One'},{id:2,fullName:'Learner Two'}]],execute:async(sql,args)=>{assert.match(sql,/^UPDATE quiz_attempts SET completion_json=/);assert.match(sql,/WHERE id=\? AND student_id=\? AND status='completed'/);writes.push(args);return [{}]}};
 const state={title:'Specific quiz',questions:[{id:1},{id:2}],rankingVisibility:'full',attempts:new Map([[1,101],[2,205]]),answers:new Map([['1:1',{studentId:1,correct:true,points:1000}]])};
 const {summary,results}=await saveQuizCompletion(pool,state,77,true);assert.equal(summary.participantCount,2);assert.equal(results.get(2).self.percentage,0);assert.equal(results.get(2).self.position,2);assert.equal(results.get(2).self.unansweredCount,2);assert.equal(results.get(1).self.unansweredCount,1);assert.equal(results.get(1).stopped,true);
 assert.deepEqual(writes.map(args=>args.slice(1)),[[101,1],[205,2]]);assert.equal(JSON.parse(writes[0][0]).title,'Specific quiz');
 // Results must use the exact totals written during finalization, even if a late in-flight answer changes memory.
 state.finalizedResults=new Map([[1,{score:1000,correctCount:1,totalQuestions:2,answeredCount:1,unansweredCount:1}]]);
 state.answers.set('2:1',{studentId:1,correct:true,points:1000});
 const final=await saveQuizCompletion(pool,state,77);assert.equal(final.results.get(1).self.correctCount,1);assert.equal(final.results.get(1).self.score,1000);
});

async function apiFixture(run,{legacy=false}={}){
 const calls=[],summary=privateQuizCompletion({quizId:9,title:'Example',participantCount:1,participants:rankQuizParticipants([{studentId:7,attemptId:91,fullName:'Learner',score:2000,correctCount:2,totalQuestions:4}])},7,'full');
 const pool={execute:async(sql,args)=>{calls.push([sql,args]);if(sql.includes('FROM quiz_attempts qa JOIN quizzes'))return [args[0]===7&&(args.length<3||args[2]===91)?[{quizId:9,title:'Example',attemptId:91,studentId:7,rankingVisibility:'private',completionJson:legacy?null:summary,score:2000,correctCount:2,totalQuestions:4}]:[]];if(sql.includes('ROW_NUMBER()'))return [[{studentId:7,fullName:'Learner',score:2000,correctCount:2,totalQuestions:4}]];throw Error(sql)}};
 const app=express();registerQuizCompletionRoutes(app,pool,(req,res,next)=>{if(!req.get('x-user'))return res.sendStatus(401);req.user={id:Number(req.get('x-user')),role:req.get('x-role')||'student'};next()});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const request=(path,user='7',role='student')=>fetch(`http://127.0.0.1:${server.address().port}/api/student/quiz-completion${path}`,{headers:{...(user?{'x-user':user}:{}),'x-role':role}});
 try{await run(request,calls)}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
test('saved results are owner-only, non-cacheable and reject invalid or other learners attempt IDs',async()=>apiFixture(async(request,calls)=>{
 assert.equal((await request('/9',null)).status,401);assert.equal((await request('/9','7','mentor')).status,403);assert.equal((await request('/9?attemptId=92')).status,404);assert.equal((await request('/9?attemptId=91','8')).status,404);
 for(const path of ['/bad','/0','/9?attemptId=-1'])assert.equal((await request(path)).status,400);
 const response=await request('/9?attemptId=91');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');const result=await response.json();assert.equal(result.self.attemptId,91);assert.equal(result.self.percentage,50);assert.equal(result.rankingVisibility,'private');
 assert.ok(calls.every(([sql])=>sql.startsWith('SELECT')));assert.ok(calls.some(([sql,args])=>sql.includes('qa.student_id=?')&&args[0]===7&&args[1]===9&&args[2]===91));
}));
test('older quiz attempts remain available with an explicitly labelled best-attempt ranking',async()=>apiFixture(async request=>{
 const result=await (await request('/9?attemptId=91')).json();assert.equal(result.rankingScope,'quiz_best_attempts');assert.equal(result.self.percentage,50);assert.equal(result.self.position,1);
},{legacy:true}));

for(const stopped of [false,true])test(`${stopped?'Instructor stop':'Natural completion'} saves personal summaries and removes all sockets from the room`,async()=>{
 const quizId=stopped?8991:8992,sockets=[],attempts=new Map(),snapshots=new Map();let handler,status='lobby',attemptNo=100;
 const question={id:9,prompt:'Example?',options:['A','B'],correctIndex:0,questionType:'single_choice'};
 const quiz={id:quizId,title:'Completion test',status,allowRetakes:true,lifelineLimit:0,questionTimeSeconds:300,navigationMode:'manual',rankingVisibility:'full'};
 const execute=async(sql,args=[])=>{
   if(sql.startsWith('SELECT id,title,join_code'))return [[{...quiz,status}]];
   if(sql.startsWith('SELECT lifeline_limits'))return [[quiz]];
   if(sql.startsWith('SELECT id,prompt'))return [[question]];
   if(sql.startsWith('SELECT id FROM quiz_attempts WHERE quiz_id'))return [attempts.has(args[1])?[{id:attempts.get(args[1])}]:[]];
   if(sql.startsWith('SELECT COALESCE(MAX(attempt_no)'))return [[{attemptNo:1}]];
   if(sql.startsWith('INSERT INTO quiz_attempts')){const id=++attemptNo;attempts.set(args[1],id);return [{insertId:id}]}
   if(sql.startsWith('SELECT question_id AS questionId'))return [[]];
   if(sql.startsWith('SELECT id FROM quiz_attempts WHERE id='))return [[{id:args[0]}]];
   if(sql.startsWith('INSERT INTO quiz_attempt_answers'))return [{}];
   if(sql.startsWith('UPDATE quiz_attempts SET completion_json')){snapshots.set(args[1],JSON.parse(args[0]));return [{}]}
   if(sql.startsWith('UPDATE quiz_attempts'))return [{}];
   if(sql.startsWith('UPDATE quizzes')){status=sql.includes("status='live'")?'live':'completed';return [{affectedRows:1}]}
   if(sql.startsWith('SELECT id, full_name'))return [[1,2,3].map(id=>({id,fullName:`Learner ${id}`}))];
   if(sql.startsWith('SELECT id, title, status'))return [[{id:quizId,status}]];
   throw Error(sql);
 };
 const pool={execute,query:async(sql,args)=>sql.startsWith('UPDATE quizzes')?[{}]:sql.startsWith('SELECT id FROM quizzes')?[[]]:execute(sql,args),getConnection:async()=>({execute,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}})};
 const io={use(){},on(_event,fn){handler=fn},in:room=>({fetchSockets:async()=>sockets.filter(socket=>socket.room===room),socketsLeave(){for(const socket of sockets)if(socket.room===room)socket.room=null}}),to:room=>({emit:(name,data)=>{for(const socket of sockets)if(socket.room===room)socket.emit(name,data)}})};
 const worker=configureQuizSockets(io,pool,()=>{});
 const connect=(id,role='student')=>{const handlers={};const socket={id:String(id),user:{id,role,status:'approved'},data:{},room:null,events:[],on:(name,fn)=>handlers[name]=fn,emit:(name,data)=>socket.events.push({name,data}),join:room=>socket.room=room,leave:()=>socket.room=null,send:(name,data)=>new Promise(resolve=>handlers[name](data,resolve))};sockets.push(socket);handler(socket);return socket};
 const staff=connect(99,'admin'),a=connect(1),b=connect(2),offline=connect(3);
 try{
   for(const socket of sockets)assert.equal((await socket.send('quiz:join',{joinCode:'TEST'})).ok,true);
   assert.equal((await staff.send('quiz:start',{quizId})).ok,true);offline.room=null;
   assert.equal((await a.send('quiz:answer',{quizId,questionId:9,answerIndex:0})).ok,true);
   if(stopped)assert.equal((await staff.send('quiz:close',{quizId})).ok,true);
   else{await staff.send('quiz:reveal-now',{quizId});assert.equal((await staff.send('quiz:next',{quizId})).ok,true)}
   assert.equal(status,'completed');assert.equal(snapshots.size,3);
   for(const socket of [staff,a,b]){assert.equal(socket.room,null);assert.equal(socket.data.quizId,null);assert.equal(socket.events.filter(event=>event.name==='quiz:completed').length,1)}
   const result=a.events.find(event=>event.name==='quiz:completed').data;assert.equal(result.self.percentage,100);assert.equal(result.self.position,1);assert.equal(result.participantCount,3);assert.equal(result.stopped,stopped);
   const zero=b.events.find(event=>event.name==='quiz:completed').data;assert.equal(zero.self.percentage,0);assert.equal(zero.self.position,2);assert.equal(snapshots.get(attempts.get(3)).self.position,2);
   assert.equal((await b.send('quiz:answer',{quizId,questionId:9,answerIndex:0})).ok,false);
 }finally{worker.stop();if(status==='live')await staff.send('quiz:close',{quizId})}
});
