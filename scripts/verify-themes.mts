import {readFile,writeFile} from 'node:fs/promises';
import {themePerformance,themeComparison,type ThemeJudgment} from '@atlas/domain/themes';
const snapshot=JSON.parse(await readFile(new URL('../dist/data/themes.json',import.meta.url),'utf8'));
const records:ThemeJudgment[]=snapshot.asset.bars.map((b:[string,...number[]],i:number)=>({id:`window-${i}`,title:'완료봉 구간 검산',assetId:'hype',mode:'reconstructed',asOf:b[0]+'T20:00:00Z',recordedAt:snapshot.generatedAt,criteria:{continuity:{state:'hold',reason:'수치 검산',evidenceIds:[]},expectation:{state:'hold',reason:'수치 검산',evidenceIds:[]},novelty:{state:'hold',reason:'수치 검산',evidenceIds:[]}}}));
const grid=records.map(j=>({asOf:j.asOf,result:themePerformance(snapshot,j)}));
await writeFile(new URL('../build/theme-materials/numerical-grid.json',import.meta.url),JSON.stringify(grid));
await writeFile(new URL('../build/theme-materials/seed-results.json',import.meta.url),JSON.stringify({judgments:snapshot.judgments.map((j:ThemeJudgment)=>({title:j.title,mode:j.mode,result:themePerformance(snapshot,j)})),comparison:themeComparison(snapshot,snapshot.judgments)},null,2));
console.log(JSON.stringify({decisionDates:grid.length,horizons:3,windows:grid.length*3}));
