Android 1.6 / versionCode 7 includes the latest quiz controls and manual update checks under About & Help. Install it over production-signed 1.5; do not uninstall or clear app data. The version increment resets stale OTA paths using Capacitor’s normal version-change handling.

# Permanent Android releases

Android 1.5 / versionCode 6 is the first production-signed release. The previous test APKs used temporary debug certificates, so testers must uninstall an old test app once before moving to this release. Future native releases use the permanent academy certificate and can install over this release, preserving the app's local settings. Ordinary compatible web updates continue through the signed OTA updater; native/plugin changes still require a new APK.

## Signing storage and CI

The signing key is generated once as a 3072-bit RSA PKCS12 keystore with a random 256-bit password and a certificate valid for 10,000 days. It is stored in the separate persistent Docker volume `android_release_signing`, mounted at `/app/android-signing-private`. The directory belongs to root with mode 700; the JSON is mode 600. The ordinary backend `node` process cannot read it. Management commands require the deployment SSH account and privileged Docker access.

Trusted main-branch Android builds connect over SSH pinned to the deployment host's Ed25519 fingerprint, load the existing key into private temporary runner storage, and build a non-debuggable release APK. Private key material and its password are never source files or artifacts. Runner key files are removed after the build. Pull requests only build/test debug APKs and never access signing credentials.

`ANDROID-RELEASE-CERTIFICATE.sha256` pins the permanent public certificate after the initial bootstrap. Future builds fail if the saved key is missing or the certificate changes; they do not generate a replacement signing identity. The store installs atomically and never overwrites an existing key. A changed SSH host fingerprint also stops signing until its identity is checked and the pin is deliberately updated.

**Back up the private signing volume before wide distribution.** Losing this key prevents in-place updates to installed APKs. The volume survives container rebuilds and normal deployments, but not deletion of the volume or loss of the server/storage. Keep an encrypted backup outside the server and keep the backup password separately. For example, from the server repository directory:

```
sudo docker compose exec -T --user root backend tar -C /app/android-signing-private -cf - android-release-signing.json | openssl enc -aes-256-cbc -salt -pbkdf2 -out livingworth-android-signing-backup.enc
```

OpenSSL prompts for a backup password. Never paste that password, the decrypted JSON, the keystore or the deployment SSH key in chat or a public repository. Restoring a signing backup is an administrator operation; do not delete a missing-key error by creating a new signing key.

## Firebase and learner trial

The Android Firebase client is bundled. Phone delivery remains inactive until the private Firebase credential is installed using the separate Configure Firebase delivery workflow described in PUSH-SETUP.md. This activation does not require another native rebuild.

Before sending the app to the whole class, test with 2–3 learners on real Android devices, including an ordinary learner and a class representative: attendance; installation; password login and reset; fingerprint enable/cancel/login; profile picture crop; materials and downloads; weekly activity/assignment gates; progress; notification permission/foreground/background/closed app receipt after Firebase is active; logout; and update-over-installation using the same permanent key. Automated builds cannot verify physical biometric sensors or phone delivery.

About & Help is available to students, mentors and administrators. It shows the actual installed app version, troubleshooting, privacy information and support contacts configured under Admin Settings → Academy & contact. If no support contact is set, users are directed to their class mentor. The offline admin preview is available only in local development builds.
