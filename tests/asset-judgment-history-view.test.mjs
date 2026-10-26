import test from 'node:test';import assert from 'node:assert/strict';
import{createAssetJudgmentHistory}from'../dist/asset-judgment-history.js';
import{clippedHistoryRuns,historyGradient,reconstructedHistoryCsv}from'../dist/asset-judgment-history-view.js';
const fixture=()=>({version:1,retrievedAt:'2026-01-05T00:00:00Z',assets:[{symbol:'TEST',name:'=SUM(1,2)',group:'위험 자산',category:'테스트',currency:'USD',prices:[['2025-01-02',100],['2025-01-03',150],['2026-01-02',100]],meta:{calendar:'sessions',adjustment:'split-adjusted-close'}}]});
test('timeline clips dates without changing judgment identity or emitting untrusted CSS',()=>{const input=[{start:'2025-01-01',end:'2025-06-30',id:'buy',label:'분할 매수'},{start:'2025-07-01',end:'2025-12-31',id:'neutral',label:'중립'}],before=JSON.stringify(input);const clipped=clippedHistoryRuns(input,'2025-06-01','2025-08-01');assert.deepEqual(clipped.map(x=>[x.start,x.end]),[['2025-06-01','2025-06-30'],['2025-07-01','2025-08-01']]);assert.equal(JSON.stringify(input),before);const style=historyGradient(clipped,'2025-06-01','2025-08-01');assert.match(style,/linear-gradient\(to right, #3b9278 0\.00000%/);assert.doesNotMatch(historyGradient([{start:'2025-01-01',end:'2025-01-01',id:'url(javascript:alert(1))'}],'2025-01-01','2025-01-01'),/javascript|url\(/);});
test('daily CSV preserves every calendar day, original observation date, kind/source version and formula safety',async()=>{const index=createAssetJudgmentHistory(fixture(),{endDate:'2026-01-05',sourceVersion:'a'.repeat(64)}),csv=await reconstructedHistoryCsv(index,{symbol:'TEST',startDate:'2026-01-02',endDate:'2026-01-05'}),lines=csv.trimEnd().split('\r\n');assert.equal(lines.length,5);assert.match(lines[0],/kind,source_version,as_of_utc,observation_date/);assert.match(lines[1],/reconstructed,a{64},2026-01-02,2026-01-02/);assert.match(lines.at(-1),/2026-01-05,2026-01-02/);assert.match(csv,/'=SUM\(1,2\)/);assert.match(csv,/判|판단 보류/);});
test('export rejects invalid scope or abort without returning a partial success-shaped CSV',async()=>{const index=createAssetJudgmentHistory(fixture(),{endDate:'2026-01-05'});await assert.rejects(reconstructedHistoryCsv(index,{symbol:'MISSING',startDate:'2026-01-01',endDate:'2026-01-05'}));const signal=AbortSignal.abort();await assert.rejects(reconstructedHistoryCsv(index,{symbol:'TEST',startDate:'2026-01-01',endDate:'2026-01-05',signal}),{name:'AbortError'});});

import{readFile}from'node:fs/promises';
import{initAssetJudgmentHistoryView}from'../dist/asset-judgment-history-view.js';
function dialogFixture(){
 const nodes=new Map(),buttons=[],listeners=new Map(),closes=[];const node=(id='',dataset={})=>({id,dataset,innerHTML:'',textContent:'',value:'',hidden:false,disabled:false,attrs:new Map(),setAttribute(k,v){this.attrs.set(k,v);},focus(){},closest(){return this;}});
 const root={open:false,set innerHTML(value){this.html=value;for(const m of value.matchAll(/id="([^"]+)"/g))nodes.set(m[1],node(m[1]));for(const m of value.matchAll(/<button\b([^>]*)>/g)){const dataset={};for(const a of m[1].matchAll(/data-([\w-]+)="([^"]*)"/g))dataset[a[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=a[2];buttons.push(node('',dataset));}},querySelector(s){const id=s.slice(1);if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);},querySelectorAll(s){const key=s.slice(6,-1).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return buttons.filter(b=>Object.hasOwn(b.dataset,key));},showModal(){this.open=true;},close(){this.open=false;if(this.deferClose)closes.push(()=>listeners.get('close')?.({}));else listeners.get('close')?.({});},addEventListener(k,v){listeners.set(k,v);},removeEventListener(k){listeners.delete(k);}};
 return{root,flushClose:()=>{while(closes.length)closes.shift()();},get:id=>root.querySelector('#'+id),click:(id,dataset={})=>listeners.get('click')?.({target:node(id,dataset)}),change:id=>listeners.get('change')?.({target:root.querySelector('#'+id)})};
}
test('saved reopen keeps its own disclosure; explicit symbol navigation resets incompatible mode/group/date',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../dist/data/judgment-snapshots/index.json',import.meta.url),'utf8')),entry=manifest.records[0];assert.ok(entry,'a genuine initial capture must exist');
 const record=JSON.parse(await readFile(new URL('../dist/data/judgment-snapshots/'+entry.file,import.meta.url),'utf8')),bundle=fixture();bundle.assets=[{...bundle.assets[0],symbol:'BTC',name:'Bitcoin'},{...bundle.assets[0],symbol:'IEF',name:'미국 중기채권',group:'안전 자산'}];
 let deferredList=null,resolveList=null;
 const ui=dialogFixture(),downloads=[],view=initAssetJudgmentHistoryView({root:ui.root,download:(name,blob)=>downloads.push({name,blob}),savedLoader:{list:async()=>deferredList?await new Promise(r=>{resolveList=r;}):manifest,load:async()=>record}}),input={bundle,asOfDate:'2026-01-05'};
 const settle=async()=>{for(let i=0;i<100&&!ui.get('history-detail').innerHTML.includes('저장된 판단');i++)await new Promise(r=>setTimeout(r,0));assert.match(ui.get('history-detail').innerHTML,/저장된 판단/);};
 try{
  await view.open(input);ui.get('history-date').value='2025-07-01';ui.change('history-date');ui.click('',{historyGroup:'위험 자산'});ui.click('',{historyMode:'saved'});await settle();assert.match(ui.get('history-detail').innerHTML,/원자료 수집/);assert.match(ui.get('history-detail').innerHTML,/저장 기록 18개 CSV/);
  ui.click('history-export');assert.equal(downloads.length,1);assert.equal((await downloads[0].blob.text()).trimEnd().split('\r\n').length,19);
  ui.root.deferClose=true;ui.root.close();deferredList=true;const reopening=view.open(input);ui.flushClose();resolveList(manifest);await reopening;deferredList=false;assert.match(ui.get('history-disclosure').textContent,/^실제로 저장한 계산 결과/);assert.match(ui.get('history-detail').innerHTML,/원자료 수집/);
  ui.root.close();await view.open({...input,symbol:'IEF'});assert.match(ui.get('history-disclosure').textContent,/현재 보관 원자료/);assert.match(ui.get('history-detail').innerHTML,/미국 중기채권/);assert.match(ui.get('history-detail').innerHTML,/IEF/);assert.equal(ui.get('history-date').value,'2026-01-05');assert.match(ui.get('history-body').innerHTML,/data-history-asset="IEF" aria-pressed="true"/);
 }finally{view.destroy();}
});

test('history reading hierarchy groups date navigation and labels financial values',async()=>{
 const source=await readFile(new URL('../dist/asset-judgment-history-view.js',import.meta.url),'utf8');
 const css=await readFile(new URL('../dist/daily-data.css',import.meta.url),'utf8');
 assert.match(source,/<div class="asset-history-date-control"><label>판단 기준일/);
 assert.match(source,/<dt>연초→최고 종가 평균 상승률<\/dt>/);
 assert.match(source,/<dt>연초→최저 종가 평균 하락률<\/dt>/);
 assert.match(source,/class="asset-history-saved-return"[^>]*><small>연초 대비<\/small>/);
 assert.match(css,/\.asset-history-dialog input:focus-visible/);
 assert.match(css,/\.asset-history-saved-return small \{ display: block/);
});
