import test from 'node:test';
import assert from 'node:assert/strict';
import {atlasPages,atlasNavigationPages,atlasNavigationId,atlasPageHref,labPageFromLocation} from '../dist/atlas-navigation.js';

test('visible navigation consolidates seven tools while retaining every legacy route identity',()=>{
  assert.deepEqual(atlasNavigationPages.map(page=>page.id),['outlook','market-us','rsi','evidence','data','ipo']);
  assert.equal(atlasNavigationPages.find(page=>page.id==='market-us').label,'시장 분석');
  assert.equal(atlasNavigationPages.find(page=>page.id==='rsi').label,'종목 차트');
  for(const page of atlasPages.filter(page=>page.tab)) {
    const old=labPageFromLocation(new URL('https://example.com/bitcoin-cycle-atlas'+page.href));
    assert.equal(old.id,page.id);
    const canonical=labPageFromLocation(new URL(atlasPageHref(page),'https://example.com'));
    assert.equal(canonical.id,page.id);
    assert(atlasNavigationPages.some(item=>item.id===atlasNavigationId(old)));
  }
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
