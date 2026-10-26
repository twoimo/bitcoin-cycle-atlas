export const readerActions = ['RequestHistory', 'StartRefresh'];
export const legend = {
  works: '정상 상태',
  wrong: '남은 오류',
  fixed: '수정으로 차단한 오류',
};
export function state(v) {
  if (v.refreshDone && v.retryBlocked) return '새로고침 후 재시도 막힘';
  if (v.active === 'refresh') return '최근 봉 새로고침';
  if (v.active === 'history') return '과거 봉 조회';
  if (v.historyStatus === 'error') return '실패 후 재시도 대기';
  if (v.refreshDone) return v.status === 'ready' ? '최신 봉 · 재시도 가능' : '저장 봉 · 재시도 가능';
  return '관측 캔들 표시';
}
export function step(action) {
  return {
    RequestHistory: '과거 기간 이동',
    StartRefresh: '수동 새로고침',
    HistorySuccess: '과거 봉 수신',
    HistoryFailure: '과거 조회 실패',
    RefreshSuccess: '최근 봉 수신',
    RefreshFailure: '최근 조회 실패',
    CooldownElapsed: '재시도 대기 종료',
  }[action] ?? action;
}
export function cause() {
  return '새로고침 실패가 이전 과거 조회의 재시도 대기를 유지함';
}
