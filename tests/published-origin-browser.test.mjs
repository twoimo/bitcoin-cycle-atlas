import assert from 'node:assert/strict';
import test from 'node:test';
import {publishedOriginCases,validatePage} from '../scripts/verify-published-origin-browser.mjs';

// Pure receipt validation only. These fixtures cannot claim a browser pass;
// the executable still requires a clean, exact-SHA Workers Build and manifest.
const origin='https://bitcoin-cycle-atlas.twoimo.workers.dev';
const box=(left,top,width,height,painted=true)=>({left,top,width,height,right:left+width,bottom:top+height,painted});
function fixture(symbol='ETHUSD',width=390,height=430,noticeHeight=0){
  const spec=publishedOriginCases.find(item=>item.symbol===symbol&&item.width===width&&item.height===height);
  assert.ok(spec);
  const desktop=width>620,left=desktop?52:0,right=desktop?45:0,top=desktop?38:48,bottom=38;
  const allocation=box(left,top+noticeHeight,width-left-right,height-top-bottom-noticeHeight);
  const state={url:spec.url,origin,boot:'ready',bootHidden:true,blockedContent:false,symbol:spec.center?'BTCUSD':symbol,
    shell:'chart',page:'outlook',center:spec.center||null,controls:spec.center?'ready':null,frameCount:spec.center?1:0,
    frame:spec.center?{url:origin+'/market-lab/embed.html',source:origin+'/market-lab/embed.html',box:allocation,
      width:allocation.width,height:allocation.height,documentWidth:allocation.width}:null,
    rangeLabel:symbol+' / USD / 1D',nativeActions:[],
    priceDestinations:[{tag:'BUTTON',current:'page',disabled:false}],priceLinks:[],
    width,height,rootWidth:width,bodyWidth:width,primaryCount:1,
    chart:{id:spec.id||'',ownerSymbol:spec.center?symbol:undefined,
      dataset:{product:spec.product,interval:'daily',chartType:'line',plotLeft:'10',plotRight:String(allocation.width-60),
        plotTop:'20',priceBottom:String(allocation.height-40),timeAxisTop:String(allocation.height-32)},
      box:allocation,allocation,renderAllocation:allocation,viewBox:`0 0 ${allocation.width} ${allocation.height}`,
      observedCount:50,pathCount:3,invalidPath:false,candleCount:0,invalidCandle:false},
    ownerCounts:{'.atlas-canvas-heading':1,'.workbench-tools':1,'.workbench-rail':1,'.workbench-bottom-bar':1},
    nav:['outlook','market-us','evidence','data','ipo','relay'],top:box(left,0,width-left-right,top),bottom:box(left,height-bottom,width-left-right,bottom),
    refreshNotice:noticeHeight?box(left,top,width-left-right,noticeHeight):null,
    left:box(0,0,left,height,desktop),right:box(width-right,0,right,height,desktop),cspViolations:[]};
  return {spec,state};
}

test('receipt validation accepts native controllers and committed child charts in a short viewport',()=>{
  for(const symbol of ['BTCUSD','ETHUSD','MSTR','BMNR','TQQQ','HYPE','HOUSING-SEOUL']){
    const {state,spec}=fixture(symbol);assert.doesNotThrow(()=>validatePage(state,spec));
  }
});

test('receipt validation retains every original destination and requires relay last without duplicates',()=>{
  for(const nav of [
    ['outlook','market-us','evidence','data','ipo'],
    ['outlook','market-us','evidence','data','relay'],
    ['outlook','market-us','evidence','relay','data','ipo'],
    ['outlook','market-us','evidence','data','ipo','relay','relay'],
  ]){const {state,spec}=fixture();state.nav=nav;assert.throws(()=>validatePage(state,spec),assert.AssertionError);}
});

test('receipt validation rejects the wrong native controller, product, child owner and duplicate painted charts',()=>{
  for(const [symbol,mutate,reason]of [
    ['MSTR',state=>state.chart.id='eth-chart',/wrong controller/],
    ['MSTR',state=>state.chart.dataset.product='BMNR',/another instrument/],
    ['TQQQ',state=>state.chart.ownerSymbol='SOXL',/selected instrument/],
    ['TQQQ',state=>state.primaryCount=2,/Exactly one painted/],
    ['TQQQ',state=>state.frameCount=2,/strictly equal/],
    ['TQQQ',state=>state.frame.url='about:blank',/published origin/],
  ]){const {state,spec}=fixture(symbol);mutate(state);assert.throws(()=>validatePage(state,spec),reason);}
});

test('an observed candlestick chart needs finite candle geometry even without a line path',()=>{
  const {state,spec}=fixture('HYPE');state.chart.pathCount=0;state.chart.candleCount=50;
  assert.doesNotThrow(()=>validatePage(state,spec));
  state.chart.invalidCandle=true;assert.throws(()=>validatePage(state,spec),/finite and present/);
  state.chart.invalidCandle=false;state.chart.candleCount=0;assert.throws(()=>validatePage(state,spec),/finite and present/);
});

test('a short viewport preserves its disclosed source notice and fills the remaining price allocation',()=>{
  const {state,spec}=fixture('BTCUSD',390,430,53);
  assert.ok(state.chart.allocation.height<spec.height*.75,'the prior viewport percentage rejected a legitimate source notice');
  assert.doesNotThrow(()=>validatePage(state,spec));
  state.refreshNotice.bottom+=10;assert.throws(()=>validatePage(state,spec),/notice overlaps/);
  state.refreshNotice.bottom-=30;assert.throws(()=>validatePage(state,spec),/fill the remaining viewport/);
});

test('receipt validation rejects stale queries and lost instrument or region links',()=>{
  for(const [symbol,mutate,reason]of [
    ['TQQQ',state=>state.url+='&eth-span=all',/stale asset state/],
    ['TQQQ',state=>state.url+='&symbol=TQQQ',/unambiguous/],
    ['HOUSING-SEOUL',state=>state.url=state.url.replace('region=seoul','region=busan'),/stale asset state/],
    ['ETHUSD',state=>state.url=state.url.replace('axis=linear','axis=log'),/Presentation query changed/],
    ['TQQQ',state=>state.priceLinks=[origin+'/?page=outlook'],/lost the selected instrument/],
    ['HOUSING-SEOUL',state=>state.priceLinks=[state.url.replace('region=seoul','region=busan')],/lost the selected housing region/],
  ]){const {state,spec}=fixture(symbol);mutate(state);assert.throws(()=>validatePage(state,spec),reason);}
});

test('receipt validation rejects collapsed allocations, overlapping axes and changed perimeter widths',()=>{
  for(const [mutate,reason]of [
    [state=>state.chart.renderAllocation={...state.chart.renderAllocation,height:state.chart.box.height-24},/allocated height/],
    [state=>state.chart.dataset.timeAxisTop=String(state.chart.box.height+1),/axes must stay inside/],
    [state=>state.chart.dataset.priceBottom=String(state.chart.box.height-1),/axes must stay inside/],
    [state=>state.right={...state.right,width:90},/rail widths/],
    [state=>state.top={...state.top,height:88},/fixed-height row/],
  ]){const {state,spec}=fixture('MSTR',1440,900);mutate(state);assert.throws(()=>validatePage(state,spec),reason);}
});

test('receipt validation rejects exposed or enabled ancestor asset actions over an embedded chart',()=>{
  for(const action of [
    {id:'eth-history-trigger',hidden:false,disabled:true,painted:true},
    {action:'info',hidden:true,disabled:false,painted:false},
    {action:'research',hidden:false,disabled:false,painted:true},
  ]){const {state,spec}=fixture('TQQQ');state.nativeActions=[action];assert.throws(()=>validatePage(state,spec),/Ancestor native asset actions/);}
  const {state,spec}=fixture('TQQQ');state.nativeActions=[{id:'eth-history-trigger',hidden:true,disabled:true,painted:false}];
  assert.doesNotThrow(()=>validatePage(state,spec));
});
