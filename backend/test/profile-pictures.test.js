import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sharp from 'sharp';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { registerProfilePictureRoutes, prepareProfilePicture, PROFILE_PICTURE_LIMIT } from '../dist/profile-pictures.js';

test('profile pictures decode real photos, strip metadata and produce square WebP files',async()=>{
 const jpeg=await sharp({create:{width:100,height:200,channels:3,background:'red'}}).jpeg().withMetadata().toBuffer();
 const output=await prepareProfilePicture(jpeg),metadata=await sharp(output).metadata();
 assert.equal(metadata.format,'webp');assert.equal(metadata.width,512);assert.equal(metadata.height,512);assert.equal(metadata.exif,undefined);
 await assert.rejects(()=>prepareProfilePicture(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>')));
 await assert.rejects(()=>prepareProfilePicture(Buffer.from('not an image')));
});

test('uploads persist on the signed-in account, replacement removes the old file, and photos remain private',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'lw-photos-'));
 let picture=null;const updates=[];
 const pool={execute:async(sql,params)=>{
  if(sql.startsWith('SELECT profile_picture'))return [[{profilePicture:picture}]];
  if(sql.startsWith('UPDATE users')){assert.equal(params[1],7);picture=params[0];updates.push(picture);return [{}]}
  throw new Error(sql);
 }};
 const app=express();registerProfilePictureRoutes(app,pool,(req,res,next)=>{if(!req.get('x-role'))return res.sendStatus(401);req.user={id:7,role:req.get('x-role')};next()},directory);
 app.use('/uploads',express.static(path.dirname(directory)));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const jpeg=await sharp({create:{width:40,height:80,channels:3,background:'blue'}}).jpeg().toBuffer();
 const upload=(bytes,role='student')=>{const body=new FormData();body.append('picture',new Blob([bytes],{type:'image/jpeg'}),'photo.jpg');return fetch(`${base}/api/profile-picture`,{method:'POST',headers:role?{'x-role':role}:{},body})};
 try{
  assert.equal((await upload(jpeg,null)).status,401);assert.equal((await upload(Buffer.from('fake JPEG'))).status,400);
  assert.equal((await upload(Buffer.alloc(PROFILE_PICTURE_LIMIT+1))).status,400);assert.equal(updates.length,0);
  const saved=await upload(jpeg);assert.equal(saved.status,200);assert.equal((await saved.json()).profilePicture,picture);
  const first=picture;assert.equal((await sharp(await readFile(path.join(directory,picture))).metadata()).format,'webp');
  const own=await fetch(`${base}/api/profile-picture/7`,{headers:{'x-role':'student'}});assert.equal(own.status,200);assert.equal(own.headers.get('cache-control'),'private, no-store');
  assert.equal((await fetch(`${base}/api/profile-picture/8`,{headers:{'x-role':'student'}})).status,403);
  assert.equal((await fetch(`${base}/api/profile-picture/7`)).status,401);
  assert.equal((await fetch(`${base}/api/profile-picture/7`,{headers:{'x-role':'mentor'}})).status,200);
  assert.equal((await fetch(`${base}/uploads/profile-pictures/${picture}`)).status,404);
  assert.equal((await upload(jpeg)).status,200);assert.notEqual(picture,first);assert.deepEqual(await readdir(directory),[picture]);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true})}
});
