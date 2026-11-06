import { positiveFactorScenario, type ScenarioResult } from '@atlas/domain/market-lab';
import type { Axis } from '@atlas/contracts/market-lab';
import { axes, errorText, finite, fmt } from '../components/common.js';
import { ScenarioContributionChart } from '../components/ztd-research-charts.js';

export interface ScenarioState {
  alpha: number; beta: number; gamma: number; weights: string[]; sensitivity: string;
}
export const initialScenario = (): ScenarioState => ({ alpha: 0, beta: 0, gamma: 0, weights: ['1', '1', '1'], sensitivity: '0.1' });
export function ScenarioPanel({ state, onChange }: { state: ScenarioState; onChange: (state: ScenarioState) => void }) {
  let result: ScenarioResult | null = null, error = '';
  try {
    const weights = state.weights.map(value => value === '' ? NaN : Number(value));
    const sensitivity = state.sensitivity === '' ? NaN : Number(state.sensitivity);
    if (![state.alpha, state.beta, state.gamma, ...weights, sensitivity].every(finite) || weights.some(value => value < 0)
      || weights.reduce((a, b) => a + b, 0) <= 0 || sensitivity < 0 || sensitivity > 1) {
      throw new Error('가중치는 0 이상, 합은 0 초과로 입력하세요. λ는 0~1입니다.');
    }
    result = positiveFactorScenario({ alpha: state.alpha, beta: state.beta, gamma: state.gamma, weights, sensitivity });
  } catch (caught) { error = errorText(caught); }
  const shock = (axis: Axis, value: string) => onChange({ ...state, [axis]: Number(value) });
  return <>
    <div className="ml-section-heading"><div><h2>조건 실험</h2></div><span className="ml-pill">가정 입력</span></div>
    <div className="ml-two-col"><article className="ml-card"><h3>축별 값</h3>
      <p className="ml-muted">범위 −3 ~ +3 · 중립 0</p>
      {axes.map(([key, symbol, name], index) => <div className="ml-shock-row" key={key}>
        <label htmlFor={`ml-${key}`}>{symbol} {name} <output id={`ml-${key}-out`}>{fmt(state[key], 1)}</output></label>
        <input id={`ml-${key}`} data-shock={key} type="range" min="-3" max="3" step="0.1" value={state[key]} aria-describedby="ml-shock-help" onChange={event => shock(key, event.currentTarget.value)} />
        <label className="ml-weight">가중치 <input data-weight={index} type="number" min="0" max="100" step="0.1" value={state.weights[index]} aria-label={`${name} 비음수 가중치`}
          onChange={event => onChange({ ...state, weights: state.weights.map((weight, i) => i === index ? event.currentTarget.value : weight) })} /></label>
      </div>)}
      <p id="ml-shock-help" className="ml-muted">가중치 합계는 1로 정규화합니다.</p>
      <label className="ml-field">민감도 λ <input data-control="sensitivity" type="number" min="0" max="1" step="0.01" value={state.sensitivity}
        onChange={event => onChange({ ...state, sensitivity: event.currentTarget.value })} /></label>
      <div className="ml-actions"><button type="button" data-action="negative" onClick={() => onChange({ ...initialScenario(), alpha: -2, beta: -2 })}>하락 예시</button>
        <button type="button" data-action="reset-scenario" onClick={() => onChange(initialScenario())}>초기화</button></div>
    </article><article className="ml-card"><h3>가정 지수 · 기준 100</h3>
      <div id="ml-scenario-output" aria-live="polite">{result ? <>
        <div className="ml-index"><strong>{fmt(result.index)}</strong><span>무차원 가상 지수 / 기준 100</span></div>
        <p className="ml-formula">I = 100 × exp(λ × 압력)</p><p>부호 있는 압력 <b>{fmt(result.pressure, 3)}</b> · λ {fmt(result.sensitivity, 2)}</p>
        <ScenarioContributionChart contributions={result.contributions} />
        <div className="ml-table-wrap"><table><caption>축별 정규화 기여와 양수 인자</caption><thead><tr><th>축</th><th>충격</th><th>정규화 기여</th><th>양수 인자</th></tr></thead>
          <tbody>{axes.map(([key, symbol, name], index) => <tr key={key}><th>{symbol} {name}</th><td>{fmt(state[key], 1)}</td><td>{fmt(result.contributions[index], 3)}</td><td>{fmt(result.factors[index], 4)}</td></tr>)}</tbody></table></div>

      </> : <p className="ml-error" role="alert">{error}</p>}</div>
      <details className="ml-original"><summary>계산 기준</summary><p>동일 가중치와 λ=0.1은 연구 가정입니다. 가중합 압력을 양수 인자로 변환합니다. 두 음수를 곱해 양수가 되는 원시 곱셈의 해석 오류를 피할 뿐, 예측 정확도를 입증하지 않습니다.</p></details>
    </article></div>
  </>;
}
