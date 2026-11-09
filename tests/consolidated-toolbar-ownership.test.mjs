import assert from 'node:assert/strict';
import test from 'node:test';
import {assertConsolidatedToolbarOwnership,consolidatedToolbarUsesDisclosure} from '../scripts/verify-consolidated-workspace-browser.mjs';

const measured=(top,height,extra={})=>({rect:{top,bottom:top+height,height},display:'flex',displayNoneOwner:null,visible:true,hidden:false,inert:false,disabled:false,...extra});
const hiddenFeature={tag:'DIV',id:null,className:'shell-instrument-slot',display:'none'};
function market(){
  return {oneRow:true,headerInset:0,chartControls:null,center:'market-us',activeHost:'atlas-center-toolbar-lab',hostId:'atlas-center-toolbar-lab',
    hostInPanel:false,hostInHeader:true,hostInFeature:false,header:measured(0,48),host:measured(0,48),
    feature:measured(0,0,{display:'none',displayNoneOwner:hiddenFeature,visible:false}),
    panel:measured(0,0,{visible:false,hidden:true}),
    toggle:measured(0,0,{displayNoneOwner:hiddenFeature,visible:false,label:'BTCUSD 간격과 종목 기능 더 보기'})};
}
function chart({open=false,inline=false}={}){
  const result=market();result.chartControls='ready';result.center='rsi';result.hostInPanel=!inline;result.hostInHeader=false;result.hostInFeature=true;
  result.feature=measured(2,44);result.toggle=measured(2,44,{label:'TQQQ 간격과 종목 기능 더 보기'});
  result.panel=measured(open?52:0,open?260:0,{visible:open,hidden:!open});
  result.host=inline?measured(2,44):measured(open?101:0,open?180:0,{visible:open,hidden:!open});
  return result;
}

test('a market center occupies one row while CSS protects its retained BTC controls',()=>{
  const result=market();
  assert.equal(result.feature.hidden,false);assert.equal(result.feature.inert,false);
  assert.equal(result.toggle.hidden,false);assert.equal(result.toggle.inert,false);assert.equal(result.toggle.disabled,false);
  assert.equal(consolidatedToolbarUsesDisclosure(result,'us'),false);
  assert.doesNotThrow(()=>assertConsolidatedToolbarOwnership(result,'us'));
});

test('an overflowed chart toolbar requires its actual disclosure to open at any viewport',()=>{
  const closed=chart();
  assert.equal(consolidatedToolbarUsesDisclosure(closed,'tqqq'),true);
  assert.throws(()=>assertConsolidatedToolbarOwnership(closed,'tqqq'),/active toolbar is visible and interactive/);
  assert.doesNotThrow(()=>assertConsolidatedToolbarOwnership(chart({open:true}),'tqqq'));
});

test('a chart toolbar with enough room retains its feature owner inline without a mandatory disclosure',()=>{
  const result=chart({inline:true});
  assert.equal(consolidatedToolbarUsesDisclosure(result,'tqqq'),false);
  assert.doesNotThrow(()=>assertConsolidatedToolbarOwnership(result,'tqqq'));
});

test('chart and nonchart toolbars cannot silently exchange their source owners',()=>{
  const wrongMarket=market();wrongMarket.hostInPanel=true;wrongMarket.hostInFeature=true;wrongMarket.hostInHeader=false;
  assert.throws(()=>consolidatedToolbarUsesDisclosure(wrongMarket,'us'),/nonchart toolbar remains a direct header child/);
  const wrongChart=chart({inline:true});wrongChart.hostInFeature=false;wrongChart.hostInHeader=true;
  assert.throws(()=>consolidatedToolbarUsesDisclosure(wrongChart,'tqqq'),/active chart toolbar retains its feature-slot owner/);
});

test('the 48px perimeter accepts its safe-area inset but rejects a second row and legacy 44px desktop cap',()=>{
  const safe=market();safe.headerInset=20;safe.header=measured(0,68);safe.host=measured(20,48);
  assert.doesNotThrow(()=>assertConsolidatedToolbarOwnership(safe,'us'));
  const twoRows=market();twoRows.header=measured(0,92);
  assert.throws(()=>assertConsolidatedToolbarOwnership(twoRows,'us'),/one 48px outer row/);
  const desktop=market();desktop.header=measured(0,44);
  assert.throws(()=>assertConsolidatedToolbarOwnership(desktop,'us'),/one 48px outer row/);
  const oldLayout=market();oldLayout.oneRow=false;
  assert.throws(()=>consolidatedToolbarUsesDisclosure(oldLayout,'us'),/current perimeter retains one row/);
});

test('inline toolbars below the header or taller than their single control row are rejected',()=>{
  const secondRow=market();secondRow.host=measured(45,44);
  assert.throws(()=>assertConsolidatedToolbarOwnership(secondRow,'us'),/one control row/);
  const oversized=chart({inline:true});oversized.host=measured(0,48);
  assert.throws(()=>assertConsolidatedToolbarOwnership(oversized,'tqqq'),/one control row/);
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
