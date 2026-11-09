import assert from 'node:assert/strict';
import test from 'node:test';
import {assertConsolidatedToolbarOwnership,consolidatedToolbarUsesDisclosure} from '../scripts/verify-consolidated-workspace-browser.mjs';

const measured=(top,height,extra={})=>({rect:{top,bottom:top+height,height},display:'flex',displayNoneOwner:null,visible:true,hidden:false,inert:false,disabled:false,...extra});
const hiddenFeature={tag:'DIV',id:null,className:'shell-instrument-slot',display:'none'};
function market(){
  return {twoRow:true,chartControls:null,center:'market-us',activeHost:'atlas-center-toolbar-lab',hostId:'atlas-center-toolbar-lab',
    hostInPanel:false,hostInHeader:true,header:measured(0,92),host:measured(45,44),
    feature:measured(0,0,{display:'none',displayNoneOwner:hiddenFeature,visible:false}),
    panel:measured(0,0,{visible:false,hidden:true}),
    toggle:measured(0,0,{displayNoneOwner:hiddenFeature,visible:false,label:'BTCUSD 종목 기능 더 보기'})};
}
function chart({open=false}={}){
  const result=market();result.chartControls='ready';result.center='rsi';result.hostInPanel=true;result.hostInHeader=false;
  result.feature=measured(45,44);result.toggle=measured(45,44,{label:'TQQQ 종목 기능 더 보기'});
  result.panel=measured(open?96:0,open?260:0,{visible:open,hidden:!open});
  result.host=measured(open?145:0,open?180:0,{visible:open,hidden:!open});
  return result;
}

test('a market center retains row two while CSS hides its BTC disclosure without hidden or inert attributes',()=>{
  const result=market();
  assert.equal(result.twoRow,true);
  assert.equal(result.feature.hidden,false);assert.equal(result.feature.inert,false);
  assert.equal(result.toggle.hidden,false);assert.equal(result.toggle.inert,false);assert.equal(result.toggle.disabled,false);
  assert.equal(consolidatedToolbarUsesDisclosure(result,'us'),false);
  assert.doesNotThrow(()=>assertConsolidatedToolbarOwnership(result,'us'));
});

test('an active mobile chart requires the native disclosure to open before its toolbar qualifies',()=>{
  const closed=chart();
  assert.equal(consolidatedToolbarUsesDisclosure(closed,'tqqq'),true);
  assert.throws(()=>assertConsolidatedToolbarOwnership(closed,'tqqq'),/active toolbar is visible and interactive/);
  assert.doesNotThrow(()=>assertConsolidatedToolbarOwnership(chart({open:true}),'tqqq'));
});

test('chart and nonchart toolbars cannot silently exchange disclosure ownership',()=>{
  const wrongMarket=market();wrongMarket.hostInPanel=true;
  assert.throws(()=>consolidatedToolbarUsesDisclosure(wrongMarket,'us'),/only the active chart toolbar/);
  const wrongChart=chart();wrongChart.hostInPanel=false;
  assert.throws(()=>consolidatedToolbarUsesDisclosure(wrongChart,'tqqq'),/only the active chart toolbar/);
});

test('a nonchart toolbar in the first row or taller than 44px is still rejected',()=>{
  const firstRow=market();firstRow.host=measured(1,44);
  assert.throws(()=>assertConsolidatedToolbarOwnership(firstRow,'us'),/second 44px row/);
  const oversized=market();oversized.host=measured(45,48);
  assert.throws(()=>assertConsolidatedToolbarOwnership(oversized,'us'),/second 44px row/);
});

test('the active direct toolbar cannot remain hidden, inert, or outside its header owner',()=>{
  const pending=market();pending.host.inert=true;
  assert.throws(()=>assertConsolidatedToolbarOwnership(pending,'us'),/active toolbar is visible and interactive/);
  const hidden=market();hidden.host.visible=false;
  assert.throws(()=>assertConsolidatedToolbarOwnership(hidden,'us'),/active toolbar is visible and interactive/);
  const detached=market();detached.hostInHeader=false;
  assert.throws(()=>assertConsolidatedToolbarOwnership(detached,'us'),/direct header child/);
});

test('a previous chart menu cannot be exposed or re-enabled to make the nonchart test pass',()=>{
  const open=market();open.panel={...open.panel,hidden:false,visible:true};
  assert.throws(()=>assertConsolidatedToolbarOwnership(open,'us'),/retained chart disclosure stays closed/);
  const exposed=market();exposed.feature={...exposed.feature,visible:true,inert:false};
  assert.throws(()=>assertConsolidatedToolbarOwnership(exposed,'us'),/previous chart feature controls remain hidden and protected/);
  const enabled=market();enabled.toggle={...enabled.toggle,inert:false,disabled:false,displayNoneOwner:null};
  assert.throws(()=>assertConsolidatedToolbarOwnership(enabled,'us'),/previous chart trigger remains hidden and protected/);
});

test('opacity-only invisibility cannot replace native display, hidden or inert protection',()=>{
  const result=market();result.feature.display='flex';result.feature.displayNoneOwner=null;
  assert.throws(()=>assertConsolidatedToolbarOwnership(result,'us'),/previous chart feature controls remain hidden and protected/);
});

test('an inactive iframe toolbar cannot supply the current workspace controls',()=>{
  const stale=market();stale.hostId='atlas-center-toolbar-data';
  assert.throws(()=>consolidatedToolbarUsesDisclosure(stale,'us'),/current iframe retains its actual toolbar owner/);
});

test('desktop chart toolbars retain direct ownership without requiring a mobile disclosure',()=>{
  const result=market();result.twoRow=false;result.chartControls='ready';result.center='rsi';result.header=measured(0,44);result.host=measured(0,44);
  result.feature=null;result.panel=null;result.toggle=null;
  assert.equal(consolidatedToolbarUsesDisclosure(result,'tqqq'),false);
  assert.doesNotThrow(()=>assertConsolidatedToolbarOwnership(result,'tqqq'));
});
