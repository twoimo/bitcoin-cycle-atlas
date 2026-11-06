import { RSI_INSTRUMENTS } from './rsi-instruments.js';

// One catalog for the shell search and the embedded chart workspace. These are
// destinations with retained source data, not a promise of arbitrary ticker data.
export const WORKSPACE_INSTRUMENTS = Object.freeze([
  ...RSI_INSTRUMENTS.map(instrument => Object.freeze({ ...instrument, page:'rsi', group:'ETF' })),
  Object.freeze({ id:'hyperliquid', symbol:'HYPE', product:'HYPE/USDC', name:'Hyperliquid', koreanName:'하이퍼리퀴드', source:'Hyperliquid', description:'하이퍼리퀴드 HYPE USDC 현물 테마 재료 근거 판정', base:'HYPE', assetClass:'crypto', currency:'USDC', page:'themes', region:'global', group:'디지털 자산' }),
  ...[['busan','부산'],['seoul','서울'],['gyeonggi','경기'],['national','전국']].map(([region,label]) => Object.freeze({
    id:`housing-${region}`, symbol:`HOUSING-${region.toUpperCase()}`, product:`${label} 아파트`, name:`${label} 아파트 실거래가격지수`, koreanName:`${label} 아파트`, source:'한국부동산원', description:`부동산 주택 ${label} 아파트 매매 실거래가격지수 거래량 월별 ${region}`, base:label, assetClass:'housing', currency:'지수 · 건', page:'housing', region, group:'부동산',
  })),
]);

export function workspaceInstrument(value) {
  const key = String(value ?? '').normalize('NFKC').trim().toUpperCase();
  return WORKSPACE_INSTRUMENTS.find(instrument => instrument.symbol === key || instrument.product.toUpperCase() === key);
}

export function searchWorkspaceInstruments(query = '', group = 'all') {
  const terms = String(query).normalize('NFKC').toLocaleLowerCase('ko-KR').trim().split(/\s+/).filter(Boolean);
  return WORKSPACE_INSTRUMENTS.filter(instrument => (group === 'all' || instrument.group === group) && terms.every(term =>
    `${instrument.symbol} ${instrument.product} ${instrument.name} ${instrument.koreanName} ${instrument.source} ${instrument.description}`.normalize('NFKC').toLocaleLowerCase('ko-KR').includes(term)));
}
