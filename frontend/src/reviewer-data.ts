export type ReviewRole='student'|'admin';
export type ReviewSection='overview'|'programme'|'activities'|'quiz'|'assignments'|'results'|'students'|'settings'|'platform';
export const reviewerSections:{id:ReviewSection;label:string;adminOnly?:boolean}[]=[
 {id:'overview',label:'Overview'},{id:'programme',label:'Programme'},{id:'activities',label:'Class activities'},
 {id:'quiz',label:'Live quiz experience'},{id:'assignments',label:'Assignments'},{id:'results',label:'Results & progress'},
 {id:'students',label:'Learner records',adminOnly:true},{id:'settings',label:'Academy settings',adminOnly:true},{id:'platform',label:'Platform overview'}
];
export function reviewerRoute(path:string):{role:ReviewRole;section:ReviewSection}|null {
 const match=/^\/review\/(student|admin)\/([a-z-]+)\/?$/.exec(path);
 if(!match)return null;
 const section=reviewerSections.find(item=>item.id===match[2]&&(!item.adminOnly||match[1]==='admin'));
 return section?{role:match[1] as ReviewRole,section:section.id}:null;
}
export const reviewLearners=[
 {id:101,fullName:'Alex Morgan',email:'alex@example.test',city:'Sample City',score:88,quiz:90,activity:85,assignment:87,attendance:90,completed:12,status:'Active',lastSignIn:'Illustrative: today at 09:15'},
 {id:102,fullName:'Casey Lane',email:'casey@example.test',city:'Sample City',score:81,quiz:85,activity:80,assignment:79,attendance:80,completed:10,status:'Active',lastSignIn:'Illustrative: yesterday at 18:40'},
 {id:103,fullName:'Jordan Ellis',email:'jordan@example.test',city:'Sample City',score:74,quiz:70,activity:76,assignment:75,attendance:75,completed:9,status:'Active',lastSignIn:'Illustrative: today at 08:30'},
 {id:104,fullName:'Taylor Reed',email:'taylor@example.test',city:'Sample City',score:43,quiz:40,activity:45,assignment:42,attendance:45,completed:5,status:'Probation',lastSignIn:'Illustrative: two days ago at 14:10'}
];
export type ReviewAnswer=number[]|string;
export type ReviewQuestion={prompt:string;type:'single'|'multiple'|'typed'|'boolean';options:string[];correct:number[];accepted?:string[];explanation:string};
export const reviewQuestions:ReviewQuestion[]=[
 {prompt:'Which tool builds and runs application containers?',type:'single',options:['Terraform','Docker','Ansible','Prometheus'],correct:[1],explanation:'Docker builds container images and runs containers from those images.'},
 {prompt:'A Git branch lets you develop changes without immediately changing the main branch.',type:'boolean',options:['True','False'],correct:[0],explanation:'A branch provides a separate line of development. Changes reach main through an explicit merge or another integration step.'},
 {prompt:'Which Docker command lists running containers?',type:'typed',options:[],correct:[],accepted:['docker ps','docker container ls','docker container list'],explanation:'docker ps and docker container ls list running containers. Add -a to include stopped containers.'},
 {prompt:'Select the three commands in a typical Terraform deployment workflow.',type:'multiple',options:['terraform init','terraform plan','terraform apply','terraform push'],correct:[0,1,2],explanation:'Initialize providers, inspect the proposed plan, then apply the infrastructure changes.'}
];
export function reviewAnswerCorrect(question:ReviewQuestion,answer:ReviewAnswer|undefined) {
 if(question.type==='typed')return typeof answer==='string'&&question.accepted!.includes(answer.trim().toLowerCase().replace(/\s+/g,' '));
 if(!Array.isArray(answer))return false;
 return answer.length===question.correct.length&&question.correct.every(value=>answer.includes(value));
}
export function sampleQuizResult(answers:ReviewAnswer[]) {
 const correct=reviewQuestions.filter((question,index)=>reviewAnswerCorrect(question,answers[index])).length;
 const own={studentId:9000,fullName:'You',score:correct*1000,correctCount:correct,totalQuestions:4,percentage:correct*25,isCurrentStudent:true};
 const peers=[{studentId:9001,fullName:'Demo learner A',score:3000,correctCount:3,totalQuestions:4,percentage:75,isCurrentStudent:false},{studentId:9002,fullName:'Demo learner B',score:2000,correctCount:2,totalQuestions:4,percentage:50,isCurrentStudent:false}];
 const sorted=[own,...peers].sort((a,b)=>b.score-a.score||a.studentId-b.studentId);let position=0;
 const leaderboard=sorted.map((row,index)=>{if(!index||row.score!==sorted[index-1].score)position=index+1;return {...row,position}});
 return {demo:true,title:'Sample quiz · DevOps fundamentals',rankingScope:'demo',rankingVisibility:'full',participantCount:3,self:{...own,position:leaderboard.find(row=>row.isCurrentStudent)!.position,unansweredCount:reviewQuestions.length-answers.filter(value=>typeof value==='string'?Boolean(value.trim()):value.length>0).length},leaderboard};
}
export const reviewLesson=`## Containers: build once, run consistently

A container packages an application with its runtime dependencies. An **image** is the template; a **container** is a running instance of that image.

### A practical workflow

1. Write a Dockerfile for the application.
2. Build an image with a version tag.
3. Run a container and publish the application's port.
4. Inspect its logs and health before sharing the service.

\`\`\`bash
docker build -t sample-app:1.0 .
docker run -d --name sample-app -p 8080:8080 sample-app:1.0
docker ps
docker logs sample-app
\`\`\`

### Check your understanding

How is an image different from a running container? What would you check first if the service did not respond?

> This is an original sample lesson for the reviewer demonstration, not a learner's private course record.`;
