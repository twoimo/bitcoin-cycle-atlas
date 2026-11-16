import assert from 'node:assert/strict';
import test from 'node:test';
import {volumeForecastSummaryMarkup} from '../dist/research-workbench.js';

test('volume summary describes a separate audit only when holdout observations are available',()=>{
  const forecast=holdout=>({
    status:'ready',
    summary:{
      source:'Bitstamp',lastDate:'2030-12-31',
      trainingStart:'2019-01-01',trainingEnd:'2023-01-31',trainingMonths:49,
      anchorDailyVolume:1500,centralMethod:'persistence',centralLabel:'최근 활동 유지',
      holdout,
    },
    annual:[{year:2030,volume:1500,lower:500,upper:3000}],
  });

  const unavailable=volumeForecastSummaryMarkup(forecast({
    available:false,months:0,startDate:null,endDate:null,
    selectedMetrics:{count:0,wapePct:null,maeRatioToPersistence:null},
  }));
  assert.doesNotMatch(unavailable,/감사했습니다|별도 감사 구간/);
  assert.match(unavailable,/별도 감사 결과가 충분하지 않습니다/);

  const available=volumeForecastSummaryMarkup(forecast({
    available:true,months:24,startDate:'2024-10-01',endDate:'2026-09-30',
    selectedMetrics:{count:24,wapePct:37.4,maeRatioToPersistence:1},
  }));
  assert.match(available,/별도 감사 구간/);
  assert.match(available,/2024-10-01–2026-09-30/);
  assert.match(available,/37\.4%/);
  assert.match(available,/1배/);
  assert.match(available,/마지막 24개월은 모형 선택과 분리해 감사했습니다/);
  assert.doesNotMatch(available,/별도 감사 결과가 충분하지 않습니다/);
});

test('unsupported future volume painting is disclosed without hiding or changing conditional table values',()=>{
  const forecast={status:'ready',renderStatus:'unsupported',summary:{source:'Bitstamp',lastDate:'2030-12-31',trainingStart:'2019-01-01',trainingEnd:'2023-01-31',trainingMonths:49,anchorDailyVolume:1500,centralMethod:'persistence'},annual:[{year:2030,volume:1500,lower:500,upper:3000}]};
  const original=structuredClone(forecast),markup=volumeForecastSummaryMarkup(forecast);
  assert.match(markup,/role="status"/);assert.match(markup,/미래 거래량 그래프를 지원하지 않습니다/);
  assert.match(markup,/아래 표에서 확인/);assert.match(markup,/<th scope="row">2030<\/th>/);
  assert.doesNotMatch(markup,/점선은|음영은/);assert.deepEqual(forecast,original);
  const unavailable=volumeForecastSummaryMarkup({status:'unavailable',renderStatus:'unsupported',reason:'no-observations'});
  assert.match(unavailable,/미래 거래량 그래프를 지원하지 않습니다/);assert.match(unavailable,/완료된 거래량 자료가 아직 없습니다/);
});

test('volume source footer does not promise an unsupported graph when volume is hidden or unready',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../dist/research-workbench.js',import.meta.url),'utf8');
  assert.match(source,/미래 거래량 가정은 수치·표로만 제공하며, 현재 차트 엔진에서는 미래 거래량 그래프를 지원하지 않습니다/);
  assert.doesNotMatch(source,/미래 모형은 실제 봉과 다른 점선·음영으로 표시합니다|미래 주간 점선/);
  assert.match(volumeForecastSummaryMarkup(null),/수치가 아직 준비되지 않았습니다/);
});
