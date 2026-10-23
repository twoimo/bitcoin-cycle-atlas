export const readerActions = ['RequestHistory', 'StartRefresh'];
// pstack colors a baseline failure green when the fix prevents it. Make that
// convention explicit; green does not mean the bad state remains reachable.
export const legend = {
  works: 'Valid state in both versions',
  wrong: 'Failure still possible after the fix',
  fixed: 'Pre-fix failure prevented by the fix',
};
export function state(v) {
  if (v.refreshDone && v.retryBlocked) return 'History blocked after refresh (before fix only)';
  if (v.active === 'refresh') return 'Refreshing recent candles';
  if (v.active === 'history') return 'Loading older candles';
  if (v.historyStatus === 'error') return 'Older candles failed; waiting to retry';
  if (v.refreshDone) return v.status === 'ready' ? 'Fresh candles; history can retry' : 'Saved candles; history can retry';
  return 'Candles displayed';
}
export function step(action) {
  return {
    RequestHistory: 'pan to an unloaded period',
    StartRefresh: 'tap refresh',
    HistorySuccess: 'older candles arrive',
    HistoryFailure: 'history request fails',
    RefreshSuccess: 'recent candles arrive',
    RefreshFailure: 'recent request fails; keep saved candles',
    CooldownElapsed: 'retry delay ends',
  }[action] ?? action;
}
export function cause() {
  return 'A failed refresh retains the previous history retry delay';
}
