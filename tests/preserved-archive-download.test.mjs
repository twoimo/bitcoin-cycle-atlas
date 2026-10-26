import assert from 'node:assert/strict';
import test from 'node:test';
import {bindPreservedArchiveDownload} from '../dist/preserved-archive-download.js';

const cases=[
  {symbol:'ETHUSD',id:'embedded-eth-data',file:'eth-ohlc.json'},
  {symbol:'MSTR',id:'embedded-mstr-data',file:'mstr-ohlc.json'},
  {symbol:'BMNR',id:'embedded-bmnr-data',file:'bmnr-ohlc.json'},
];
function fixture(entry,{text=null,hasLink=true,failClick=false}={}){
  const state={created:[],urls:[],revoked:[],timers:[],downloads:[],lookups:[],replacement:null};
  const source=text===null?null:{textContent:text};
  const body={children:[],append(node){this.children.push(node);}};
  const doc={body,getElementById(id){state.lookups.push(id);return id===entry.id?source:null;}};
  doc.defaultView={Blob,URL:{
    createObjectURL(blob){const url='blob:test-'+(state.urls.length+1);state.urls.push({url,blob});return url;},
    revokeObjectURL(url){state.revoked.push(url);},
  },setTimeout(callback,delay){state.timers.push({callback,delay});return state.timers.length;}};
  doc.createElement=tag=>{
    const node={tagName:tag,dataset:{},removed:false,
      click(){
        if(this.onclick)return this.onclick();
        state.downloads.push({href:this.href,filename:this.download,attached:body.children.includes(this)});
        if(failClick)throw new Error('download blocked');
      },
      remove(){this.removed=true;body.children=body.children.filter(item=>item!==this);},
    };
    state.created.push(node);return node;
  };
  const link={href:'./data/'+entry.file,replaceWith(node){state.replacement=node;}};
  const root={ownerDocument:doc,querySelector(selector){return hasLink&&!state.replacement&&selector==='a[href="'+link.href+'"]'?link:null;}};
  return {root,doc,source,link,state};
}

test('online links and missing embedded/archive nodes remain untouched without allocating a download',()=>{
  for(const options of [{},{text:''},{text:'   '},{text:'{"kept":true}',hasLink:false}]){
    const f=fixture(cases[0],options);
    assert.equal(bindPreservedArchiveDownload(f.root,'ETHUSD'),null);
    assert.equal(f.link.href,'./data/eth-ohlc.json');
    assert.equal(f.state.replacement,null);assert.equal(f.state.created.length,0);
    assert.equal(f.state.urls.length,0);assert.equal(f.state.timers.length,0);
  }
  const f=fixture(cases[0]);delete f.doc.getElementById;
  assert.equal(bindPreservedArchiveDownload(f.root,'ETHUSD'),null);
});

for(const entry of cases)test(entry.symbol+' downloads its exact embedded text on demand and releases the URL later',async()=>{
  const raw='{\n  "archive":"'+entry.symbol+'", "note":"<source> & 한국어", "unused":null\n}\n';
  const f=fixture(entry,{text:raw});
  const button=bindPreservedArchiveDownload(f.root,entry.symbol);
  assert.equal(button,f.state.replacement);assert.equal(button.type,'button');
  assert.equal(button.textContent,'내장 일별 원자료(JSON) 저장');
  assert.equal(button.dataset.preservedArchive,entry.symbol);
  assert.deepEqual(f.state.lookups,[entry.id]);
  assert.equal(f.state.urls.length,0,'rendering information must not allocate a multi-megabyte Blob');
  assert.equal(bindPreservedArchiveDownload(f.root,entry.symbol),null,'do not bind a second download control');
  f.source.textContent='{"later":"different text"}';
  button.click();
  assert.equal(f.state.urls.length,1);
  assert.equal(await f.state.urls[0].blob.text(),raw,'download the preserved text captured by this control, without reparsing or reserializing');
  assert.equal(f.state.urls[0].blob.type,'application/json;charset=utf-8');
  assert.deepEqual(f.state.downloads,[{href:'blob:test-1',filename:entry.file,attached:true}]);
  assert.equal(f.doc.body.children.length,0,'remove the temporary download anchor');
  assert.deepEqual(f.state.revoked,[],'do not revoke before the browser can consume the download');
  assert.equal(f.state.timers.length,1);assert.equal(f.state.timers[0].delay,30000);
  f.state.timers[0].callback();assert.deepEqual(f.state.revoked,['blob:test-1']);
});

test('download failure still removes the temporary anchor and schedules URL release',()=>{
  const f=fixture(cases[1],{text:'{"preserved":true}',failClick:true});
  const button=bindPreservedArchiveDownload(f.root,'MSTR');
  assert.throws(()=>button.click(),/download blocked/);
  assert.equal(f.doc.body.children.length,0);assert.equal(f.state.timers.length,1);
  f.state.timers[0].callback();assert.deepEqual(f.state.revoked,['blob:test-1']);
});

test('archive IDs and output filenames cannot be supplied through an unsupported symbol',()=>{
  const f=fixture(cases[0],{text:'{"preserved":true}'});
  for(const symbol of ['ETHUSDT','../../outside','__proto__','constructor'])assert.throws(()=>bindPreservedArchiveDownload(f.root,symbol),/Unsupported preserved archive/);
  assert.equal(f.state.created.length,0);assert.equal(f.state.urls.length,0);assert.equal(f.state.lookups.length,0);
});
