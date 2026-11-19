const LOGOS = {
  BTC: 'https://static.upbit.com/logos/BTC.png',
  ETH: 'https://static.upbit.com/logos/ETH.png',
  MSTR: 'https://financialmodelingprep.com/image-stock/MSTR.png',
  BMNR: 'https://financialmodelingprep.com/image-stock/BMNR.png',
};

export function symbolLogo(base) {
  return LOGOS[base] || '';
}

export function compactQuantity(value) {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  const digits = abs >= 1e5 ? 1 : 2;
  if (abs >= 1e8) return `${(value / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: digits })}억`;
  if (abs >= 1e4) return `${(value / 1e4).toLocaleString('ko-KR', { maximumFractionDigits: digits })}만`;
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

export function signedChange(pct, absolute) {
  if (!Number.isFinite(pct)) return '';
  const pctSign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  const pctText = `${pctSign}${Math.abs(pct).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  if (!Number.isFinite(absolute)) return pctText;
  const absSign = absolute > 0 ? '+' : absolute < 0 ? '−' : '';
  const absText = `${absSign}${Math.abs(absolute).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${absText} (${pctText})`;
}

/** The on-chart identity that updates with the selected symbol and bar. */
export function renderChartSymbolLegend(root, { name = '', logo = '', interval = '', source = '', open = '', high = '', low = '', close = '', changeText = '', volumeText = '', tone = 'flat' } = {}) {
  const doc = root.ownerDocument;
  const add = (parent, tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    parent.append(node);
    return node;
  };
  root.className = 'chart-symbol-legend';
  root.replaceChildren();
  const title = add(root, 'div', 'chart-symbol-legend-title');
  if (logo) {
    const img = add(title, 'img', 'chart-symbol-avatar');
    img.src = logo;
    img.alt = '';
    img.width = 18;
    img.height = 18;
    img.addEventListener('error', () => img.remove(), { once: true });
  }
  add(title, 'b', '', name);
  for (const part of [interval, source].filter(Boolean)) {
    add(title, 'span', '', '·');
    add(title, 'span', '', part);
  }
  const values = add(root, 'div', 'chart-symbol-legend-values');
  const value = (label, text) => {
    if (!text) return;
    const span = add(values, 'span');
    if (label) span.append(doc.createTextNode(`${label} `));
    add(span, 'b', `is-${tone}`, text);
  };
  value('시', open);
  value('고', high);
  value('저', low);
  value('종', close);
  if (changeText) add(values, 'b', `is-${tone}`, changeText);
  value('거래량', volumeText);
}
