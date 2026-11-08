import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {DEFAULT_CHART_SPAN} from '../dist/chart-presets.js';
import {isIntradayInterval} from '../dist/ohlc-data.js';
import {readIndicatorState,writeIndicatorState} from '../dist/indicator-state.js';
import {writeWorkspaceViewport} from '../dist/workspace-state.js';

// Execute the controller's actual URL writer with its real serializers. The
// document/history boundary is isolated; this is not browser-layout evidence.
const source=readFileSync(new URL('../dist/lab-view.js',import.meta.url),'utf8');
const writer=source.match(/^  function syncAtlasUrl\(\)\{[\s\S]*?^  \}/m)?.[0];
assert.ok(writer,'The native BTC controller must retain its URL writer');
function fixture(){
  const state={indicators:readIndicatorState('indicator-hide=volume&indicator-list=closed'),
    window:'history',magnet:'weak',scenario:'stress',frequency:'weekly',scale:'linear',
    atlasAlignment:'trough',atlasPeriod:'monthly',atlasMetric:'returnPct',atlasScope:'recent',atlasPhase:'macro',cryptoView:'timing',
    chartType:'candles',cycleCollapsed:true,cycleRelation:'bottom-cycle-top',unit:'usd',
    priceRange:{start:'2024-01-01',end:'2026-01-01'},marketRange:null,priceDomain:{min:10000,max:150000},invertScale:false,priceOnlyAuto:true};
  const location=new URL('https://example.test/bitcoin-cycle-atlas/'),document={body:{dataset:{}}},writes=[];
  const history={replaceState(_state,_title,destination){writes.push(destination);location.href=new URL(destination,location).href;}};
  const persist=vm.runInNewContext('('+writer+')',{state,location,document,history,URLSearchParams,
    writeIndicatorState,writeWorkspaceViewport,isIntradayInterval,DEFAULT_CHART_SPAN});
  return {state,location,document,writes,persist};
}

test('late BTC persistence cannot append its presentation state to a selected center URL',()=>{
  const f=fixture(),original=structuredClone(f.state);
  for(const [center,route]of [
    ['rsi','market-lab/charts/?symbol=TQQQ'],
    ['themes','market-lab/charts/?symbol=HYPE'],
    ['housing','market-lab/charts/?symbol=HOUSING-SEOUL&region=seoul'],
    ['market-us','market-lab/'],
  ]){
    f.document.body.dataset.centerTool=center;f.location.href='https://example.test/bitcoin-cycle-atlas/'+route;
    const selected=f.location.href;f.persist();f.persist();
    assert.equal(f.location.href,selected,center+' must own its exact route and query');
    assert.deepEqual(f.writes,[],'A hidden BTC paint must not replace active navigation history');
    assert.deepEqual(f.state,original,'Deferring URL writes must preserve the native BTC state');
  }
});

test('restoring native BTC resumes persistence of its original chart, indicator and viewport choices',()=>{
  const f=fixture();f.persist();const nativeUrl=f.location.href,original=structuredClone(f.state);
  assert.equal(f.location.searchParams.get('granularity'),'weekly');
  assert.equal(f.location.searchParams.get('axis'),'linear');
  assert.equal(f.location.searchParams.get('type'),'candles');
  assert.equal(f.location.searchParams.get('indicator-list'),'closed');
  assert.equal(f.location.searchParams.get('view-start'),'2024-01-01');
  assert.equal(f.location.searchParams.get('price-min'),'10000');
  f.document.body.dataset.centerTool='housing';
  f.location.href='https://example.test/bitcoin-cycle-atlas/market-lab/charts/?symbol=HOUSING-BUSAN&region=busan';
  f.persist();assert.equal(f.writes.length,1,'Only the initial native write may occur while the center owns navigation');
  delete f.document.body.dataset.centerTool;f.location.href=nativeUrl;f.persist();
  assert.equal(f.writes.length,2);assert.equal(f.location.href,nativeUrl);
  assert.deepEqual(f.state,original);
  f.state.scale='log';f.persist();assert.equal(f.location.searchParams.has('axis'),false,'Native controls remain live after ownership returns');
  assert.equal(f.location.searchParams.get('granularity'),'weekly');
  assert.equal(f.location.searchParams.has('symbol'),false);assert.equal(f.location.searchParams.has('region'),false);
});
