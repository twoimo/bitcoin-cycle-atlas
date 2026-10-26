import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root=resolve(process.argv[2]||'.'),output=resolve(process.argv[3]||'build/renderer-experiment');
const source=await readFile(resolve(root,'dist/data/btc-volume.json'));
const snapshot=JSON.parse(source),bars=snapshot.bars;
assert.ok(bars.length>1000&&bars.every(b=>b.low>0&&b.high>=b.low&&b.open>0&&b.close>0));
const {chromium}=await import(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.ATLAS_BROWSER_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
await mkdir(output,{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  await page.setContent('<style>body{margin:0;background:#11171d;color:#ccd5df}#stage{position:relative;width:1280px;height:720px}canvas,svg{position:absolute;inset:0}#selected{position:absolute;left:20px;top:10px;font:14px sans-serif}</style><div id="stage"><svg id="svg" width="1280" height="720" viewBox="0 0 1280 720"></svg><canvas id="canvas" width="1280" height="720"></canvas><div id="selected"></div></div>');
  const report=await page.evaluate(async bars=>{
    const svg=document.querySelector('#svg'),canvas=document.querySelector('#canvas'),ctx=canvas.getContext('2d'),readout=document.querySelector('#selected');
    const W=1280,H=720,L=20,R=70,T=40,B=30;
    const low=Math.log(Math.min(...bars.map(b=>b.low))),high=Math.log(Math.max(...bars.map(b=>b.high)));
    const y=value=>T+(high-Math.log(value))/(high-low)*(H-T-B);
    const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    function geometry(offset){
      const wicks=['',''],bodies=['',''];
      bars.forEach((b,i)=>{const x=L+i/(bars.length-1)*(W-L-R)+offset,side=b.close>=b.open?0:1,top=Math.min(y(b.open),y(b.close)),height=Math.max(1,Math.abs(y(b.open)-y(b.close)));
        wicks[side]+=`M${x.toFixed(2)},${y(b.high).toFixed(2)}V${y(b.low).toFixed(2)}`;
        bodies[side]+=`M${(x-.35).toFixed(2)},${top.toFixed(2)}h.7v${height.toFixed(2)}h-.7Z`;
      });
      return{wicks,bodies};
    }
    function draw(renderer,index){
      const {wicks,bodies}=geometry(index%11),colors=['#62bca5','#dd7e8d'];
      svg.style.display=renderer==='svg'?'block':'none';canvas.style.display=renderer==='canvas'?'block':'none';
      if(renderer==='svg')svg.innerHTML=colors.map((color,i)=>`<path d="${wicks[i]}" fill="none" stroke="${color}"/><path d="${bodies[i]}" fill="${color}"/>`).join('');
      else{ctx.clearRect(0,0,W,H);for(let i=0;i<2;i++){ctx.strokeStyle=colors[i];ctx.stroke(new Path2D(wicks[i]));ctx.fillStyle=colors[i];ctx.fill(new Path2D(bodies[i]));}}
      const selected=bars[Math.floor(bars.length/2)];readout.textContent=`${selected.date} · O ${selected.open} H ${selected.high} L ${selected.low} C ${selected.close}`;
      return {bodyCount:bodies.reduce((n,path)=>n+(path.match(/Z/g)||[]).length,0),selected};
    }
    for(const side of ['svg','canvas']){draw(side,0);await frame();}
    const samples=[];
    for(let sample=0;sample<5;sample++)for(const side of ['svg','canvas']){
      const start=performance.now();let last;
      for(let i=0;i<10;i++){last=draw(side,i);await frame();}
      const durationMs=performance.now()-start;
      if(last.bodyCount!==bars.length)throw Error('Candle geometry lost observations');
      if(!readout.textContent.includes(String(bars[Math.floor(bars.length/2)].close)))throw Error('Selection value changed');
      let rendered=0;
      if(side==='svg'){rendered=svg.querySelectorAll('path').length;if(rendered!==4)throw Error('SVG paths missing');}
      else{const pixels=ctx.getImageData(0,0,W,H).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i])rendered++;if(!rendered)throw Error('Canvas did not draw');}
      samples.push({sample:sample+1,side,durationMs,frames:10,bodyCount:last.bodyCount,rendered});
    }
    draw('svg',0);canvas.style.display='none';await frame();
    return {samples,selected:bars[Math.floor(bars.length/2)],rows:bars.length};
  },bars);
  await page.screenshot({path:resolve(output,'svg-reference.png')});
  const stats=side=>{const values=report.samples.filter(s=>s.side===side).map(s=>s.durationMs).toSorted((a,b)=>a-b);return{medianMs:values[2],minMs:values[0],maxMs:values.at(-1)};};
  const result={status:'COMPLETE',adoption:'NOT_ADOPTED',reason:'This price-layer prototype cannot demonstrate full Atlas parity for research overlays, accessible interaction, annotation hit-testing, SVG export and standalone packaging. Frame-ready timings include vsync; they are not renderer-only CPU time or a full-engine comparison.',method:'Five alternating samples per renderer, ten changing views each; identical full saved OHLC geometry, selection readout and viewport, two RAFs per draw, outputs checked; desktop Chromium only. Warmups excluded.',sourceSha256:createHash('sha256').update(source).digest('hex'),source:snapshot.source,asOf:snapshot.asOf,browser:browser.version(),svg:stats('svg'),canvas:stats('canvas'),...report};
  await writeFile(resolve(output,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({adoption:result.adoption,rows:result.rows,svg:result.svg,canvas:result.canvas},null,2));
}finally{await browser.close();}
