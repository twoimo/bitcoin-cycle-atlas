import {atlasSitePath,isAtlasStatic} from '../../../dist/site-paths.js';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { validateSnapshot } from '@atlas/domain/market-lab';
import type { Region } from '@atlas/contracts/market-lab';
import { loadSnapshot, type Delivery } from './load-snapshot.js';
import { initialSnapshotState, snapshotNotice, snapshotReducer } from './snapshot-state.js';
import { errorText } from './components/common.js';
import { LoadingSkeleton } from './components/loading-skeleton.js';
import { SourceDisclosure } from './components/source-disclosure.js';
import { atlasPages, atlasPageHref, labPageFromLocation } from '../../../dist/atlas-navigation.js';
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
import { WORKSPACE_INSTRUMENTS, workspaceInstrument } from '../../../dist/workspace-instruments.js';
import { ChartWorkspaceToolbar, MarketWorkspaceToolbar, type WorkspaceInstrument } from './components/workspace-toolbar.js';
import { CompactToolbar, CompactToolbarHost, CompactToolbarProvider } from './components/compact-toolbar.js';

const tabs = [['diagnosis', '시장 진단'], ['scenario', '조건 실험'], ['ai', '현금흐름'], ['rsi', '삼플레·RSI'],['housing','부동산'],['themes','테마·재료']] as const;
type Tab = typeof tabs[number][0];
type Navigation = { tab: Tab; region: Region };
const systemClock = () => new Date();
const selectedRsiSymbol = () => rsiInstrument(new URLSearchParams(globalThis.location?.search).get('symbol'))?.symbol || 'TQQQ';
function selectedWorkspaceInstrument() {
  const query = new URLSearchParams(globalThis.location?.search), page = labPageFromLocation(globalThis.location);
  const selected = workspaceInstrument(query.get('symbol'));
  if (selected && (!['rsi','housing','themes'].includes(page.id) || selected.page === page.id)) return selected;
  if (page.id === 'housing') return WORKSPACE_INSTRUMENTS.find(item => item.page === 'housing' && item.region === query.get('region')) || workspaceInstrument('HOUSING-BUSAN')!;
  return workspaceInstrument(page.id === 'themes' ? 'HYPE' : 'TQQQ')!;
}
function initialNavigation(): Navigation {
  const page = labPageFromLocation(globalThis.location);
  return { tab: page.tab as Tab, region: page.region === 'kr' ? 'kr' : 'us' };
}

export function MarketLabApp({ load = loadSnapshot, clock = systemClock, embedded = false }: { load?: typeof loadSnapshot; clock?: () => Date; embedded?:boolean }) {
  const [navigation, setNavigation] = useState(initialNavigation);
  const navigationRef=useRef(navigation);
  navigationRef.current=navigation;
  const intentSerial=useRef(0);
  const pendingIntent=useRef<{serial:number;navigation:Navigation;symbol:string}|null>(null);
  const needsSnapshot = navigation.tab === 'diagnosis' || navigation.tab === 'rsi';
  const [snapshotRequested,setSnapshotRequested] = useState(needsSnapshot);
  const [attempt, setAttempt] = useState(0);
  const [data, dispatchData] = useReducer(snapshotReducer, initialSnapshotState);
  const delivery = data.delivery, notice = snapshotNotice(data);
  const [marketSelections,setMarketSelections] = useState<Record<Region,{marketId:string|null;priceIndex:number|null}>>({us:{marketId:null,priceIndex:null},kr:{marketId:null,priceIndex:null}});
  const {marketId,priceIndex}=marketSelections[navigation.region];
  const [scenario, setScenario] = useState(initialScenario);
  const [economics, setEconomics] = useState(initialEconomics);
  const [rsiSymbol,setRsiSymbol] = useState<string>(selectedRsiSymbol);
  const [workspaceSymbol,setWorkspaceSymbol] = useState<string>(() => selectedWorkspaceInstrument().symbol);
  const [housingRegion,setHousingRegion] = useState(() => {
    const instrument = selectedWorkspaceInstrument(); return instrument.page === 'housing' ? instrument.region : 'busan';
  });
  const [rsiStates,setRsiStates] = useState<Record<string,ReturnType<typeof initialRsi>>>({});
  const rsi = rsiStates[rsiSymbol] || initialRsi();
  const rsiHistoryCache=useRef(new Map<string,RsiHistoryState>());
  const rsiChartCache=useRef(new Map<string,RsiChartCache>());
  const housingCache=useRef<HousingCache>({});
  const themeCache=useRef<ThemeCache>({});
  const [centerEpoch,setCenterEpoch]=useState(()=>Number(new URLSearchParams(globalThis.location?.search).get('epoch'))||0);
  const centerEpochRef=useRef(centerEpoch);
  const [centerActive,setCenterActive]=useState(true);
  const liveUs = navigation.tab==='diagnosis'&&navigation.region==='us'&&centerActive&&!isAtlasStatic();
  const collection = useUsCollection(liveUs,attempt);
  const requestedCollection=useRef<string|null>(null);
  const now = clock();
  // Housing and theme charts have their own validated sources. Their first
  // visit must not download the market snapshot. Once requested, keep the
  // existing request/cache owner through subsequent in-workspace navigation.
  useEffect(()=>{if(needsSnapshot)setSnapshotRequested(true);},[needsSnapshot]);
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
    if(!snapshotRequested)return;
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
  }, [attempt, load, snapshotRequested]);

  function retry() { setSnapshotRequested(true); setAttempt(value => value + 1); }
  const page = atlasPages.find(page => page.tab === navigation.tab && (navigation.tab !== 'diagnosis' || page.region === navigation.region))!;
  const chartWorkspace = ['rsi','housing','themes'].includes(navigation.tab);
  const currentInstrument = workspaceInstrument(navigation.tab === 'themes' ? 'HYPE' : navigation.tab === 'housing' ? `HOUSING-${housingRegion.toUpperCase()}` : rsiSymbol)!;
  const workspaceTitle = chartWorkspace ? '가격 차트' : '시장 분석';
  useEffect(() => {
    document.title = `${chartWorkspace ? currentInstrument.koreanName : page.title} · ${workspaceTitle} · Cycle Atlas`;
  }, [page.title,chartWorkspace,currentInstrument.koreanName,workspaceTitle]);
  useEffect(() => {
    const back = () => {
      const instrument = selectedWorkspaceInstrument();
      pendingIntent.current=null;
      navigationRef.current=initialNavigation();
      setNavigation(navigationRef.current); setWorkspaceSymbol(instrument.symbol);
      if (instrument.page === 'rsi') setRsiSymbol(instrument.symbol);
      if (instrument.page === 'housing') setHousingRegion(instrument.region);
    };
    globalThis.addEventListener?.('popstate', back);
    return () => globalThis.removeEventListener?.('popstate', back);
  }, []);
  const requestEmbeddedSelection=useCallback((pageId:string,symbol:string)=>{
    const next=atlasPages.find(page=>page.id===pageId);if(!next?.tab)return;
    const previous=pendingIntent.current?.navigation||navigationRef.current;
    const nextNavigation:Navigation={tab:next.tab as Tab,region:next.region==='kr'?'kr':next.region==='us'?'us':previous.region};
    const serial=++intentSerial.current,instrument=workspaceInstrument(symbol);
    pendingIntent.current={serial,navigation:nextNavigation,symbol};
    window.parent.postMessage({kind:'atlas:center-select',page:next.id,symbol,region:next.id==='housing'&&instrument?.page==='housing'?instrument.region:undefined,epoch:centerEpochRef.current,intentSerial:serial},location.origin);
  },[]);
  function navigatePage(id: string) {
    const next = atlasPages.find(page => page.id === id);
    if (!next?.tab) return;
    const symbol = next.id === 'rsi' ? rsiSymbol : next.id === 'themes' ? 'HYPE' : next.id === 'housing' ? `HOUSING-${housingRegion.toUpperCase()}` : pendingIntent.current?.symbol||workspaceSymbol;
    if (embedded) {
      requestEmbeddedSelection(next.id,symbol);
      return;
    }
    const region: Region = next.region === 'kr' ? 'kr' : next.region === 'us' ? 'us' : navigationRef.current.region;
    navigationRef.current={tab:next.tab as Tab,region};
    setNavigation(navigationRef.current);
    setWorkspaceSymbol(symbol);
    try { globalThis.history.pushState(globalThis.history.state, '', atlasSitePath(atlasPageHref(next,{symbol,region:housingRegion}))); } catch { /* Embedded preview. */ }
  }
  const selectInstrument = useCallback((instrument:WorkspaceInstrument) => {
    const accepted = workspaceInstrument(instrument.symbol), next = atlasPages.find(page => page.id === accepted?.page);
    if (!accepted || !next?.tab) return;
    if (embedded) {
      requestEmbeddedSelection(next.id,accepted.symbol);
      return;
    }
    setWorkspaceSymbol(accepted.symbol);
    if (accepted.page === 'rsi') setRsiSymbol(accepted.symbol);
    if (accepted.page === 'housing') setHousingRegion(accepted.region);
    navigationRef.current={...navigationRef.current,tab:next.tab as Tab};
    setNavigation(navigationRef.current);
    try { globalThis.history.pushState(globalThis.history.state,'',atlasSitePath(atlasPageHref(next,{symbol:accepted.symbol,region:accepted.region}))); } catch { /* Embedded preview. */ }
  },[embedded,requestEmbeddedSelection]);
  const selectRsi = useCallback((symbol:string) => {
    const instrument = workspaceInstrument(symbol); if (instrument?.page === 'rsi') selectInstrument(instrument);
  },[selectInstrument]);
  useEffect(() => {
    if (!embedded) return;
    document.body.dataset.shell='embedded';
    const receive = (event:MessageEvent) => {
      if (event.source !== window.parent || event.origin !== location.origin) return;
      if(event.data?.kind==='atlas:center-visibility'){setCenterActive(event.data.visible===true);return;}
      if(event.data?.kind!=='atlas:center-navigate')return;
      const next=atlasPages.find(item=>item.id===event.data.page);
      if (!next?.tab) return;
      if(!Number.isSafeInteger(event.data.epoch)||event.data.epoch<centerEpochRef.current)return;
      const serial=event.data.intentSerial,pending=pendingIntent.current;
      if(serial!==undefined&&(!Number.isSafeInteger(serial)||serial<=0))return;
      centerEpochRef.current=event.data.epoch;
      // Earlier acknowledgements cannot paint over a newer queued choice. A
      // host-owned search/menu/history navigation has no serial and wins.
      if(pending&&serial!==undefined&&serial<pending.serial)return;
      const previous=pending&&serial===pending.serial?pending.navigation:navigationRef.current;
      pendingIntent.current=null;
      setCenterEpoch(event.data.epoch);
      navigationRef.current={tab:next.tab as Tab,region:next.region==='kr'?'kr':next.region==='us'?'us':previous.region};
      setNavigation(navigationRef.current);
      setCenterActive(true);
      const instrument=workspaceInstrument(event.data.symbol);
      if (instrument) {
        setWorkspaceSymbol(instrument.symbol);
        if (instrument.page === 'rsi') setRsiSymbol(instrument.symbol);
        if (instrument.page === 'housing') setHousingRegion(instrument.region);
      }
      if (next.id === 'housing' && !instrument) {
        const housing = WORKSPACE_INSTRUMENTS.find(item => item.page === 'housing' && item.region === event.data.region);
        if (housing) { setHousingRegion(housing.region); setWorkspaceSymbol(housing.symbol); }
      }
    };
    window.addEventListener('message',receive);
    return ()=>window.removeEventListener('message',receive);
  },[embedded]);
  useEffect(() => {
    if (embedded) window.parent.postMessage({kind:'atlas:center-state',page:page.id,symbol:chartWorkspace ? currentInstrument.symbol : workspaceSymbol,region:page.id === 'housing' ? housingRegion : undefined,epoch:centerEpoch},location.origin);
  },[embedded,page.id,chartWorkspace,currentInstrument.symbol,workspaceSymbol,housingRegion,centerEpoch]);
  const independent=navigation.tab==='housing'||navigation.tab==='themes';
  const snapshotLoading=(snapshotRequested||needsSnapshot)&&data.phase==='loading';
  return <CompactToolbarProvider embedded={embedded} active={centerActive} epoch={centerEpoch}>
    {!embedded && <DashboardChrome title={workspaceTitle} currentPage={page.id} chartSymbol={chartWorkspace?currentInstrument.symbol:workspaceSymbol} onNavigate={navigatePage} />}
    <main data-workspace={chartWorkspace ? 'charts' : 'market'} data-loading-kind={snapshotLoading&&!data.doc&&!independent?navigation.tab:undefined} className={embedded?'atlas-embedded-workspace':'workspace atlas-service-workspace'}><h1 className="atlas-sr-only">{workspaceTitle}</h1>
      <CompactToolbarHost />
      {chartWorkspace ? !embedded && <CompactToolbar label="종목 선택" order={0}><ChartWorkspaceToolbar instrument={currentInstrument} onSelect={selectInstrument}/></CompactToolbar> : <MarketWorkspaceToolbar page={page.id} onNavigate={navigatePage}/>}
      {!independent&&notice && <CompactToolbar label="자료 상태" order={90}><span className="compact-toolbar-muted ml-delivery" style={{display:'inline',padding:0,background:'transparent',fontSize:11}} role="status">{notice.text}</span><button className="compact-toolbar-action" data-action="market-refresh" type="button" onClick={retry}>{notice.retry}</button></CompactToolbar>}
      <section id="market-view" className="market-lab" aria-label={page.title} aria-busy={!independent&&snapshotLoading}>
        <div className="ml-scroll">
          {!independent&&snapshotLoading && <div className="atlas-inline-loading" role="status"><span className="atlas-loading-label">자료를 읽고 있습니다.</span><i skullet-bar="" /></div>}
          {!independent&&data.phase === 'error' && <div className="ml-status" aria-live="polite">자료 오류 · {data.error} <button type="button" data-action="retry" onClick={retry}>데이터 다시 읽기</button></div>}
          {!independent&&data.phase === 'empty' && <div className="ml-status" aria-live="polite">스냅샷은 읽었지만 관측 자료가 없습니다. 없는 지표는 판단을 유보합니다.</div>}
          <section id="ml-panel" role={chartWorkspace ? 'region' : 'tabpanel'} aria-label={chartWorkspace || embedded ? page.title : undefined} aria-labelledby={chartWorkspace || embedded ? undefined : `workspace-tab-${page.id}`} tabIndex={0}>
            {navigation.tab === 'diagnosis' && (data.phase==='loading'&&!data.doc?<LoadingSkeleton kind="diagnosis" label="시장 자료 로딩"/>:<DiagnosisPanel snapshot={data.doc} region={navigation.region} now={now} marketId={marketId} priceIndex={priceIndex} collection={collection.data} collectionError={collection.error} saved={data.phase==='error'||delivery?.kind==='saved'||data.retainedPrevious} onRefresh={retry}
              onMarket={market => setMarketSelections(previous=>({...previous,[navigation.region]:{marketId:market,priceIndex:null}}))}
              onDate={index => setMarketSelections(previous=>({...previous,[navigation.region]:{...previous[navigation.region],priceIndex:index}}))} />)}
            {navigation.tab === 'scenario' && <ScenarioPanel state={scenario} onChange={setScenario} />}
            {navigation.tab === 'ai' && <EconomicsPanel state={economics} onChange={setEconomics} />}
            {navigation.tab === 'rsi' && (data.phase==='loading'&&!data.doc?<LoadingSkeleton kind="rsi" label={`${rsiSymbol} 가격·RSI 로딩`}/>:<RsiPanel key={rsiSymbol} embedded={embedded} active={centerActive} epoch={centerEpoch} chartCache={rsiChartCache.current} historyCache={rsiHistoryCache.current} symbol={rsiSymbol} onSymbol={selectRsi} revision={delivery?.revision} snapshot={data.doc} now={now} state={rsi} onChange={value => setRsiStates(previous => ({...previous,[rsiSymbol]:value}))} />)}
            {navigation.tab === 'housing'&&<HousingPanel cache={housingCache.current} selectedRegion={housingRegion} embedded={embedded} active={centerActive} epoch={centerEpoch} onRegion={region => { const instrument=WORKSPACE_INSTRUMENTS.find(item => item.page === 'housing' && item.region === region); if(instrument)selectInstrument(instrument); }}/>}
            {navigation.tab === 'themes'&&<ThemePanel cache={themeCache.current} embedded={embedded} active={centerActive} epoch={centerEpoch}/>}
          </section>
          {!independent&&<SourceDisclosure key={`${navigation.tab}:${navigation.region}`} snapshot={data.doc} region={navigation.region} now={now} onOpen={()=>setSnapshotRequested(true)}/>}
        </div>
      </section>
    </main>
  </CompactToolbarProvider>;
}
