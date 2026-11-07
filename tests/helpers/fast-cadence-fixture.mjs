import {fastCadencePolicy} from '../../scripts/browser-fast-cadence-contract.mjs';

// Synthetic receipt data only; never used as rendered browser evidence.
export function fastCadenceFixture({sourceCommit='a'.repeat(40),sourceTree='b'.repeat(40),count=17}={}){
  const expectedObservationDates=Array.from({length:count},(_,index)=>new Date(Date.parse('2026-10-21T00:00:00Z')+index*86400000).toISOString().slice(0,10));
  const context={sourceCommit,sourceTree,sourceInventorySha256:'e'.repeat(64),suiteRunId:'11111111-1111-4111-8111-111111111111',expectedObservationDates};
  const measurement={speed:10,expectedMilliseconds:100,allowedMeanRatio:[.85,1.3],
    observations:expectedObservationDates.map((cursor,index)=>({cursor,at:100+index*100})),intervals:Array(count-1).fill(100),
    meanMilliseconds:100,averageUpdatesPerSecond:10,setupAllowanceMilliseconds:5000,completionTimeoutMilliseconds:Math.ceil(count*100*1.3)+5000};
  const milestone={schemaVersion:1,kind:'atlas-browser-fast-cadence',phase:fastCadencePolicy.phase,
    sourceCommit,sourceTree,sourceInventorySha256:context.sourceInventorySha256,suiteRunId:context.suiteRunId,
    lane:'chart-replay',caseSpec:structuredClone(fastCadencePolicy.caseSpec),status:'passed',restored:true,
    startedAt:'2026-11-07T00:00:00.000Z',completedAt:'2026-11-07T00:00:02.000Z',
    fixture:{origin:fastCadencePolicy.origin,displayFrequency:'weekly',updateInterval:'daily',viewStart:'2022-11-07',viewEnd:'2026-11-07'},measurement};
  const release={schemaVersion:1,kind:'atlas-browser-fast-cadence-release',phase:fastCadencePolicy.phase,
    ...context,lane:'chart-replay',caseSpec:structuredClone(fastCadencePolicy.caseSpec),status:'passed',reason:'milestone',
    startedAt:'2026-11-07T00:00:00.000Z',releasedAt:'2026-11-07T00:00:03.000Z',durationMs:3000,milestone};
  return {context,milestone,release};
}
