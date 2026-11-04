export const axes=['continuity','expectation','novelty'] as const;
export type ThemeAxis=typeof axes[number];
export type VerdictState='pass'|'fail'|'hold';
export type ThemeBar=[string,number,number,number,number,number];
export type ThemeEvidence={id:string;title:string;url:string|null;kind:'official'|'issuer'|'release'|'note';publishedAt:string|null;precision:'instant'|'day'|'unknown';retrievedAt:string;sha256:string;summary:string;expectedAt:string|null;status:'observed'|'scheduled'|'cancelled'};
export type ThemeCriterion={state:VerdictState;reason:string;evidenceIds:string[]};
export type ThemeCriteria=Record<ThemeAxis,ThemeCriterion>;
export type ThemeJudgment={id:string;title:string;assetId:'hype';mode:'recorded'|'reconstructed';asOf:string;recordedAt:string;criteria:ThemeCriteria};
export type ThemeSnapshot={schemaVersion:1;generatedAt:string;rubricVersion:'ygs-1';asset:{id:'hype';symbol:'HYPE';pair:'@107';quote:'USDC';name:string;theme:string;bars:ThemeBar[]};benchmark:{symbol:'BTC';kind:'perpetual';quote:'USD';bars:ThemeBar[]};evidence:ThemeEvidence[];judgments:ThemeJudgment[];priceSources:{id:string;url:string;sha256:string;retrievedAt:string}[]};
export type ThemeDraft={title:string;criteria:ThemeCriteria};
const instant=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
const validDay=(s:string)=>/^\d{4}-\d\d-\d\d$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export const evidenceAvailableAt=(e:ThemeEvidence)=>e.publishedAt===null?e.retrievedAt:e.precision==='day'?`${e.publishedAt.slice(0,10)}T23:59:59.999Z`:e.publishedAt;
export function validateThemeCriteria(criteria:ThemeCriteria,evidence:ThemeEvidence[],asOf:string):ThemeCriteria{
  if(!criteria||Object.keys(criteria).length!==3)throw new Error('연·기·신 세 항목을 확인하세요.');
  const normalized={} as ThemeCriteria;
  for(const axis of axes){const c=criteria[axis];if(!c||!['pass','fail','hold'].includes(c.state)||typeof c.reason!=='string'||!c.reason.trim()||c.reason.length>400||!Array.isArray(c.evidenceIds)||c.evidenceIds.length>12||new Set(c.evidenceIds).size!==c.evidenceIds.length||c.state!=='hold'&&!c.evidenceIds.length)throw new Error('각 판정의 이유와 근거를 확인하세요.');
    for(const id of c.evidenceIds){const e=evidence.find(e=>e.id===id);if(!e||Date.parse(evidenceAvailableAt(e))>Date.parse(asOf))throw new Error('판정 시점 이후 또는 존재하지 않는 근거입니다.');}
    normalized[axis]={state:c.state,reason:c.reason.trim(),evidenceIds:[...c.evidenceIds].sort()};
  }return normalized;
}
export function validateThemeJudgment(record:ThemeJudgment,snapshot:ThemeSnapshot){
  if(!record||typeof record.id!=='string'||!record.id||record.id.length>100||typeof record.title!=='string'||!record.title.trim()||record.title.length>100||record.assetId!=='hype'||!['recorded','reconstructed'].includes(record.mode)||!instant(record.asOf)||!instant(record.recordedAt)||Date.parse(record.asOf)>Date.parse(record.recordedAt)||record.mode==='recorded'&&record.asOf!==record.recordedAt)throw new Error('판정 기록 형식 오류');
  validateThemeCriteria(record.criteria,snapshot.evidence,record.asOf);return record;
}
export function validateThemeSnapshot(input:unknown):ThemeSnapshot{
  const s=input as ThemeSnapshot;if(!s||s.schemaVersion!==1||s.rubricVersion!=='ygs-1'||!instant(s.generatedAt)||s.asset?.id!=='hype'||s.asset.pair!=='@107'||s.asset.quote!=='USDC'||s.benchmark?.symbol!=='BTC'||s.benchmark.kind!=='perpetual'||s.benchmark.quote!=='USD')throw new Error('테마 자료 형식 오류');
  for(const bars of [s.asset.bars,s.benchmark.bars]){if(!Array.isArray(bars)||bars.length<2||bars.length>5000)throw new Error('가격 자료 부족');let previous='';for(const b of bars){if(!Array.isArray(b)||b.length!==6||!validDay(b[0])||b[0]<=previous||Date.parse(b[0]+'T00:00:00Z')+86400000>Date.parse(s.generatedAt)||b.slice(1).some(v=>typeof v!=='number'||!Number.isFinite(v))||Math.min(b[1],b[2],b[3],b[4])<=0||b[2]<Math.max(b[1],b[3],b[4])||b[3]>Math.min(b[1],b[2],b[4])||b[5]<0)throw new Error('완료 일봉 형식 오류');previous=b[0];}}
  if(!Array.isArray(s.evidence)||s.evidence.length>100||new Set(s.evidence.map(e=>e.id)).size!==s.evidence.length)throw new Error('근거 목록 오류');
  for(const e of s.evidence){if(!e.id||!e.title||!e.summary||!['official','issuer','release','note'].includes(e.kind)||!['instant','day','unknown'].includes(e.precision)||!['observed','scheduled','cancelled'].includes(e.status)||!instant(e.retrievedAt)||Date.parse(e.retrievedAt)>Date.parse(s.generatedAt)||!/^([a-f0-9]{64})$/.test(e.sha256)||e.publishedAt!==null&&!instant(e.publishedAt)||e.expectedAt!==null&&!instant(e.expectedAt))throw new Error('근거 시각·무결성 오류');if(e.url!==null){const u=new URL(e.url);if(u.protocol!=='https:'||u.username||u.password)throw new Error('근거 URL 오류');}}
  if(!Array.isArray(s.priceSources)||s.priceSources.length!==2||s.priceSources.some(p=>p.url!=='https://api.hyperliquid.xyz/info'||!instant(p.retrievedAt)||Date.parse(p.retrievedAt)>Date.parse(s.generatedAt)||!/^[a-f0-9]{64}$/.test(p.sha256)))throw new Error('가격 출처 오류');
  if(!Array.isArray(s.judgments)||s.judgments.length>50||new Set(s.judgments.map(j=>j.id)).size!==s.judgments.length)throw new Error('판정 목록 오류');for(const j of s.judgments){validateThemeJudgment(j,s);if(Date.parse(j.recordedAt)>Date.parse(s.generatedAt))throw new Error('미래 판정 기록');}return s;
}
export function normalizeThemeDraft(input:ThemeDraft,evidence:ThemeEvidence[],asOf:string):ThemeDraft{
  if(!input||typeof input.title!=='string'||!input.title.trim()||input.title.length>100)throw new Error('판정 이름을 확인하세요.');return {title:input.title.trim(),criteria:validateThemeCriteria(input.criteria,evidence,asOf)};
}
export function themeStatus(j:ThemeJudgment){return axes.some(a=>j.criteria[a].state==='fail')?'fail':axes.every(a=>j.criteria[a].state==='pass')?'pass':'hold';}
const dayAfter=(s:string,n=1)=>new Date(Date.parse(s.slice(0,10)+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export function themePerformance(snapshot:ThemeSnapshot,judgment:ThemeJudgment){
  validateThemeJudgment(judgment,snapshot);
  const bars=new Map(snapshot.asset.bars.map(b=>[b[0],b])),benchmark=new Map(snapshot.benchmark.bars.map(b=>[b[0],b]));
  // Entry uses the close of the next UTC day, whose entire bar follows the decision.
  const entryDate=dayAfter(judgment.asOf),entry=bars.get(entryDate),last=snapshot.asset.bars.at(-1)![0];
  return [1,5,20].map(horizon=>{
    const exitDate=dayAfter(entryDate,horizon),exit=bars.get(exitDate),path=Array.from({length:horizon},(_,i)=>bars.get(dayAfter(entryDate,i+1)));
    const status=exitDate>last?'pending':!entry||!exit||path.some(b=>!b)?'unavailable':'observed';
    if(status!=='observed')return {horizon,status,entryDate,exitDate,entry:entry?.[4]??null,exit:null,change:null,benchmarkChange:null,excess:null,adverse:null,favorable:null};
    const change=100*(exit![4]/entry![4]-1),a=benchmark.get(entryDate),b=benchmark.get(exitDate),benchPath=Array.from({length:horizon+1},(_,i)=>benchmark.get(dayAfter(entryDate,i)));
    const benchmarkChange=a&&b&&benchPath.every(Boolean)?100*(b[4]/a[4]-1):null;
    return {horizon,status,entryDate,exitDate,entry:entry![4],exit:exit![4],change,benchmarkChange,excess:benchmarkChange===null?null:change-benchmarkChange,adverse:Math.min(0,...path.map(b=>100*(b![3]/entry![4]-1))),favorable:Math.max(0,...path.map(b=>100*(b![2]/entry![4]-1)))};
  });
}
export function themeComparison(snapshot:ThemeSnapshot,judgments:ThemeJudgment[]){
  return (['recorded','reconstructed'] as const).flatMap(mode=>(['pass','hold','fail'] as const).flatMap(status=>[1,5,20].map(horizon=>{
    const records=judgments.filter(j=>j.mode===mode&&themeStatus(j)===status),results=records.map(j=>themePerformance(snapshot,j).find(p=>p.horizon===horizon)!);
    const completed=results.filter(p=>p.status==='observed'),returns=completed.map(p=>p.change!),excess=completed.flatMap(p=>p.excess===null?[]:[p.excess]);
    return {mode,status,horizon,records:records.length,n:completed.length,pending:results.filter(p=>p.status==='pending').length,unavailable:results.filter(p=>p.status==='unavailable').length,up:returns.filter(v=>v>0).length,down:returns.filter(v=>v<0).length,flat:returns.filter(v=>v===0).length,mean:returns.length?returns.reduce((s,v)=>s+v,0)/returns.length:null,excessN:excess.length,meanExcess:excess.length?excess.reduce((s,v)=>s+v,0)/excess.length:null};
  })));
}
