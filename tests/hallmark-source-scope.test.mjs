import test from 'node:test';
import assert from 'node:assert/strict';
import {countHallmarkSources,verifyHallmarkSourceScope,verifyHallmarkWorkspaceSourceScope,hallmarkAuditScope,hallmarkRequestPath} from '../scripts/hallmark-source-scope.mjs';

const baseline=['index.html','mobile-preview.html',...Array.from({length:24},(_,index)=>`styles/screen-${index}.css`),'app.js'];

test('Hallmark scope: added pages/styles remain in the full static scan without changing the pinned baseline',()=>{
  const current=[...baseline,'market-lab/app/index.html','market-lab/us/index.html','market-lab/app/assets/index-aLhLaYOa.css','market-lab/app/assets/index-DA-MnXHe.js'];
  const receipt=verifyHallmarkSourceScope(baseline,current);
  assert.deepEqual(receipt.baseline,{css:24,html:2});
  assert.deepEqual(receipt.current,{css:25,html:4});
  assert.equal(receipt.preservedBaselinePaths.length,26);
  assert.equal(countHallmarkSources(current).css+countHallmarkSources(current).html,29);
});

test('Hallmark scope: deleting either real baseline screen fails even with an unrelated same-count replacement',()=>{
  for(const missing of ['index.html','mobile-preview.html']){
    const current=baseline.filter(path=>path!==missing).concat('unrelated-screen.html');
    assert.deepEqual(countHallmarkSources(current),countHallmarkSources(baseline));
    assert.throws(()=>verifyHallmarkSourceScope(baseline,current),error=>error.message.includes(missing)&&error.message.includes('every baseline'));
  }
});

test('Hallmark scope: deleting a baseline stylesheet fails despite equal or greater aggregate coverage',()=>{
  for(const replacement of [['unrelated.css'],['unrelated.css','additional.css','added/index.html']]){
    const current=baseline.filter(path=>path!=='styles/screen-7.css').concat(replacement);
    assert.throws(()=>verifyHallmarkSourceScope(baseline,current),/styles\/screen-7\.css/);
  }
});

test('Hallmark scope: the fixed baseline still requires exactly 24 CSS and two HTML inputs',()=>{
  for(const changed of [baseline.slice(1),baseline.concat('extra.html'),baseline.concat('extra.css')]){
    assert.throws(()=>verifyHallmarkSourceScope(changed,changed),/Pinned baseline inventory changed/);
  }
});

test('Hallmark suites retain the original eight routes and add ten distinct real workspace destinations',()=>{
  const core=hallmarkAuditScope(),workspaces=hallmarkAuditScope('workspaces');
  assert.equal(core.baselineCommit,'0c1ed40e1b9b6c76f5621d087737dc57f174b51e');
  assert.deepEqual(core.routes.map(route=>route.name),['btc','eth','bmnr','mstr','data','evidence','compare','mobile-preview']);
  assert.deepEqual(core.routes.map(route=>route.path),['?symbol=BTCUSD&granularity=daily&type=line','?symbol=ETHUSD&granularity=daily&type=line','?symbol=BMNR&granularity=daily&type=line','?symbol=MSTR&granularity=daily&type=line','?page=data','?page=evidence','?page=compare&legacy=1','mobile-preview.html']);
  assert.equal(workspaces.baselineCommit,'3b6373906dbdd3ef321db31deaf8a8f785da61c3');
  assert.deepEqual(workspaces.routes.map(route=>route.name),['market-us','market-kr','scenario','cashflow','rsi','housing','themes','ipo','embedded-data','research']);
  assert.equal(new Set(workspaces.routes.map(route=>route.path)).size,10);
  assert.equal(workspaces.routes.find(route=>route.name==='housing').symbol,'HOUSING-SEOUL');
  assert.equal(workspaces.routes.find(route=>route.name==='themes').symbol,'HYPE');
  for(const invalid of ['all','workspace','__proto__','toString',''])assert.throws(()=>hallmarkAuditScope(invalid),/Unknown Hallmark audit suite/);
});

const workspaceBaseline=[
  'index.html','mobile-preview.html','market-lab/app/index.html','market-lab/index.html','market-lab/charts/index.html',
  ...['us','kr','scenario','cashflow','rsi','housing','themes'].map(page=>`market-lab/${page}/index.html`),
  ...Array.from({length:31},(_,index)=>`styles/workspace-${index}.css`),'market-lab/app/assets/index-before.css',
];

test('Workspace source scope preserves all stable owners while allowing content-hashed CSS to be rebuilt',()=>{
  const current=workspaceBaseline.filter(path=>!path.endsWith('index-before.css')).concat('market-lab/app/assets/index-after.css','additional.css');
  const receipt=verifyHallmarkWorkspaceSourceScope(workspaceBaseline,current);
  assert.deepEqual(receipt.baseline,{css:32,html:12});
  assert.equal(receipt.preservedBaselinePaths.length,43);
  assert.deepEqual(receipt.generatedStylesheets,{baseline:['market-lab/app/assets/index-before.css'],current:['market-lab/app/assets/index-after.css']});
});

test('Workspace source scope rejects lost entrypoints, stable CSS and compiled CSS despite equal counts',()=>{
  for(const missing of ['market-lab/index.html','market-lab/app/index.html','market-lab/charts/index.html','market-lab/themes/index.html','styles/workspace-30.css']){
    const current=workspaceBaseline.filter(path=>path!==missing).concat('unrelated'+(missing.endsWith('.css')?'.css':'.html'));
    assert.deepEqual(countHallmarkSources(current),countHallmarkSources(workspaceBaseline));
    assert.throws(()=>verifyHallmarkWorkspaceSourceScope(workspaceBaseline,current),error=>error.message.includes(missing));
  }
  const noBundle=workspaceBaseline.filter(path=>!path.endsWith('index-before.css')).concat('unrelated.css');
  assert.throws(()=>verifyHallmarkWorkspaceSourceScope(workspaceBaseline,noBundle),/compiled stylesheet/);
  for(const changed of [workspaceBaseline.slice(1),workspaceBaseline.concat('added.html'),workspaceBaseline.concat('added.css')]){
    assert.throws(()=>verifyHallmarkWorkspaceSourceScope(changed,changed),/Pinned workspace baseline inventory changed/);
  }
});

test('The audit server maps real Pages directory routes without an SPA fallback or project-root escape',()=>{
  const base='/bitcoin-cycle-atlas/';
  assert.equal(hallmarkRequestPath(base),'index.html');
  assert.equal(hallmarkRequestPath(base+'market-lab/'),'market-lab/index.html');
  assert.equal(hallmarkRequestPath(base+'market-lab/charts/'),'market-lab/charts/index.html');
  assert.equal(hallmarkRequestPath(base+'market-lab/app/'),'market-lab/app/index.html');
  assert.equal(hallmarkRequestPath(base+'market-lab/app/assets/index-a.js'),'market-lab/app/assets/index-a.js');
  assert.equal(hallmarkRequestPath(base+'missing.js'),'missing.js','A missing resource must keep its missing identity, never fall back to index.html');
  for(const path of ['/market-lab/','/bitcoin-cycle-atlas-extra/','/bitcoin-cycle-atlas/%2e%2e%2fsecret','/bitcoin-cycle-atlas/%2fetc/passwd','/bitcoin-cycle-atlas/%5csecret','/bitcoin-cycle-atlas/%00','/bitcoin-cycle-atlas/%zz']){
    assert.equal(hallmarkRequestPath(path),null,path);
  }
});
