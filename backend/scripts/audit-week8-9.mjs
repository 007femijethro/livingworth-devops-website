import {rawPool} from '../dist/db.js';
import fs from 'node:fs';
import {randomBytes,publicEncrypt,createCipheriv} from 'node:crypto';
const publicKey = "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtdyaKKTUi3ybqbR6e/OH\nH4fMUzS31872Yl/tiV/bzuGsFMsUO1PtWMsGZypyweDrbyLQW4UYfTL0cLTNYmP/\ncMBuCoapNWh2DGvlmV3RJHeH/lSVjowgT7A/00cUxhGvyaxfrk8dzKrs2a0FjzRd\nszjocMOQQpASis/vg1xgeRi3dcom2+D0OwBiQKD6fDf51k5iVCoUFiLAPQnLlo0P\nD598d3tVFrKr60rWICUMQY4YWDqQTAQHkAbr6yXEqe6zhQgKV6GR5oSEb9KEdPX8\nOZril+WfOZM36jbc9SihXFc6HOg/2jZ+qSPSPJ1Ulqc3KQzP2pMQ/AdfPmUU/qKX\ntQIDAQAB\n-----END PUBLIC KEY-----\n";
try {
const {rows}=await rawPool.query(`SELECT m.id AS module_id,m.week_number,m.title AS module_title,l.id,l.title,l.material_type,l.resource_url,l.lesson_content,l.original_name FROM lw_learning_modules m LEFT JOIN lw_learning_materials l ON l.module_id=m.id WHERE m.week_number IN (8,9) ORDER BY m.week_number,l.display_order,l.id`);
const keyPath='/app/mobile-private/week8-9-quiz-import-key';
try {fs.writeFileSync(keyPath,randomBytes(32),{flag:'wx',mode:0o600});} catch(e){if(e.code!=='EEXIST')throw e;}
const importKey=fs.readFileSync(keyPath).toString('base64');
const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
const data=Buffer.concat([cipher.update(JSON.stringify({rows,importKey})),cipher.final()]);
console.log('QUIZ_MATERIAL_AUDIT '+JSON.stringify({key:publicEncrypt(publicKey,key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}));
} finally {await rawPool.end();}
