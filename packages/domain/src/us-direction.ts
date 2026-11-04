import { diagnoseRegion } from './market-lab-math.js';
import type { MarketSnapshot } from '@atlas/contracts/market-lab';

export function spxDirection(snapshot: MarketSnapshot, now = new Date()) {
  const diagnosis = diagnoseRegion(snapshot, 'us', { now });
  const factors = diagnosis.axes.map(axis => ({ key: axis.key, z: axis.z, date: axis.date, status: axis.status }));
  const available = factors.every(axis => axis.status === 'ready' && axis.z !== null);
  const product = available ? factors.reduce((value, axis) => value * axis.z!, 1) : null;
  return {
    version: 'proxy-product-1' as const,
    direction: product === null || product === 0 ? null : product > 0 ? 'UP' as const : 'DOWN' as const,
    product, factors,
    reason: product === null ? '세 축의 정상 관측이 필요합니다.' : product === 0 ? '세 축의 곱이 0입니다.' : '',
    kind: 'proxy_model_direction' as const,
  };
}
