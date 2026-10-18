export type CalendarEvent={id:number;title:string;type:'class'|'quiz'|'assignment';startsAt:string;endsAt?:string;status:string;actionTarget:string;weekNumber?:number;moduleTitle?:string};
export function calendarDateKey(date:Date,zone:string){const p=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(part=>[part.type,part.value]));return `${p.year}-${p.month}-${p.day}`}
const escapeText=(text:string)=>text.replace(/\\/g,'\\\\').replace(/\r/g,'').replace(/\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const stamp=(value:string|Date)=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
function fold(line:string){let output='',part='',bytes=0;for(const character of line){const length=new TextEncoder().encode(character).length;if(bytes+length>75){output+=part+'\r\n';part=' ';bytes=1}part+=character;bytes+=length}return output+part}
export function calendarICS(events:CalendarEvent[],now=new Date()){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Livingworth Academy//Learning Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
 for(const event of events){lines.push('BEGIN:VEVENT',`UID:${event.type}-${event.id}@livingworthacademy.com`,`DTSTAMP:${stamp(now)}`,`DTSTART:${stamp(event.startsAt)}`);if(event.endsAt)lines.push(`DTEND:${stamp(event.endsAt)}`);lines.push(`SUMMARY:${escapeText(event.title)}`,`DESCRIPTION:${escapeText(`${event.type==='assignment'?'Assignment deadline':event.type==='class'?'Live class':'Quiz'} · ${event.status}. Check the academy portal for the latest details.`)}`,'END:VEVENT')}
 lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
