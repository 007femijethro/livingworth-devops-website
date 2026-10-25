/** A focused field alone must not hide navigation (hardware keyboards and zoom). */
export function keyboardVisible({layoutHeight,visibleHeight,editing,scale=1}:{layoutHeight:number;visibleHeight:number;editing:boolean;scale?:number}){
 return editing&&scale<=1.05&&layoutHeight-visibleHeight>=Math.max(150,layoutHeight*.2);
}
export function isTextEntry(element:Element|null){
 if(!element)return false;
 if(element instanceof HTMLElement&&element.isContentEditable)return true;
 if(element instanceof HTMLTextAreaElement)return !element.readOnly&&!element.disabled;
 return element instanceof HTMLInputElement&&!element.readOnly&&!element.disabled&&['text','search','email','password','tel','url','number'].includes(element.type);
}
export function startMobileViewport(){
 let layoutHeight=window.innerHeight,lastWidth=window.innerWidth,frame=0;
 const update=()=>{frame=0;const viewport=window.visualViewport;
  if(Math.abs(window.innerWidth-lastWidth)>80){layoutHeight=window.innerHeight;lastWidth=window.innerWidth}
  layoutHeight=Math.max(layoutHeight,window.innerHeight,viewport?.height||0);
  const open=window.innerWidth<=760&&keyboardVisible({layoutHeight,visibleHeight:viewport?.height||window.innerHeight,editing:isTextEntry(document.activeElement),scale:viewport?.scale||1});
  document.documentElement.toggleAttribute('data-keyboard-open',open);
 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update)};
 window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
 document.addEventListener('focusin',schedule);document.addEventListener('focusout',schedule);update();
 return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);document.removeEventListener('focusin',schedule);document.removeEventListener('focusout',schedule);document.documentElement.removeAttribute('data-keyboard-open')};
}
/** Cancel this event in a visible overlay before Android navigates or minimizes. */
export function handleMobileBack(target:Pick<Window,'dispatchEvent'>,canGoBack:boolean,back:()=>void,minimize:()=>void){
 if(!target.dispatchEvent(new Event('lw-native-back',{cancelable:true})))return;
 if(canGoBack)back();else minimize();
}
