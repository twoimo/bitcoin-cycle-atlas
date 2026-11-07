import { assetEconomics, type EconomicsResult } from '@atlas/domain/market-lab';
import { Original, errorText, fmt } from '../components/common.js';
import { CompactToolbar } from '../components/compact-toolbar.js';

export const economicsFields = [
  ['costBasis', '취득원가', '0.01', '0.01'], ['residual', '잔존가치', '0', '0.01'], ['lifeYears', '내용연수 (년)', '1', '1'],
  ['annualRevenue', '연간 현금 매출', '0', '0.01'], ['annualOpex', '연간 현금 운영비', '0', '0.01'], ['discountRate', '할인율 (%)', '0', '0.1'],
] as const;
type Field = typeof economicsFields[number][0];
export interface EconomicsState { inputs: Partial<Record<Field, string>>; result: EconomicsResult | null; error: string; hypothetical: boolean }
export const initialEconomics = (): EconomicsState => ({ inputs: {}, result: null, error: '', hypothetical: false });
export function calculateEconomics(state: EconomicsState): EconomicsState {
  try {
    if (economicsFields.some(([key]) => state.inputs[key] === '' || state.inputs[key] === undefined || !Number.isFinite(Number(state.inputs[key])))) {
      throw new Error('모든 항목에 명시적인 숫자를 입력하세요.');
    }
    const e = state.inputs;
    const result = assetEconomics({ costBasis: Number(e.costBasis), residual: Number(e.residual), lifeYears: Number(e.lifeYears), annualRevenue: Number(e.annualRevenue), annualOpex: Number(e.annualOpex), discountRate: Number(e.discountRate) / 100 });
    return { ...state, result, error: '' };
  } catch (error) { return { ...state, result: null, error: errorText(error) }; }
}
function EconomicsOutput({ state }: { state: EconomicsState }) {
  if (state.error) return <p className="ml-error" role="alert">{state.error}</p>;
  const result = state.result;
  if (!result) return <p className="ml-empty-copy">입력 후 계산하세요.</p>;
  return <>
    <p className={state.hypothetical ? 'ml-pill ml-warn' : 'ml-pill'}>{state.hypothetical ? '가상 예시 결과 · 실제 기업 관측 아님' : '사용자 입력 가정 결과'}</p>
    <dl className="ml-results ml-economics-results">
      {[['연간 감가상각', result.depreciation], ['영업이익', result.operatingProfit], ['연간 운영현금', result.operatingCash], ['순현재가치 NPV', result.npv]].map(([label, value]) =>
        <div key={label} className={label === '순현재가치 NPV' ? 'ml-principal-result' : undefined}><dt>{label}</dt><dd>{fmt(value)}</dd></div>)}
      <div className="ml-payback-result"><dt>회수 구분</dt><dd><details><summary>{result.operatingPaybackYears === null ? '계산 불가' : `${fmt(result.operatingPaybackYears)}년`} · {result.recoveredWithinLife ? '내용연수 내 회수' : '내용연수 내 미회수'}</summary><p>{result.summary}</p></details></dd></div>
    </dl>
    <details className="ml-original"><summary>계산 기준</summary><p className="ml-muted">입력 금액과 같은 통화·연말 수취를 가정합니다. 현금 매출과 현금 운영비가 같은 기간의 회계 수익·비용과 같다는 보장은 없습니다. 상각기간과 현금 수취기간은 현재 같은 내용연수를 씁니다. 감가상각은 현금 유출이 아닙니다.</p></details>
  </>;
}
export function EconomicsPanel({ state, onChange }: { state: EconomicsState; onChange: (state: EconomicsState) => void }) {
  function example() {
    onChange(calculateEconomics({ inputs: { costBasis: '100000', residual: '10000', lifeYears: '5', annualRevenue: '40000', annualOpex: '15000', discountRate: '8' }, result: null, error: '', hypothetical: true }));
  }
  return <>
    <CompactToolbar label="현금흐름 계산 도구"><span className="compact-toolbar-muted">가정 입력</span><button className="compact-toolbar-action" type="button" data-action="economics-example" onClick={example}>예시 채우기</button>{state.result&&<span className="compact-toolbar-summary">NPV <strong>{fmt(state.result.npv)}</strong><span className="compact-toolbar-muted">{state.hypothetical?'가상 예시':'사용자 가정'}</span></span>}</CompactToolbar>
    <div className="ml-two-col ml-ai-calc ml-analysis-layout"><article className="ml-card ml-editor-pane"><h3>자산 현금흐름 계산기</h3>
      <p className="ml-muted">금액은 같은 통화로 입력하세요.</p>
      <form id="ml-economics-form" onSubmit={event => { event.preventDefault(); onChange(calculateEconomics(state)); }}>
        {[{legend: '자산과 수명', fields: economicsFields.slice(0, 3)}, {legend: '운영과 할인', fields: economicsFields.slice(3)}].map(({legend, fields}) => <fieldset className="ml-input-group" key={legend}><legend>{legend}</legend><div className="ml-input-grid">
          {fields.map(([key, label, min, step]) => <label key={key} className={`ml-field${key === 'lifeYears' || key === 'discountRate' ? ' ml-field-inline' : ''}`} htmlFor={`ml-econ-${key}`}>{label}<input id={`ml-econ-${key}`} name={key} data-econ={key} type="number" min={min} max={key === 'lifeYears' || key === 'discountRate' ? 100 : undefined} step={step} required value={state.inputs[key] ?? ''}
            onChange={event => onChange({ inputs: { ...state.inputs, [key]: event.currentTarget.value }, result: null, error: '', hypothetical: false })} /></label>)}
        </div></fieldset>)}
        <button type="submit" className="ml-primary">현금흐름 계산</button>
      </form>
    </article><article className="ml-card ml-result-pane"><h3>손익과 현금 구분</h3><div id="ml-economics-output" aria-live="polite"><EconomicsOutput state={state} /></div>
      <details className="ml-original"><summary>포함하지 않은 항목</summary><p>세금·금융비용·교체투자·가동률 변동·운전자본은 제외합니다. 결과는 가정 입력에 따른 계산값입니다.</p></details>
    </article></div>
    <details className="ml-original"><summary>원문과 분석 항목</summary>
    <div className="ml-theme-grid">
      <article className="ml-card"><h3>사용량이 매출로 남는가</h3><p className="ml-source-line">누적</p><p>유료 과금 토큰량 × 실현 토큰단가. 사용자 결제 침투율은 별도로 봅니다.</p><p className="ml-muted">필요 증거: 기간별 사용량, 할인·무료분, 단가와 결제 고객 수. 연결된 실측값 없음 → 판단 유보.</p></article>
      <article className="ml-card"><h3>성장이 현금으로 이어지는가</h3><p className="ml-source-line">증명</p><p>매출·영업이익률·FCF·CAPEX와 고객 집중도를 같은 기간·단위로 비교합니다.</p><p className="ml-muted">2027년은 원문에서 숫자 증명의 시기로 제시된 전망입니다. 달성된 사실이나 현재 실적이 아닙니다.</p></article>
      <article className="ml-card"><h3>설비가 투자금을 회수하는가</h3><p className="ml-source-line">자산화</p><p>취득원가·내용연수·잔존가치와 실제 연간 운영현금을 분리합니다. 감가상각은 현금 유출이 아닙니다.</p><p className="ml-muted">ASP 30,000은 원문 판매가격 논의입니다. 제조원가·취득원가로 자동 대입하지 않습니다.</p></article>
    </div>
    </details>
    <Original pages="사진 197 / R8 p.208 · 198 / p.209 · 212 / p.226 · 216 / p.231 · 217 / p.232 · 221 / p.238">누적·증명·자산화라는 세 주제와 2027년 숫자 증명 전망을 출처에 귀속합니다. 미래 전망을 이미 실현된 재무값으로 표시하지 않습니다. 계산기는 원문 수익 약속이 아닌 별도의 연구용 가정입니다.</Original>
  </>;
}
