import {atlasSitePath,isAtlasStatic} from '../../../dist/site-paths.js';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { validateSnapshot } from '@atlas/domain/market-lab';
import type { Region } from '@atlas/contracts/market-lab';
import { loadSnapshot, type Delivery } from './load-snapshot.js';
import { initialSnapshotState, snapshotNotice, snapshotReducer } from './snapshot-state.js';
import { errorText } from './components/common.js';
import { LoadingSkeleton } from './components/loading-skeleton.js';
import { SourceDisclosure } from './components/source-disclosure.js';
import { atlasPages, labPageFromLocation } from '../../../dist/atlas-navigation.js';
import { DashboardChrome } from './components/app-shell.js';
import { DiagnosisPanel } from './panels/diagnosis-panel.js';
import { ScenarioPanel, initialScenario } from './panels/scenario-panel.js';
import { EconomicsPanel, initialEconomics } from './panels/economics-panel.js';
import { RsiPanel, initialRsi } from './panels/rsi-panel.js';
import { rsiInstrument } from '../../../dist/rsi-instruments.js';
import type { RsiHistoryState } from './panels/rsi-history.js';
import type { RsiChartCache } from './rsi-chart-model.js';
import { HousingPanel,type HousingCache } from './panels/housing-panel.js';
import { ThemePanel,type ThemeCache } from './panels/theme-panel.js';
import {useUsCollection} from './components/us-direction.js';
import {collectionMatchesSnapshot} from './us-collection.js';

const tabs = [['diagnosis', '시장 진단'], ['scenario', '조건 실험'], ['ai', '현금흐름'], ['rsi', '삼플레·RSI'],['housing','부동산'],['themes','테마·재료']] as const;
type Tab = typeof tabs[number][0];
type Navigation = { tab: Tab; region: Region };
const systemClock = () => new Date();
const selectedRsiSymbol = () => rsiInstrument(new URLSearchParams(globalThis.location?.search).get('symbol'))?.symbol || 'TQQQ';
function initialNavigation(): Navigation {
  const page = labPageFromLocation(globalThis.location);
  return { tab: page.tab as Tab, region: page.region === 'kr' ? 'kr' : 'us' };
}

export function MarketLabApp({ load = loadSnapshot, clock = systemClock, embedded = false }: { load?: typeof loadSnapshot; clock?: () => Date; embedded?:boolean }) {
  const [navigation, setNavigation] = useState(initialNavigation);
  const [attempt, setAttempt] = useState(0);
  const [data, dispatchData] = useReducer(snapshotReducer, initialSnapshotState);
  const delivery = data.delivery, notice = snapshotNotice(data);
  const [marketId, setMarketId] = useState<string | null>(null);
  const [priceIndex, setPriceIndex] = useState<number | null>(null);
  const [scenario, setScenario] = useState(initialScenario);
  const [economics, setEconomics] = useState(initialEconomics);
  const [rsiSymbol,setRsiSymbol] = useState<string>(selectedRsiSymbol);
  const [rsiStates,setRsiStates] = useState<Record<string,ReturnType<typeof initialRsi>>>({});
  const rsi = rsiStates[rsiSymbol] || initialRsi();
  const rsiHistoryCache=useRef(new Map<string,RsiHistoryState>());
  const rsiChartCache=useRef(new Map<string,RsiChartCache>());
  const housingCache=useRef<HousingCache>({});
  const themeCache=useRef<ThemeCache>({});
  const [centerEpoch,setCenterEpoch]=useState(()=>Number(new URLSearchParams(globalThis.location?.search).get('epoch'))||0);
  const [centerActive,setCenterActive]=useState(true);
  const liveUs = navigation.tab==='diagnosis'&&navigation.region==='us'&&centerActive&&!isAtlasStatic();
  const collection = useUsCollection(liveUs,attempt);
  const requestedCollection=useRef<string|null>(null);
  const now = clock();
  useEffect(()=>{
    const accepted=collection.data?.lastSuccess;
    if(!liveUs||!accepted||!data.doc||data.phase==='loading'||delivery?.kind!=='api'||requestedCollection.current===accepted.id||collectionMatchesSnapshot(data.doc,collection.data))return;
    requestedCollection.current=accepted.id;setAttempt(value=>value+1);
  },[liveUs,collection.data,data.doc,data.phase,delivery?.kind]);
  useEffect(()=>{
    if(!liveUs)return;
    const refresh=()=>{if(document.visibilityState!=='hidden')setAttempt(value=>value+1);};
    const interval=setInterval(refresh,60000);
    const visible=()=>{if(document.visibilityState==='visible')refresh();};
    document.addEventListener('visibilitychange',visible);
    return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',visible);};
  },[liveUs]);
  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    dispatchData({ type: 'loading' });
    void (async () => {
      try {
        let received: Delivery|null=null;
        const doc = validateSnapshot(await load({ signal: abort.signal, onDelivery: value => { received=value; } }));
        if (active) {
          dispatchData({ type: 'received', doc, delivery: received });
        }
      } catch (error) {
        if (active) dispatchData({ type: 'failed', error: errorText(error) });
      } finally {
        if (active) document.documentElement.dataset.labReady = 'ready';
      }
    })();
    return () => { active = false; abort.abort(); };
  }, [attempt, load]);

  function retry() { setAttempt(value => value + 1); }
  const page = atlasPages.find(page => page.tab === navigation.tab && (navigation.tab !== 'diagnosis' || page.region === navigation.region))!;
  useEffect(() => {
    document.title = `${page.title} · Cycle Atlas`;
  }, [page.title]);
  useEffect(() => {
    const back = () => { setNavigation(initialNavigation()); setRsiSymbol(selectedRsiSymbol()); setMarketId(null); setPriceIndex(null); };
    globalThis.addEventListener?.('popstate', back);
    return () => globalThis.removeEventListener?.('popstate', back);
  }, []);
  function navigatePage(id: string) {
    const next = atlasPages.find(page => page.id === id);
    if (!next?.tab) return;
    const region: Region = next.region === 'kr' ? 'kr' : next.region === 'us' ? 'us' : navigation.region;
    if (region !== navigation.region) { setMarketId(null); setPriceIndex(null); }
    setNavigation({ tab: next.tab as Tab, region });
    if (!embedded) try { globalThis.history.pushState(globalThis.history.state, '', atlasSitePath(next.href)+(next.tab === 'rsi' ? `?symbol=${rsiSymbol}` : '')); } catch { /* Embedded preview. */ }
  }
  const selectRsi = useCallback((symbol:string) => {
    if (!rsiInstrument(symbol)) return;
    setRsiSymbol(symbol);
    if (!embedded) try { globalThis.history.pushState(globalThis.history.state,'',atlasSitePath(`/market-lab/rsi/?symbol=${symbol}`)); } catch { /* Embedded preview. */ }
  },[embedded]);
  useEffect(() => {
    if (!embedded) return;
    document.body.dataset.shell='embedded';
    const receive = (event:MessageEvent) => {
      if (event.source !== window.parent || event.origin !== location.origin) return;
      if(event.data?.kind==='atlas:center-visibility'){setCenterActive(event.data.visible===true);return;}
      if(event.data?.kind!=='atlas:center-navigate')return;
      const next=atlasPages.find(item=>item.id===event.data.page);
      if (!next?.tab) return;
      setNavigation({tab:next.tab as Tab,region:next.region === 'kr' ? 'kr' : 'us'});
      if(Number.isSafeInteger(event.data.epoch)&&event.data.epoch>=0)setCenterEpoch(event.data.epoch);
      setCenterActive(true);
      if (rsiInstrument(event.data.symbol)) setRsiSymbol(event.data.symbol);
    };
    window.addEventListener('message',receive);
    return ()=>window.removeEventListener('message',receive);
  },[embedded]);
  useEffect(() => {
    if (embedded) window.parent.postMessage({kind:'atlas:center-state',page:page.id,symbol:rsiSymbol,epoch:centerEpoch},location.origin);
  },[embedded,page.id,rsiSymbol,centerEpoch]);
  const independent=navigation.tab==='housing'||navigation.tab==='themes';
  return <>
    {!embedded && <DashboardChrome title={page.title} currentPage={page.id} onNavigate={navigatePage} />}
    <main data-loading-kind={data.phase==='loading'&&!data.doc&&!independent?navigation.tab:undefined} className={embedded?'atlas-embedded-workspace':'workspace atlas-service-workspace'}><h1 className="atlas-sr-only">{page.title}</h1>
      {!independent&&notice && <div className="ml-delivery" role="status"><span>{notice.text}</span><button type="button" onClick={retry}>{notice.retry}</button></div>}
      <section id="market-view" className="market-lab" aria-label={page.title} aria-busy={!independent&&data.phase === 'loading'}>
        <div className="ml-scroll">
          {!independent&&data.phase === 'loading' && <div className="atlas-inline-loading" role="status"><span className="atlas-loading-label">자료를 읽고 있습니다.</span><i skullet-bar="" /></div>}
          {!independent&&data.phase === 'error' && <div className="ml-status" aria-live="polite">자료 오류 · {data.error} <button type="button" data-action="retry" onClick={retry}>데이터 다시 읽기</button></div>}
          {!independent&&data.phase === 'empty' && <div className="ml-status" aria-live="polite">스냅샷은 읽었지만 관측 자료가 없습니다. 없는 지표는 판단을 유보합니다.</div>}
          <section id="ml-panel" role="region" aria-label={page.title} tabIndex={0}>
            {navigation.tab === 'diagnosis' && (data.phase==='loading'&&!data.doc?<LoadingSkeleton kind="diagnosis" label="시장 자료 로딩"/>:<DiagnosisPanel snapshot={data.doc} region={navigation.region} now={now} marketId={marketId} priceIndex={priceIndex} collection={collection.data} collectionError={collection.error} saved={data.phase==='error'||delivery?.kind==='saved'||data.retainedPrevious} onRefresh={retry}
              onMarket={market => { setMarketId(market); setPriceIndex(null); }} onDate={setPriceIndex} />)}
            {navigation.tab === 'scenario' && <ScenarioPanel state={scenario} onChange={setScenario} />}
            {navigation.tab === 'ai' && <EconomicsPanel state={economics} onChange={setEconomics} />}
            {navigation.tab === 'rsi' && (data.phase==='loading'&&!data.doc?<LoadingSkeleton kind="rsi" label={`${rsiSymbol} 가격·RSI 로딩`}/>:<RsiPanel key={rsiSymbol} embedded={embedded} active={centerActive} epoch={centerEpoch} chartCache={rsiChartCache.current} historyCache={rsiHistoryCache.current} symbol={rsiSymbol} onSymbol={selectRsi} revision={delivery?.revision} snapshot={data.doc} now={now} state={rsi} onChange={value => setRsiStates(previous => ({...previous,[rsiSymbol]:value}))} />)}
            {navigation.tab === 'housing'&&<HousingPanel cache={housingCache.current}/>}
            {navigation.tab === 'themes'&&<ThemePanel cache={themeCache.current} active={centerActive}/>}
          </section>
          {!independent&&<SourceDisclosure key={`${navigation.tab}:${navigation.region}:${data.phase}:${data.doc?.generatedAt}`} snapshot={data.doc} region={navigation.region} now={now} />}
        </div>
      </section>
    </main>
  </>;
}
