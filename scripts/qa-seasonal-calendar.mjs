#!/usr/bin/env node
// 시즌 테마 달력 전수 점검: 연도별 커버리지·충돌·공백을 출력한다.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SEASONAL_THEMES, describeYear, eventDate } from '../dist/ui/seasonal-theme.js';

const table = JSON.parse(await readFile(resolve('dist/data/seasonal/lunar-calendar.json'), 'utf8'));
const years = Object.keys(table.years).map(Number).sort();
let problems = 0;
const rows = [];

for (const year of years) {
  const days = describeYear(year, { lunarTable: table });
  const covered = days.filter(d => d.season).length;
  const used = [...new Set(days.map(d => d.season).filter(Boolean))];
  const problemsThisYear = [];
  for (const theme of SEASONAL_THEMES) {
    const peak = eventDate(theme, year, table);
    if (!peak) { problemsThisYear.push(`${theme.id}:no-peak`); continue; }
    const own = days.filter(d => d.season === theme.id);
    const inside = own.every(d => {
      const delta = (new Date(`${d.day}T00:00:00Z`) - new Date(`${peak}T00:00:00Z`)) / 86400000;
      return delta >= -theme.before && delta <= theme.after;
    });
    if (!inside) problemsThisYear.push(`${theme.id}:out-of-window`);
  }
  if (!days.every((d, i) => i === 0 || d.day > days[i - 1].day)) problemsThisYear.push('order');
  problems += problemsThisYear.length;
  rows.push({ year, days: days.length, covered, pct: Math.round((covered / days.length) * 100), themes: used.length, problems: problemsThisYear.join(',') || '-' });
}

console.log('year  days  covered  pct  themes  problems');
for (const r of rows) console.log(`${r.year}  ${String(r.days).padStart(4)}  ${String(r.covered).padStart(7)}  ${String(r.pct).padStart(3)}%  ${String(r.themes).padStart(6)}  ${r.problems}`);
console.log(`\ntotal problems: ${problems}`);
process.exitCode = problems === 0 ? 0 : 1;
