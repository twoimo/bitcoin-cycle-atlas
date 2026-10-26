import { buildLongHorizonForecast } from './long-horizon-forecast.js?v=1.29.0';

self.onmessage = event => {
  const { id, revision, dataset, options } = event.data || {};
  try { self.postMessage({ id, revision, status: 'ready', model: buildLongHorizonForecast(dataset, options) }); }
  catch (error) { self.postMessage({ id, revision, status: 'error', error: error.message || String(error) }); }
};
