const fs=require('node:fs');const {chromium}=require('playwright');
(async()=>{const root='assets/estate/',manifest=JSON.parse(fs.readFileSync(root+'manifest.json'));
 const browser=await chromium.launch({headless:true,channel:'chromium',args:['--no-sandbox']});const page=await browser.newPage();
 fs.mkdirSync('/tmp/estate-previews',{recursive:true});
 for(const a of manifest.materials){
 if(process.env.ESTATE_ONLY&&a.id!==process.env.ESTATE_ONLY)continue;
 const stem=(a.file||a.id+'.jpg').replace(/\.jpg$/,'');
 const input=a.source.startsWith('/')?a.source:require('node:path').join(process.env.ESTATE_SOURCE_DIR||root,a.source);
 const data='data:image/png;base64,'+fs.readFileSync(input).toString('base64');
 const size=['masonry','paving'].includes(a.id)?1024:512;
 const result=await page.evaluate(async({data,size})=>{
  const image=new Image();image.src=data;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const c=canvas.getContext('2d');c.drawImage(image,0,0,size,size);
  const color=canvas.toDataURL('image/jpeg',.87);
  const low=document.createElement('canvas');low.width=low.height=256;low.getContext('2d').drawImage(canvas,0,0,256,256);const lowColor=low.toDataURL('image/jpeg',.8);
  const preview=document.createElement('canvas');preview.width=preview.height=768;const pc=preview.getContext('2d');for(let x=0;x<3;x++)for(let y=0;y<3;y++)pc.drawImage(low,x*256,y*256);
  const d=c.getImageData(0,0,size,size);for(let i=0;i<d.data.length;i+=4){const v=Math.round(d.data[i]*.2126+d.data[i+1]*.7152+d.data[i+2]*.0722);d.data[i]=d.data[i+1]=d.data[i+2]=v;}c.putImageData(d,0,0);
  const bump=canvas.toDataURL('image/jpeg',.8);low.getContext('2d').drawImage(canvas,0,0,256,256);
  return {color,bump,lowColor,lowBump:low.toDataURL('image/jpeg',.8),preview:preview.toDataURL('image/jpeg',.9)};
 },{data,size});
 for(const [key,suffix]of [['color',''],['bump','-bump'],['lowColor','-256'],['lowBump','-256-bump']])fs.writeFileSync(root+stem+suffix+'.jpg',Buffer.from(result[key].split(',')[1],'base64'));
 fs.writeFileSync('/tmp/estate-previews/'+a.id+'.jpg',Buffer.from(result.preview.split(',')[1],'base64'));
 a.source=a.source.split('/').pop();a.file=stem+'.jpg';a.pixels=size;a.bump=stem+'-bump.jpg';a.lowPixels=256;console.log(a.id);
 }
 fs.writeFileSync(root+'manifest.json',JSON.stringify(manifest,null,2)+'\n');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
