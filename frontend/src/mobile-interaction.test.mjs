import test from 'node:test';
import assert from 'node:assert/strict';
import {keyboardVisible,handleMobileBack,startMobileViewport} from './mobile-interaction.ts';
test('keyboard detection keeps navigation for hardware keyboards, browser bars, zoom and non-editable focus',()=>{
 const base={layoutHeight:800,visibleHeight:470,editing:true};assert.equal(keyboardVisible(base),true);
 for(const patch of [{editing:false},{visibleHeight:720},{visibleHeight:800},{scale:1.4}])assert.equal(keyboardVisible({...base,...patch}),false);
 assert.equal(keyboardVisible({layoutHeight:400,visibleHeight:230,editing:true}),true);
});
test('Android back closes a consuming overlay before history or minimization',()=>{
 const target=new EventTarget(),calls=[];const close=event=>{event.preventDefault();calls.push('closed menu')};target.addEventListener('lw-native-back',close);
 const back=()=>calls.push('history'),minimize=()=>calls.push('minimize');
 handleMobileBack(target,true,back,minimize);handleMobileBack(target,false,back,minimize);assert.deepEqual(calls,['closed menu','closed menu']);
 target.removeEventListener('lw-native-back',close);handleMobileBack(target,true,back,minimize);handleMobileBack(target,false,back,minimize);assert.deepEqual(calls,['closed menu','closed menu','history','minimize']);
});
test('viewport lifecycle reacts to keyboard, focus, rotation and desktop resize, and removes listeners on cleanup',()=>{
 class Element{isContentEditable=false};class Input extends Element{type='text';readOnly=false;disabled=false};class Textarea extends Element{readOnly=false;disabled=false};
 const originals=new Map(['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','requestAnimationFrame','cancelAnimationFrame'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const win=Object.assign(new EventTarget(),{innerWidth:390,innerHeight:844,visualViewport:Object.assign(new EventTarget(),{height:844,scale:1})});const attributes=new Set();const doc=Object.assign(new EventTarget(),{activeElement:null,documentElement:{toggleAttribute:(k,on)=>on?attributes.add(k):attributes.delete(k),removeAttribute:k=>attributes.delete(k)}});const pending=new Map();let id=0;const flush=()=>{for(const [k,fn]of pending){pending.delete(k);fn()}};
 Object.assign(globalThis,{window:win,document:doc,HTMLElement:Element,HTMLInputElement:Input,HTMLTextAreaElement:Textarea,requestAnimationFrame:fn=>{pending.set(++id,fn);return id},cancelAnimationFrame:k=>pending.delete(k)});
 try{const stop=startMobileViewport();const open=()=>attributes.has('data-keyboard-open');assert.equal(open(),false);
  doc.activeElement=new Input();doc.dispatchEvent(new Event('focusin'));flush();assert.equal(open(),false,'Focus without software keyboard keeps shortcuts');
  win.visualViewport.height=490;win.visualViewport.dispatchEvent(new Event('resize'));flush();assert.equal(open(),true);
  win.visualViewport.scale=2;win.visualViewport.dispatchEvent(new Event('resize'));flush();assert.equal(open(),false,'Pinch zoom is not a keyboard');win.visualViewport.scale=1;
  doc.activeElement.type='checkbox';doc.dispatchEvent(new Event('focusin'));flush();assert.equal(open(),false,'Checkbox does not hide navigation');
  doc.activeElement=new Textarea();doc.dispatchEvent(new Event('focusin'));flush();assert.equal(open(),true);
  doc.activeElement=null;doc.dispatchEvent(new Event('focusout'));flush();assert.equal(open(),false);
  win.innerWidth=844;win.innerHeight=390;win.visualViewport.height=390;doc.activeElement=new Input();win.dispatchEvent(new Event('resize'));flush();assert.equal(open(),false,'Rotation resets the baseline');
  win.innerWidth=1200;win.innerHeight=900;win.visualViewport.height=500;win.dispatchEvent(new Event('resize'));flush();assert.equal(open(),false,'Desktop layout keeps navigation');
  stop();assert.equal(open(),false);win.dispatchEvent(new Event('resize'));doc.dispatchEvent(new Event('focusin'));assert.equal(pending.size,0);
 }finally{for(const [key,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
});
