# Android push notifications

Android **1.4 / versionCode 5** includes Capacitor Push Notifications 8.1.3 and the Firebase Android client for **livingworth-academy**, package **com.livingworthacademy.app**. The Android client JSON contains public app identifiers and is tracked at `frontend/android/app/google-services.json` so CI, production web builds and OTA native fingerprints agree. Never substitute a private service-account file there.

The native app initializes Firebase messaging only after a learner chooses to enable phone notifications. Android 13+ asks for notification permission. Biometrics and the existing app features remain available. This native plugin requires the new APK; a web update alone cannot add it to older apps.

## Connect private server delivery

The Android file does not authorize the academy server to send messages. In the **livingworth-academy** Firebase project:

1. Ensure Firebase Cloud Messaging HTTP v1 is enabled. The sending service account needs the Firebase Cloud Messaging API Admin role.
2. Open Project settings → Service accounts → Generate new private key. Keep this JSON private; never attach it in chat or add it to source.
3. Open the GitHub repository → Settings → Secrets and variables → Actions → New repository secret.
4. Name it **FIREBASE_SERVICE_ACCOUNT_JSON** and paste the complete private JSON as the secret value.
5. Open Actions → **Configure Firebase delivery** → Run workflow → main. Run after the latest deployment succeeds.

The workflow masks the transport value, validates the project and RSA private key, writes atomically to the persistent private backend volume with mode 600 and directory mode 700, and restarts the backend. It uses the existing EC2 deployment secrets. It never puts the credential in the APK, database, workflow artifact or public uploads. Existing signed mobile update keys remain in the same private volume.

Alternatively, on the server, pipe the private JSON into the backend:

```
cd /home/ubuntu/livingworth-devops-website
sudo docker compose exec -T backend node scripts/install-firebase-credential.mjs < /secure/path/firebase-service-account.json
sudo docker compose restart backend
```

The backend checks that the server credential belongs to the same Firebase project as the Android app. Deployment reports configuration readiness without logging key contents. Configuration readiness does not prove the key has permission to deliver messages.

## Enable and test delivery

In Admin Settings → Email & reminders, confirm Android push is allowed. Enable scheduled reminders if class/quiz/deadline reminders should run. Deployment preserves these settings and does not switch scheduled reminders on automatically.

Install the new APK. A learner opens Notifications and chooses **Enable phone notifications**, then accepts Android permission. Confirm their device appears in the admin delivery status. Use a test learner to check foreground receipt, tapping a background notification, and receipt with the app closed. Do not send a class-wide test without instruction.

The user can opt out; logout removes the device registration and unregisters the native token. Tokens are encrypted at rest. Delivery checks current account status and device ownership; expelled learners do not receive queued messages. Jobs retry up to five times and expire after 30 days. Notification bodies are generic; private feedback stays in the signed-in portal.

## Validation

Backend tests cover encrypted token storage, owner-scoped registration/revocation, retry and expired-token handling, and server credential validation/installation. Android CI builds the APK, runs unit tests and lint. Real delivery still requires the private server credential, device permission, a registered phone and physical device testing.

Official references:
- https://capacitorjs.com/docs/apis/push-notifications
- https://firebase.google.com/docs/android/setup
- https://firebase.google.com/docs/cloud-messaging/send/v1-api
