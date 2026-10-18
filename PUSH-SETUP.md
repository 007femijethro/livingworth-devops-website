# Android push notification activation

The learning calendar and in-app notifications work without Firebase. Actual
phone push delivery remains off until both Firebase credentials and a new native
Android release are ready. Existing version 1.1 apps cannot gain a native plugin
through a web update.

## 1. Firebase Android client

Create or select your Firebase project. Add an Android app with package
`com.livingworthacademy.app`, and download its `google-services.json` CLIENT file.
This is different from the private service-account credential below.

Run from a clean project checkout, passing the client file's actual location:

```
node frontend/scripts/prepare-push-android.mjs /path/to/google-services.json
```

The helper installs pinned Capacitor push support, prepares Android version
1.2 / versionCode 3, creates the notification icon/channel configuration and
builds with the new native fingerprint. It validates the package and rejects
service-account files. It does NOT upload any client or server credentials.

Before distribution, commit the resulting native source, dependency and config
changes. Configure the existing Android CI to restore the CLIENT JSON from a
repository secret before `android:sync`, or supply it locally when building.
Build and test the APK on a physical Android device. Do not distribute an APK
whose native inputs have not been committed: later signed web updates must
match that native fingerprint. Existing version 1.1 updates stay on channel 2;
version 1.2 uses channel 3.

## 2. Private server credential

Enable Firebase Cloud Messaging HTTP v1 in the same project. Give the server
service account the Firebase Cloud Messaging API Admin role, and generate its
private JSON credential through Google's console. Never commit this key, put it
in the Android client, or paste it in chat.

On the academy server, copy the private credential into the existing persistent
`mobile_update_signing` volume at:

```
/app/mobile-private/firebase-service-account.json
```

Keep it readable only by the backend container's `node` user (mode 600). This
private directory is not web-served. The backend's default credential path is
that file; an alternative can be supplied using `GOOGLE_APPLICATION_CREDENTIALS`.
The current Docker service uses the default path. No database password, Firebase
server key or OAuth token belongs in the admin interface.

## 3. Enable and verify

In Admin Settings → Email & reminders, confirm Android push is allowed. Enable
scheduled reminders if class/quiz/deadline reminders should run. Existing values
are preserved by deployment; deploying does not switch reminders on.

Install the new APK. A learner opens Notifications and chooses **Enable phone
notifications**, accepting Android's permission prompt. Confirm their device
appears in the admin delivery status. Verify foreground receipt, tapping a
background notification, and receipt while the app is closed. Test with a
purpose-created account/notification rather than messaging the whole class.

Each phone can opt out. Logging out removes its registration and unregisters the
native token. Device tokens are encrypted at rest. Delivery checks account status
and current device ownership; expelled learners do not receive queued messages.
Queued delivery retries up to five times, removes expired tokens, and retains
jobs for at most 30 days. The lock-screen body is generic; private feedback remains
inside the signed-in portal.

Official references:
- https://capacitorjs.com/docs/apis/push-notifications
- https://firebase.google.com/docs/cloud-messaging/send/v1-api
