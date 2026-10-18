# Livingworth Academy Android app

Student and staff portals are bundled with Capacitor 8. The Android app uses the existing production API and accounts at https://bridgess.co.uk. It requires an internet connection for course content, submissions and administrative changes. No account credentials are bundled.

## Build a test APK

Requirements: Node 22+, JDK 21, Android SDK 36 (Android Studio can install these).

```sh
cd frontend
npm ci
npm run android:apk
```

APK: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.
Minimum supported Android version: Android 7 (API 24). The GitHub Actions **Build Android app** workflow also builds the test APK and runs Android unit tests and lint. Its artifact is named **Livingworth-Academy-Android-test**.

Download the APK to an Android phone, open it and allow installation from that browser or file manager when Android asks. Sign in through the existing student or staff login. This is a debug-signed testing build; its signing identity may change between CI runs, so reinstalling a later testing build can require uninstalling the earlier one.

## Included mobile integration

- Bundled React interface with existing student, mentor and admin access.
- HTTPS production API and live quiz socket connection.
- File chooser for submissions and uploads, Android share sheet for generated reports and downloads.
- External class/video links opened outside the app's main WebView.
- Android back navigation, keyboard resizing, safe-area styling and offline connection notice.
- Native app backups disabled because portal session tokens currently use WebView local storage, as on the website.

The app has in-app notifications while connected; background push notifications require a separate Firebase setup. Offline submissions, background downloads and full offline course access are not implemented.

## Device acceptance checks

Before wider distribution, test on a physical Android device: student/staff login and logout; learning and class activity submission; assignments with file upload; attendance; downloads/share; a live quiz; external class links; keyboard and back navigation; reconnecting after loss of network. Never delete real learner attempts as a test.

## Play Store release

The application id is `com.livingworthacademy.app`, version code 1. Before publishing, confirm the app id, create and safely retain a release signing/upload key, configure signed AAB builds and Play App Signing, and prepare store artwork, privacy policy, account-deletion process and Play Console declarations. Do not commit keys or passwords. Publishing and release signing are separate from the test APK.

## Live updates (Android 1.1 / native version code 2)

Install the new 1.1 test APK once to enable live updates and get the latest class-activity navigation. The earlier 1.0 APK has no updater. Because these CI builds use different debug signing keys, Android may require uninstalling the old test APK first; this clears its local session, so sign in again. Academy records remain on the server.

Afterwards, the app checks for signed interface updates on launch and on resume (at most every 15 minutes). It downloads a compatible bundle in the background and applies it on the next full app restart. A short notice confirms when an update is ready. No automatic WebView reload interrupts an active quiz or form. Closing the app from Android's recent-apps screen and reopening applies a staged bundle.

The production deployment copies the built website assets into the backend publishing job. `scripts/publish-mobile-update.mjs` creates a ZIP, SHA-256 checksum and RSA-SHA256 signature, then atomically publishes a per-native-version manifest. Bundles and manifests are public; no credentials, learner records or private keys are included. Native verification uses the public key pinned in `capacitor.config.ts`. Invalid signatures never become the next bundle. If a downloaded bundle cannot start and confirm readiness within 15 seconds, the native plugin rolls back to the built-in UI and blocks that bundle.

The signing private key lives only in the persistent Docker volume `mobile_update_signing`, mounted at `/app/mobile-private`; it is not exposed through `/uploads` or committed to git. Include this volume in the server's protected backups and retain it across deployments. Replacing this key requires a new APK containing its new public key. Keep production release signing keys separate from this OTA signing key.

Every build emits `mobile-runtime.json`. The publisher compares a fingerprint of Android source/configuration/resources and Capacitor plugin versions with the protected baseline for that version code. Changing these requires incrementing `versionCode` and distributing a new APK before that runtime can receive its own updates. Interface-only changes continue to use the existing version channel. Older APKs keep their existing channel. Publishing native changes without a version-code increment fails the publishing step and retains the previous working manifest.

Diagnostics: public key `/api/mobile-updates/public-key.pem`; native-v2 manifest `/api/mobile-updates/android/2/manifest.json`. To roll out an interface fix, push it to `main` and verify **Deploy Livingworth** succeeds. To revert an update, deploy the previous working web code with the same native runtime; the app will stage that signed bundle on its next check. Do not manually edit published ZIPs/manifests. Native changes and Play Store publication still require a new binary release.

Verification completed in development/CI covers URL and compatibility validation, staging without reload, blocked/current bundles, failed-download handling, deterministic signed packaging, tamper rejection, native-version isolation, public-route restrictions, web compilation and Android lint/build. Physical-device acceptance remains necessary for download, full-restart activation and rollback on the target phones.
