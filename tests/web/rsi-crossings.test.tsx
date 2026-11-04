import test from 'node:test';
import assert from 'node:assert/strict';
import { rsiCrossings } from '../../apps/web/src/rsi-crossings.js';
import { labPageFromLocation, atlasPages } from '../../dist/atlas-navigation.js';
const rows = (values: (number|null)[]) => values.map((rsi,i) => ({ date:`2026-01-${String(i+1).padStart(2,'0')}`, close:100, rsi, signal:null }));
test('Buy/Sell markers use observed directional crossings, equality once, and no invented position state', () => {
  const input=rows([50,33.5,33.5,29.5,29.5,40,43]);
  const events=rsiCrossings(input);
  assert.deepEqual(events.map(({side,level,date})=>({side,level,date})),[
    {side:'Buy',level:'33.5',date:'2026-01-02'}, {side:'Buy',level:'29.5',date:'2026-01-04'},
    {side:'Sell',level:'40',date:'2026-01-06'}, {side:'Sell',level:'43',date:'2026-01-07'},
  ]);
  assert.deepEqual(rsiCrossings(input.slice(0,5)),events.slice(0,2),'future rows cannot change earlier marks');
  assert.deepEqual(rsiCrossings(rows([50,20])).map(e=>e.level),['33.5 / 29.5']);
  assert.deepEqual(rsiCrossings(rows([null,20,null,45])),[],'missing RSI never manufactures a crossing');
});
test('sidebar tools have unique direct pages and old tab/region links select the same tool', () => {
  const tools=atlasPages.filter(p=>p.tab); assert.equal(new Set(tools.map(p=>p.href)).size,7);
  for(const page of tools) assert.equal(labPageFromLocation({pathname:page.href,search:''}).id,page.id);
  assert.equal(labPageFromLocation({pathname:'/market-lab/',search:'?lab-tab=diagnosis&lab-region=kr'}).id,'market-kr');
  assert.equal(labPageFromLocation({pathname:'/market-lab/',search:'?lab-tab=ai'}).id,'cashflow');
  assert.equal(labPageFromLocation({pathname:'/market-lab/',search:'?lab-tab=rsi'}).id,'rsi');
});
