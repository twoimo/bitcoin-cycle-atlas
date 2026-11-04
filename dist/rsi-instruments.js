export const RSI_INSTRUMENTS = Object.freeze([
  Object.freeze({ id:'tqqq', symbol:'TQQQ', product:'TQQQ', name:'ProShares UltraPro QQQ', koreanName:'삼플레 · 나스닥100 3배', source:'Nasdaq', description:'삼플레 RSI 나스닥 레버리지 ETF', base:'TQQQ', assetClass:'etf', currency:'USD', region:'us' }),
  Object.freeze({ id:'soxl', symbol:'SOXL', product:'SOXL', name:'Direxion Semiconductor Bull 3X', koreanName:'속쓸 · 반도체 3배', source:'NYSE Arca', description:'삼플레 RSI SOXL 속쓸 반도체 레버리지 ETF', base:'SOXL', assetClass:'etf', currency:'USD', region:'us' }),
  Object.freeze({ id:'kodex-kosdaq150', symbol:'233740', product:'233740.KS', name:'KODEX 코스닥150 레버리지', koreanName:'코스닥150 2배', source:'KRX', description:'삼플레 RSI 코덱스 국내 한국 코스닥 레버리지 ETF', base:'233740', assetClass:'etf', currency:'KRW', region:'kr' }),
]);
export const rsiInstrument = value => RSI_INSTRUMENTS.find(item => item.symbol === String(value).toUpperCase() || item.product === String(value).toUpperCase());
