// Run only after receiving this app's Firebase Android CLIENT configuration.
// This intentionally changes native inputs and requires a new APK release.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url)),source=process.argv[2];
if(!source)throw new Error('Provide the path to Firebase google-services.json (Android client configuration).');
const client=JSON.parse(fs.readFileSync(path.resolve(source),'utf8'));
if(client.type==='service_account'||client.private_key)throw new Error('Use the Android CLIENT configuration, never a service-account key.');
if(!client.project_info?.project_id||!client.client?.some(item=>item.client_info?.android_client_info?.package_name==='com.livingworthacademy.app'))throw new Error('Firebase configuration must contain Android package com.livingworthacademy.app.');
fs.writeFileSync(path.join(root,'android/app/google-services.json'),JSON.stringify(client,null,2));
execFileSync('npm',['install','--save-exact','@capacitor/push-notifications@8.1.3'],{cwd:root,stdio:'inherit'});
const edit=(name,update)=>{const file=path.join(root,name);fs.writeFileSync(file,update(fs.readFileSync(file,'utf8')))};
edit('android/app/build.gradle',text=>text.replace(/versionCode\s+(\d+)\b/,(_,code)=>`versionCode ${Number(code)+1}`).replace(/versionName\s+"1\.(\d+)"/,(_,minor)=>`versionName "1.${Number(minor)+1}"`));
edit('capacitor.config.ts',text=>text.includes('PushNotifications:')?text:text.replace('plugins: {','plugins: { PushNotifications: { presentationOptions: ["alert", "sound"] },'));
edit('android/app/src/main/AndroidManifest.xml',text=>text.includes('default_notification_icon')?text:text.replace('        <activity','        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_academy" />\n        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="academy-learning" />\n\n        <activity'));
fs.writeFileSync(path.join(root,'android/app/src/main/res/drawable/ic_stat_academy.xml'),`<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFFFF" android:pathData="M12,2L1,8L5,10.18V16L12,20L19,16V10.18L21,9.09V16H23V8L12,2ZM7,11.27L12,14L17,11.27V14.84L12,17.7L7,14.84Z"/></vector>`);
// First sync can use the previous web bundle; then rebuild with the final native fingerprint.
execFileSync('npm',['run','build'],{cwd:root,stdio:'inherit'});
execFileSync('npx',['cap','sync','android'],{cwd:root,stdio:'inherit'});
execFileSync('npm',['run','android:sync'],{cwd:root,stdio:'inherit'});
console.log('Push-capable Android sources prepared. Commit the native inputs and configure the CI Firebase client file before releasing the new APK.');
