import test from 'node:test';
import assert from 'node:assert/strict';
import {atlasPages,atlasNavigationPages,atlasNavigationId,atlasPageHref,isWorkspaceChart,labPageFromLocation} from '../dist/atlas-navigation.js';

test('visible navigation has one price chart while retaining every legacy route identity',()=>{
  assert.deepEqual(atlasNavigationPages.map(page=>page.id),['outlook','market-us','evidence','data','ipo','relay']);
  assert.equal(atlasNavigationPages.find(page=>page.id==='market-us').label,'시장 분석');
  assert.equal(atlasNavigationPages.find(page=>page.id==='outlook').label,'가격 차트');
  for(const page of atlasPages.filter(page=>page.tab)) {
    const old=labPageFromLocation(new URL('https://example.com/bitcoin-cycle-atlas'+page.href));
    assert.equal(old.id,page.id);
    const canonical=labPageFromLocation(new URL(atlasPageHref(page),'https://example.com'));
    assert.equal(canonical.id,page.id);
    assert(atlasNavigationPages.some(item=>item.id===atlasNavigationId(old)));
  }
});

test('price-chart links retain all twelve instruments without changing their source route',()=>{
  for(const [symbol,page,region] of [
    ['BTCUSD','outlook'],['ETHUSD','outlook'],['MSTR','outlook'],['BMNR','outlook'],
    ['TQQQ','rsi'],['SOXL','rsi'],['233740','rsi'],['HYPE','themes'],
    ['HOUSING-BUSAN','housing','busan'],['HOUSING-SEOUL','housing','seoul'],
    ['HOUSING-GYEONGGI','housing','gyeonggi'],['HOUSING-NATIONAL','housing','national'],
  ]) {
    const url=new URL(atlasPageHref('outlook',{symbol}),'https://example.com');
    assert.equal(atlasNavigationId(page),'outlook',symbol);
    assert.equal(isWorkspaceChart(page),page!=='outlook',symbol);
    assert.equal(isWorkspaceChart(atlasPages.find(item=>item.id===page)),page!=='outlook',symbol);
    assert.equal(url.searchParams.get('symbol')||'BTCUSD',symbol);
    if(page==='outlook') {
      assert.equal(url.pathname,'/');
      assert.equal(url.searchParams.get('page'),'outlook');
    } else {
      assert.equal(url.pathname,'/market-lab/charts/');
      assert.equal(labPageFromLocation(url).id,page);
      assert.equal(url.searchParams.get('region'),region||null);
    }
  }
  assert.equal(atlasPageHref('outlook',{symbol:'  ethusd  '}),'/?page=outlook&symbol=ETHUSD');
  assert.equal(atlasPageHref('outlook',{symbol:'https://evil.test/'}),'/?page=outlook');
  assert.equal(isWorkspaceChart('market-us'),false);
  assert.equal(isWorkspaceChart(undefined),false);
});

test('canonical chart selection preserves exact instrument and housing region at project subpaths',()=>{
  for(const [id,symbol,region] of [['rsi','233740',undefined],['themes','HYPE',undefined],['housing','HOUSING-SEOUL','seoul']]) {
    const url=new URL('/bitcoin-cycle-atlas'+atlasPageHref(id,{symbol,region}),'https://example.com');
    assert.equal(url.pathname,'/bitcoin-cycle-atlas/market-lab/charts/');
    assert.equal(url.searchParams.get('symbol'),symbol);
    assert.equal(labPageFromLocation(url).id,id);
  }
  assert.equal(labPageFromLocation(new URL('https://example.com/market-lab/?region=kr')).id,'market-kr');
  assert.equal(labPageFromLocation(new URL('https://example.com/market-lab/app/?embedded=1&lab-tab=diagnosis&lab-region=kr')).id,'market-kr');
  assert.equal(labPageFromLocation(new URL('https://example.com/market-lab/app/?embedded=1&lab-tab=housing&region=seoul')).id,'housing');
  assert.equal(atlasPageHref('housing',{symbol:'https://evil.test/',region:'../../'}),'/market-lab/charts/?symbol=HOUSING-BUSAN&region=busan');
});
