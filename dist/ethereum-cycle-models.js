import { utcDay, dateFromDay, validateDataset } from './cycle-engine.js?v=1.29.0';
import { buildDetailedForecast, DETAILED_FORECAST_DEFAULTS } from './detailed-forecast.js?v=1.29.0';
import { calibrateCycleTiming, CYCLE_CALIBRATION_DEFAULTS } from './cycle-calibration.js?v=1.29.0';

/**
 * Experimental comparisons of deterministic log-anchor baselines.
 * The BTC candidate uses the actual BTC engine. The ETH candidate estimates
 * the same anchor equation from causal ETH reversal episodes, without halvings.
 * Neither candidate is a production forecast or a calibrated distribution.
 */
export const ETHEREUM_CYCLE_COMPARISON_POLICY = Object.freeze({
  version: 'eth-cycle-comparison-1',
  drawdownPct: CYCLE_CALIBRATION_DEFAULTS.drawdownPct,
  reversalPct: CYCLE_CALIBRATION_DEFAULTS.reversalPct,
  confirmationDays: CYCLE_CALIBRATION_DEFAULTS.confirmationDays,
  highZoneFraction: DETAILED_FORECAST_DEFAULTS.highZoneFraction,
  minimumCompletedPeakIntervals: 3,
  minimumGrowthTransitions: 2,
  btcInternalSampleCount: 16,
});

const median = values => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const logRatio = (a, b) => Math.log(a) - Math.log(b);
const view = row => ({ date: row.date, price: row.price });

function finitePrice(logPrice) {
  const price = Math.exp(logPrice);
  if (!Number.isFinite(price) || price <= 0) throw new RangeError('Cycle baseline price overflow or underflow');
  return price;
}

function prefix(input, asOf, asset) {
  if (!Array.isArray(input) || !input.length || input.length > 100000) throw new TypeError(asset + ' requires bounded daily observations');
  const included = [];
  for (const row of input) {
    const date = row?.date;
    utcDay(date);
    if (date > asOf) continue;
    const day = utcDay(date);
    if (row.epochDay !== undefined && row.epochDay !== day) throw new RangeError(asset + ' epochDay conflicts with date');
    included.push(row);
  }
  if (!included.length) throw new RangeError(asset + ' has no observations through asOf');
  const rows = validateDataset(included);
  if (rows.at(-1).date !== asOf) throw new RangeError(asset + ' requires an exact completed close at asOf');
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].epochDay !== rows[i - 1].epochDay + 1) throw new RangeError(asset + ' history contains missing days; no interpolation is applied');
  }
  return rows;
}

function unavailable(reason, training = null, assumptions = null) {
  return { status: 'unavailable', reason, predictions: [], training, assumptions,
    probability: null, calibrated: false, productionEligible: false };
}

function knownInputFailure(error) {
  if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
  return unavailable(error.message);
}

/** Threshold episodes become visible only on their later confirmation day.
 * Confirmed records are never revised. They are not final economic cycle turns.
 */
function confirmedTurns(rows) {
  const policy = ETHEREUM_CYCLE_COMPARISON_POLICY, turns = [];
  let mode = 'high', high = { ...rows[0], index: 0 }, low = null;
  let fallingLow = null, reboundHigh = null, run = 0;
  for (let index = 1; index < rows.length; index++) {
    const row = { ...rows[index], index };
    if (mode === 'high') {
      if (row.price > high.price) {
        high = row; fallingLow = null; run = 0;
      } else if (row.epochDay > high.epochDay) {
        if (!fallingLow || row.price < fallingLow.price) fallingLow = row;
        run = row.price <= high.price * (1 - policy.drawdownPct / 100) ? run + 1 : 0;
        if (run >= policy.confirmationDays) {
          turns.push({ type: 'high', ...view(high), epochDay: high.epochDay,
            knownAt: row.date, leftCensored: high.index === 0 });
          low = fallingLow; reboundHigh = row; run = 0; mode = 'low';
        }
      }
    } else {
      if (row.price < low.price) {
        low = row; reboundHigh = row; run = 0;
      } else {
        if (!reboundHigh || row.price > reboundHigh.price) reboundHigh = row;
        run = row.price >= low.price * (1 + policy.reversalPct / 100) ? run + 1 : 0;
        if (run >= policy.confirmationDays) {
          turns.push({ type: 'low', ...view(low), epochDay: low.epochDay,
            knownAt: row.date, leftCensored: false });
          high = reboundHigh; fallingLow = null; run = 0; mode = 'high';
        }
      }
    }
  }
  return turns;
}

function completedEpisodes(rows, turns) {
  const result = [];
  for (let index = 0; index + 2 < turns.length; index += 2) {
    const peak = turns[index], trough = turns[index + 1], nextPeak = turns[index + 2];
    if (peak.type !== 'high' || trough.type !== 'low' || nextPeak.type !== 'high' || peak.leftCensored) continue;
    const zoneEntry = rows.find(row => row.date > trough.date && row.date <= nextPeak.date
      && row.price >= ETHEREUM_CYCLE_COMPARISON_POLICY.highZoneFraction * nextPeak.price);
    const periodDays = nextPeak.epochDay - peak.epochDay;
    const bearDays = trough.epochDay - peak.epochDay;
    if (!(periodDays > bearDays && bearDays > 0) || !zoneEntry) throw new RangeError('Invalid confirmed ETH episode ordering');
    result.push({
      peak, trough, nextPeak, knownAt: nextPeak.knownAt,
      periodDays, bearDays, riseDays: nextPeak.epochDay - trough.epochDay,
      logPeakGrowth: logRatio(nextPeak.price, peak.price),
      troughRetention: Math.exp(logRatio(trough.price, peak.price)),
      zoneLeadDays: nextPeak.epochDay - zoneEntry.epochDay,
    });
  }
  return result;
}

function projectedPrices(anchors, asOf, horizons) {
  return horizons.map(horizonDays => {
    const day = utcDay(asOf) + horizonDays;
    const rightIndex = anchors.findIndex(anchor => anchor.epochDay >= day);
    if (rightIndex <= 0) throw new RangeError('No forward log-anchor segment covers target');
    const left = anchors[rightIndex - 1], right = anchors[rightIndex];
    const fraction = (day - left.epochDay) / (right.epochDay - left.epochDay);
    return { horizonDays, targetDate: dateFromDay(day),
      price: finitePrice((1 - fraction) * Math.log(left.price) + fraction * Math.log(right.price)) };
  });
}

function refit(rows, asOf, horizons) {
  const policy = ETHEREUM_CYCLE_COMPARISON_POLICY;
  const turns = confirmedTurns(rows), episodes = completedEpisodes(rows, turns);
  const highs = turns.filter(turn => turn.type === 'high');
  const transitions = [];
  for (let index = 1; index < episodes.length; index++) {
    const previous = episodes[index - 1], current = episodes[index];
    if (previous.nextPeak.date !== current.peak.date) continue;
    transitions.push({ inputLogGrowth: previous.logPeakGrowth, outputLogGrowth: current.logPeakGrowth,
      knownAt: current.knownAt, fromPeak: previous.peak.date, throughPeak: current.nextPeak.date });
  }
  const training = {
    firstObservation: rows[0].date, informationThrough: asOf, observations: rows.length,
    confirmedTurns: turns, completedEpisodes: episodes, growthTransitions: transitions,
    completedPeakIntervals: episodes.length, growthTransitionCount: transitions.length,
    independentMarketCycles: null, finalCycleTurnClaim: false, historicalVintagesVerified: false,
    grouping: 'Causal ETH threshold-reversal episodes; no Bitcoin halving eras',
  };
  const assumptions = {
    policy: { ...policy }, coefficientsEstimatedFromPrefix: true,
    assumedDetectionThresholds: ['drawdownPct', 'reversalPct', 'confirmationDays', 'highZoneFraction'],
    periodFixedAt48Months: false, bitcoinHalvingApplied: false,
    formula: 'Q_next = Q_last * (Q_last / Q_previous)^g; L_next = Q_next * retention; log B is linear between dated anchors',
    residualAdded: false, probabilisticIntervalAvailable: false, retrospectiveParameterDesign: true,
  };
  if (episodes.length < policy.minimumCompletedPeakIntervals || transitions.length < policy.minimumGrowthTransitions) {
    return unavailable('Insufficient confirmed ETH episodes to estimate period, decline and growth retention', training, assumptions);
  }
  const denominator = transitions.reduce((sum, item) => sum + item.inputLogGrowth ** 2, 0);
  if (!(denominator > 1e-12)) return unavailable('ETH peak-growth retention is not identifiable from near-zero preceding growth', training, assumptions);
  const growthRetention = transitions.reduce((sum, item) => sum + item.inputLogGrowth * item.outputLogGrowth, 0) / denominator;
  const periodDays = Math.round(median(episodes.map(item => item.periodDays)));
  const bearDays = Math.round(median(episodes.map(item => item.bearDays)));
  const zoneLeadDays = Math.round(median(episodes.map(item => item.zoneLeadDays)));
  const retention = median(episodes.map(item => item.troughRetention));
  const coefficients = { growthRetention, periodDays, bearDays, riseDays: periodDays - bearDays,
    zoneLeadDays, troughRetention: retention, bearDrawdownPct: 100 * (1 - retention),
    highZoneFraction: policy.highZoneFraction };
  assumptions.coefficients = coefficients;
  assumptions.coefficientEstimation = {
    growthRetention: 'Zero-intercept least squares of next completed log peak growth on previous log peak growth',
    periodDays: 'Median confirmed peak-to-peak episode duration, rounded to whole days',
    bearDays: 'Median confirmed peak-to-trough duration, rounded to whole days',
    zoneLeadDays: 'Median first 95% high-zone entry to confirmed peak duration, rounded to whole days',
    troughRetention: 'Median confirmed trough / preceding peak',
    growthRetentionClamped: false, dwellIsNotSeparatelyIdentified: true,
  };
  if (![growthRetention, periodDays, bearDays, zoneLeadDays, retention].every(Number.isFinite)
    || periodDays <= bearDays || bearDays <= 0 || zoneLeadDays < 0 || zoneLeadDays >= periodDays
    || retention <= 0 || retention >= 1) {
    return unavailable('Estimated ETH coefficients do not define ordered finite anchors', training, assumptions);
  }
  const current = rows.at(-1), peak = highs.at(-1), previousPeak = highs.at(-2);
  const peakDay = peak.epochDay + periodDays, zoneDay = peakDay - zoneLeadDays, lowDay = peakDay + bearDays;
  if (zoneDay <= current.epochDay) return unavailable('Estimated ETH high-zone date has expired; no additional cycle is invented', training, assumptions);
  if (current.epochDay + Math.max(...horizons) > lowDay) return unavailable('Requested ETH horizon exceeds the next estimated low; no repeated wave is invented', training, assumptions);
  let nextPeak, nextLow;
  try {
    nextPeak = finitePrice(Math.log(peak.price) + growthRetention * logRatio(peak.price, previousPeak.price));
    nextLow = finitePrice(Math.log(nextPeak) + Math.log(retention));
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return unavailable(error.message, training, assumptions);
  }
  if (!(nextPeak * policy.highZoneFraction > current.price)) {
    return unavailable('Estimated ETH high-zone price is not above the current observation; the rising-anchor structure is inapplicable', training, assumptions);
  }
  const anchor = (id, epochDay, price) => ({ id, epochDay, date: dateFromDay(epochDay), price });
  const anchors = [anchor('current', current.epochDay, current.price)];
  if (zoneDay < peakDay) anchors.push(anchor('zone-reference', zoneDay, nextPeak * policy.highZoneFraction));
  anchors.push(anchor('peak-reference', peakDay, nextPeak), anchor('next-low-reference', lowDay, nextLow));
  return {
    status: 'available', model: 'eth-refitted-log-anchor-baseline', asOf,
    predictions: projectedPrices(anchors, asOf, horizons), anchors, training, assumptions,
    probability: null, calibrated: false, productionEligible: false,
    warning: 'Few dependent ETH reversal episodes are not independent four-year cycles. Fitted coefficients and 3-up/1-down proportions require out-of-sample evaluation.',
  };
}

function transfer(ethRows, btcRows, asOf, horizons) {
  let rows, model;
  try {
    rows = prefix(btcRows, asOf, 'BTC');
    const clock = calibrateCycleTiming(rows, { asOf });
    model = buildDetailedForecast(rows, {
      asOf, referenceDate: dateFromDay(utcDay(asOf) + 1),
      displayEnd: dateFromDay(utcDay(asOf) + Math.max(...horizons)),
      scenario: 'base', timingCalibration: clock.current,
      sampleCount: ETHEREUM_CYCLE_COMPARISON_POLICY.btcInternalSampleCount,
    });
  } catch (error) { return knownInputFailure(error); }
  const ethPrice = ethRows.at(-1).price, btcPrice = rows.at(-1).price;
  const points = new Map(model.path.map(point => [point.date, point]));
  const predictions = horizons.map(horizonDays => {
    const targetDate = dateFromDay(utcDay(asOf) + horizonDays), point = points.get(targetDate);
    if (!point) throw new RangeError('Actual BTC model did not cover comparison target');
    return { horizonDays, targetDate,
      price: finitePrice(Math.log(ethPrice) + logRatio(point.baselinePrice, btcPrice)),
      sourceBtcBaselinePrice: point.baselinePrice };
  });
  return {
    status: 'available', model: 'btc-baseline-transfer-to-eth', asOf, predictions,
    assumptions: {
      formula: 'ETH(asOf) * BTC_baseline(asOf+h) / BTC(asOf)',
      sourceEngine: model.version, sourceClock: model.nominalClock,
      sourceGrowthRetention: model.assumptions.priceGrowthRetention,
      sourceBearDrawdownPct: model.assumptions.bearDrawdownPct,
      sourceHighZoneFraction: model.assumptions.highZoneFraction,
      residualAdded: false, bitcoinAbsoluteUsdTargetTransferred: false,
      btcPhaseAndRelativeAmplitudeTransferredAsHypothesis: true,
      internalSampleCount: ETHEREUM_CYCLE_COMPARISON_POLICY.btcInternalSampleCount,
      sampleCountMeaning: 'Only the deterministic BTC baseline is consumed; internal draw count cannot affect it',
    },
    training: { informationThrough: asOf, ethAnchor: view(ethRows.at(-1)), btcAnchor: view(rows.at(-1)),
      btcSource: model.training, historicalVintagesVerified: false },
    probability: null, calibrated: false, productionEligible: false,
    warning: 'This explicitly tests BTC phase and relative-amplitude transfer. ETH does not acquire a Bitcoin issuance schedule.',
  };
}

export function buildEthereumCycleCandidates({ ethRows, btcRows, asOf, horizons = [30, 90, 180] } = {}) {
  utcDay(asOf);
  if (!Array.isArray(horizons) || !horizons.length || horizons.length > 12 || new Set(horizons).size !== horizons.length
    || horizons.some(value => !Number.isSafeInteger(value) || value < 1 || value > 1120)) {
    throw new RangeError('Unique positive horizons up to 1120 days are required');
  }
  let rows;
  try { rows = prefix(ethRows, asOf, 'ETH'); }
  catch (error) {
    const failure = knownInputFailure(error);
    return { asOf, horizons: [...horizons], btcTransfer: failure, ethRefit: { ...failure } };
  }
  return { asOf, horizons: [...horizons],
    btcTransfer: transfer(rows, btcRows, asOf, horizons),
    ethRefit: refit(rows, asOf, horizons) };
}
