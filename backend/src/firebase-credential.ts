import crypto from 'node:crypto';

export type FirebaseCredential = { type: 'service_account'; project_id: string; client_email: string; private_key: string; [key: string]: unknown };

/** Validate without including any supplied credential fields in error messages. */
export function validateFirebaseCredential(value: unknown, expectedProject = process.env.FIREBASE_PROJECT_ID): FirebaseCredential {
  const data = value as Partial<FirebaseCredential> | null;
  if (!data || data.type !== 'service_account' || typeof data.project_id !== 'string' || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(data.project_id)
    || typeof data.client_email !== 'string' || !data.client_email.endsWith(`@${data.project_id}.iam.gserviceaccount.com`)
    || typeof data.private_key !== 'string') throw new Error('A valid Firebase service-account credential is required.');
  if (expectedProject && data.project_id !== expectedProject) throw new Error('The Firebase server credential must match the Android app project.');
  try {
    const key = crypto.createPrivateKey(data.private_key);
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength || 0) < 2048) throw new Error();
  } catch { throw new Error('The Firebase private key is invalid.'); }
  return data as FirebaseCredential;
}
