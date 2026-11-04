export type MonthlyPoint = [string, number];
export type HousingSource = { id:string; title:string; url:string; sha256:string; retrievedAt:string; unit:string; clockBasis:string };
export type HousingRegion = { id:string; label:string; code:string; volume:MonthlyPoint[]; price:MonthlyPoint[] };
export type HousingSnapshot = { schemaVersion:1; generatedAt:string; volumeBasis:'report-month'; priceBasis:'contract-month'; indexBase:string; sources:HousingSource[]; regions:HousingRegion[] };
export type HousingOptions = { region:string; window:number; band:number; lag:number; start:string; end:string };
export type VolumeState = 'above'|'neutral'|'below'|'warmup';
export type HousingRow = { month:string; volume:number|null; price:number|null; average:number|null; deviation:number|null; state:VolumeState; priceChange:number|null; volumeChange:number|null };
const monthPattern=/^\d{4}-(0[1-9]|1[0-2])$/;
export const monthNumber=(s:string)=>Number(s.slice(0,4))*12+Number(s.slice(5,7))-1;
export const monthAfter=(s:string,n:number)=>{const m=monthNumber(s)+n;return `${Math.floor(m/12)}-${String(m%12+1).padStart(2,'0')}`;};
export function validateHousing(input:unknown):HousingSnapshot {
  const d=input as HousingSnapshot;
  if(!d||d.schemaVersion!==1||!Number.isFinite(Date.parse(d.generatedAt))||d.volumeBasis!=='report-month'||d.priceBasis!=='contract-month'||typeof d.indexBase!=='string'||!d.indexBase.trim())throw new Error('부동산 자료 형식 오류');
  if(!Array.isArray(d.sources)||d.sources.length!==2||new Set(d.sources.map(s=>s.id)).size!==2)throw new Error('원천 자료 누락');
  for(const s of d.sources)if(!/^[a-f0-9]{64}$/.test(s.sha256)||!/^https:\/\/www\.reb\.or\.kr\//.test(s.url)||!Number.isFinite(Date.parse(s.retrievedAt))||Date.parse(s.retrievedAt)>Date.parse(d.generatedAt)||!s.unit||!s.clockBasis)throw new Error('출처 확인 오류');
  if(!Array.isArray(d.regions)||!d.regions.length||d.regions.length>25||new Set(d.regions.map(r=>r.id)).size!==d.regions.length)throw new Error('지역 자료 오류');
  for(const r of d.regions){
    if(!/^[a-z-]+$/.test(r.id)||!r.label||!/^\d+$/.test(r.code))throw new Error('지역 식별 오류');
    for(const kind of ['volume','price'] as const){
      if(!Array.isArray(r[kind])||r[kind].length<2||r[kind].length>2000)throw new Error('월별 자료 부족');
      let previous='';for(const p of r[kind]){
        if(!Array.isArray(p)||p.length!==2||!monthPattern.test(p[0])||p[0]<=previous||p[0]>=d.generatedAt.slice(0,7)||!Number.isFinite(p[1])||(kind==='price'?p[1]<=0:p[1]<0)||kind==='volume'&&!Number.isInteger(p[1]))throw new Error('월별 관측값 오류');previous=p[0];
      }
    }
  }
  return d;
}
export function housingRows(region:HousingRegion,window:number,band:number):HousingRow[]{
  const volumes=new Map(region.volume),prices=new Map(region.price);
  return [...new Set([...volumes.keys(),...prices.keys()])].sort().map(month=>{
    const volume=volumes.get(month)??null,price=prices.get(month)??null;
    const history=Array.from({length:window},(_,i)=>volumes.get(monthAfter(month,-i-1)));
    const average=history.every(v=>v!==undefined)?history.reduce<number>((s,v)=>s+v!,0)/window:null;
    const deviation=volume!==null&&average!==null&&average>0?(volume/average-1)*100:null;
    const delta=volume!==null&&average!==null?volume-average:null,margin=average!==null?average*band/100:0;
    const tolerance=Number.EPSILON*Math.max(1,Math.abs(volume??0),Math.abs(average??0))*8;
    const state:VolumeState=deviation===null?'warmup':delta!>margin+tolerance?'above':delta!< -margin-tolerance?'below':'neutral';
    const prevPrice=prices.get(monthAfter(month,-1)),prevVolume=volumes.get(monthAfter(month,-1));
    return {month,volume,price,average,deviation,state,priceChange:price!==null&&prevPrice?100*(price/prevPrice-1):null,volumeChange:volume!==null&&prevVolume?100*(volume/prevVolume-1):null};
  });
}
export function correlation(pairs:[number,number][]){
  const n=pairs.length;if(n<3)return {n,r:null};
  const x=pairs.reduce((s,p)=>s+p[0],0)/n,y=pairs.reduce((s,p)=>s+p[1],0)/n;
  let xy=0,xx=0,yy=0;for(const [a,b] of pairs){xy+=(a-x)*(b-y);xx+=(a-x)**2;yy+=(b-y)**2;}
  return {n,r:xx>0&&yy>0?Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy))):null};
}
type Outcome={month:string;entry:string;exit:string;state:Exclude<VolumeState,'warmup'>;change:number};
function summarize(outcomes:Outcome[],direction:'up'|'down',anchor:number,horizon:number){
  const n=outcomes.length,up=outcomes.filter(r=>r.change>0).length,down=outcomes.filter(r=>r.change<0).length,flat=n-up-down;
  const sorted=outcomes.map(r=>r.change).sort((a,b)=>a-b),hit=direction==='up'?up:down;
  const independent=outcomes.filter(r=>(monthNumber(r.month)-anchor)%horizon===0),independentHits=independent.filter(r=>direction==='up'?r.change>0:r.change<0).length;
  return {n,up,down,flat,hit,rate:n?hit/n*100:null,mean:n?sorted.reduce((s,v)=>s+v,0)/n:null,median:n?(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2:null,
    nonOverlapping:{n:independent.length,hit:independentHits,rate:independent.length?independentHits/independent.length*100:null}};
}
export function analyzeHousing(snapshot:HousingSnapshot,options:HousingOptions){
  validateHousing(snapshot);
  const region=snapshot.regions.find(r=>r.id===options.region);
  if(!region||![12,36,60].includes(options.window)||![0,5,10,20].includes(options.band)||![0,1,2,3].includes(options.lag)||!monthPattern.test(options.start)||!monthPattern.test(options.end)||options.start>options.end)throw new Error('분석 조건을 확인하세요.');
  const rows=housingRows(region,options.window,options.band),selected=rows.filter(r=>r.month>=options.start&&r.month<=options.end),byMonth=new Map(rows.map(r=>[r.month,r]));
  const pairs=(x:keyof HousingRow,y:keyof HousingRow):[number,number][]=>selected.filter(r=>typeof r[x]==='number'&&typeof r[y]==='number').map(r=>[r[x] as number,r[y] as number]);
  const relations={levels:correlation(pairs('volume','price')),changes:correlation(pairs('volumeChange','priceChange')),deviation:correlation(pairs('deviation','priceChange')),
    lags:Array.from({length:13},(_,i)=>{const lag=i-6;const pairs:[number,number][]=[];for(const r of selected){const future=byMonth.get(monthAfter(r.month,lag));if(r.deviation!==null&&future?.priceChange!==null&&future?.priceChange!==undefined&&future.month>=options.start&&future.month<=options.end)pairs.push([r.deviation,future.priceChange]);}return {lag,...correlation(pairs)};})};
  const eligible=selected.filter(r=>r.state!=='warmup');
  const backtests=[1,3,6,12].map(horizon=>{
    const outcomes:Outcome[]=[];
    for(const r of eligible){const entry=monthAfter(r.month,options.lag),exit=monthAfter(entry,horizon);const a=byMonth.get(entry)?.price,b=byMonth.get(exit)?.price;
      // Missing or out-of-period terminal observations are never flat outcomes.
      if(a===null||a===undefined||b===null||b===undefined||exit>options.end)continue;
      // Every calendar price month must be observed; gaps cannot be bridged.
      if(Array.from({length:horizon+1},(_,i)=>byMonth.get(monthAfter(entry,i))?.price).some(v=>v===null||v===undefined))continue;
      outcomes.push({month:r.month,entry,exit,state:r.state as Outcome['state'],change:100*(b/a-1)});
    }
    const anchor=outcomes.length?monthNumber(outcomes[0].month):0;
    const groups=(subset:Outcome[])=>['above','neutral','below'].map(state=>{const direction=state==='below'?'down':'up',base=summarize(subset,direction,anchor,horizon),summary=summarize(subset.filter(r=>r.state===state),direction,anchor,horizon);return {state,direction,...summary,baseline:base,lift:summary.rate!==null&&base.rate!==null?summary.rate-base.rate:null};});
    return {horizon,eligible:eligible.length,excluded:eligible.length-outcomes.length,groups:groups(outcomes),holdoutStart:'2021-01',holdout:groups(outcomes.filter(r=>r.month>='2021-01')),outcomes};
  });
  return {options,region:region.label,rows,selectedCount:selected.length,relations,backtests};
}
export type HousingAnalysis=ReturnType<typeof analyzeHousing>;
