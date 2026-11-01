import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  applyObservedPreset,
  checkFixtures,
  evaluateFixture,
  findListingTable,
  isPublicIpoData,
  parsePeriod,
  periodState,
  refreshOfficial,
  viewerBodyPath,
  writeCandidate,
} from '../scripts/refresh-ipo-official.mjs';

const scriptUrl = fileURLToPath(new URL('../scripts/refresh-ipo-official.mjs', import.meta.url));
const publicData = fileURLToPath(new URL('../dist/data/ipo-calendar.json', import.meta.url));

test('fixtures reject omission, follow-on, withdrawal, reversal, 403, and unclear IPO promotion', async () => {
  const checked = await checkFixtures();
  assert.equal(checked.ok, true, JSON.stringify(checked.results.filter(item => !item.ok)));
  assert.equal(checked.results.length >= 9, true);
});

test('an explicit listing table and original dates confirm a sample, not the run or market', () => {
  const result = evaluateFixture({
    board: [page('표본전자', '20261101000001', '2026.11.02~2026.11.03')],
    documents: [{ rcpNo: '20261101000001', html: '<table><tr><td>인수(주선) 여부</td><td colspan="3">지분증권 등 상장을 위한 공모여부</td></tr><tr><td>인수</td><td>예</td><td>코스닥시장</td><td>신규상장</td></tr></table><table><tr><td>청약기일</td><td>납입기일</td></tr><tr><td>2026년 11월 02일 ~ 2026년 11월 03일</td><td>2026년 11월 06일</td></tr></table>' }],
  });
  assert.equal(result.verified, false);
  assert.equal(result.marketComplete, false);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].listingValue, '코스닥시장 신규상장');
});

test('a distant new-listing keyword is not the required table cell', () => {
  const found = findListingTable('코스닥시장 신규상장만 있고 표 제목은 없다');
  assert.equal(found.found, false);
  const labeled = findListingTable('지분증권 등 상장을 위한 공모여부 해당없음');
  assert.equal(labeled.found, false, 'a naked nearby label is not a table field');
  assert.equal(labeled.value, null);
});

test('date round trip preserves month and year rollover and period state', () => {
  const period = parsePeriod('2026.12.31~2027.01.22');
  assert.deepEqual([period.start, period.end, period.reversed], ['2026-12-31', '2027-01-22', false]);
  assert.equal(parsePeriod('2026년 11월 03일 ~ 2026년 11월 04일').start, '2026-11-03');
  assert.equal(parsePeriod('2026.11.04~2026.11.03').reversed, true);
  assert.equal(periodState(period, '2026-12-31'), 'in_progress');
  assert.equal(periodState(period, '2027-01-23'), 'completed');
  assert.equal(periodState(period, '2026-12-30'), 'upcoming');
});

test('observed six-month preset records overflow instead of inventing a constant', () => {
  assert.deepEqual(applyObservedPreset(new Date(2026, 10, 1), 3), {
    preset: 3, bgnDe: '2026-05-01', endDe: '2026-11-01', overflowRecorded: true,
  });
  assert.equal(applyObservedPreset(new Date(2026, 0, 15), 3).bgnDe, '2025-07-15');
  assert.equal(applyObservedPreset(new Date(2026, 2, 31), 2).bgnDe, '2026-03-03');
});

test('viewer body URL uses only fields present in the observed viewDoc call', () => {
  assert.equal(
    viewerBodyPath({ rcpNo: '20260929000191', dcmNo: '11593609', eleId: '1', offset: '651', length: '564368', dtd: 'dart4.xsd' }),
    '/report/viewer.do?rcpNo=20260929000191&dcmNo=11593609&eleId=1&offset=651&length=564368&dtd=dart4.xsd',
  );
  assert.equal(viewerBodyPath({ rcpNo: '1' }), null);
});

test('HTTP 403 is a source failure, not an empty success, and does not replace a complete candidate', async () => {
  const failed = evaluateFixture({ httpStatus: 403, source: 'opendart-list' });
  assert.equal(failed.status, 'source_failed');
  assert.equal(failed.verified, false);
  assert.equal(failed.coverage.complete, false);
  assert.deepEqual(failed.candidates, []);
  const dir = await mkdtemp(resolve(tmpdir(), 'ipo-official-'));
  const out = resolve(dir, 'candidate.json');
  const previous = { ...failed, status: 'needs_review', verified: false, coverage: { complete: true }, sources: [{ observedAt: '2026-10-01T00:00:00.000Z' }] };
  await writeCandidate(out, previous);
  const preserved = await writeCandidate(out, failed, { replaceComplete: false });
  assert.equal(preserved.preserved, true);
  assert.equal(JSON.parse(await readFile(out, 'utf8')).sources[0].observedAt, '2026-10-01T00:00:00.000Z');
});

test('published IPO data and KIND are outside this collector', async () => {
  assert.equal(isPublicIpoData(publicData), true);
  await assert.rejects(() => writeCandidate(publicData, { coverage: { complete: false } }));
  const before = (await stat(publicData)).mtimeMs;
  assert.equal((await stat(publicData)).mtimeMs, before);
  const source = readFileSync(scriptUrl, 'utf8');
  assert.equal(source.includes('https://kind.krx.co.kr'), false);
  assert.match(source, /KIND collection is excluded/);
  const urls = [];
  const scratch = await mkdtemp(resolve(tmpdir(), 'ipo-official-kind-'));
  const failed = await refreshOfficial({offlineFixture:true,
    out: resolve(scratch, 'failed.json'),
    evidenceDir: resolve(scratch, 'failed-evidence'),
    fetchImpl: async url => {
      urls.push(String(url));
      if (String(url).includes('kind.kr')) throw new Error('KIND requested');
      return new Response('', { status: 403 });
    },
  });
  assert.equal(failed.status, 'source_failed');
  assert.equal(failed.verified, false);
  assert.equal(urls.some(url => url.includes('kind.kr')), false);
});

function page(name, rcp, period) {
  return `<div class="pageInfo">[1/1] [총 1건]</div><table><tr><td>1</td><td><span class="tagCom_etc" title="기타법인"></span><a title="${name} 기업개황 새창">${name}</a></td><td><a href="/dsaf001/main.do?rcpNo=${rcp}">증권신고서(지분증권)</a></td><td title="보통주">보통주</td><td>${period}</td><td>2026.11.01</td></tr></table>`;
}
