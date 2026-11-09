const fallbackLevels = [33.5, 29.5, 40, 43];
const sideLabel = side => side === 'Buy' ? '매수' : '매도';
const finite = value => Number.isFinite(value) ? value : null;

/** Present tranche ownership and ledger clocks without deriving new signals.
 * Earlier closed cycles never complete a stage in the current cycle.
 * @param {import('../../packages/domain/src/rsi-simulation.js').RsiSimulationResult|null|undefined} result
 * @param {{error?:string}} [options]
 */
export function rsiTrancheStatus(result, {error = ''} = {}) {
  const declared = [...(result?.assumptions.entryLevels || []), ...(result?.assumptions.exitLevels || [])];
  const levels = fallbackLevels.map((value, index) => finite(declared[index]) ?? value);
  const ready = !error && result?.status === 'ready' && finite(result?.currentRsi) !== null;
  const pending = result?.pending || [], trades = result?.trades || [];
  const holdings = result?.holdings || [], nextTriggers = result?.nextTriggers || [];
  const currentCycle = holdings[0]?.cycle ?? null;
  const closed = currentCycle === null ? [] : (result?.closed || []).filter(row => row.cycle === currentCycle);
  const waitReason = error || (!result ? '확정 일봉 자료를 불러오는 중입니다.'
    : result.status === 'insufficient' ? '선택 기간의 확정 일봉이 부족하여 기준 판정을 보류합니다.'
      : 'RSI14 계산에 필요한 확정 자료가 부족합니다.');

  function stageRow(side, stage) {
    const level = levels[(side === 'Buy' ? 0 : 2) + stage - 1];
    const signal = pending.find(row => row.side === side && row.tranche === stage);
    const holding = holdings.find(row => row.tranche === stage);
    const finished = closed.find(row => row.tranche === stage);
    const eligible = ready && nextTriggers.some(row => row.side === side && row.tranche === stage);
    const base = {stage, level, active:ready && !!signal, eligible, signalDate:null, executionDate:null};
    if (!ready) return {...base, status:'unavailable', label:'—', reason:waitReason};
    if (signal) return {...base, status:'pending', label:'체결 대기', signalDate:signal.date,
      reason:`${signal.date} ${stage}차 ${sideLabel(side)} 신호 · 다음 확정 관측 종가에 모의 체결을 기다립니다.`};
    if (side === 'Buy' && holding) return {...base, status:'holding', label:'보유 중',
      signalDate:holding.signalDate, executionDate:holding.date,
      reason:`${holding.date} 체결한 현재 사이클의 ${stage}차 보유분입니다.`};
    if (finished) return {...base, status:'closed', label:side === 'Buy' ? '청산 완료' : '완료',
      signalDate:side === 'Buy' ? finished.signalDate : finished.exitSignalDate,
      executionDate:side === 'Buy' ? finished.date : finished.exitDate,
      reason:`현재 사이클의 ${stage}차 보유분은 ${finished.exitDate}에 청산했습니다.`};
    if (eligible) return {...base, status:'waiting', label:'신호 대기',
      reason:side === 'Buy' && stage === 1
        ? `첫 진입은 확정 RSI ${level} 하향 통과 신호가 필요합니다. 현재 예약된 신호는 없습니다.`
        : `${stage}차 ${sideLabel(side)}의 활성 기준 RSI ${level}에서 새 신호를 기다립니다.`};
    const noHolding = side === 'Sell' && !holding;
    return {...base, status:'blocked', label:noHolding ? '보유 없음' : '1차 후 대기',
      reason:noHolding ? `${stage}차 보유분이 없어 해당 매도 단계는 활성화되지 않았습니다.`
        : side === 'Buy' ? '1차 매수 체결 뒤에 2차 매수 기준을 판정합니다.'
          : '1차 보유분 청산 뒤에 2차 매도 기준을 판정합니다.'};
  }

  // Closed positions already appear in trades. Keep pending signals separate
  // from fills and sort new records, leaving all original arrays untouched.
  const recent = [
    ...trades.map(row => ({id:`${row.side}:${row.tranche}:${row.signalDate}`, side:row.side, stage:row.tranche,
      level:row.threshold, status:'filled', label:`${row.tranche}차 ${sideLabel(row.side)}`,
      signalDate:row.signalDate, executionDate:row.date, price:row.price})),
    ...pending.map(row => ({id:`${row.side}:${row.tranche}:${row.date}`, side:row.side, stage:row.tranche,
      level:row.level, status:'pending', label:`${row.tranche}차 ${sideLabel(row.side)}`,
      signalDate:row.date, executionDate:null, price:null})),
  ].sort((a, b) => b.signalDate.localeCompare(a.signalDate) || (b.executionDate || '').localeCompare(a.executionDate || '')).slice(0, 5);

  return {buy:[stageRow('Buy', 1), stageRow('Buy', 2)], sell:[stageRow('Sell', 1), stageRow('Sell', 2)], recent};
}
