import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWp6Report,wp6EvidenceSymbols,wp6EvidenceViewports } from '../scripts/verify-wp6-cloudflare.mjs';

const origin='https://bitcoin-cycle-atlas.twoimo.workers.dev',source='a'.repeat(40);
const fixture=phase=>({kind:'atlas-wp6-native-browser-evidence',qualifiesFullVerification:false,phase,origin,status:'PASS',failures:[],
  publicationBefore:{sourceCommit:source,sha256:'b'.repeat(64)},publicationAfter:{sourceCommit:source,sha256:'b'.repeat(64)},
  cases:wp6EvidenceViewports.flatMap(([width,height])=>wp6EvidenceSymbols.map(symbol=>{const id=symbol.toLowerCase()+'-'+width+'x'+height;return {symbol,width,height,id,contextId:id,status:'PASS',runtimeErrors:[],
    screenshots:[id+'-chart.png',...(symbol==='BTCUSD'?[id+'-replay.png']:[]),...(phase==='after'&&symbol==='TQQQ'?[id+'-statistics.png']:[])].map(file=>({file,bytes:1000,sha256:'c'.repeat(64)}))};}))});

test('WP6 evidence requires all30 cases and every requested screenshot, never partial success',()=>{
  const report=fixture('after'),options={phase:'after',origin,expectedSource:source};
  assert.equal(validateWp6Report(report,options).length,42);
  const missingCase=structuredClone(report);missingCase.cases.pop();assert.throws(()=>validateWp6Report(missingCase,options),/every instrument/);
  const missingImage=structuredClone(report);missingImage.cases[0].screenshots.pop();assert.throws(()=>validateWp6Report(missingImage,options),/Required screenshot missing/);
  const failed=structuredClone(report);failed.cases[3].status='FAIL';assert.throws(()=>validateWp6Report(failed,options),/failed/);
  const mixed=structuredClone(report);mixed.publicationAfter.sourceCommit='d'.repeat(40);assert.throws(()=>validateWp6Report(mixed,options),/Publication source changed/);
  const reused=structuredClone(report);reused.cases[1].contextId=reused.cases[0].contextId;assert.throws(()=>validateWp6Report(reused,options),/isolated browser state/);
});

test('before measurements remain distinct from exact-source after assertions',()=>{
  assert.equal(validateWp6Report(fixture('before'),{phase:'before',origin}).length,36);
  assert.throws(()=>validateWp6Report(fixture('after'),{phase:'after',origin}),/exact published source/);
  assert.throws(()=>validateWp6Report(fixture('after'),{phase:'after',origin,expectedSource:'e'.repeat(40)}));
  const report=fixture('before');report.cases[0].screenshots[0].file='../outside.png';assert.throws(()=>validateWp6Report(report,{phase:'before',origin}));
});
