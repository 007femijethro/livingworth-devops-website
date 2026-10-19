# Saved email and biometric sign-in

Android 1.3 (versionCode 4) includes the native biometric plugin. Install this APK, sign in with your password, then open Security → Biometric sign-in. Confirm your current password and select Enable fingerprint (or the supported biometric shown). Next time the app opens, it asks you to sign in and offers the saved account's biometric button. Remember my email is optional and works independently of biometrics.

A 256-bit random device sign-in key is stored through the plugin's crypto-bound secure-data API, protected by Android Keystore / iOS Keychain and the current enrolled biometric set. The password is never saved. Only the key's SHA-256 hash is kept on the server. The key expires after 30 days, and changes to the password, role, session version, account approval or password-reset requirement invalidate it. Locked accounts cannot use it. Adding or changing enrolled biometrics can invalidate local secure storage; sign in with your password and enable it again.

One account per phone can be saved for biometrics. Signing out retains that saved sign-in, as described in Security. Remove this device or revoke all saved sign-ins under Security to disable it. A full app restart returns a biometrically enrolled account to the sign-in screen; this feature does not lock an already open session when switching apps. No fingerprint images or facial data are collected by the academy.

Only strong Android biometrics are accepted; unsupported face unlock falls back to password sign-in. Secure reads must use `getSecureData`, never a separate prompt followed by an unprotected read. Native changes require the new APK, not just a web update.

## Future iPhone release

The implementation uses the cross-platform native plugin and labels Face ID / Touch ID when available. This repository currently ships Android only. Before an iOS release, add a Capacitor iOS project, sync the plugin, and set `NSFaceIDUsageDescription` in the app's Info.plist (for example, “Use Face ID to sign in to your Livingworth Academy account”). Build and verify enrollment, cancellation, secure storage and password fallback on physical iOS devices. No iPhone binary is delivered with this Android update.

## Validation

Backend tests cover enrollment, password confirmation and lockout, account/password/session/role invalidation, expiry, portal binding, hashed storage and owner-scoped revocation. Frontend tests cover secure-prompt cancellation, read-before-exchange, failures and account matching. Android CI builds the APK and runs native unit tests and lint. Physical fingerprint / Face ID testing remains required on supported devices.
