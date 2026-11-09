#!/usr/bin/env node
// 음력 명절(설날·추석·부처님오신날)의 양력 날짜 표를 만든다.
// 변환은 MIT 라이선스 korean-lunar-calendar(devDependency)를 쓰고, 결과 JSON만 배포한다.
// 런타임에는 의존성이 없으며 이 스크립트는 명절 날짜가 바뀌는 해에만 다시 돌린다.
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import pkg from 'korean-lunar-calendar';

const Lunar = pkg.KoreanLunarCalendar || pkg.default || pkg;
const START = Number(process.argv[2] || 2024);
const END = Number(process.argv[3] || 2040);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.year}-${pad(d.month)}-${pad(d.day)}`;

function solarOf(lunarYear, lunarMonth, lunarDay) {
  const cal = new Lunar();
  if (!cal.setLunarDate(lunarYear, lunarMonth, lunarDay, false)) throw new Error(`lunar ${lunarYear}-${lunarMonth}-${lunarDay} unsupported`);
  return iso(cal.getSolarCalendar());
}

const calendar = {
  version: 1,
  method: 'korean-lunar-calendar@0.4.0 (음력→양력, 윤달 없음 기준)',
  generatedAt: new Date().toISOString().slice(0, 10),
  years: {},
};

for (let year = START; year <= END; year += 1) {
  calendar.years[year] = {
    seollal: solarOf(year, 1, 1),
    buddha: solarOf(year, 4, 8),
    chuseok: solarOf(year, 8, 15),
  };
}

const out = resolve('dist/data/seasonal/lunar-calendar.json');
await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(calendar, null, 2)}\n`);
console.log(`wrote ${out} (${START}-${END})`);
for (const y of [2024, 2025, 2026, 2027, 2030, 2033]) console.log(y, JSON.stringify(calendar.years[y]));
