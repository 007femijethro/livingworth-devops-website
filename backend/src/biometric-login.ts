// @ts-nocheck
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
const duration = 30 * 24 * 60 * 60 * 1000;
export const biometricTokenHash = value => crypto.createHash('sha256').update(value).digest('hex');
export const biometricPasswordVersion = value => crypto.createHmac('sha256',process.env.JWT_SECRET).update(value).digest('hex');
function publicUser(user) { return {id:user.id,fullName:user.full_name,email:user.email,role:user.role,status:user.status,isClassRep:Boolean(user.is_class_rep),profilePicture:user.profile_picture||null,mustChangePassword:Boolean(user.must_change_password)}; }
export function biometricAccountValid(row) {
 return row && row.status==='approved' && !row.must_change_password && !row.is_locked
   && row.role===row.enrolledRole && Number(row.session_version)===Number(row.enrolledSessionVersion)
   && new Date(row.expiresAt).getTime()>Date.now()
   && row.passwordVersion===biometricPasswordVersion(row.password_hash);
}
export function registerBiometricLoginRoutes(app,pool,requireAuth,createToken) {
 app.post('/api/auth/biometric-devices',requireAuth,async(req,res,next)=>{
  let connection;
  try {
   if(typeof req.body.password!=='string'||!req.body.password||req.body.password.length>1024)return res.status(400).json({message:'Confirm your current password to enable biometric sign-in.'});
   connection=await pool.getConnection();
   await connection.beginTransaction();
   const [rows]=await connection.execute('SELECT *, locked_until > NOW() AS is_locked FROM users WHERE id = ? FOR UPDATE',[req.user.id]);const user=rows[0];
   if(!user||user.status!=='approved'||user.must_change_password){await connection.rollback();return res.status(403).json({message:'Use your password to sign in to an approved account first.'})}
   if(user.is_locked){await connection.rollback();return res.status(429).json({message:'Too many incorrect attempts. Try again in 15 minutes.'})}
   if(!await bcrypt.compare(req.body.password,user.password_hash)){
    await connection.execute(`UPDATE users SET failed_login_attempts=failed_login_attempts+1, locked_until=CASE WHEN failed_login_attempts+1>=5 THEN DATE_ADD(NOW(), INTERVAL 15 MINUTE) ELSE locked_until END WHERE id=?`,[user.id]);await connection.commit();return res.status(401).json({message:'Your current password is incorrect.'});
   }
   await connection.execute('DELETE FROM biometric_devices WHERE user_id=? AND expires_at<=NOW()',[user.id]);
   const [counts]=await connection.execute('SELECT COUNT(*) AS count FROM biometric_devices WHERE user_id=?',[user.id]);
   if(Number(counts[0].count)>=10){await connection.rollback();return res.status(409).json({message:'The saved sign-in device limit has been reached. Remove saved devices before adding another.'})}
   const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+duration).toISOString();
   await connection.execute(`INSERT INTO biometric_devices (id,user_id,token_hash,password_version,enrolled_role,session_version,expires_at) VALUES (?,?,?,?,?,?,?)`,[id,user.id,biometricTokenHash(token),biometricPasswordVersion(user.password_hash),user.role,Number(user.session_version||0),expiresAt]);
   await connection.execute('UPDATE users SET failed_login_attempts=0, locked_until=NULL WHERE id=?',[user.id]);await connection.commit();res.set('Cache-Control','no-store');res.status(201).json({id,token,expiresAt,user:publicUser(user)});
  }catch(error){if(connection)await connection.rollback().catch(()=>{});next(error)}finally{connection?.release()}
 });
 app.post('/api/auth/biometric-login',async(req,res,next)=>{
  try {
   const token=req.body.token,portal=req.body.portal;
   if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||!['student','staff'].includes(portal))return res.status(401).json({message:'Saved sign-in is unavailable. Sign in with your password.'});
   const [rows]=await pool.execute(`SELECT u.*, u.locked_until>NOW() AS is_locked, d.id AS deviceId, d.password_version AS passwordVersion, d.enrolled_role AS enrolledRole, d.session_version AS enrolledSessionVersion, d.expires_at AS expiresAt FROM biometric_devices d JOIN users u ON u.id=d.user_id WHERE d.token_hash=?`,[biometricTokenHash(token)]);const user=rows[0];
   const correctPortal=user&&(portal==='student'?user.role==='student':['admin','mentor'].includes(user.role));
   if(!biometricAccountValid(user)||!correctPortal)return res.status(401).json({message:'Saved sign-in has expired or changed. Sign in with your password and enable it again.'});
   await pool.execute('UPDATE biometric_devices SET last_used_at=NOW() WHERE id=?',[user.deviceId]);res.set('Cache-Control','no-store');res.json({token:createToken(user),user:publicUser(user)});
  }catch(error){next(error)}
 });
 app.delete('/api/auth/biometric-devices/:id',requireAuth,async(req,res,next)=>{
  try{if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(req.params.id))return res.sendStatus(400);await pool.execute('DELETE FROM biometric_devices WHERE id=? AND user_id=?',[req.params.id,req.user.id]);res.json({message:'Saved sign-in removed.'})}catch(error){next(error)}
 });
 app.delete('/api/auth/biometric-devices',requireAuth,async(req,res,next)=>{
  try{await pool.execute('DELETE FROM biometric_devices WHERE user_id=?',[req.user.id]);res.json({message:'Saved sign-ins removed from all devices.'})}catch(error){next(error)}
 });
}
