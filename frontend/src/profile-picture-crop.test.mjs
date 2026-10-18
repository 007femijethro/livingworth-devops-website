import test from 'node:test';
import assert from 'node:assert/strict';
import {cropGeometry,initialPictureSettings,drawPictureCrop} from './profile-picture-crop.ts';
test('portrait, landscape and rotated crops fill the output at every allowed position',()=>{
 for(const [width,height] of [[1200,800],[800,1200],[512,512]])for(const rotation of [0,90,180,270])for(const zoom of [1,1.5,3])for(const position of [-1,0,1]){
  const g=cropGeometry(width,height,512,{...initialPictureSettings,rotation,zoom,x:position,y:position});
  const rotated=rotation%180!==0,w=(rotated?height:width)*g.scale,h=(rotated?width:height)*g.scale;
  assert.ok(256+g.offsetX-w/2<=.00001);assert.ok(256+g.offsetX+w/2>=511.99999);
  assert.ok(256+g.offsetY-h/2<=.00001);assert.ok(256+g.offsetY+h/2>=511.99999);
 }
 const portrait=cropGeometry(800,1200,512,initialPictureSettings);assert.equal(portrait.scale,.64);assert.equal(portrait.limitX,0);assert.equal(portrait.limitY,128);
 const rotated=cropGeometry(800,1200,512,{...initialPictureSettings,rotation:90});assert.equal(rotated.limitX,128);assert.equal(rotated.limitY,0);
});
test('crop position is clamped and export uses the same transforms and adjustments as the preview',()=>{
 const g=cropGeometry(1200,800,512,{...initialPictureSettings,zoom:2,x:10,y:-10});assert.equal(g.offsetX,g.limitX);assert.equal(g.offsetY,-g.limitY);
 const calls=[];const context={save:()=>calls.push('save'),clearRect:()=>{},fillRect:()=>{},translate:(...v)=>calls.push(['translate',...v]),scale:(...v)=>calls.push(['scale',...v]),rotate:(v)=>calls.push(['rotate',v]),drawImage:()=>calls.push('draw'),restore:()=>calls.push('restore')};
 drawPictureCrop({width:512,getContext:()=>context},{naturalWidth:800,naturalHeight:1200},{...initialPictureSettings,rotation:90,flip:true,brightness:120,contrast:90});
 assert.deepEqual(calls.slice(1,5),[['translate',256,256],['scale',-1,1],['rotate',Math.PI/2],['scale',.64,.64]]);assert.equal(context.filter,'brightness(120%) contrast(90%)');assert.deepEqual(calls.slice(-2),['draw','restore']);
});
