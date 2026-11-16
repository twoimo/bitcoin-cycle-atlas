export const title = 'Equity chart readiness and request ownership';
export function state(v) {
  if (v.hiddenReady) return 'A hidden page announces readiness';
  if (v.staleWrite) return 'An old request or a destroyed chart changed the current chart';
  if (v.projection > 0 && v.projection !== v.prices) return 'Old forecast paired with new prices';
  if (v.rangeLost) return 'The forecast replaced the chosen date range';
  if ((v.painted > 0 || v.errorPainted) && !v.ready) return 'Usable chart remains behind loading shell';
  if (!v.attached) return 'Page suspended';
  if (v.chartError && v.ready) return 'Chart failure and retry button visible';
  if (v.projection > 0) return 'Observed chart and forecast ready';
  if (v.prices > 0 && v.ready) return v.forecastError ? 'Observed chart ready; forecast failed' : 'Observed chart ready; forecast pending';
  if (v.priceError && v.ready) return 'Price error and retry button visible';
  if (v.mounted) return 'Chart mounted; paint not confirmed';
  return v.loading ? 'Loading price archive' : 'Waiting for usable chart';
}
export function step(action) {
  return {
    Load: 'open or retry the chart', PricesArrive: 'stock prices arrive', PricesFail: 'stock price request fails',
    CoinArrives: 'coin archive arrives', CoinFails: 'coin archive fails', FirstPaint: 'first paint yield runs',
    SecondPaint: 'second paint yield runs', Project: 'compute the three forecasts', ProjectFails: 'forecast calculation rejects its inputs', Render: 'render the available chart',
    SkipRender: 'skip the frame while replay or a center tool is open', InitialFrame: 'initial loader finishes',
    PaintConfirmed: 'Funnest confirms the price pixels', PaintFails: 'Funnest reports that the chart did not paint',
    OrphanSettles: 'a destroyed chart reports late', RetryChart: 'retry after a chart failure',
    Hide: 'leave the page', Show: 'restore the page',
    Pan: 'go to a chosen date range', NativePan: 'pan or zoom on the chart', ChangeInterval: 'change daily or weekly display',
    Restore: 'undo, redo or reset the range', Obscure: 'open replay or a center tool', Reveal: 'close replay or the center tool',
  }[action] || action;
}
