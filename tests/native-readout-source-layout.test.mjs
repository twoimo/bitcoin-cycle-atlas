import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {parseHTML} from 'linkedom';

// Authored CSS allocation only. The original ETH native gate still owns the
// actual wrapped glyph boxes, OHLC pointer input and overlap measurements.
const {document}=parseHTML('<html><head></head><body><section class="eth-plot"><div class="eth-readout"></div><div class="eth-readout-source"></div><p class="eth-forecast-note"></p></section></body></html>');
const style=document.createElement('style');
style.textContent=readFileSync(new URL('../dist/eth-view.css',import.meta.url),'utf8');
document.head.append(style);

function mediaMatches(media,{width,height}) {
  return media.split(',').some(branch=>branch.trim().split(/\s+and\s+/).every(condition=>{
    const dimension=condition.match(/^\((min|max)-(width|height):\s*(\d+)px\)$/);
    if(dimension) {
      const actual=dimension[2]==='width'?width:height,limit=Number(dimension[3]);
      return dimension[1]==='min'?actual>=limit:actual<=limit;
    }
    if(condition==='(pointer:coarse)')return false;
    throw new Error('Unmodelled CSS media condition: '+condition);
  }));
}
function declarations(node,size,rules=[...style.sheet.cssRules]) {
  const result={};
  for(const rule of rules) {
    if(rule.type===4) {
      if(mediaMatches(rule.media.mediaText,size))Object.assign(result,declarations(node,size,[...rule.cssRules]));
    } else if(rule.selectorText&&!rule.selectorText.includes('::')) {
      const values={};
      for(const property of ['top','font-size','line-height']) {
        const value=rule.style.getPropertyValue(property);
        if(value)values[property]=Number.parseFloat(value);
      }
      // Focus/hover paint has no role in this offset allocation proof.
      if(Object.keys(values).length&&node.matches(rule.selectorText))Object.assign(result,values);
    }
  }
  return result;
}
function layout(width,height) {
  const size={width,height};
  return Object.fromEntries(['readout','readout-source','forecast-note'].map(name=>[name,declarations(document.querySelector('.eth-'+name),size)]));
}

for(const [width,height] of [[320,900],[390,900],[620,900],[320,360],[390,420],[620,390]]) {
  test(`the source and following note clear a full two-line readout at ${width}×${height}`,()=>{
    const slots=layout(width,height),readout=slots.readout,source=slots['readout-source'],note=slots['forecast-note'];
    // 44 is the unchanged native readout height ceiling, not a measured box.
    assert.ok(source.top>=readout.top+44+1,'source must follow the entire two-line budget plus a visible gap');
    assert.ok(note.top>=source.top+source['font-size']*source['line-height']+4,'the following note must clear the complete source line');
  });
}

test('wide one-line and landscape allocation remains unchanged',()=>{
  for(const [width,height] of [[900,430],[1440,900]]) {
    const slots=layout(width,height);
    assert.equal(slots.readout.top,9);
    assert.equal(slots['readout-source'].top,31);
    assert.equal(slots['forecast-note'].top,54);
  }
  const landscape=layout(900,390);
  assert.equal(landscape.readout.top,3);
  assert.equal(landscape['readout-source'].top,24);
  assert.equal(landscape['forecast-note'].top,42);
});
