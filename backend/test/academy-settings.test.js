import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireAdmin } from '../dist/auth.js';
import { validateSettings, loadAcademySettings, getAcademySettings, registerAcademySettingsRoutes } from '../dist/academy-settings.js';

test('settings validate exact types, limits, days, zones and meeting links', () => {
  assert.deepEqual(validateSettings({classDays:[5,1,5],supportEmail:' help@example.com ',certificateRequiredScore:80}),{classDays:[1,5],supportEmail:'help@example.com',certificateRequiredScore:80});
  for (const settings of [{unknown:1},{classRepLimit:0},{studentSessionHours:'8'},{registrationOpen:'false'},{signInActivityRequired:'false'},{classDays:[]},{classDays:[7]},{classTime:'24:00'},{classTimezone:'Invalid/Zone'},{meetingUrl:'https://evil.example'},{meetingUrl:'http://meet.google.com/abc'},{supportEmail:'invalid'},{certificateRequiredScore:101}]) assert.throws(()=>validateSettings(settings));
});

test('admin settings enforce roles, revision conflicts and transactional saves while public settings omit private controls', async () => {
  let rows=[{settingKey:'email_notifications',enabled:false,valueText:null,updatedAt:'original'},{settingKey:'class_code_expiry_hours',enabled:true,valueText:'48',updatedAt:'original'}];
  const calls=[]; let snapshot;
  const pool={execute:async(sql,params=[])=>{
    calls.push(sql);
    if(sql.startsWith('SELECT setting_key'))return [structuredClone(rows)];
    if(sql.startsWith('SELECT pg_advisory'))return [[]];
    if(sql.startsWith('INSERT INTO system_settings')){const [settingKey,enabled,valueText]=params;rows=rows.filter(row=>row.settingKey!==settingKey);rows.push({settingKey,enabled,valueText,updatedAt:'changed'});return [{}]}
    if(sql.startsWith('UPDATE live_classes')){assert.deepEqual(params,[96]);return [{}]}
    throw new Error(sql);
  },getConnection:async()=>({...pool,beginTransaction:async()=>{snapshot=structuredClone(rows)},commit:async()=>calls.push('COMMIT'),rollback:async()=>{rows=snapshot;calls.push('ROLLBACK')},release:()=>calls.push('RELEASE')})};
  await loadAcademySettings(pool);
  assert.equal(getAcademySettings().emailEnabled,false);
  assert.equal(getAcademySettings().expiryHours,48);
  const app=express();app.use(express.json());
  registerAcademySettingsRoutes(app,pool,(req,res,next)=>{const role=req.get('x-role');if(!role)return res.sendStatus(401);req.user={id:1,role};next()},requireAdmin);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const patch=(body,role='admin')=>fetch(`${base}/admin/settings`,{method:'PATCH',headers:{'Content-Type':'application/json','x-role':role},body:JSON.stringify(body)});
  try{
    assert.equal((await fetch(`${base}/admin/settings`)).status,401);
    for(const role of ['student','mentor']) assert.equal((await patch({settings:{registrationOpen:false}},role)).status,403);
    const loaded=await (await fetch(`${base}/admin/settings`,{headers:{'x-role':'admin'}})).json();
    assert.equal((await patch({settings:{registrationOpen:false},revision:'stale'})).status,409);
    assert.equal(getAcademySettings().registrationOpen,true);
    const result=await patch({settings:{signInActivityRequired:false,registrationOpen:false,classRepLimit:3,certificateRequiredScore:80,expiryHours:96},revision:loaded.revision});assert.equal(result.status,200);
    const saved=await result.json();assert.notEqual(saved.revision,loaded.revision);
    assert.equal(saved.settings.signInActivityRequired,false);assert.equal(getAcademySettings().signInActivityRequired,false);assert.equal(saved.settings.registrationOpen,false);assert.equal(getAcademySettings().certificateRequiredScore,80);assert.ok(calls.includes('COMMIT'));assert.ok(calls.some(sql=>sql.startsWith('UPDATE live_classes')));
    const publicResponse=await fetch(`${base}/academy-settings`);const publicSettings=await publicResponse.json();assert.equal(publicResponse.headers.get('cache-control'),'no-store');assert.equal(publicSettings.classRepLimit,3);assert.equal(publicSettings.registrationOpen,false);assert.equal(publicSettings.certificateRequiredScore,80);assert.equal('studentSessionHours' in publicSettings,false);assert.equal('emailEnabled' in publicSettings,false);assert.equal('signInActivityRequired' in publicSettings,false);
    const enabled=await patch({settings:{signInActivityRequired:true},revision:saved.revision});assert.equal(enabled.status,200);assert.equal(getAcademySettings().signInActivityRequired,true);
    await loadAcademySettings(pool);assert.equal(getAcademySettings().signInActivityRequired,true);
    assert.equal((await patch({settings:{registrationOpen:true},revision:loaded.revision})).status,409);
  }finally{await loadAcademySettings({execute:async()=>[[]]});server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
