import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const chrome=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('real Chromium preserves painted Funnest canvas pixels and geometry, and rejects empty/tainted canvases',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'atlas-export-canvas-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const module=pathToFileURL(join(process.cwd(),'dist/chart-export.js')).href;
  const html=`<!doctype html><meta charset="utf-8"><style>#host{position:relative;width:400px;height:200px}canvas,svg{position:absolute;inset:0;width:400px;height:200px}svg{pointer-events:none}</style><div id="host"><canvas id="plot" width="800" height="400"></canvas><svg id="overlay" viewBox="0 0 400 200"><text x="10" y="20">Atlas overlay</text></svg></div><pre id="result">pending</pre><script type="module">import{createChartSvgExport}from ${JSON.stringify(module)};const c=document.querySelector('#plot'),s=document.querySelector('#overlay'),ctx=c.getContext('2d');ctx.fillStyle='#111';ctx.fillRect(0,0,800,400);ctx.strokeStyle='#f00';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(20,300);ctx.lineTo(400,30);ctx.stroke();let result={};try{const out=createChartSvgExport(s,{canvas:c,title:'BTCUSD',source:'Coin Metrics'});result.svg=out;result.image=(out.match(/<image\\b[^>]*>/)||[])[0];result.ok=Boolean(result.image&&out.includes('data:image/png;base64,')&&out.includes('Atlas overlay')&&out.includes('Coin Metrics'));result.bounds=result.image?.match(/x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/u)?.slice(1).map(Number);const empty=document.createElement('canvas');empty.width=10;empty.height=10;empty.style.cssText='position:absolute;inset:0;width:400px;height:200px';document.querySelector('#host').append(empty);try{createChartSvgExport(s,{canvas:empty});result.emptyRejected=false}catch(e){result.emptyRejected=/Funnest 차트 캔버스가 아직 그려지지 않았습니다/.test(e.message)}const blocked=c.toDataURL;c.toDataURL=()=>{throw Error('SecurityError')};try{createChartSvgExport(s,{canvas:c});result.taintRejected=false}catch(e){result.taintRejected=/PNG로 읽을 수 없습니다/.test(e.message)}c.toDataURL=blocked;}catch(e){result.error=e.stack}document.querySelector('#result').textContent=JSON.stringify(result);document.title=JSON.stringify({ok:result.ok,bounds:result.bounds,empty:result.emptyRejected,taint:result.taintRejected});</script>`;
  const file=join(dir,'fixture.html');await writeFile(file,html);
  const run=spawnSync(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--allow-file-access-from-files','--dump-dom',pathToFileURL(file).href],{encoding:'utf8',timeout:30000});
  assert.equal(run.status,0,`Chromium failed: ${run.stderr}`);assert.match(run.stdout,/<title>\{"ok":true,"bounds":\[0,37,400,200\],"empty":true,"taint":true\}<\/title>/,run.stdout);assert.match(run.stdout,/"bounds":\[0,37,400,200\]/);
});
