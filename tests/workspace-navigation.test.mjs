import test from 'node:test';
import assert from 'node:assert/strict';
import {atlasPages,atlasNavigationPages,atlasNavigationId,atlasPageHref,canonicalDefaultChartEntry,isWorkspaceChart,labPageFromLocation} from '../dist/atlas-navigation.js';

test('visible navigation has one price chart while retaining every legacy route identity',()=>{
  assert.deepEqual(atlasNavigationPages.map(page=>page.id),['outlook','market-us','evidence','data','ipo','relay']);
  assert.equal(atlasNavigationPages.find(page=>page.id==='market-us').label,'시장 분석');
  assert.equal(atlasNavigationPages.find(page=>page.id==='outlook').label,'가격 차트');
  assert.deepEqual(atlasNavigationPages.map(page=>[page.id,page.label,page.view,atlasPageHref(page)]),[
    ['outlook','가격 차트','outlook','/'],
    ['market-us','시장 분석','market','/market-lab/'],
    ['evidence','리서치','evidence','/?page=evidence'],
    ['data','자산 비교','data','/?page=data'],
    ['ipo','공모주','ipo','/?page=ipo'],
    ['relay','릴레이 콘텐츠','relay','/?page=relay'],
  ]);
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
      assert.equal(url.searchParams.get('page'),null);
    } else {
      assert.equal(url.pathname,'/market-lab/charts/');
      assert.equal(labPageFromLocation(url).id,page);
      assert.equal(url.searchParams.get('region'),region||null);
    }
  }
  assert.equal(atlasPageHref('outlook',{symbol:'  ethusd  '}),'/?symbol=ETHUSD');
  assert.equal(atlasPageHref('outlook',{symbol:'https://evil.test/'}),'/');
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
  assert.equal(labPageFromLocation(new URL('https://example.com/market-lab/?region=kr')).id,'market-us');
  assert.equal(labPageFromLocation(new URL('https://example.com/market-lab/app/?embedded=1&lab-tab=diagnosis&lab-region=kr')).id,'market-us');
  assert.equal(labPageFromLocation(new URL('https://example.com/market-lab/app/?embedded=1&lab-tab=housing&region=seoul')).id,'housing');
  assert.equal(atlasPageHref('housing',{symbol:'https://evil.test/',region:'../../'}),'/market-lab/charts/?symbol=HOUSING-BUSAN&region=busan');
});

test('the default chart drops only the redundant outlook parameter and stays on the same path',()=>{
  const at=href=>{const url=new URL(href,'https://atlas.example');return {protocol:url.protocol,pathname:url.pathname,search:url.search,hash:url.hash};};
  for(const [href,expected] of [
    ['/?page=outlook','/'],
    ['/?page=outlook&symbol=ETHUSD','/?symbol=ETHUSD'],
    ['/?page=outlook&center=data','/?center=data'],
    ['/bitcoin-cycle-atlas/?page=outlook&granularity=weekly#price','/bitcoin-cycle-atlas/?granularity=weekly#price'],
  ]){
    const entry=canonicalDefaultChartEntry(at(href));
    assert.equal(entry,expected,href);
    const target=new URL(entry,'https://atlas.example');
    assert.equal(target.origin,'https://atlas.example',href);
    assert.equal(target.pathname,new URL(href,'https://atlas.example').pathname,href);
    assert.equal(canonicalDefaultChartEntry(at(entry)),null,href+' cannot loop');
  }
  for(const href of [
    '/','/?symbol=ETHUSD','/?page=data','/?page=evidence','/?page=relay','/?center=data','/market-lab/?page=outlook',
  ]) assert.equal(canonicalDefaultChartEntry(new URL(href,'https://atlas.example')),null,href);
  assert.equal(canonicalDefaultChartEntry(new URL('file:///tmp/?page=outlook')),null);
  assert.equal(canonicalDefaultChartEntry(new URL('https://atlas.example//foreign.example/?page=outlook')),null);
  assert.equal(canonicalDefaultChartEntry({protocol:'https:',pathname:'/../',search:'?page=outlook',hash:''}),null);
  assert.equal(canonicalDefaultChartEntry({protocol:'https:',pathname:'/./',search:'?page=outlook',hash:''}),null);
  const external=canonicalDefaultChartEntry(new URL('https://evil.example/?page=outlook'));
  assert.equal(external,'/');
  assert.equal(external.includes('evil.example'),false);
  assert.equal(canonicalDefaultChartEntry(at('/?page=https://evil.example')),null);
  assert.equal(atlasPageHref('missing'),'/');
  assert.equal(atlasPageHref('outlook',{symbol:'javascript:alert(1)'}),'/');
});
