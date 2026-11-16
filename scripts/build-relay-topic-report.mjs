#!/usr/bin/env node
// Deterministic, source-bound documentation for the exact same rules the UI uses.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {RELAY_TOPICS,relayTopicReport} from '../dist/relay-topics.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const input=await readFile(resolve(root,'dist/data/relay/index.json'));
const report={...relayTopicReport(JSON.parse(input)),sourceSha256:createHash('sha256').update(input).digest('hex')};
report.counts=Object.fromEntries(RELAY_TOPICS.map(t=>[t.id,report.entries.filter(e=>e.topics.some(x=>x.id===t.id)).length]));
const cell=s=>String(s??'미제공').replaceAll('|','\\|').replace(/\s+/g,' ').trim();
const lines=['# 릴레이 분류 스냅샷','',`자료 시각: ${report.generatedAt}. 항목 ${report.entries.length}개. 원문 SHA-256: \`${report.sourceSha256}\`.`,
'','UI와 이 문서는 `dist/relay-topics.js`의 같은 규칙을 사용한다. 새 데이터는 UI에서 즉시 재분류하며, 이 문서는 `node scripts/build-relay-topic-report.mjs`로 갱신한다. `--check`는 원문과 규칙이 바뀐 뒤 오래된 문서를 성공으로 처리하지 않는다.',
'','원문 텍스트의 키워드에 근거한 다중 분류이며 의미·사실 검증이나 투자 추천이 아니다. 이미지 내용은 추론하지 않고 **미분류**로 남긴다. 원문 링크가 제공되지 않은 항목은 링크를 만들어내지 않는다. 원문·이미지·순서는 수정하지 않았다.',
'','## 분류 축','', '| 분류 | 키워드 | 배정 수(중복 가능) |','|---|---|---:|',...RELAY_TOPICS.map(t=>`| ${t.label} | ${cell(t.terms.join(' · ')||'분류 근거가 없는 항목')} | ${report.counts[t.id]} |`),
'','## 항목별 배정','', '| 방 | 항목 ID | 시각 | 분류 | 원문 근거 | 원문 링크 |','|---|---|---|---|---|---|',...report.entries.map(e=>`| ${cell(e.roomTitle)} | ${cell(e.id)} | ${cell(e.time)} | ${e.topics.map(t=>t.label).join(' · ')} | ${cell(e.topics.map(t=>t.evidence?`${t.evidence.field}[${t.evidence.offset}:${t.evidence.offset+t.evidence.length}] 「${t.evidence.quote}」`:e.reason).join(' / '))} | ${cell(e.sourceUrl)} |`),''];
const outputs=new Map([['classification.json',JSON.stringify(report,null,2)+'\n'],['CLASSIFICATION.md',lines.join('\n')]]),dir=resolve(root,'docs/evidence/local-r22');
if(process.argv.includes('--check')){for(const [name,content]of outputs)assert.equal(await readFile(resolve(dir,name),'utf8'),content,`stale ${name}`);}else{await mkdir(dir,{recursive:true});for(const [name,content]of outputs)await writeFile(resolve(dir,name),content);}
console.log(JSON.stringify({status:'passed',mode:process.argv.includes('--check')?'check':'write',sourceSha256:report.sourceSha256,entries:report.entries.length,counts:report.counts}));
