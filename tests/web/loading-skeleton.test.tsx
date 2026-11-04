import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {setLoadingSurface,clearLoadingSurface,skeletonMarkup,replaceWithSkeleton} from '../../dist/loading-surfaces.js';
test('loading geometry contains no pretend data or active controls, and its status label is escaped',()=>{
  const {document}=parseHTML('<html><body>'+skeletonMarkup('rsi','<script>bad</script>')+'</body></html>');
  assert.equal(document.querySelectorAll('script,button,input,a,svg').length,0);
  assert.equal(document.querySelector('[role=status]')?.getAttribute('aria-busy'),'true');
  assert.equal(document.querySelector('.atlas-skeleton-paint')?.hasAttribute('inert'),true);
  assert.equal(document.querySelector('.atlas-skeleton-paint')?.getAttribute('aria-hidden'),'true');
  assert.equal(document.querySelectorAll('.atlas-skeleton-rsi-panels > [skullet-block]').length,2);
  assert.equal(document.querySelector('.atlas-loading-label')?.textContent,'<script>bad</script>');
});
test('pending -> error -> retry -> ready preserves original nodes and releases only its own loading surface',()=>{
  const {document,window}=parseHTML('<html><body><section id="target"><button>다시 조회</button><p>기존 결과</p></section></body></html>');
  const target=document.querySelector('#target')!,button=target.querySelector('button')!;let clicks=0;button.addEventListener('click',()=>clicks++);
  setLoadingSurface(target,true,{kind:'table'});const first=target.querySelector('.atlas-skeleton');assert(first);
  setLoadingSurface(target,true,{kind:'table'});assert.equal(target.querySelector('.atlas-skeleton'),first,'repeated busy paints do not restart the skeleton');
  clearLoadingSurface(target);assert.equal(target.querySelector('.atlas-skeleton'),null);assert.equal(target.querySelector('button'),button);
  target.querySelector('p')!.textContent='조회 실패';button.dispatchEvent(new window.Event('click'));assert.equal(clicks,1);
  setLoadingSurface(target,true,{kind:'table'});setLoadingSurface(target,false);assert.equal(target.classList.contains('atlas-has-skeleton'),false);
  assert.equal(target.querySelector('p')!.textContent,'조회 실패','clearing presentation never writes a success state');
  assert.equal(target.querySelector('button'),button);
});
test('a renderer replacing its body can clear a detached skeleton without erasing its error or retry action',()=>{
  const {document}=parseHTML('<html><body><section id="target"></section></body></html>'),target=document.querySelector('#target')!;
  replaceWithSkeleton(target,'detail');target.innerHTML='<p role="alert">오류</p><button>재시도</button>';clearLoadingSurface(target);
  assert.equal(target.querySelector('[role=alert]')?.textContent,'오류');assert(target.querySelector('button'));assert(!target.classList.contains('atlas-has-skeleton'));
});
