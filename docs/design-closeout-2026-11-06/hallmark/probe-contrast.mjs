// Diagnostic evidence only: temporary DOM fixtures with shipped CSS, not a gate.
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
const dist=resolve('dist'),prefix='/bitcoin-cycle-atlas/';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://127.0.0.1').pathname;if(!path.startsWith(prefix))throw Error();const file=resolve(dist,path.slice(prefix.length)||'index.html');if(!file.startsWith(dist+'/'))throw Error();res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const req=createRequire('/workspace/scratch/82e52cfd9693/hallmark-runtime/noop.js'),puppeteer=req('puppeteer-core');let browser;
try{
  browser=await puppeteer.launch({executablePath:'/workspace/scratch/82e52cfd9693/browser-native/chromium-audit-multiprocess',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();await page.setViewport({width:1440,height:900});
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}?page=compare&legacy=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),{timeout:10000});
  const result=await page.evaluate(()=>{
    const headings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(e=>e.textContent.trim());
    const sourceLinks=[...document.querySelectorAll('a[href]')].map(a=>a.href).filter(s=>s.includes('community-api.coinmetrics.io'));
    const d=document.createElement('dialog');d.innerHTML='<code>contrast sample</code><div class="method-formula">contrast sample</div>';document.body.append(d);d.showModal();
    const e=document.createElement('div');e.className='lab-error';e.textContent='contrast sample';document.body.append(e);
    const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
    const luminance=a=>a.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);
    const contrast=(a,b)=>{const x=luminance(rgb(a)),y=luminance(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
    const background=el=>{while(el){const c=getComputedStyle(el).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent')return c;el=el.parentElement}return 'rgb(255, 255, 255)'};
    const samples=[];
    for(const theme of ['dark','light']){document.documentElement.dataset.theme=theme;document.body.dataset.theme=theme;for(const [selector,el]of [['dialog code',d.querySelector('code')],['dialog .method-formula',d.querySelector('.method-formula')],['.lab-error',e]]){const cs=getComputedStyle(el),bg=background(el);samples.push({theme,selector,color:cs.color,background:bg,contrastRatio:contrast(cs.color,bg),fontSize:cs.fontSize,fixture:true})}}
    d.remove();e.remove();return {headings,sourceLinks,samples};
  });
  const receipt={sourceCommit:'027d84914a8fb0d1c4034eda70eec8a0c42dd22d',browserVersion:await browser.version(),notes:['Focused diagnostic only; does not replace Hallmark or native49.','Temporary fixtures use real shipped CSS under each active theme. No source/checker/font changes.','Background uses first opaque ancestor; sampled foregrounds are opaque.','Earlier diagnostic attempt waited for a BTC-only chart selector on comparison route and timed out; this probe correctly waits for shipped CSS. This was a probe error, not an app failure.'],...result};
  await writeFile(new URL('./advisory-probe.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({samples:result.samples},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
