// @ts-nocheck
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getAcademySettings } from './academy-settings.js';
import { logger } from './logger.js';
const credentialPath=()=>process.env.GOOGLE_APPLICATION_CREDENTIALS||'/app/mobile-private/firebase-service-account.json';
let credentialCache=null,accessCache=null;
export function pushConfigured(){if(!fs.existsSync(credentialPath()))return false;try{credentials();return true}catch{return false}}
function credentials(){if(credentialCache)return credentialCache;const data=JSON.parse(fs.readFileSync(credentialPath(),'utf8'));if(!/^[a-z0-9-]+$/.test(data.project_id||'')||!data.client_email||!data.private_key)throw new Error('Push credentials are incomplete.');crypto.createPrivateKey(data.private_key);return credentialCache=data}
const key=()=>crypto.createHash('sha256').update(`${process.env.JWT_SECRET}:livingworth-push`).digest();
export function protectPushToken(token){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv),body=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);return [iv.toString('base64'),cipher.getAuthTag().toString('base64'),body.toString('base64')].join('.')}
export function revealPushToken(value){const [iv,tag,body]=value.split('.').map(part=>Buffer.from(part,'base64')),cipher=crypto.createDecipheriv('aes-256-gcm',key(),iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(body),cipher.final()]).toString('utf8')}
const targets=new Set(['Calendar','Live class','Live quiz','Assignments','Learning','Overview','Notifications','Class Activity']);
export function pushMessage(notification){return {notification:{title:String(notification.title||'Livingworth Academy').slice(0,150),body:'Open your academy portal to view this update.'},data:{actionTarget:targets.has(notification.actionTarget)?notification.actionTarget:'Notifications'},android:{priority:'high',notification:{channel_id:'academy-learning',icon:'ic_stat_academy',sound:'default'}}}}
async function accessToken(){
 if(accessCache&&accessCache.until>Date.now()+60000)return accessCache.token;
 const c=credentials(),now=Math.floor(Date.now()/1000),encode=data=>Buffer.from(JSON.stringify(data)).toString('base64url');
 const part=`${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:c.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})}`;
 const assertion=`${part}.${crypto.sign('RSA-SHA256',Buffer.from(part),c.private_key).toString('base64url')}`;
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(10000)});
 const data=await response.json();if(!response.ok||!data.access_token)throw new Error('Push authorization failed.');accessCache={token:data.access_token,until:Date.now()+Math.min(Number(data.expires_in)||3600,3600)*1000};return accessCache.token;
}
export async function sendFCM(token,notification){
 const bearer=await accessToken(),c=credentials();
 const response=await fetch(`https://fcm.googleapis.com/v1/projects/${c.project_id}/messages:send`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${bearer}`},body:JSON.stringify({message:{token,...pushMessage(notification)}}),signal:AbortSignal.timeout(10000)});
 if(response.ok)return 'sent';const data=await response.json().catch(()=>({}));
 if(data.error?.details?.some(detail=>detail.errorCode==='UNREGISTERED'))return 'unregistered';
 if(response.status===401)accessCache=null;throw new Error('Push delivery failed.');
}
export async function queuePush(pool,notification,userId=null){
 if(!pushConfigured()||!getAcademySettings().pushEnabled)return;
 await pool.execute(`INSERT INTO push_jobs (user_id,title,action_target) SELECT u.id,?,? FROM users u WHERE u.role='student' AND u.status='approved' ${userId?'AND u.id=?':''} AND EXISTS(SELECT 1 FROM push_devices d WHERE d.user_id=u.id AND d.enabled=TRUE AND d.updated_at>NOW()-INTERVAL '90 days')`,[String(notification.title||'Livingworth Academy').slice(0,150),targets.has(notification.actionTarget)?notification.actionTarget:'Notifications',...(userId?[userId]:[])]);
}
export async function deliverPushJobs(pool,sender=sendFCM){
 const [jobs]=await pool.execute(`WITH claimed AS (SELECT id FROM push_jobs WHERE delivered_at IS NULL AND attempts<5 AND available_at<=NOW() AND (locked_until IS NULL OR locked_until<NOW()) ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED) UPDATE push_jobs j SET locked_until=NOW()+INTERVAL '5 minutes',attempts=j.attempts+1 FROM claimed WHERE j.id=claimed.id RETURNING j.id,j.user_id AS userId,j.title,j.action_target AS actionTarget,j.attempts`);
 // WITH queries return rows directly through the PostgreSQL adapter.
 for(const job of (Array.isArray(jobs)?jobs:jobs.rows||[])){
  try{
   const [devices]=await pool.execute(`SELECT d.id,d.encrypted_token AS encryptedToken FROM push_devices d JOIN users u ON u.id=d.user_id WHERE d.user_id=? AND d.enabled=TRUE AND u.status='approved' AND u.role='student' AND d.updated_at>NOW()-INTERVAL '90 days'`,[job.userId]);
   for(const device of devices){const outcome=await sender(revealPushToken(device.encryptedToken),job);if(outcome==='unregistered')await pool.execute('DELETE FROM push_devices WHERE id=? AND user_id=?',[device.id,job.userId])}
   await pool.execute('UPDATE push_jobs SET delivered_at=NOW(),locked_until=NULL WHERE id=?',[job.id]);
  }catch{await pool.execute(`UPDATE push_jobs SET locked_until=NULL,available_at=NOW()+(? * INTERVAL '1 minute') WHERE id=?`,[Math.min(60,2**job.attempts),job.id]);logger.warn('push_delivery_retry',{jobId:job.id,attempt:job.attempts})}
 }
 await pool.execute("DELETE FROM push_jobs WHERE created_at<NOW()-INTERVAL '30 days'");
}
export function startPushWorker(pool){let running=false;const run=async()=>{if(running||!pushConfigured()||!getAcademySettings().pushEnabled)return;running=true;try{await deliverPushJobs(pool)}catch{logger.warn('push_worker_failed')}finally{running=false}};void run();setInterval(run,60000).unref()}
export function registerPushRoutes(app,pool,requireAuth,requireAdmin){
 app.get('/api/push/status',requireAuth,async(req,res,next)=>{try{const [rows]=await pool.execute('SELECT COUNT(*) AS count FROM push_devices WHERE user_id=? AND enabled=TRUE',[req.user.id]);res.set('Cache-Control','no-store').json({configured:pushConfigured(),enabled:getAcademySettings().pushEnabled,devices:Number(rows[0]?.count||0)})}catch(error){next(error)}});
 app.post('/api/push/devices',requireAuth,async(req,res,next)=>{
  if(req.user.role!=='student')return res.status(403).json({message:'Learner access required.'});
  const {token,installationId}=req.body;if(typeof token!=='string'||token.length<20||token.length>4096||/\s/.test(token)||typeof installationId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(installationId))return res.status(400).json({message:'Invalid device registration.'});
  if(!pushConfigured()||!getAcademySettings().pushEnabled)return res.status(503).json({message:'Phone notifications are not active yet.'});
  let connection;try{connection=await pool.getConnection();await connection.beginTransaction();await connection.execute('SELECT pg_advisory_xact_lock(4792102)');await connection.execute('DELETE FROM push_devices WHERE installation_id=?',[installationId]);await connection.execute(`INSERT INTO push_devices (user_id,installation_id,token_hash,encrypted_token,enabled,updated_at) VALUES (?,?,?,?,TRUE,NOW()) ON CONFLICT(token_hash) DO UPDATE SET user_id=EXCLUDED.user_id,installation_id=EXCLUDED.installation_id,encrypted_token=EXCLUDED.encrypted_token,enabled=TRUE,updated_at=NOW()`,[req.user.id,installationId,crypto.createHash('sha256').update(token).digest('hex'),protectPushToken(token)]);await connection.commit();res.json({message:'Phone notifications enabled.'})}catch(error){if(connection)await connection.rollback();next(error)}finally{connection?.release()}
 });
 app.delete('/api/push/devices/:installationId',requireAuth,async(req,res,next)=>{try{await pool.execute('DELETE FROM push_devices WHERE user_id=? AND installation_id=?',[req.user.id,req.params.installationId]);res.json({message:'Phone notifications disabled on this device.'})}catch(error){next(error)}});
 app.get('/api/admin/push-status',requireAuth,requireAdmin,async(_req,res,next)=>{try{const [[devices],[jobs]]=await Promise.all([pool.execute('SELECT COUNT(*) AS count FROM push_devices WHERE enabled=TRUE'),pool.execute(`SELECT COUNT(*) FILTER(WHERE delivered_at IS NULL AND attempts<5) AS pending,COUNT(*) FILTER(WHERE delivered_at IS NULL AND attempts>=5) AS failed,MAX(delivered_at) AS lastDeliveryAt FROM push_jobs`)]);res.json({configured:pushConfigured(),enabled:getAcademySettings().pushEnabled,registeredDevices:Number(devices[0]?.count||0),...jobs[0]})}catch(error){next(error)}});
}
