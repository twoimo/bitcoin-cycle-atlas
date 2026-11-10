import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const bottom=await readFile(new URL('../dist/chart-bottom-bar.css',import.meta.url),'utf8');
const shell=await readFile(new URL('../dist/atlas-shell.css',import.meta.url),'utf8');
const styles=await readFile(new URL('../dist/styles.css',import.meta.url),'utf8');
const mobile=bottom.slice(bottom.indexOf('@media(max-width:620px){'));
function rule(css,selector){const i=css.indexOf(selector+'{');assert.notEqual(i,-1,'missing rule '+selector);const end=css.indexOf('}',i);return Object.fromEntries(css.slice(i+selector.length+1,end).split(';').filter(Boolean).map(item=>{const p=item.indexOf(':');return [item.slice(0,p).trim(),item.slice(p+1).trim()];}));}
test('mobile footer gives controls 44px without enlarging the fixed outer row',()=>{
  assert.equal(rule(mobile,'.has-chart-bottom-bar')['--chart-bottom-height'],'calc(44px + var(--mobile-bottom,0px))');
  const outer=rule(mobile,'.workbench-bottom.workbench-bottom-bar');assert.equal(outer.padding,'0 4px var(--mobile-bottom,0px)');assert.equal(outer.border,'0');
  assert.equal(rule(mobile,'.workbench-bottom-scroll').height,'44px');
  const nav=rule(mobile,'.workbench-bottom-bar #workbench-go-date,.workbench-bottom-bar .workbench-bottom-more');for(const key of ['height','min-height','width','min-width'])assert.equal(nav[key],'44px');
  const axis=rule(mobile,'.workbench-bottom-bar .workbench-axis button');for(const key of ['height','min-height','min-width'])assert.equal(axis[key],'44px');
  assert.equal(rule(mobile,'.workbench-bottom-bar .workbench-range-select')['font-size'],'16px');
  assert.equal(rule(mobile,'.bottom-menu-action')['min-height'],'44px');
});
test('compare controls retain 44px targets after moving to the shared tablet heading',()=>{
  assert.match(styles,/@media\(max-width:1100px\),\(pointer:coarse\)\{\s*\/\* The original compare controls/);
  const target=rule(styles,'body[data-page=compare] :is(#compare-view,.atlas-canvas-heading) :is(button,select,input:not([type="range"]),summary)');
  assert.equal(target['min-width'],'var(--control-touch-size)');
  assert.equal(target['min-height'],'var(--control-touch-size)');
});
test('compare mobile return shares the toolbar instead of reserving a second row',()=>{
  assert.equal(rule(shell,'body[data-shell=chart][data-page=compare] .workspace.atlas-details-layout>#main')['padding-top'],'0');
  const home=rule(shell,'body[data-shell=chart][data-page=compare] .atlas-canvas-heading>.mobile-chart-home');assert.equal(home.position,'static');assert.equal(home.display,'flex!important');assert.equal(home.width,'44px');assert.equal(home.height,'44px');
});
