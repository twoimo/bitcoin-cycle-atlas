// Comparison-owned URL state. The initial page load and history navigation use
// the same parser, so a Back/Forward restores exactly the fields this
// controller owns and never the fields another owner keeps (center, unit,
// viewport, indicators, and anything else it does not write).
const VIEWS = Object.freeze(['outlook', 'compare', 'evidence', 'data', 'ipo', 'market', 'relay', 'conference']);
const MODES = Object.freeze(['halving', 'bottom', 'top', 'breakout']);
const HORIZONS = Object.freeze(['365', '730', '1461', 'current', 'all']);
const BASELINES = Object.freeze(['previous', 'recent2', 'all3']);
const ANALYSIS = Object.freeze(['forecast', 'peak', 'timing']);
const ZONES = Object.freeze(['0.9', '0.93', '0.94', '0.95', '0.98']);
const SCENARIOS = Object.freeze(['bottom-holds', 'calendar-48m', 'calendar-minus-3m', 'calendar-minus-4m', 'calendar-minus-5m']);

// Every key this controller writes in persistUrl(). History restore only touches
// these; the shell, the atlas viewport and other owners keep their own fields.
export const COMPARISON_OWNED_KEYS = Object.freeze([
  'page', 'mode', 'compare-unit', 'scale', 'range', 'day', 'hide',
  'baseline', 'analysis', 'zone', 'future', 'scenario',
]);

const oneOf = (list, value, fallback) => list.includes(value) ? value : fallback;

export function parseComparisonUrl(search = '') {
  const params = new URLSearchParams(search);
  // Old comparison links used `unit`; new links keep the choice separate from
  // the atlas viewport, which can change while the comparison is hidden.
  const comparisonUnit = params.get('compare-unit') ?? (params.has('legacy') ? params.get('unit') : null);
  const day = params.get('day') ?? '';
  return {
    view: oneOf(VIEWS, params.get('page'), 'outlook'),
    mode: oneOf(MODES, params.get('mode'), 'halving'),
    unit: comparisonUnit === 'indexed' ? 'indexed' : 'rebased',
    scale: params.get('scale') === 'linear' ? 'linear' : 'log',
    horizon: oneOf(HORIZONS, params.get('range'), '1461'),
    cursor: /^\d{1,5}$/.test(day) ? Number(day) : null,
    hidden: (params.get('hide') ?? '').split(',').filter(Boolean),
    timingBaseline: oneOf(BASELINES, params.get('baseline'), 'recent2'),
    analysisView: oneOf(ANALYSIS, params.get('analysis'), 'forecast'),
    peakThreshold: ZONES.includes(params.get('zone')) ? Number(params.get('zone')) : .95,
    forecastView: params.get('future') === 'analogues' ? 'analogues' : 'macro',
    forecastScenario: oneOf(SCENARIOS, params.get('scenario'), 'bottom-holds'),
  };
}

// True when the parsed state would change what this controller renders. The
// hidden series set is compared by value, not identity.
export function comparisonUrlChanged(state, parsed) {
  if (!state || !parsed) return true;
  if (state.view !== parsed.view || state.mode !== parsed.mode || state.unit !== parsed.unit) return true;
  if (state.scale !== parsed.scale || state.horizon !== parsed.horizon || state.cursor !== parsed.cursor) return true;
  if (state.timingBaseline !== parsed.timingBaseline || state.analysisView !== parsed.analysisView) return true;
  if (state.peakThreshold !== parsed.peakThreshold || state.forecastView !== parsed.forecastView) return true;
  if (state.forecastScenario !== parsed.forecastScenario) return true;
  const current = state.hidden instanceof Set ? [...state.hidden] : (state.hidden || []);
  if (current.length !== parsed.hidden.length) return true;
  return parsed.hidden.some(id => !current.includes(id));
}
