// Preserve the supplied company artwork; only crop padding and resize assets.
// Run from the repository root after installing backend dependencies.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require(require.resolve('sharp', { paths: [path.resolve('backend')] }));
const source = 'frontend/public/livingworth-logo.jpeg';
const res = 'frontend/android/app/src/main/res';
async function icon(size, symbolSize) {
  const symbol = await sharp(source).extract({left:14,top:128,width:132,height:124}).resize(symbolSize,symbolSize,{fit:'contain',background:'#ffffff'}).png().toBuffer();
  return sharp({create:{width:size,height:size,channels:4,background:'#ffffff'}}).composite([{input:symbol,gravity:'centre'}]).png().toBuffer();
}
(async()=>{
  await sharp(source).extract({left:12,top:128,width:376,height:124}).png().toFile('frontend/public/livingworth-wordmark.png');
  // Adaptive artwork stays inside Android's central 66dp safe area (108dp layer).
  await fs.mkdir(`${res}/drawable-nodpi`,{recursive:true});
  await fs.writeFile(`${res}/drawable-nodpi/academy_emblem.png`,await icon(432,256));
  for(const [density,size] of Object.entries({mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192})){
    const dir=`${res}/mipmap-${density}`;await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(`${dir}/ic_launcher.png`,await icon(size,Math.round(size*.76)));
  }
  await fs.mkdir(`${res}/mipmap-anydpi-v26`,{recursive:true});
  const adaptive=`<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@android:color/white" />\n    <foreground android:drawable="@drawable/academy_emblem" />\n</adaptive-icon>\n`;
  await fs.writeFile(`${res}/mipmap-anydpi-v26/ic_launcher.xml`,adaptive);
  await fs.writeFile(`${res}/mipmap-anydpi-v26/ic_launcher_round.xml`,adaptive);
  // Legacy launchers can apply their own round/square mask to the same artwork.
  await fs.mkdir(`${res}/mipmap-anydpi`,{recursive:true});
  await fs.writeFile(`${res}/mipmap-anydpi/ic_launcher_round.xml`,'<?xml version="1.0" encoding="utf-8"?>\n<bitmap xmlns:android="http://schemas.android.com/apk/res/android" android:src="@mipmap/ic_launcher" android:gravity="fill" />\n');
})();
