import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findListingTable as structuralListingTable, findOfferFields, documentLinks } from './lib/ipo-official-html.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SCHEMA_VERSION = 1;
export const KIND = 'ipo-official-candidate';
export const LISTING_LABEL = '지분증권 등 상장을 위한 공모여부';
export const NEW_LISTING_VALUES = ['코스닥시장 신규상장', '유가증권시장 신규상장', '코넥스시장 신규상장'];
export const DEFAULT_SAMPLES = ['20260929000191', '20261030000113'];
export const KIND_EXCLUSION = {
  source: 'KIND',
  collected: false,
  reason: 'prior-consent redistribution limit observed; no free API key; not a collection target',
};

const DART_ORIGIN = 'https://dart.fss.or.kr';
const OPENDART_ORIGIN = 'https://opendart.fss.or.kr';
const BOARD_MAIN = `${DART_ORIGIN}/dsac005/main.do`;
const BOARD_SEARCH = `${DART_ORIGIN}/dsac005/search.ax`;
const CALENDAR = `${DART_ORIGIN}/dsac008/main.do`;
const VIEWER_MAIN = `${DART_ORIGIN}/dsaf001/main.do`;
const OPENDART_MAIN = `${OPENDART_ORIGIN}/disclosureinfo/scrits/main.do`;
const OPENDART_LIST = `${OPENDART_ORIGIN}/disclosureinfo/scrits/list.do`;
const USER_AGENT = 'AtlasIPOOfficialRefresh/1 (public page read; no API key)';
const MAX_PAGES = 40;

export function sha256Hex(value) {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return createHash('sha256').update(data).digest('hex');
}

export function isPublicIpoData(target) {
  const path = resolve(String(target || ''));
  return path === resolve(root,'dist/data') || path.startsWith(`${resolve(root, 'dist/data')}/`) || path.endsWith('/dist/data/ipo-calendar.json') || path.endsWith('/ipo-calendar.json');
}

export const LIVE_SOURCE_POLICY = Object.freeze({
  status:'blocked',
  basis:'DART robots explicitly disallows the filing main and report viewer paths',
  robotsUrl:'https://dart.fss.or.kr/robots.txt',
  disallowedPaths:['/dsaf001/main.do','/report/viewer.do'],
  requiredNextStep:'Use documented OpenDART APIs with an existing authorized key; do not create a new key or fall back to HTML crawling.',
});

async function canonicalOutput(target) {
  let cursor=resolve(target),suffix=[];
  while(true) {
    try { return resolve(await realpath(cursor),...suffix); }
    catch(error) {
      if(error.code!=='ENOENT' && error.code!=='ENOTDIR')throw error;
      try { if((await lstat(cursor)).isSymbolicLink())throw new Error('refusing unresolved output symlink'); }
      catch(linkError) { if(linkError.code!=='ENOENT' && linkError.code!=='ENOTDIR')throw linkError; }
      const parent=dirname(cursor);
      if(parent===cursor)throw error;
      suffix.unshift(basename(cursor));cursor=parent;
    }
  }
}

async function assertPrivateOutput(target) {
  if(isPublicIpoData(target) || isPublicIpoData(await canonicalOutput(target)))throw new Error('refusing to replace published IPO data');
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function stripHtml(value) {
  return decodeEntities(String(value || ''))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(source, name) {
  const match = String(source || '').match(new RegExp(`${name}\\s*=\\s*(['"])(.*?)\\1`, 'i'));
  return match ? decodeEntities(match[2]) : '';
}

function rowsOf(html) {
  return [...String(html || '').matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(match => match[0]);
}

function cellsOf(row) {
  return [...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map(match => ({ attrs: match[1], html: match[2], text: stripHtml(match[2]) }));
}

export function parsePageInfo(html) {
  const match = String(html || '').match(/\[(\d+)\s*\/\s*(\d+)\]\s*\[\s*총\s*([\d,]+)\s*건\s*\]/);
  if (!match) return null;
  return { page: Number(match[1]), pages: Number(match[2]), total: Number(match[3].replace(/,/g, '')) };
}

function marketTag(html) {
  const source = String(html || '');
  const titled = source.match(/<span\b(?=[^>]*class="[^"]*tagCom_)[^>]*(?:title|alt)="([^"]+)"/i)
    || source.match(/<span\b(?=[^>]*(?:title|alt)=")[^>]*class="[^"]*tagCom_[^>]*(?:title|alt)="([^"]+)"/i);
  if (titled) return decodeEntities(titled[1]);
  const alt = source.match(/class="[^"]*tagCom_[^"]*"[^>]*alt="([^"]+)"/i);
  return alt ? decodeEntities(alt[1]) : null;
}

function companyName(html) {
  const titled = String(html || '').match(/title="([^"]+?)\s*기업개황 새창"/);
  if (titled) return decodeEntities(titled[1]).trim();
  const text = stripHtml(html).replace(/\bIR\b/g, '').trim();
  return text || null;
}

function cikOf(html) {
  const match = String(html || '').match(/openCorpInfo(?:New)?\(\s*'(\d+)'/);
  return match ? match[1] : null;
}

function rcpOf(html) {
  const match = String(html || '').match(/rcpNo=(\d{14})|openReportViewer(?:Detail)?\(\s*'(\d{14})'/);
  return match ? (match[1] || match[2]) : null;
}

function labelsOf(text) {
  return ['철회', '기재정정', '발행조건확정', '정정제출요구'].filter(label => text.includes(`[${label}]`));
}

function reportNameOf(text) {
  return text.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();
}

export function parseDottedDate(value) {
  const match = String(value || '').trim().match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  return match ? checkedDate(match[1], match[2], match[3]) : null;
}

export function parseIsoDate(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? checkedDate(match[1], match[2], match[3]) : null;
}

export function parseKoreanDate(value) {
  const match = String(value || '').trim().match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/);
  if (!match) return null;
  return checkedDate(match[1], match[2].padStart(2, '0'), match[3].padStart(2, '0'));
}

function checkedDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function formatDotted(iso) {
  return iso ? iso.replaceAll('-', '.') : null;
}

export function formatKorean(iso) {
  if (!iso) return null;
  const [year, month, day] = iso.split('-');
  return `${year}년 ${month}월 ${day}일`;
}

export function parsePeriod(value) {
  const text = String(value || '').replace(/\s+/g, '').trim();
  if (!text || text === '-') return { start: null, end: null, reversed: false, unparsed: false, missing: true, text };
  const parts = text.split('~');
  if (parts.length > 2) return { start: null, end: null, reversed: false, unparsed: true, missing: false, text };
  const parse = token => parseIsoDate(token) || parseDottedDate(token) || parseKoreanDate(token);
  const start = parse(parts[0]);
  let end = parts.length === 2 ? parse(parts[1]) : start;
  const inferred = [];
  if (start && !end && parts.length === 2) {
    const monthDay = /^(\d{1,2})월(\d{1,2})일$/.exec(parts[1]) || /^(\d{1,2})[.-](\d{1,2})$/.exec(parts[1]);
    const dayOnly = /^(\d{1,2})(?:일)?$/.exec(parts[1]);
    const [year,month,day] = start.split('-').map(Number);
    if (monthDay) {
      const endMonth=Number(monthDay[1]);
      end=checkedDate(String(year + (endMonth < month ? 1 : 0)),String(endMonth),monthDay[2]);
      inferred.push('end-year');
    } else if(dayOnly) {
      const nextMonth=month+(Number(dayOnly[1])<day?1:0);
      end=checkedDate(String(year+(nextMonth>12?1:0)),String(nextMonth>12?1:nextMonth),dayOnly[1]);
      inferred.push('end-year','end-month');
    }
  }
  if (!start || !end) return { start, end, reversed: false, unparsed: true, missing: false, text };
  return {
    start,
    end,
    reversed: end < start,
    unparsed: false,
    missing: false,
    text,
    inferred,
    roundTrip: formatDotted(start) === parts[0] || formatKorean(start).replace(/\s/g, '') === parts[0] || parts[0] === start,
  };
}

export function periodState(period, today) {
  if (!period?.start || !period?.end || period.reversed || !parseIsoDate(today)) return 'unknown';
  if (today < period.start) return 'upcoming';
  if (today > period.end) return 'completed';
  return 'in_progress';
}

export function applyObservedPreset(now, num = 3) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) throw new RangeError('invalid preset clock');
  const korea = new Date(date.getTime() + 9 * 3600000);
  const year = korea.getUTCFullYear();
  const month = korea.getUTCMonth();
  const day = korea.getUTCDate();
  let begin;
  if (num === 1) begin = new Date(Date.UTC(year, month, day - 7));
  else if (num === 2) begin = new Date(Date.UTC(year, month - 1, day));
  else if (num === 4) begin = new Date(Date.UTC(year - 1, month, day));
  else if (num === 5) begin = new Date(Date.UTC(year - 2, month, day));
  else if (num === 6) begin = new Date(Date.UTC(year - 3, month, day));
  else if (num === 7) begin = new Date(Date.UTC(1999, 0, 1));
  else begin = new Date(Date.UTC(year, month - 6, day));
  const bgnDe = formatLocal(begin);
  const endDe = formatLocal(korea);
  if (Number(bgnDe.slice(0, 4)) < 2015) throw new RangeError('OpenDART screen rejects a start before 2015');
  return { preset: num, bgnDe, endDe, overflowRecorded: true };
}

function formatLocal(date) {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return `${date.getUTCFullYear()}-${month < 10 ? `0${month}` : month}-${day < 10 ? `0${day}` : day}`;
}

export function parseBoardPage(html) {
  const rows = [];
  for (const row of rowsOf(html)) {
    const cells = cellsOf(row);
    if (cells.length < 6 || !/^\d+$/.test(cells[0].text)) continue;
    const reportText = cells[2].text;
    rows.push({
      number: Number(cells[0].text),
      name: companyName(cells[1].html),
      cik: cikOf(cells[1].html),
      marketTag: marketTag(cells[1].html),
      rcpNo: rcpOf(cells[2].html),
      labels: labelsOf(reportText),
      reportName: reportNameOf(reportText),
      security: attr(cells[3].attrs, 'title') || cells[3].text,
      periodText: cells[4].text,
      receiptText: cells[5].text,
      period: parsePeriod(cells[4].text),
      receipt: parseDottedDate(cells[5].text) || parseIsoDate(cells[5].text),
    });
  }
  return { coverage: parsePageInfo(html), rows };
}

export function parseOpenDartPage(html) {
  const rows = [];
  for (const row of rowsOf(html)) {
    const cells = cellsOf(row);
    if (cells.length < 6 || !/tagCom_/.test(cells[0].html)) continue;
    const note = cells[11]?.text || cells.at(-1)?.text || '';
    rows.push({
      name: companyName(cells[0].html),
      cik: cikOf(cells[0].html),
      marketTag: marketTag(cells[0].html),
      receipt: parseIsoDate(attr(cells[1].attrs, 'title') || cells[1].text),
      receiptText: cells[1].text,
      periodText: attr(cells[2].attrs, 'title') || cells[2].text,
      period: parsePeriod(attr(cells[2].attrs, 'title') || cells[2].text),
      rcpNo: rcpOf(cells[2].html),
      note,
      finalLabel: note.includes('최종'),
      noteRcpNo: rcpOf(cells[11]?.html || ''),
      fingerprint: sha256Hex(JSON.stringify(cells.map(cell => [cell.text, rcpOf(cell.html)]))),
    });
  }
  return { coverage: parsePageInfo(html), rows, excelAction: excelForm(html) };
}

function excelForm(html) {
  const match = String(html || '').match(/<form\b[^>]*name=["']formDownload["'][^>]*>[\s\S]*?<\/form>/i);
  if (!match) return null;
  const action = attr(match[0], 'action');
  const fields = [];
  for (const input of match[0].matchAll(/<input\b([^>]*)>/gi)) {
    const name = attr(input[1], 'name');
    if (!name || name === 'goAction' || /\bdisabled\b/i.test(input[1])) continue;
    fields.push([name, attr(input[1], 'value')]);
  }
  return action ? { action, fields } : null;
}

export function parseCalendarPage(html) {
  const year = selectedValue(html, 'year');
  const month = selectedValue(html, 'month');
  const events = [];
  for (const day of String(html || '').matchAll(/<li\b[^>]*class="[^"]*\bday\b[^"]*"[^>]*>[\s\S]*?<\/li>/gi)) {
    const dayNo = Number(day[0].match(/class="date">\s*(\d+)/)?.[1] || 0);
    for (const anchor of day[0].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const text = stripHtml(anchor[2]);
      events.push({
        day: dayNo,
        rcpNo: rcpOf(anchor[1] + anchor[2]),
        text,
        edge: text.includes('[시작]') ? 'start' : text.includes('[종료]') ? 'end' : 'unknown',
        marketTag: marketTag(anchor[2]),
        name: text.replace(/\[(시작|종료)\]/g, '').replace(/^[기유코]\s*/, '').trim(),
      });
    }
  }
  return { year: year ? Number(year) : null, month: month ? Number(month) : null, events };
}

function selectedValue(html, id) {
  const block = String(html || '').match(new RegExp(`<select\\b[^>]*id=["']${id}["'][\\s\\S]*?</select>`, 'i'));
  if (!block) return null;
  const option = block[0].match(/<option\b[^>]*value=["'](\d+)["'][^>]*selected/i) || block[0].match(/<option\b[^>]*selected[^>]*value=["'](\d+)["']/i);
  return option ? option[1] : null;
}

export function parseViewerDocument(html) {
  const initial = String(html || '').match(/viewDoc\(\s*"(\d+)"\s*,\s*"(\d+)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"/);
  const nodes = [], active = new Map();
  const pattern = /(node\d+)\[['"](text|rcpNo|dcmNo|eleId|offset|length|dtd)['"]\]\s*=\s*"([^"]*)"/g;
  for (const match of String(html || '').matchAll(pattern)) {
    const [, variable, key, value] = match;
    if (key === 'text') { const node = { text: decodeEntities(value) }; nodes.push(node); active.set(variable,node); }
    else if (active.has(variable)) active.get(variable)[key] = value;
  }
  return {
    initial: initial ? { rcpNo: initial[1], dcmNo: initial[2], eleId: initial[3], offset: initial[4], length: initial[5], dtd: initial[6] } : null,
    nodes: nodes.filter(node => node.rcpNo),
    links: documentLinks(html),
  };
}

export function viewerBodyPath(node) {
  if (!/^\d{14}$/.test(node?.rcpNo || '') || !/^\d{1,20}$/.test(node?.dcmNo || '') || !/^dart\d{1,2}\.xsd$/.test(node?.dtd || '')) return null;
  for (const key of ['eleId','offset','length']) if (node[key] != null && !/^\d{1,12}$/.test(node[key])) return null;
  const query = new URLSearchParams({rcpNo:node.rcpNo,dcmNo:node.dcmNo});
  for (const key of ['eleId','offset','length']) if (node[key] != null) query.set(key,node[key]);
  query.set('dtd',node.dtd);
  return `/report/viewer.do?${query}`;
}

export function findListingTable(html) {
  return structuralListingTable(html);
}

export function findNarrativePhrase(html) {
  const text = stripHtml(html);
  const needle = '상장을 목적으로 모집';
  const at = text.indexOf(needle);
  if (at < 0) return null;
  return { needle, fragment: text.slice(Math.max(0, at - 48), at + needle.length + 48), insufficient: true };
}

export function coverageOf(pages, rowCount) {
  const info = pages.map(page => page.coverage).filter(Boolean), first = info[0] || null;
  const numbers = new Set(), identities = new Set(), duplicateNumbers = [], duplicateIdentities = [];
  for (const page of pages) for (const row of page.rows || []) {
    if (row.number != null) { if (numbers.has(row.number)) duplicateNumbers.push(row.number); numbers.add(row.number); }
    const identity = row.fingerprint || (row.rcpNo ? `${row.rcpNo}:${row.cik || ''}` : sha256Hex(JSON.stringify(row)));
    if (identities.has(identity)) duplicateIdentities.push(identity);
    identities.add(identity);
  }
  const pageNumbers = new Set(info.map(page => page.page));
  const complete = Boolean(first) && Number.isSafeInteger(first.pages) && first.pages > 0 && Number.isSafeInteger(first.total) && first.total >= 0
    && info.length === pages.length && info.every(item => item.pages === first.pages && item.total === first.total)
    && pages.length === first.pages && Array.from({length:first.pages},(_,index)=>index+1).every(number=>pageNumbers.has(number))
    && rowCount === first.total && duplicateNumbers.length === 0 && duplicateIdentities.length === 0;
  return { complete, pages:pages.length, declaredPages:first?.pages ?? null, declaredTotal:first?.total ?? null, rowCount, uniqueRows:identities.size, duplicateNumbers, duplicateIdentities };
}

export function decideVerification(item) {
  const reasons = [];
  if (!item.coverageComplete) reasons.push('list_coverage_incomplete');
  if (!item.documentRead) reasons.push('original_not_read');
  if (!item.table?.found || !item.table.value) reasons.push('listing_table_cell_absent');
  if (item.labels?.includes('철회')) reasons.push('withdrawn');
  if (item.supersededBy) reasons.push('superseded_source');
  if (['conflict','unparsed'].includes(item.calendarVerification?.status)) reasons.push('calendar_subscription_mismatch');
  if (item.period?.reversed) reasons.push('reversed_period');
  if (!item.period?.start || !item.period?.end || item.period?.missing || item.period?.unparsed) reasons.push('subscription_date_unconfirmed');
  if (item.document?.offer?.ambiguousDates || (item.document?.offer?.ambiguous && !Object.hasOwn(item.document.offer,'ambiguousDates'))) reasons.push('document_fields_ambiguous');
  if (item.documentRead && (!item.document?.offer?.period?.start || item.document?.offer?.period?.unparsed || item.document?.offer?.period?.reversed)) reasons.push('original_subscription_unconfirmed');
  const originalPeriod = item.document?.offer?.period;
  if (originalPeriod?.start && (originalPeriod.start !== item.period?.start || originalPeriod.end !== item.period?.end)) reasons.push('document_subscription_mismatch');
  if (item.conflicts?.some(conflict => conflict.type !== 'final_label_ignored')) reasons.push('correction_conflict');
  if (item.reportName && !item.reportName.includes('증권신고서(지분증권)')) reasons.push('not_equity_registration');
  if (String(item.followOnText || '').includes('유상증자')) reasons.push('follow_on_excluded');
  if (item.narrative && !item.table?.value) reasons.push('narrative_phrase_not_table');
  return { verified: reasons.length === 0, reasons };
}

export function assembleCandidate({
  checkedAt,
  boardPages = [],
  openDartPages = [],
  calendars = [],
  documents = [],
  observedCoverage = null,
  sourceFailures = [],
  calendarGaps = [],
  sources = [],
  previousObservedAt = null,
}) {
  const boardRows = boardPages.flatMap(page => page.rows || []);
  const openRows = openDartPages.flatMap(page => page.rows || []);
  const boardCoverage = coverageOf(boardPages, boardRows.length);
  const openCoverage = coverageOf(openDartPages, openRows.length);
  const boardRequired = boardPages.length > 0 || sourceFailures.some(failure => failure.source === 'dart-board');
  const openRequired = openDartPages.length > 0 || sourceFailures.some(failure => failure.source === 'opendart-list');
  const listsComplete = (boardRequired || openRequired) && (!boardRequired || boardCoverage.complete) && (!openRequired || openCoverage.complete);
  const documentsComplete = documents.every(doc=>doc.read);
  const coverageComplete = documentsComplete && calendarGaps.length === 0 && sourceFailures.length === 0
    && (boardPages.length > 0 || openDartPages.length > 0 || documents.some(doc => doc.read))
    && (!boardRequired || boardCoverage.complete)
    && (!openRequired || openCoverage.complete);
  const byRcp = new Map();
  const review = [];
  for (const row of boardRows) review.push(reviewFromBoard(row));
  for (const row of openRows) mergeOpenRow(review, row);
  for (const doc of documents) attachDocument(review, doc);
  reconcileFilingFamilies(review);
  mergeCalendar(review, calendars);
  const conflicts = [];
  for (const item of review) item.conflicts = conflictsFor(item);
  annotateSameName(review);
  for (const item of review) {
    item.coverageComplete = coverageComplete;
    item.calendarVerification = calendarVerification(item);
    item.dateVerification = dateVerification(item, new Date(Date.parse(checkedAt) + 9 * 3600000).toISOString().slice(0, 10));
    const decision = decideVerification(item);
    item.verified = decision.verified;
    item.reasons = decision.reasons;
    item.status = decision.verified ? 'verified_sample' : 'needs_review';
    if (item.conflicts.length) conflicts.push(...item.conflicts.map(conflict => ({ name: item.name, rcpNo: item.rcpNo, ...conflict })));
    if (item.rcpNo) byRcp.set(item.rcpNo, item);
  }
  const candidates = review.filter(item => item.verified).map(publicCandidate);
  const failed = sourceFailures.length > 0 || !coverageComplete;
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: KIND,
    status: failed ? 'source_failed' : 'needs_review',
    verified: false,
    marketComplete: false,
    checkedAt,
    previousObservedAtPreserved: previousObservedAt,
    coverage: {
      complete: coverageComplete,
      listsComplete,
      documentsComplete:documents.length ? documentsComplete : null,
      calendarComplete:calendars.length || calendarGaps.length ? calendarGaps.length === 0 : null,
      marketComplete: false,
      board: boardCoverage,
      openDart: openCoverage,
      calendars: calendars.map(item => ({ year: item.year, month: item.month, events: item.events?.length ?? 0, matchesRequest: item.matchesRequest ?? null })),
      samplesRead: documents.filter(doc => doc.read).length,
      samplesRequested: documents.length,
      observedCoverage,
    },
    dateVerification: {
      reversed: review.filter(item => item.period?.reversed).length,
      unparsed: review.filter(item => item.period?.unparsed).length,
      completed: review.filter(item => item.dateVerification?.periodState === 'completed').length,
      inProgress: review.filter(item => item.dateVerification?.periodState === 'in_progress').length,
      upcoming: review.filter(item => item.dateVerification?.periodState === 'upcoming').length,
    },
    correctionConflict: { count: conflicts.length, items: conflicts },
    candidates,
    review: review.map(publicReview),
    missing: [
      ...sourceFailures,
      ...calendarGaps,
      ...documents.filter(doc => !doc.read).map(doc => ({ rcpNo: doc.rcpNo, reason: doc.error || 'sample_not_read' })),
    ],
    changes: [],
    sources,
    excluded: [KIND_EXCLUSION],
    limits: limits(),
  };
}

function reviewFromBoard(row) {
  return {
    name: row.name,
    rcpNo: row.rcpNo,
    cik: row.cik,
    marketTag: row.marketTag,
    labels: [...row.labels],
    reportName: row.reportName,
    security: row.security,
    period: row.period,
    receipt: row.receipt,
    board: { rcpNo: row.rcpNo, receipt: row.receipt, period: row.period, labels: [...row.labels] },
    openDart: null,
    calendar: [],
    documentRead: false,
    table: { found: false, value: null },
    narrative: null,
    finalLabel: false,
    followOnText: '',
    conflicts: [],
  };
}

function mergeOpenRow(review, row) {
  let item = review.find(entry => entry.rcpNo && row.rcpNo && entry.rcpNo === row.rcpNo);
  if (!item) {
    item = {
      name: row.name,
      rcpNo: row.rcpNo,
      marketTag: row.marketTag,
      labels: [],
      reportName: null,
      security: null,
      period: row.period,
      receipt: row.receipt,
      board: null,
      calendar: [],
      documentRead: false,
      table: { found: false, value: null },
      narrative: null,
      followOnText: '',
      conflicts: [],
    };
    review.push(item);
  }
  item.openDart = { rcpNo: row.rcpNo, receipt: row.receipt, period: row.period, finalLabel: row.finalLabel, noteRcpNo: row.noteRcpNo };
  item.finalLabel = Boolean(row.finalLabel);
  if (!item.rcpNo) item.rcpNo = row.rcpNo;
}

function mergeCalendar(review, calendars) {
  const byRcp = new Map();
  for (const page of calendars) {
    for (const event of page.events || []) {
      if (!event.rcpNo) continue;
      const bucket = byRcp.get(event.rcpNo) || [];
      bucket.push({ ...event, year: page.year, month: page.month });
      byRcp.set(event.rcpNo, bucket);
    }
  }
  for (const item of review) {
    item.calendar = byRcp.get(item.rcpNo) || byRcp.get(item.openDart?.rcpNo) || [];
  }
}

function attachDocument(review, doc) {
  const item = review.find(entry => entry.rcpNo === doc.rcpNo || entry.openDart?.rcpNo === doc.rcpNo);
  const target = item || {
    name: doc.name || doc.rcpNo,
    rcpNo: doc.rcpNo,
    labels: [],
    period: { missing: true },
    board: null,
    openDart: null,
    calendar: [],
    conflicts: [],
  };
  if (!item) review.push(target);
  target.documentRead = Boolean(doc.read);
  target.table = doc.table || { found: false, value: null };
  target.narrative = doc.narrative || null;
  target.followOnText = `${doc.followOnText || ''} ${target.followOnText || ''}`;
  target.document = { rcpNo: doc.rcpNo, bodyPath: doc.bodyPath || null, tableFound: Boolean(doc.table?.found), classificationRcpNo:doc.classificationRcpNo || doc.rcpNo, conditionRcpNo:doc.conditionRcpNo || doc.rcpNo, lineage:doc.lineage || [], priceStatus:doc.priceStatus || 'provisional-filing-value', familyLinks:doc.familyLinks || [], currentReceiptDate:doc.currentReceiptDate || null, classificationBodyPath:doc.classificationBodyPath || doc.bodyPath || null, conditionBodyPath:doc.conditionBodyPath || doc.bodyPath || null, offer:doc.offer || null };
  if (doc.withdrawnInLineage && !target.labels.includes('철회')) target.labels.push('철회');
}

// A cross-receipt join requires the actual DART family control. Company names
// never establish a family. Two same-day authoritative board rows remain
// ambiguous; receipt serials are not treated as timestamps.
function reconcileFilingFamilies(review) {
  const parents = new Map();
  const root = key => { if (!parents.has(key)) parents.set(key,key); const parent = parents.get(key); if (parent !== key) parents.set(key,root(parent)); return parents.get(key); };
  const join = (left,right) => parents.set(root(right),root(left));
  for (const item of review) if (item.documentRead) for (const link of item.document?.familyLinks || []) {
    if (link.control === 'family' && link.title === '증권신고서(지분증권)' && /^\d{14}$/.test(link.rcpNo)) join(item.rcpNo,link.rcpNo);
  }
  const groups = new Map();
  for (const item of review) if (parents.has(item.rcpNo)) { const key=root(item.rcpNo); const group=groups.get(key)||[];group.push(item);groups.set(key,group); }
  for (const group of groups.values()) {
    let authoritative=group.filter(item=>item.board);
    if (!authoritative.length) authoritative=group.filter(item=>item.documentRead && item.document?.currentReceiptDate);
    if (!authoritative.length) continue;
    const date = item=>item.board?.receipt || item.document?.currentReceiptDate;
    const latest=[...new Set(authoritative.map(date))].filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value || '')).sort().at(-1);
    const winners=authoritative.length===1 ? authoritative : authoritative.filter(item=>date(item)===latest);
    if (winners.length!==1) continue;
    const target=winners[0];
    const older=group.filter(item=>item!==target && item.openDart).sort((a,b)=>String(b.openDart.receipt).localeCompare(String(a.openDart.receipt)));
    for (const item of group) if(item!==target)item.supersededBy=target.rcpNo;
    if (!target.openDart && older.length) {
      target.openDart=older[0].openDart;
      target.openDartLineage={control:'family',currentReceipt:target.rcpNo,summaryReceipt:older[0].rcpNo};
      target.sourceNotices=[{type:'older_summary_same_filing_family',summaryReceipt:older[0].rcpNo,summaryPeriod:older[0].openDart.period}];
      if (!target.board) { target.name=older[0].name; target.receipt=target.document?.currentReceiptDate; target.period=target.document?.offer?.period || target.period; }
    }
  }
}

function conflictsFor(item) {
  const conflicts = [];
  if (item.board && item.openDart && !item.openDartLineage) {
    if (item.board.rcpNo && item.openDart.rcpNo && item.board.rcpNo !== item.openDart.rcpNo) {
      conflicts.push({ type: 'different_rcp', board: item.board.rcpNo, openDart: item.openDart.rcpNo, finalLabelIgnored: Boolean(item.finalLabel) });
    }
    if (item.board.receipt && item.openDart.receipt && item.board.receipt !== item.openDart.receipt) {
      conflicts.push({ type: 'receipt_mismatch', board: item.board.receipt, openDart: item.openDart.receipt });
    }
    const left = item.board.period;
    const right = item.openDart.period;
    if (left?.start && right?.start && (left.start !== right.start || left.end !== right.end)) {
      conflicts.push({ type: 'subscription_mismatch', board: [left.start, left.end], openDart: [right.start, right.end] });
    }
    if (item.labels?.includes('철회') && right?.start) {
      conflicts.push({ type: 'withdrawn_summary_still_dated', openDart: [right.start, right.end] });
    }
  }
  return conflicts;
}

function annotateSameName(review) {
  const groups=new Map();
  for(const item of review) { if(!item.name)continue;const group=groups.get(item.name)||[];group.push(item);groups.set(item.name,group); }
  for(const group of groups.values())for(const item of group) {
    const unrelated=group.filter(other=>other.rcpNo!==item.rcpNo && other.supersededBy!==item.rcpNo && item.supersededBy!==other.rcpNo && !(item.supersededBy && item.supersededBy===other.supersededBy));
    if(unrelated.length)item.conflicts.push({type:'same_name_different_rcp',rcpNos:[item.rcpNo,...unrelated.map(other=>other.rcpNo)]});
  }
}

function calendarVerification(item) {
  const events=item.calendar || [];
  if (!events.length) return {status:'not_checked',starts:[],ends:[]};
  const values=edge=>[...new Set(events.filter(event=>event.edge===edge).map(event=>`${event.year}-${String(event.month).padStart(2,'0')}-${String(event.day).padStart(2,'0')}`))];
  const starts=values('start'),ends=values('end');
  if ([...starts,...ends].some(value=>!parseIsoDate(value))) return {status:'unparsed',starts,ends};
  const period=item.document?.offer?.period || item.period;
  const conflict=starts.length>1 || ends.length>1 || starts.some(value=>value!==period?.start) || ends.some(value=>value!==period?.end);
  return {status:conflict?'conflict':starts.length===1&&ends.length===1?'confirmed':'partial',starts,ends};
}

function dateVerification(item, today) {
  const period = item.board?.period || item.period;
  return {
    periodState: periodState(period, today),
    reversed: Boolean(period?.reversed),
    unparsed: Boolean(period?.unparsed),
    rolloverPreserved: Boolean(period?.start && period?.end && period.start.slice(0, 4) !== period.end.slice(0, 4) ? period.end > period.start : true),
  };
}

function publicCandidate(item) {
  return {
    name: item.name,
    rcpNo: item.rcpNo,
    verified: true,
    listingValue: item.table.value,
    fieldVerification:{listing:'explicit-table',subscription:'original-confirmed',sourceList:item.board?'current-board-agrees':item.openDartLineage?'linked-older-summary':item.openDart?'same-receipt-summary':'not-checked',calendar:item.calendarVerification?.status || 'not_checked'},
    period: item.period,
    receipt: item.receipt,
    sources: [item.board ? 'dart-board' : null, item.openDart ? 'opendart-list' : null, item.documentRead ? 'dart-document' : null, item.calendar?.length ? 'dart-calendar' : null].filter(Boolean),
    document:item.document || null,
    sourceNotices:item.sourceNotices || [],
    summaryLineage:item.openDartLineage || null,
    supersededBy:item.supersededBy || null,
  };
}

function publicReview(item) {
  return {
    name: item.name,
    rcpNo: item.rcpNo,
    status: item.status,
    verified: item.verified,
    reasons: item.reasons,
    marketTag: item.marketTag || null,
    labels: item.labels || [],
    reportName: item.reportName || null,
    period: item.board?.period || item.period || null,
    receipt: item.receipt || item.board?.receipt || null,
    dateVerification: item.dateVerification,
    calendarVerification:item.calendarVerification,
    calendar:item.calendar || [],
    correctionConflict: item.conflicts,
    table: item.table,
    narrative: item.narrative,
    openDart: item.openDart,
    documentRead: item.documentRead,
    document:item.document || null,
    sourceNotices:item.sourceNotices || [],
    summaryLineage:item.openDartLineage || null,
    supersededBy:item.supersededBy || null,
  };
}

function limits() {
  return [
    '현재 live HTML 수집은 DART robots의 공시 뷰어 차단으로 중단돼 있다. 명시적 offline fixture만 실행하며 API 인증키·문서 경로의 별도 검증이 필요하다.',
    '조회 범위의 목록 페이지 수집과 모든 IPO 확정은 별개다. marketComplete는 항상 false다.',
    'KIND는 사전동의 없는 재배포 제한과 무료 API 키 부재로 수집하지 않는다.',
    'OpenDART HTML 목록·화면 뷰어는 문서화 Open API가 아닌 공개 화면이다. API 키를 쓰지 않았고 인증을 우회하지 않는다.',
    '지분증권 등 상장을 위한 공모여부 칸과 신규상장 값이 같은 원문 HTML 조각에 있을 때만 표본 확정이다.',
    '제3자 PDF는 DART HTML 근거가 아니며 의존성으로 읽지 않는다.',
    '최신 확정 문서에서 표가 없으면 관측된 본문/관련문서 select의 직접 링크만 따라간다. 회사명만으로 접수번호를 합치지 않는다. 과거 전체본에서 가져온 가격은 현재 조건으로 쓰지 않는다.',
    '법인유형, 일반공모, 최종보고서, 발행조건확정 라벨만으로는 확정하지 않는다.',
    '공개 엑셀은 수동 접근 표본으로만 확인했다. 정기 후보 수집은 관측된 HTML 조회만 사용하며, 임의 폼 action으로 POST하지 않는다.',
  ];
}

export function formFields(html, formId = 'searchForm') {
  const match = String(html || '').match(new RegExp(`<form\\b[^>]*(?:id|name)=["']${formId}["'][^>]*>[\\s\\S]*?</form>`, 'i'));
  if (!match) return null;
  const fields = [];
  for (const input of match[0].matchAll(/<(input|select)\b([^>]*)>(?:[\s\S]*?<\/\1>)?/gi)) {
    const tag = input[1].toLowerCase();
    const attrs = input[2];
    if (/\bdisabled\b/i.test(attrs)) continue;
    const name = attr(attrs, 'name');
    if (!name || name === 'goAction') continue;
    if (tag === 'input' && /type=["'](?:checkbox|radio)["']/i.test(attrs) && !/\bchecked\b/i.test(attrs)) continue;
    if (tag === 'select') {
      const selected = input[0].match(/<option\b[^>]*selected[^>]*value=["']([^"']*)["']/i) || input[0].match(/<option\b[^>]*value=["']([^"']*)["'][^>]*selected/i);
      fields.push([name, selected ? selected[1] : '']);
    } else {
      fields.push([name, attr(attrs, 'value')]);
    }
  }
  return fields;
}

export function withOverrides(fields, overrides) {
  const next = fields.map(([name, value]) => [name, Object.hasOwn(overrides, name) ? overrides[name] : value]);
  for (const [name, value] of Object.entries(overrides)) {
    if (!next.some(([key]) => key === name)) next.push([name, value]);
  }
  return next;
}

export function encodeForm(fields) {
  const params = new URLSearchParams();
  for (const [name, value] of fields) params.append(name, value ?? '');
  return params.toString();
}

export async function readPages(fetchPage) {
  const pages = [];
  let declared = null;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await fetchPage(page);
    if (!response.ok) return { ok: false, reason: `http_${response.status}`, status: response.status, pages };
    const html = response.text;
    const parsed = response.parser(html);
    if (!parsed.coverage) return { ok: false, reason: 'page_info_missing', pages, html };
    if (!declared) declared = parsed.coverage;
    if (parsed.coverage.pages !== declared.pages || parsed.coverage.total !== declared.total) {
      return { ok: false, reason: 'page_info_conflict', pages };
    }
    pages.push({ ...parsed, html, observedAt: response.observedAt, url: response.url, sha256: sha256Hex(html) });
    if (pages.length >= declared.pages) break;
  }
  const rows = pages.flatMap(page => page.rows);
  const coverage = coverageOf(pages, rows.length);
  if (!coverage.complete || declared.pages > MAX_PAGES) return { ok: false, reason: 'page_omission', pages, coverage };
  return { ok: true, pages, coverage };
}

export async function refreshOfficial(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const checkedAt = options.checkedAt || now.toISOString();
  const out = options.out ? resolve(options.out) : null;
  const evidenceDir = options.evidenceDir ? resolve(options.evidenceDir) : null;
  if(out)await assertPrivateOutput(out);
  if(evidenceDir)await assertPrivateOutput(evidenceDir);
  const window = options.from && options.to
    ? { preset: null, bgnDe: options.from, endDe: options.to, overflowRecorded: false }
    : applyObservedPreset(now, 3);
  if (!parseIsoDate(window.bgnDe) || !parseIsoDate(window.endDe) || window.endDe < window.bgnDe) {
    throw new RangeError('invalid observed coverage window');
  }
  // Injected transports are only for explicit offline fixtures. There is no
  // CLI/env switch that enables the disallowed public HTML collection.
  if (!(options.offlineFixture === true && typeof options.fetchImpl === 'function' && options.fetchImpl !== globalThis.fetch)) {
    const blocked=assembleCandidate({checkedAt,observedCoverage:window,sourceFailures:[{source:'source-policy',reason:'dart_robots_disallows_viewer',url:LIVE_SOURCE_POLICY.robotsUrl}]});
    blocked.status='blocked_source_policy';blocked.sourcePolicy=LIVE_SOURCE_POLICY;
    if(evidenceDir)await writeEvidence(evidenceDir,blocked,[]);
    const preserved=await writeCandidate(out,blocked,{replaceComplete:false});
    return {...blocked,wrote:preserved.wrote,preservedPrevious:preserved.preserved};
  }
  const sources = [];
  const failures = [];
  const boardMain = await getText(fetchImpl, BOARD_MAIN, sources, failures, 'dart-board-main');
  if (!boardMain.ok) return finishFailed({out,evidenceDir,checkedAt,window,sources,failures});
  const openMain = await getText(fetchImpl, OPENDART_MAIN, sources, failures, 'opendart-main');
  if (!boardMain.ok || !openMain.ok) return finishFailed({ out, evidenceDir, checkedAt, window, sources, failures });
  const boardFields = formFields(boardMain.text);
  const openFields = formFields(openMain.text);
  if (!boardFields || !openFields) {
    failures.push({ source: 'search-form', reason: 'observed_form_missing' });
    return finishFailed({ out, evidenceDir, checkedAt, window, sources, failures });
  }
  const board = await readPages(page => postForm(fetchImpl, BOARD_SEARCH, withOverrides(boardFields, { currentPage: String(page) }), sources, 'dart-board', parseBoardPage));
  const openDart = await readPages(page => postForm(fetchImpl, OPENDART_LIST, withOverrides(openFields, {
    pageIndex: String(page), startDate: window.bgnDe, endDate: window.endDe, bgnDe: window.bgnDe, endDe: window.endDe,
  }), sources, 'opendart-list', parseOpenDartPage));
  if (!board.ok) failures.push({ source: 'dart-board', reason: board.reason, status: board.status || null });
  if (!openDart.ok) failures.push({ source: 'opendart-list', reason: openDart.reason, status: openDart.status || null });
  const documents = [];
  const requestedDocuments = options.samples ?? [...new Set((board.pages || []).flatMap(page=>page.rows).filter(row=>String(row.reportName).replace(/\s/g,'').includes('증권신고서(지분증권)') && !row.labels.includes('철회') && /^\d{14}$/.test(row.rcpNo || '')).map(row=>row.rcpNo))];
  if (requestedDocuments.length > 80) failures.push({source:'document-budget',reason:'document_limit_exceeded',requested:requestedDocuments.length,limit:80});
  else for (const rcpNo of requestedDocuments) {
    if (failures.some(item=>/http_(401|403|429)/.test(item.reason))) break;
    documents.push(await readSample(fetchImpl, rcpNo, sources, failures));
  }
  const ipoIds=new Set(documents.filter(doc=>doc.table?.value).map(doc=>doc.rcpNo));
  const months = monthsFor([...(board.pages || []).flatMap(page=>page.rows).filter(row=>ipoIds.has(row.rcpNo)),...documents.filter(doc=>doc.table?.value && doc.offer?.period?.start).map(doc=>({period:doc.offer.period}))]);
  const calendars = [];
  const calendarGaps = [];
  for (const month of months) {
    if (failures.some(item=>/http_(401|403|429)/.test(item.reason))) break;
    const url = `${CALENDAR}?year=${month.year}&month=${month.month}`;
    const response = await getText(fetchImpl, url, sources, [], 'dart-calendar');
    if (!response.ok) {
      failures.push({ source: 'dart-calendar', reason: `http_${response.status}`, requested: month });
      if ([401,403,429].includes(response.status)) break;
      continue;
    }
    const parsed = parseCalendarPage(response.text);
    parsed.matchesRequest = parsed.year === month.year && parsed.month === month.month;
    parsed.sha256 = sha256Hex(response.text);
    if (!parsed.matchesRequest) {
      calendarGaps.push({ source: 'dart-calendar', reason: 'month_not_offered', requested: month, observed: { year: parsed.year, month: parsed.month } });
      continue;
    }
    calendars.push(parsed);
  }
  const result = assembleCandidate({
    checkedAt,
    boardPages: board.pages || [],
    openDartPages: openDart.pages || [],
    calendars,
    documents,
    observedCoverage: { ...window, formStart: inputValue(openMain.text, 'startDate'), formEnd: inputValue(openMain.text, 'endDate') },
    sourceFailures: failures,
    sources,
    calendarGaps,
  });
  result.verified = false;
  const supporting=new Set(result.candidates.flatMap(item=>[item.document?.classificationBodyPath,item.document?.conditionBodyPath]).filter(Boolean).map(value=>new URL(value,DART_ORIGIN).href));
  for (const source of sources) if(supporting.has(source.url)) source.usedForConfirmation=true;
  if (evidenceDir) await writeEvidence(evidenceDir, result, sources);
  const preserved = await writeCandidate(out, result, { replaceComplete: result.coverage.complete });
  return { ...result, wrote: preserved.wrote, preservedPrevious: preserved.preserved };
}

function offerFromBody(html) {
  const fields = findOfferFields(html);
  return {...fields, period:fields.dates ? parsePeriod(fields.dates.subscriptionText) : null};
}

function summaryNode(parsed) {
  const normalized = node => String(node.text || '').replace(/\s+/g,'');
  return parsed.nodes.find(node => /^2[.．]모집또는매출에관한일반사항$/.test(normalized(node)))
    || parsed.nodes.find(node => normalized(node) === '요약정보')
    || parsed.nodes[0] || parsed.initial;
}

async function readBody(fetchImpl, parsed, sources, failures, role) {
  const node = summaryNode(parsed), bodyPath = viewerBodyPath(node);
  if (!bodyPath) return {read:false,error:'body_url_not_in_html'};
  const body = await getText(fetchImpl,new URL(bodyPath,DART_ORIGIN).href,sources,failures,role);
  if (!body.ok) return {read:false,bodyPath,error:'viewer_body_failed'};
  return {read:true,bodyPath,table:findListingTable(body.text),narrative:findNarrativePhrase(body.text),offer:offerFromBody(body.text),followOnText:/주주배정|주주우선|실권주|제3자배정|제삼자배정/.test(findOfferFields(body.text).price?.methodText || '') ? '유상증자' : ''};
}

async function readSample(fetchImpl, rcpNo, sources, failures) {
  if (!/^\d{14}$/.test(rcpNo)) return {rcpNo,read:false,error:'invalid_receipt_number'};
  const main = await getText(fetchImpl,`${VIEWER_MAIN}?rcpNo=${rcpNo}`,sources,failures,`viewer-${rcpNo}`);
  if (!main.ok) return {rcpNo,read:false,error:'viewer_main_failed'};
  const parsed = parseViewerDocument(main.text), current = await readBody(fetchImpl,parsed,sources,failures,`body-${rcpNo}`);
  const lineage = [], currentDate = parsed.links.find(link=>link.control === 'family' && link.rcpNo === rcpNo)?.receiptDate;
  const withdrawnInLineage = parsed.links.some(link=>/철회/.test(link.label));
  const base = {...current,rcpNo,priceStatus:current.offer?.price && parsed.links.some(link=>link.control==='family' && link.rcpNo===rcpNo && /발행조건확정/.test(link.label))?'reported-in-confirmed-filing':'provisional-filing-value',classificationRcpNo:rcpNo,classificationBodyPath:current.bodyPath,conditionBodyPath:current.bodyPath,currentReceiptDate:currentDate,familyLinks:parsed.links.filter(link=>link.control==='family'),lineage,withdrawnInLineage};
  if (!current.read || current.table?.value && current.offer?.period?.start && current.offer?.period?.end && !current.offer.period.unparsed && !current.offer.ambiguousDates) return base;
  // Use only a real related-document control, not a same-name corporation join.
  const prospects = parsed.links.filter(link=>link.control === 'ref' && link.title === '투자설명서').sort((a,b)=>String(b.receiptDate).localeCompare(String(a.receiptDate)));
  if (prospects.length && (prospects.length === 1 || prospects[0].receiptDate !== prospects[1].receiptDate)) {
    const link = prospects[0];
    const relatedMain = await getText(fetchImpl,`${VIEWER_MAIN}?rcpNo=${link.rcpNo}`,sources,failures,`related-viewer-${link.rcpNo}`);
    if (!relatedMain.ok) return base;
    const related = parseViewerDocument(relatedMain.text);
    if (!related.links.some(back=>back.control === 'ref' && back.rcpNo === rcpNo && back.title === '증권신고서(지분증권)')) return {...base,lineageError:'related_document_not_reciprocal'};
    const full = await readBody(fetchImpl,related,sources,failures,`related-summary-${link.rcpNo}`);
    lineage.push({control:'ref',from:rcpNo,to:link.rcpNo,label:link.label,reciprocal:true});
    if (full.read && full.table?.found) {
      const freshConditions = currentDate && link.receiptDate && link.receiptDate >= currentDate;
      const offer = freshConditions ? full.offer : current.offer;
      if (freshConditions && current.offer?.period?.start && current.offer?.period?.end && !current.offer.period.unparsed && !current.offer.ambiguousDates && full.offer?.period?.start && (current.offer.period.start !== full.offer.period.start || current.offer.period.end !== full.offer.period.end)) { offer.ambiguous = true; offer.ambiguousDates=true; }
      return {...base,table:full.table,narrative:full.narrative,bodyPath:full.bodyPath,classificationRcpNo:link.rcpNo,classificationBodyPath:full.bodyPath,conditionBodyPath:freshConditions?full.bodyPath:current.bodyPath,offer,conditionRcpNo:freshConditions?link.rcpNo:rcpNo,lineage};
    }
  }
  // A linked older full registration can prove classification, never today's price.
  const older = parsed.links.filter(link=>link.control === 'family' && link.rcpNo !== rcpNo && link.title === '증권신고서(지분증권)' && !link.label.includes('발행조건확정')).sort((a,b)=>String(b.receiptDate).localeCompare(String(a.receiptDate)));
  if (!older.length || (older.length > 1 && older[0].receiptDate === older[1].receiptDate)) return base;
  const link = older[0], olderMain = await getText(fetchImpl,`${VIEWER_MAIN}?rcpNo=${link.rcpNo}`,sources,failures,`family-viewer-${link.rcpNo}`);
  if (!olderMain.ok) return base;
  const full = await readBody(fetchImpl,parseViewerDocument(olderMain.text),sources,failures,`family-summary-${link.rcpNo}`);
  lineage.push({control:'family',from:rcpNo,to:link.rcpNo,label:link.label,classificationOnly:true});
  return full.read && full.table?.value ? {...base,table:full.table,classificationRcpNo:link.rcpNo,classificationBodyPath:full.bodyPath,lineage} : base;
}

function monthsFor(rows) {
  const months = new Set();
  for (const row of rows) {
    for (const iso of [row.period?.start, row.period?.end]) {
      if (!iso) continue;
      const [year, month] = iso.split('-');
      months.add(`${year}-${Number(month)}`);
    }
  }
  return [...months].map(value => {
    const [year, month] = value.split('-');
    return { year: Number(year), month: Number(month) };
  });
}

function inputValue(html, id) {
  const match = String(html || '').match(new RegExp(`id=["']${id}["'][^>]*value=["']([^"']*)["']`, 'i'))
    || String(html || '').match(new RegExp(`value=["']([^"']*)["'][^>]*id=["']${id}["']`, 'i'));
  return match ? match[1] : null;
}

async function getText(fetchImpl, url, sources, failures, role) {
  const response = await fetchObserved(fetchImpl, url, { method: 'GET' });
  remember(sources, role, url, response);
  if (!response.ok) failures.push({ source: role, url, reason: `http_${response.status}` });
  return response;
}

async function postForm(fetchImpl, url, fields, sources, role, parser) {
  const response = await postRaw(fetchImpl, url, encodeForm(fields), sources, role);
  return { ...response, parser };
}

async function postRaw(fetchImpl, url, body, sources, role) {
  const response = await fetchObserved(fetchImpl, url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body,
  });
  remember(sources, role, url, response);
  return response;
}

async function fetchObserved(fetchImpl, url, init) {
  if (/kind\.kr/i.test(url)) throw new Error('KIND collection is excluded');
  const parsedUrl = new URL(url);
  const routes = {
    'https://dart.fss.or.kr': { GET:new Set(['/dsac005/main.do','/dsac008/main.do','/dsaf001/main.do','/report/viewer.do']), POST:new Set(['/dsac005/search.ax']) },
    'https://opendart.fss.or.kr': { GET:new Set(['/disclosureinfo/scrits/main.do']), POST:new Set(['/disclosureinfo/scrits/list.do']) },
  };
  if (parsedUrl.username || parsedUrl.password || !routes[parsedUrl.origin]?.[init.method || 'GET']?.has(parsedUrl.pathname)) throw new Error('Untrusted official-source origin or read path');
  const response = await fetchImpl(url, {
    ...init,
    redirect:'manual',
    headers: { 'user-agent': USER_AGENT, ...(init.headers || {}) },
    signal: AbortSignal.timeout(45000),
  });
  const finalUrl = response.url || String(url);
  if (new URL(finalUrl).origin !== parsedUrl.origin || response.redirected) throw new Error('Untrusted official-source redirect');
  const length = Number(response.headers?.get?.('content-length') || 0);
  if (length > 16_000_000) throw new Error('Official-source response exceeds the collection bound');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 16_000_000) throw new Error('Official-source response exceeds the collection bound');
  const observedAt = new Date().toISOString();
  return {
    ok: response.status === 200,
    status: response.status,
    url:finalUrl,
    requestedUrl:String(url),
    redirectLocation:response.status >= 300 && response.status < 400 ? response.headers?.get?.('location') || null : null,
    observedAt,
    sha256: sha256Hex(buffer),
    bytes: buffer,
    text: buffer.toString('utf8'),
  };
}

function remember(sources, role, url, response) {
  sources.push({ role, url:response.url || url, requestedUrl:url, redirectLocation:response.redirectLocation || null, status: response.status, observedAt: response.observedAt, sha256: response.sha256, bytes: response.bytes?.length ?? null, usedForConfirmation: false });
}

async function finishFailed({ out, evidenceDir, checkedAt, window, sources, failures }) {
  const result = assembleCandidate({ checkedAt, observedCoverage: window, sourceFailures: failures, sources });
  result.status = 'source_failed';
  result.verified = false;
  const supporting=new Set(result.candidates.flatMap(item=>[item.document?.classificationBodyPath,item.document?.conditionBodyPath]).filter(Boolean).map(value=>new URL(value,DART_ORIGIN).href));
  for (const source of sources) if(supporting.has(source.url)) source.usedForConfirmation=true;
  if (evidenceDir) await writeEvidence(evidenceDir, result, sources);
  const preserved = await writeCandidate(out, result, { replaceComplete: false });
  return { ...result, wrote: preserved.wrote, preservedPrevious: preserved.preserved };
}

export async function writeCandidate(out, result, { replaceComplete = true } = {}) {
  if (!out) return { wrote: false, preserved: false };
  await assertPrivateOutput(out);
  await mkdir(dirname(out), { recursive: true });
  if (!replaceComplete) {
    try {
      const previous = JSON.parse(await readFile(out, 'utf8'));
      if (previous.coverage?.complete === true) return { wrote: false, preserved: true };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const temporary = `${out}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`);
  await rename(temporary, out);
  return { wrote: true, preserved: false };
}

async function writeEvidence(dir, result, sources) {
  await assertPrivateOutput(dir);
  await mkdir(dir, { recursive: true });
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    checkedAt: result.checkedAt,
    status: result.status,
    verified: result.verified,
    sources: sources.map(({ bytes, ...source }) => source),
  };
  await writeFile(resolve(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function checkFixtures(dir = resolve(root, 'tests/fixtures/ipo-official')) {
  const entries = JSON.parse(await readFile(resolve(dir, 'cases.json'), 'utf8'));
  const results = [];
  for (const item of entries.cases) {
    const result = evaluateFixture(item);
    const failures = [];
    if (result.verified !== item.expect.verified) failures.push(`verified ${result.verified}`);
    if (item.expect.status && result.status !== item.expect.status) failures.push(`status ${result.status}`);
    for (const name of item.expect.candidateNames || []) {
      if (!result.candidates.some(row => row.name === name)) failures.push(`candidate missing ${name}`);
    }
    if (item.expect.candidateNames && result.verified !== false) failures.push('run verified must stay false');
    for (const reason of item.expect.reasons || []) {
      if (!result.review.some(row => row.reasons?.includes(reason))) failures.push(`missing ${reason}`);
    }
    for (const name of item.expect.mustNotVerify || []) {
      if (result.review.some(row => row.name === name && row.verified)) failures.push(`verified ${name}`);
    }
    if (item.expect.date) {
      const row = result.review.find(entry => entry.name === item.expect.date.name);
      if (row?.period?.start !== item.expect.date.start || row?.period?.end !== item.expect.date.end) failures.push('date mismatch');
    }
    results.push({ id: item.id, ok: failures.length === 0, failures, status: result.status, verified: result.verified });
  }
  return { ok: results.every(item => item.ok), results };
}

export function evaluateFixture(item) {
  if (item.httpStatus && item.httpStatus !== 200) {
    return assembleCandidate({
      checkedAt: item.checkedAt || '2026-11-01T00:00:00.000Z',
      sourceFailures: [{ source: item.source || 'opendart-list', reason: `http_${item.httpStatus}` }],
      observedCoverage: item.observedCoverage || null,
    });
  }
  const boardPages = (item.board || []).map(html => ({ ...parseBoardPage(html), html }));
  const openDartPages = (item.openDart || []).map(html => ({ ...parseOpenDartPage(html), html }));
  const documents = (item.documents || []).map(doc => doc.html ? {
    rcpNo: doc.rcpNo,
    read: true,
    table: findListingTable(doc.html),
    narrative: findNarrativePhrase(doc.html),
    offer:offerFromBody(doc.html),
    familyLinks:doc.familyLinks || [],
    currentReceiptDate:doc.currentReceiptDate || null,
    followOnText: doc.html.includes('유상증자') ? '유상증자' : '',
  } : doc);
  return assembleCandidate({
    checkedAt: item.checkedAt || '2026-11-01T00:00:00.000Z',
    boardPages,
    openDartPages,
    calendars: item.calendars || [],
    documents,
    observedCoverage: item.observedCoverage || { bgnDe: '2026-05-01', endDe: '2026-11-01', preset: 3 },
    sourceFailures: item.sourceFailures || [],
    previousObservedAt: item.previousObservedAt || null,
  });
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  if (process.argv.includes('--check-fixtures')) {
    const checked = await checkFixtures(arg('--fixtures') || undefined);
    console.log(JSON.stringify(checked));
    process.exitCode = checked.ok ? 0 : 1;
    return;
  }
  const out = arg('--out');
  const evidenceDir = arg('--evidence-dir');
  if (!out || !evidenceDir) {
    console.error('usage: node scripts/refresh-ipo-official.mjs --out <json> --evidence-dir <dir>');
    process.exitCode = 1;
    return;
  }
  const result = await refreshOfficial({ out, evidenceDir, from: arg('--from'), to: arg('--to'), now: arg('--now') ? new Date(arg('--now')) : new Date() });
  console.log(JSON.stringify({ status: result.status, verified: result.verified, marketComplete: result.marketComplete, candidates: result.candidates.length, review: result.review.length, coverage: result.coverage, wrote: result.wrote }));
  process.exitCode = process.argv.includes('--policy-check') && result.status === 'blocked_source_policy' ? 0 : result.coverage.complete && result.status !== 'source_failed' ? 0 : 2;
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
