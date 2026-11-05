import type { MarketSnapshot } from '@atlas/contracts/market-lab';
import type { Delivery } from './load-snapshot.js';

export type SnapshotState = {
  phase: 'loading' | 'loaded' | 'empty' | 'error';
  doc: MarketSnapshot | null;
  delivery: Delivery | null;
  error: string;
  retainedPrevious: boolean;
};
export type SnapshotAction = { type: 'loading' }
  | { type: 'received'; doc: MarketSnapshot; delivery: Delivery | null }
  | { type: 'failed'; error: string };
export const initialSnapshotState: SnapshotState = {
  phase: 'loading', doc: null, delivery: null, error: '', retainedPrevious: false,
};

export function snapshotReducer(previous: SnapshotState, action: SnapshotAction): SnapshotState {
  if (action.type === 'loading') return { ...previous, phase: 'loading', error: '' };
  if (action.type === 'failed') return { ...previous, phase: 'error', error: action.error, retainedPrevious: !!previous.doc };
  const retainedPrevious = action.delivery?.kind === 'saved' && !!previous.doc
    && Date.parse(previous.doc.generatedAt) > Date.parse(action.doc.generatedAt);
  const doc = retainedPrevious ? previous.doc! : action.doc;
  const delivery = retainedPrevious ? previous.delivery : action.delivery;
  const populated = doc.markets.some(market => market.prices.length)
    || Object.values(doc.regions).some(region => Object.values(region.axes).some(axis => axis.values.length));
  return { phase: populated ? 'loaded' : 'empty', doc, delivery, error: '', retainedPrevious };
}

export function snapshotNotice(state: SnapshotState): { text: string; retry: string } | null {
  if (state.retainedPrevious) return { text: '연결 실패 · 직전 자료 유지', retry: '다시 연결' };
  if (state.delivery?.kind !== 'saved') return null;
  return state.delivery.reason === 'static-hosting'
    ? { text: '저장 자료', retry: '다시 읽기' }
    : { text: '연결 실패 · 저장본 표시', retry: '다시 연결' };
}
