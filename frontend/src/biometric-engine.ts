export type SavedBiometric = {id:string;userId:number;email:string;portal:'student'|'staff';expiresAt:string};
type Session = {token:string;user:{id:number;email:string;role:string;[key:string]:unknown}};
export async function recoverBiometricSession(readSecret:()=>Promise<{value:string}>,exchange:(token:string,portal:string)=>Promise<Session>,saved:SavedBiometric) {
  // The secret is released only by the native, crypto-bound biometric operation.
  const secret=await readSecret();
  if(!/^[A-Za-z0-9_-]{43}$/.test(secret.value))throw new Error('Invalid saved sign-in.');
  const session=await exchange(secret.value,saved.portal);
  if(String(session.user.id)!==String(saved.userId)||(saved.portal==='student'?session.user.role!=='student':!['mentor','admin'].includes(session.user.role)))throw new Error('Saved sign-in does not match this account.');
  return session;
}
