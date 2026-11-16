import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {conferenceReady} from '../scripts/verify-r19-p5-f2-browser.mjs';

const playerSelector='.conference-player[data-state="ready"]';
const page=({boot='ready',theme='dark',page='conference',player=true}={})=>({
  documentElement:{dataset:{boot,theme}},body:{dataset:{page}},
  querySelector:selector=>selector===playerSelector&&player?{}:null,
});
const ready=(document,theme='dark')=>runInNewContext(`(${conferenceReady})(${JSON.stringify(theme)})`,{document});

test('F2 keeps polling while a committed navigation has not parsed its root element',()=>{
  assert.equal(ready({documentElement:null,body:null,querySelector:()=>null}),false);
});
test('F2 is ready only for the requested theme once the conference player is ready',()=>{
  assert.equal(ready(page()),true);
  assert.equal(ready(page({boot:'loading'})),false);
  assert.equal(ready(page({theme:'light'})),false);
  assert.equal(ready(page({page:'outlook'})),false);
  assert.equal(ready(page({player:false})),false);
});
test('F2 stops on a product boot error',()=>{
  assert.throws(()=>ready(page({boot:'error'})),/Product boot error/);
});
