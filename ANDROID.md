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
