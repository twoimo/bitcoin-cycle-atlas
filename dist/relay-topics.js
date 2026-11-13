// One deterministic taxonomy is shared by the live reader and its coverage report.
// Matches are quoted evidence, not a claim that the source's opinion is true.
export const RELAY_TAXONOMY_VERSION = 'relay-topics-v1';
export const RELAY_TOPICS = Object.freeze([
  { id: 'crypto', label: '가상자산', terms: ['비트코인', '이더리움', '암호화폐', '가상자산', '스테이블코인', '블록체인', 'BTC', 'ETH', 'Bitcoin', 'Ethereum'] },
  { id: 'markets', label: '증시·기업', terms: ['주식', '증시', '나스닥', '코스피', '코스닥', '반도체', '엔비디아', '테슬라', '삼성전자', '하이닉스', '주가', '시총', '실적', '제약', '바이오', '일라이릴리', '젠슨황', '젠슨 황', '네비우스', '기업 실적', 'AI인프라', 'AI 인프라', 'ETF', 'Nasdaq', 'S&P'] },
  { id: 'macro', label: '경제·정책', terms: ['금리', '물가', '인플레이션', '연준', '중앙은행', '환율', '달러', '긴축', '유동성', '유가', '관세', '국채', '고용', '연방정부', 'GDP', 'FOMC', 'CPI'] },
  { id: 'politics', label: '정치·국제', terms: ['지정학', '전쟁', '중간선거', '트럼프', '행정부', '부통령', '상무장관', '민주당', '공화당'] },
  { id: 'housing', label: '부동산', terms: ['부동산', '아파트', '주택', '전세', '재건축', '분양', '임대차', '토지'] },
  { id: 'business', label: '사업·세금', terms: ['법인', '사업자', '창업', '소득세', '법인세', '절세', '세금', '급여', '4대보험'] },
  { id: 'career', label: '취업·학습', terms: ['면접', '취업', '자기소개서', '외국인', '영어 표현', '영어공부'] },
  { id: 'rights', label: '법률·권리', terms: ['초상권', '저작권', '법률', '법적 책임'] },
  { id: 'life', label: '생활·건강', terms: ['운동', '건강', '수면', '식습관', '식단', '근육', '스트레칭', '인간관계', '독서', '결혼', '연애', '마인드', '용기', '심리'] },
  { id: 'unclassified', label: '미분류', terms: [] },
].map(topic => Object.freeze({ ...topic, terms: Object.freeze(topic.terms) })));

const text = value => typeof value === 'string' ? value : '';
export function relayEntries(room) {
  const rows = room?.kind === 'articles' ? room.articles : room?.kind === 'editions' ? room.editions : room?.messages;
  return Array.isArray(rows) ? rows.filter(row => row && typeof row === 'object') : [];
}
export function relayEntryId(room, item, index = 0) {
  return String(item?.id ?? (room?.kind === 'editions' ? `${text(item?.date)}:${text(item?.version)}` : index));
}
export function relayTextFields(item) {
  const fields = ['title', 'text', 'body_text', 'quote'].flatMap(key => text(item?.[key]) ? [{ field: key, text: item[key] }] : []);
  for (const [index, block] of (Array.isArray(item?.blocks) ? item.blocks : []).entries()) {
    if (block?.kind === 'text' && text(block.text)) fields.push({ field: `blocks.${index}.text`, text: block.text });
  }
  // Image filenames and alt/room labels do not establish the contents of a page.
  for (const [index, page] of (Array.isArray(item?.pages) ? item.pages : []).entries()) {
    if (text(page?.text)) fields.push({ field: `pages.${index}.text`, text: page.text });
  }
  return fields;
}
function evidenceFor(fields, terms) {
  for (const source of fields) {
    for (const term of terms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const match of source.text.matchAll(new RegExp(escaped, 'giu'))) {
        const offset = match.index, end = offset + match[0].length;
        const ascii = /^[A-Za-z]+$/.test(term);
        const tokenBoundary = !ascii || (!/[A-Za-z0-9]/.test(source.text[offset - 1] || '') && !/[A-Za-z0-9]/.test(source.text[end] || ''));
        // '전세계' means worldwide, not a jeonse housing contract.
        if (tokenBoundary && !(term === '전세' && source.text[end] === '계')) {
          return { field: source.field, offset, length: match[0].length, quote: match[0], excerpt: source.text.slice(Math.max(0, offset - 32), end + 48) };
        }
      }
    }
  }
  return null;
}
export function classifyRelayEntry(item) {
  const fields = relayTextFields(item);
  const matches = RELAY_TOPICS.flatMap(topic => {
    const evidence = evidenceFor(fields, topic.terms);
    return evidence ? [{ id: topic.id, label: topic.label, evidence }] : [];
  });
  return {
    version: RELAY_TAXONOMY_VERSION,
    topics: matches.length ? matches : [{ id: 'unclassified', label: '미분류', evidence: null }],
    reason: matches.length ? '원문 키워드 일치' : fields.length ? '분류 사전에 일치하는 원문 구절 없음' : '분류할 원문 텍스트 없음 · 이미지 내용 미판독',
  };
}
export function relayMatches(item, { topic = 'all', query = '' } = {}) {
  const needle = String(query).normalize('NFKC').trim().toLocaleLowerCase('ko-KR');
  const queryMatch = !needle || relayTextFields(item).some(field => field.text.normalize('NFKC').toLocaleLowerCase('ko-KR').includes(needle));
  return queryMatch && (topic === 'all' || classifyRelayEntry(item).topics.some(match => match.id === topic));
}
export function relayTopicReport(data) {
  return {
    schema: 1, taxonomy: RELAY_TAXONOMY_VERSION, generatedAt: data?.generated_at || null,
    entries: (Array.isArray(data?.rooms) ? data.rooms : []).flatMap(room => relayEntries(room).map((item, index) => ({
      room: room.id, roomTitle: room.title, id: relayEntryId(room, item, index), kind: room.kind,
      time: item.at || item.published_date || item.date || null,
      sourceUrl: /^https?:\/\//i.test(item.url || item.link || '') ? (item.url || item.link) : null,
      ...classifyRelayEntry(item),
    }))),
  };
}
