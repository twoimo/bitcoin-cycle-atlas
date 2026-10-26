import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTreasuryForecast} from '../dist/treasury-model.js';

test('a cash deficit cannot sell ETH still assigned to staking', () => {
  const forecast=buildTreasuryForecast({symbol:'BMNR',scenario:'stress',endYear:2027,
    history:[{date:'2026-10-23',close:1}],coinAnchor:{date:'2026-10-23',price:2000},
    snapshot:{asOf:'2026-05-31',publishedAt:'2026-07-14',coin:'ETH',coinUnits:10,cashUsd:0,
      otherAssetsUsd:0,debtUsd:0,preferredUsd:0,otherLiabilitiesUsd:0,shares:100,
      sourceIds:['synthetic-liquidity-regression'],notes:[]}});
  const point=forecast.path[1];
  assert.ok(point.components.coinUnits>=8,'the 80% staking assumption leaves locked units instead of inventing immediate sale proceeds');
  assert.ok(point.components.otherLiabilitiesUsd>0,'unpaid cash obligations remain visible');
});
