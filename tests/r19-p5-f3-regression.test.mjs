import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=async file=>readFile(new URL(`../dist/${file}`,import.meta.url),'utf8');

test('F3 page descriptions use readable body type and 1.4 line-height',async()=>{
  const source=await css('atlas-shell.css');
  assert.match(source,/\.atlas-page-description\{[^}]*font:12px\/1\.4 var\(--font\)/);
  assert.match(source,/\.atlas-page-description\{[^}]*word-break:keep-all/);
});
test('F3 small metadata is 11px; genuine chart axis remains explicitly 10px',async()=>{
  const [shell,cycles,lab,rsi]=await Promise.all(['atlas-shell.css','cycle-milestones.css','market-lab.css','ui/rsi-simulation.css'].map(css));
  assert.match(shell,/\.atlas-sidebar \.atlas-brand small\{[^}]*font-size:11px/);
  assert.match(shell,/\.rsi-crossing\{[^}]*font-size:10px/);
  assert.match(cycles,/\.cycle-interval-duration tspan\{font-size:11px!important\}/);
  assert.match(cycles,/\.cycle-marker-label[^}]*font-size:11px/);
  assert.match(lab,/\.ml-review\{[^}]*font-size:11px/);
  assert.doesNotMatch(rsi,/font-size:9px/);
  assert.doesNotMatch(rsi,/font-size:10px/);
});
test('Q-P1c-B-2 preserves badge text, Korean word boundaries and 12px floor',async()=>{
  const source=await css('conference/player.css');
  assert.match(source,/\.conference-page-status\{[^}]*font-size:max\(12px,var\(--type-meta\)\)/);
  assert.match(source,/\.conference-page-status\{[^}]*word-break:keep-all;overflow-wrap:break-word/);
  assert.doesNotMatch(source,/\.conference-page-status\{[^}]*overflow-wrap:anywhere/);
  assert.match(source,/\.conference-caption-text\{[^}]*word-break:keep-all;overflow-wrap:break-word/);
});
test('F3 stylesheet edits avoid broad universal typography reset',async()=>{
  const files=['atlas-shell.css','conference/player.css','cycle-milestones.css','chart-details-panel.css','compact-toolbar.css','monthly-backtest.css','ipo-view.css','editorial-system.css','market-lab.css','ui/rsi-simulation.css'];
  for(const file of files){const source=await css(file);assert.doesNotMatch(source,/(^|})\s*\*\s*\{\s*font-size\s*:/,`${file} contains a global font reset`);}
});
test('native F3 harness covers approved route/theme/viewport matrix and retains failure gates',async()=>{
  const source=await readFile(new URL('../scripts/verify-r19-p5-f3-browser.mjs',import.meta.url),'utf8');
  for(const width of ['320','390','768','1440'])assert.match(source,new RegExp(`\\b${width}\\b`));
  for(const theme of ['light','dark'])assert.match(source,new RegExp(`'${theme}'`));
  for(const surface of ['chart','relay','conference'])assert.match(source,new RegExp(`id:'${surface}'`));
  assert.match(source,/Horizontal overflow/);assert.match(source,/Q-P1c-B-2 badge typography\/wrap contract failed/);
  assert.match(source,/Visible keyboard focus ring not observed/);assert.match(source,/Axis label contrast below 4\.5:1/);
  assert.match(source,/performance:\{status:'not-run'/);
});
