type Schedule = {classTime:string;classTimezone:string;classDays:number[];classDurationMinutes:number};
export function classSessionStatus(now:Date,schedule:Schedule):{isLive:boolean;date:Date|null} {
 const parts=(date:Date)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:schedule.classTimezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
 const today=parts(now),base=Date.UTC(Number(today.year),Number(today.month)-1,Number(today.day));
 const [hour,minute]=schedule.classTime.split(':').map(Number);
 for(let offset=-1;offset<9;offset++){
  const wall=new Date(base+offset*86400000);
  if(!schedule.classDays.includes(wall.getUTCDay()))continue;
  const target=wall.getTime()+hour*3600000+minute*60000;let instant=target;
  for(let n=0;n<3;n++){const observed=parts(new Date(instant));instant+=target-Date.UTC(Number(observed.year),Number(observed.month)-1,Number(observed.day),Number(observed.hour),Number(observed.minute),Number(observed.second))}
  const start=new Date(instant);
  if(now.getTime()>=instant&&now.getTime()<instant+schedule.classDurationMinutes*60000)return {isLive:true,date:start};
  if(start>now)return {isLive:false,date:start};
 }
 return {isLive:false,date:null};
}
