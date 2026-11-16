import {parseVolumeSnapshot} from '../../dist/volume-data.js';

// This is the preserved Bitstamp daily OHLC archive used by Atlas replay.
// Coin Metrics closes and Coinbase intraday candles are different sources.
export const ATLAS_BTC_SYMBOL = Object.freeze({
  symbol:'BTCUSD', name:'비트코인 · USD', exchange:'Bitstamp', timezone:'UTC',
  session:'24x7', pricePrecision:2, tickSize:0.01, volumePrecision:8,
  type:'crypto', supportedResolutions:Object.freeze(['1D']),
});
const symbolInfo = () => ({...ATLAS_BTC_SYMBOL,supportedResolutions:['1D']});
const copy = value => structuredClone(value);
const searchText = value => value.normalize('NFKC').toLowerCase().replace(/[\s/_-]+/g,'');
const searchTerms = ['BTCUSD','BTC','Bitcoin','비트코인','Bitstamp','USD'].map(searchText);

function requireSymbol(symbol) {
  if (symbol !== 'BTCUSD') throw new RangeError('The P2a-0 snapshot supports BTCUSD only');
}
function requireResolution(resolution) {
  if (resolution !== '1D') throw new RangeError('The P2a-0 snapshot supports native 1D bars only');
}
function requireRequest(request) {
  if (!request || !Number.isSafeInteger(request.from) || !Number.isSafeInteger(request.to) || request.from > request.to) {
    throw new TypeError('BarsRequest requires ordered, finite UTC millisecond bounds');
  }
  if (request.countBack !== undefined && (!Number.isSafeInteger(request.countBack) || request.countBack < 1)) {
    throw new TypeError('countBack must be a positive safe integer');
  }
}
function firstIndex(bars, predicate) {
  let left = 0, right = bars.length;
  while (left < right) {
    const middle = (left + right) >>> 1;
    if (predicate(bars[middle])) right = middle;
    else left = middle + 1;
  }
  return left;
}

/** Static, native daily OHLCV only. No fabricated live quote or connection. */
export function createAtlasBtcDatafeed({loadSnapshot,onEvent=()=>{},now=()=>Date.now()}) {
  if (typeof loadSnapshot !== 'function' || typeof onEvent !== 'function' || typeof now !== 'function') {
    throw new TypeError('Snapshot loader, event observer and clock must be functions');
  }
  const state = {status:'idle',error:null,provenance:null,lastBarsRequest:null,activeSubscriptions:0,
    calls:{resolveSymbol:0,getBars:0,searchSymbols:0,getSparkline:0,subscribeBars:0,unsubscribeBars:0}};
  let pending = null;
  function archive() {
    if (!pending) {
      state.status = 'loading';
      pending = Promise.resolve().then(loadSnapshot).then(payload => {
        const observedNow = now();
        if (payload?.source !== 'Bitstamp' || !Number.isFinite(observedNow) || Date.parse(payload.retrievedAt) > observedNow) {
          throw new TypeError('A preserved Bitstamp snapshot acquired by the inspection clock is required');
        }
        const validated = parseVolumeSnapshot(payload,{now:observedNow});
        if (!validated.bars.length) throw new RangeError('The snapshot has no completed daily observations');
        const bars = validated.bars.map(({time,open,high,low,close,volume}) => ({time:time*1000,open,high,low,close,volume}));
        state.provenance = {
          archivePath:'dist/data/btc-volume.json',source:validated.source,product:validated.product,
          priceCurrency:'USD',volumeUnit:validated.unit,volumeScope:validated.scope,
          globalMarketVolume:validated.globalMarketVolume,interval:'1D',timestampUnit:'UTC milliseconds',
          firstDate:validated.firstDate,lastDate:validated.lastDate,retrievedAt:validated.retrievedAt,
          asOf:validated.asOf,bars:bars.length,completedOnly:true,imputedBars:0,
          sourceZeroVolumeBars:validated.coverage.sourceZeroVolumeBars,gapCount:validated.coverage.gapCount,
          sourceUrls:[...validated.sourceUrls],realtime:false,
        };
        state.status = 'ready';
        onEvent({type:'snapshot-ready',provenance:copy(state.provenance)});
        return bars;
      }).catch(error => {
        state.status = 'error'; state.error = error.message;
        onEvent({type:'snapshot-error',message:error.message});
        throw error;
      });
    }
    return pending;
  }
  const datafeed = {
    async resolveSymbol(symbol) {
      state.calls.resolveSymbol++; requireSymbol(symbol);
      return symbolInfo();
    },
    async getBars(symbol,resolution,request) {
      state.calls.getBars++; requireSymbol(symbol?.symbol); requireResolution(resolution); requireRequest(request);
      const bars = await archive();
      // Funnest 0.6.16 pages with to = oldest.time - 1. Its to is inclusive,
      // and countBack takes priority over from, including an archived last bar.
      const end = firstIndex(bars,bar => bar.time > request.to);
      const start = request.countBack === undefined ? firstIndex(bars,bar => bar.time >= request.from) : Math.max(0,end-request.countBack);
      const selected = bars.slice(start,end).map(bar => ({...bar}));
      const result = {bars:selected,noMoreData:end===0 || start===0};
      state.lastBarsRequest = {symbol:'BTCUSD',resolution,request:{...request},returned:selected.length,
        firstTime:selected[0]?.time??null,lastTime:selected.at(-1)?.time??null,noMoreData:result.noMoreData};
      onEvent({type:'bars',...copy(state.lastBarsRequest)});
      return result;
    },
    subscribeBars(symbol,resolution,_onBar,_onResetCache,_onConnection) {
      requireSymbol(symbol?.symbol); requireResolution(resolution);
      state.calls.subscribeBars++; state.activeSubscriptions++;
      onEvent({type:'subscription',mode:'static-noop',active:state.activeSubscriptions});
      let active = true;
      return () => {
        if (!active) return;
        active = false; state.activeSubscriptions--; state.calls.unsubscribeBars++;
        onEvent({type:'unsubscription',mode:'static-noop',active:state.activeSubscriptions});
      };
    },
    async searchSymbols(query) {
      state.calls.searchSymbols++;
      if (typeof query !== 'string') throw new TypeError('Symbol search requires a string');
      const term = searchText(query);
      return searchTerms.some(value => value.includes(term)) ? [symbolInfo()] : [];
    },
    async getSparkline(symbol) {
      state.calls.getSparkline++; requireSymbol(symbol);
      return (await archive()).slice(-60).map(bar => bar.close);
    },
  };
  return {datafeed,inspect:() => copy(state)};
}
