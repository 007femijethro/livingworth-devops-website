import { Capacitor,registerPlugin,type PluginListenerHandle } from '@capacitor/core';
type PushPlugin={checkPermissions:()=>Promise<{receive:string}>;requestPermissions:()=>Promise<{receive:string}>;register:()=>Promise<void>;unregister:()=>Promise<void>;createChannel:(options:{id:string;name:string;importance:number;description:string})=>Promise<void>;addListener:(event:string,listener:(data:any)=>void)=>Promise<PluginListenerHandle>};
const Push=registerPlugin<PushPlugin>('PushNotifications');
export const supportsPhonePush=()=>Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('PushNotifications');
export const pushOptedIn=(id:number|string)=>localStorage.getItem(`lw_push_enabled:${id}`)==='true';
function installation(){let value=localStorage.getItem('lw_push_installation');if(!value){value=crypto.randomUUID();localStorage.setItem('lw_push_installation',value)}return value}
export async function pushRequest(path:string,options:RequestInit={}){const response=await fetch(`/api${path}`,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('lw_token')}`,...options.headers}});const data=await response.json();if(!response.ok)throw new Error(data.message||'Could not update notification settings.');return data}
let dispose:(()=>Promise<void>)|null=null;
export async function startPhonePush(userId:number|string,prompt=false){
 if(!supportsPhonePush())throw new Error('This app version needs the phone-notification update.');
 const status=await pushRequest('/push/status');if(!status.configured||!status.enabled)throw new Error('Phone notifications are not active at the academy yet.');
 let permission=await Push.checkPermissions();if(prompt&&permission.receive!=='granted')permission=await Push.requestPermissions();if(permission.receive!=='granted')throw new Error('Notifications are not allowed. Enable them in your phone’s app settings.');
 if(dispose)await dispose();let alive=true;const listeners:PluginListenerHandle[]=[];
 const authorization=`Bearer ${localStorage.getItem('lw_token')}`;
 const stop=async()=>{alive=false;await Promise.all(listeners.map(listener=>listener.remove()));if(dispose===stop)dispose=null};dispose=stop;
 await Push.createChannel({id:'academy-learning',name:'Academy learning',description:'Classes, quizzes, deadlines and feedback',importance:4});
 let settle:(error?:Error)=>void=()=>{};const registered=new Promise<void>((resolve,reject)=>{settle=error=>error?reject(error):resolve()});
 listeners.push(await Push.addListener('registration',async event=>{if(!alive)return;try{await pushRequest('/push/devices',{method:'POST',headers:{Authorization:authorization},body:JSON.stringify({token:event.value,installationId:installation()})});if(!alive)return;localStorage.setItem(`lw_push_enabled:${userId}`,'true');settle();window.dispatchEvent(new Event('lw-push-settings-changed'))}catch(error){settle(error as Error)}}));
 listeners.push(await Push.addListener('registrationError',()=>settle(new Error('Your phone could not register for notifications. Please try again.'))));
 const allowed=new Set(['Calendar','Live class','Live quiz','Assignments','Learning','Overview','Notifications','Class Activity']);
 listeners.push(await Push.addListener('pushNotificationActionPerformed',event=>{if(!alive)return;const target=allowed.has(event.notification?.data?.actionTarget)?event.notification.data.actionTarget:'Notifications';sessionStorage.setItem('lw_push_pending_target',target);window.dispatchEvent(new CustomEvent('lw-push-open',{detail:target}))}));
 listeners.push(await Push.addListener('pushNotificationReceived',event=>{if(alive)window.dispatchEvent(new CustomEvent('lw-push-received',{detail:String(event.title||'New academy update')}))}));
 let timeout:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([Promise.all([Push.register(),registered]),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Registration timed out. Please try again.')),20000)})]);return stop}catch(error){await stop();throw error}finally{clearTimeout(timeout)}
}
export async function stopPhonePush(userId:number|string){
 const wasEnabled=pushOptedIn(userId);localStorage.removeItem(`lw_push_enabled:${userId}`);if(!wasEnabled&&!supportsPhonePush())return;if(dispose)await dispose();
 const requests=[pushRequest(`/push/devices/${installation()}`,{method:'DELETE'})];if(supportsPhonePush())requests.push(Push.unregister());
 await Promise.allSettled(requests);window.dispatchEvent(new Event('lw-push-settings-changed'));
}
