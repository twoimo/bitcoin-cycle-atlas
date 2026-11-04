import { observationGate } from '@atlas/domain/market-lab';
import type { Market, MarketSnapshot } from '@atlas/contracts/market-lab';

export function marketGate(snapshot: MarketSnapshot | null, market: Market | undefined, now: Date) {
  const source = snapshot?.sources.find(source => source.id === market?.sourceId);
  const result = observationGate({ generatedAt: snapshot?.generatedAt, source, prices: market?.prices, now, timeZone: market?.timezone || source?.timezone });
  return market ? { ...result, reason: result.reason || '' } : { ok: false, reason: '출처가 연결되지 않았습니다.' };
}
export function rsiGate(snapshot: MarketSnapshot | null, market: Market | undefined, now: Date, symbol='TQQQ') {
  const gate = marketGate(snapshot, market, now);
  if (gate.ok) return gate;
  return { ok: false, reason: gate.reason.includes('미래') ? '미래 수집·생성 시각의 RSI는 현재 관측으로 표시하지 않습니다.'
    : gate.reason.includes('가격일') ? '미래 가격일의 RSI는 표시하지 않습니다.' : gate.reason.replace('출처가 연결되지 않았습니다.', `${symbol} 출처가 연결되지 않았습니다.`) };
}
