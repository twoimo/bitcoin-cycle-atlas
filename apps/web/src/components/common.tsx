import type { ReactNode } from 'react';
import { safeSourceUrl } from '@atlas/domain/market-lab';
import type { Source } from '@atlas/contracts/market-lab';

export const axes = [['alpha', 'α', '성장'], ['beta', 'β', '유동성'], ['gamma', 'γ', '심리']] as const;
export const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const fmt = (value: unknown, decimals = 2) => finite(value)
  ? new Intl.NumberFormat('ko-KR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(value) : '판단 유보';
export const errorText = (error: unknown) => error instanceof Error ? error.message : '자료를 읽지 못했습니다.';
export function Empty({ children }: { children: ReactNode }) {
  return <div className="ml-empty" role="status"><strong>관측 자료 없음</strong><p>{children}</p></div>;
}
export function PublicLink({ url, children }: { url: string; children: ReactNode }) {
  const safe = safeSourceUrl(url);
  return safe ? <a href={safe} target="_blank" rel="noopener noreferrer">{children} <span aria-hidden="true">↗</span></a>
    : <span>{children} · 유효한 공개 URL 없음</span>;
}
export function Original({ pages, children }: { pages: string; children: ReactNode }) {
  return <details className="ml-original"><summary>원문 정의 · {pages}</summary><p>{children}</p>
    <p className="ml-muted">개인 소장 원문 아카이브. 짧은 인용과 쪽수만 표시하며 원본 사진은 공개하지 않습니다.</p></details>;
}
export function sourceMeta(source?: Source) {
  return source ? `${source.label} · 단위 ${source.unit} · 최근 관측 ${source.lastObservation || '미확인'} · 수집 ${source.retrievedAt || '미확인'}`
    : '출처 연결 없음 · 판단 유보';
}
