export const readerActions = ['Open', 'Refresh', 'ChangeInterval', 'Pan', 'NativePan', 'Hide', 'Show'];
export function state({ s }) {
  if (s.badReadiness) return 'Unpainted or empty chart announced ready';
  if (s.hiddenPublication) return 'Hidden page published updates';
  if (s.stalePublication) return 'Revoked request or replaced chart wrote current state';
  if (s.lostNavigation) return 'Refresh reset the chosen range';
  if (s.lostNative) return 'Refresh reset the window chosen on the chart';
  if (!s.attached) return 'Page suspended';
  if (!s.ready) return s.prices > 0 ? 'Prices waiting for a painted chart' : s.priceError ? 'Retry waiting for first display' : 'Loading shell';
  if (s.prices === 0) return s.priceError ? 'Retry available' : 'Loading after retry';
  if (s.chartError) return 'Chart failed with a retry';
  if (s.loading) return s.range === 'custom' ? 'Refreshing with a new range' : 'Refreshing observed prices';
  if (s.refreshError) return 'Observed chart with refresh error';
  return s.range === 'custom' ? 'Observed chart at chosen range' : 'Observed chart ready';
}
export function step(action) {
  return {
    Open: 'open ETH chart', Refresh: 'refresh or retry', ChangeInterval: 'change daily or weekly',
    ArchiveArrives: 'saved prices arrive', ArchiveFails: 'saved price request fails',
    LiveArrives: 'live prices arrive', LiveFails: 'live price request fails',
    Pan: 'choose a date range', NativePan: 'zoom or pan the chart itself',
    Render: 'render available content', InitialFrame: 'initial loader finishes',
    PaintConfirmed: 'chart confirms painted prices', PaintFailed: 'chart fails to paint',
    StalePaintFailed: 'replaced chart reports late', ViewportEcho: 'chart reports its own window',
    Hide: 'leave the page', Show: 'restore the page', Resize: 'layout notification',
  }[action] || action;
}
export function cause(_state, _facts, invariant) {
  return {
    ReadyHasUsableView: 'Readiness is announced before the chart confirms painted prices or records a retry error',
    NoHiddenPublication: 'An old frame, layout, paint or viewport callback publishes while the page is suspended',
    NoStalePublication: 'A late response or a replaced chart publishes without checking current ownership',
    NavigationSurvivesRefresh: 'A live response resets a date range the user selected while waiting',
    NativeNavigationSurvivesRefresh: 'A live response resets a window the user chose on the chart while waiting',
    ReadinessOnce: 'Readiness is emitted more than once for the same document',
  }[invariant] || invariant;
}
