export type PictureSettings={zoom:number;x:number;y:number;rotation:number;flip:boolean;brightness:number;contrast:number};
export const initialPictureSettings:PictureSettings={zoom:1,x:0,y:0,rotation:0,flip:false,brightness:100,contrast:100};
export function cropGeometry(width:number,height:number,size:number,settings:PictureSettings){
 const quarterTurn=((settings.rotation%180)+180)%180===90;
 const rotatedWidth=quarterTurn?height:width,rotatedHeight=quarterTurn?width:height;
 const scale=Math.max(size/rotatedWidth,size/rotatedHeight)*Math.max(1,Math.min(3,settings.zoom));
 const limitX=Math.max(0,(rotatedWidth*scale-size)/2),limitY=Math.max(0,(rotatedHeight*scale-size)/2);
 return {scale,limitX,limitY,offsetX:Math.max(-1,Math.min(1,settings.x))*limitX,offsetY:Math.max(-1,Math.min(1,settings.y))*limitY};
}
export function drawPictureCrop(canvas:HTMLCanvasElement,image:HTMLImageElement,settings:PictureSettings){
 const context=canvas.getContext('2d');if(!context)throw new Error('Picture editing is not available in this browser.');
 const size=canvas.width,{scale,offsetX,offsetY}=cropGeometry(image.naturalWidth,image.naturalHeight,size,settings);
 context.save();context.clearRect(0,0,size,size);context.fillStyle='#fff';context.fillRect(0,0,size,size);
 context.translate(size/2+offsetX,size/2+offsetY);context.scale(settings.flip?-1:1,1);context.rotate(settings.rotation*Math.PI/180);context.scale(scale,scale);
 context.filter=`brightness(${settings.brightness}%) contrast(${settings.contrast}%)`;
 context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,-image.naturalWidth/2,-image.naturalHeight/2);context.restore();
}
