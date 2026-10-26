const DAY = 86_400_000;
export const MARKET_CALENDAR = Object.freeze({
  id: 'nyse-core-2026-2028-v1',
  firstYear: 2026,
  lastYear: 2028,
  source: 'https://www.nyse.com/trade/hours-calendars',
  reviewedAt: '2026-10-26',
});
const HOLIDAYS = new Set([
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
  '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24',
  '2028-01-17','2028-02-21','2028-04-14','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-11-23','2028-12-25',
]);
const EARLY_CLOSE = new Set(['2026-11-27','2026-12-24','2027-11-26','2028-07-03','2028-11-24']);
export const FRESHNESS_LABELS = Object.freeze({
  current: '정상', closed: '정상 휴장', delayed: '공급원 지연', retained: '갱신 실패 · 이전 자료',
  gap: '알려진 결측', disagreement: '출처 간 차이', incomparable: '정의상 비교 불가',
  unknown: '최신성 확인 필요', future: '미완료 또는 미래 관측',
});

export function parseDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('A calendar date is required');
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== value) throw new RangeError('Invalid calendar date');
  return time;
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) throw new TypeError('An explicit timezone is required');
  parseDay(value.slice(0,10));
  if (Number(value.slice(11,13))>23 || Number(value.slice(14,16))>59 || Number(value.slice(17,19))>59) throw new RangeError('Invalid timestamp');
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new RangeError('Invalid timestamp');
  return result;
}
function dayAt(time) { return new Date(time).toISOString().slice(0,10); }
function validateObservationTimes(timing, observedAt, availableAt=null) {
  const close=timing.sessionCloseUtc===null?null:instant(timing.sessionCloseUtc);
  const observed=observedAt===null?null:instant(observedAt);
  const available=availableAt===null?null:instant(availableAt);
  if (close!==null && observed!==null && observed<close) throw new RangeError('Collection precedes the observation close');
  if (close!==null && available!==null && available<close) throw new RangeError('Publication precedes the observation close');
  if (available!==null && observed!==null && available>observed) throw new RangeError('Known publication occurs after collection');
}
function supported(day) { const y = Number(day.slice(0,4)); return y >= MARKET_CALENDAR.firstYear && y <= MARKET_CALENDAR.lastYear; }
export function isEquitySession(day) {
  const time = parseDay(day);
  if (!supported(day)) return null;
  const weekday = new Date(time).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !HOLIDAYS.has(day);
}
export function sessionCloseUtc(day, market = 'crypto') {
  const time = parseDay(day);
  if (market === 'crypto') return new Date(time + DAY).toISOString();
  if (market !== 'equity') throw new RangeError('Unknown market calendar');
  if (!isEquitySession(day)) return null;
  const year = Number(day.slice(0,4));
  const secondSundayMarch = 8 + (7 - new Date(Date.UTC(year,2,8)).getUTCDay()) % 7;
  const firstSundayNovember = 1 + (7 - new Date(Date.UTC(year,10,1)).getUTCDay()) % 7;
  const daylight = time >= Date.UTC(year,2,secondSundayMarch) && time < Date.UTC(year,10,firstSundayNovember);
  return new Date(time + ((EARLY_CLOSE.has(day) ? 13 : 16) + (daylight ? 4 : 5)) * 3_600_000).toISOString();
}

export function observationTiming(day, market = 'crypto') {
  const time = parseDay(day);
  if (!['crypto','equity'].includes(market)) throw new RangeError('Unknown market calendar');
  return {
    sessionDate: day,
    sessionCloseUtc: sessionCloseUtc(day, market),
    eligibleAt: new Date(time + DAY).toISOString(),
    availableAt: null,
    policy: market === 'crypto' ? 'completed-utc-day' : 'session-date-before-utc-date',
    calendar: market === 'equity' ? (supported(day) ? MARKET_CALENDAR.id : null) : 'utc-daily',
    availabilityKnown: false,
  };
}

export function expectedObservationDate(now, market = 'crypto') {
  const time = instant(now), today = dayAt(time);
  if (market === 'crypto') return dayAt(parseDay(today) - DAY);
  if (market !== 'equity') throw new RangeError('Unknown market calendar');
  for (let offset=1; offset<=14; offset++) {
    const day = dayAt(parseDay(today) - offset * DAY), session = isEquitySession(day);
    if (session === null) return null;
    if (session) return day;
  }
  return null;
}

export function describeFreshness({ latestDate, market='crypto', observedAt=null, availableAt=null, lastAttemptAt=null, lastOutcome=null, gaps=0, disagreement=false, comparable=true }, now) {
  if (!Number.isSafeInteger(gaps) || gaps<0) throw new RangeError('Known gap count must be a nonnegative integer');
  const nowMs = instant(now), expected = expectedObservationDate(now, market);
  const result = { market, latestDate: latestDate || null, expectedDate: expected, observedAt, lastAttemptAt, lastOutcome,
    knownGapCount:gaps,gapScope:'bundled-history',disagreement,comparable,
    calendar: market==='equity'?MARKET_CALENDAR.id:'utc-daily', policy:'completed-before-current-utc-day', timing:null, code:'unknown' };
  if (latestDate) {
    result.timing = {...observationTiming(latestDate, market),availableAt,availabilityKnown:availableAt!==null};
    validateObservationTimes(result.timing,observedAt,availableAt);
  }
  if (!comparable) result.code='incomparable';
  else if (latestDate && (Date.parse(result.timing.eligibleAt)>nowMs || (observedAt && instant(observedAt)>nowMs))) result.code='future';
  else if (market==='equity' && latestDate && isEquitySession(latestDate)===false) result.code='incomparable';
  else if (lastOutcome==='failure' || lastOutcome==='cancelled') result.code='retained';
  else if (disagreement) result.code='disagreement';
  else if (gaps>0) result.code='gap';
  else if (latestDate && expected) {
    if (latestDate < expected) result.code='delayed';
    else if (latestDate > expected) result.code='future';
    else {
      const yesterday=dayAt(parseDay(dayAt(nowMs))-DAY);
      result.code=market==='equity' && isEquitySession(yesterday)===false?'closed':'current';
    }
  }
  return { ...result, label: FRESHNESS_LABELS[result.code] };
}

export function alignObservations(series, comparisonTime, {mode='reconstructed'}={}) {
  const cutoff=instant(comparisonTime);
  if (!['reconstructed','observed'].includes(mode)) throw new RangeError('Unknown alignment mode');
  if (!Array.isArray(series)) throw new TypeError('Series must be an array');
  const symbols=new Set();
  const rows=series.map(item=>{
    if (!item || typeof item.symbol!=='string' || symbols.has(item.symbol) || !Array.isArray(item.prices)) throw new TypeError('Invalid or duplicate series');
    symbols.add(item.symbol);
    const market=item.market || 'crypto';
    let selected=null, previous=-Infinity;
    for (const row of item.prices) {
      const date=Array.isArray(row)?row[0]:row?.date;
      const dateMs=parseDay(date);
      if (dateMs<=previous) throw new RangeError('Observations must be strictly chronological');
      previous=dateMs;
      const timing=observationTiming(date, market);
      if (Date.parse(timing.eligibleAt)>cutoff) break;
      if (market==='equity' && isEquitySession(date)===false) throw new RangeError('Equity observation falls on a closed session');
      const price=Array.isArray(row)?row[1]:row.close;
      if (!(Number.isFinite(price) && price>0)) throw new RangeError('Invalid eligible price');
      const observedAt=(Array.isArray(row)?null:row.observedAt)||item.observedAt||null;
      const availableAt=(Array.isArray(row)?null:row.availableAt)||null;
      validateObservationTimes(timing,observedAt,availableAt);
      if (availableAt && instant(availableAt)>cutoff) continue;
      if (mode==='observed' && (!observedAt || instant(observedAt)>cutoff)) continue;
      selected={date,price,...timing,observedAt,availableAt,availabilityKnown:Boolean(availableAt),
        ageHours:timing.sessionCloseUtc?(cutoff-Date.parse(timing.sessionCloseUtc))/3_600_000:null};
    }
    return {symbol:item.symbol,market,status:selected?'available':'unavailable',observation:selected};
  });
  return {comparisonTime:new Date(cutoff).toISOString(),mode,simultaneousPrices:false,
    interpretation:mode==='observed'?'수집시각까지 확인된 판본의 마지막 이용 가능 관측':'현재 판본을 완료 봉 정책으로 정렬한 회고 비교',rows};
}
