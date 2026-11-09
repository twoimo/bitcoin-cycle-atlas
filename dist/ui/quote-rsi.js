import {calculateRsiSeries} from '../market-lab-math.js';

const cache=new WeakMap(),day=86400000;
const unavailable=reason=>({value:null,reason});
const keys=row=>{
  if(Array.isArray(row))return [row[0]];
  return [row?.time,row?.date,row?.endDate,row?.lastObservationDate,row?.lastSessionDate].filter(value=>value!==null&&value!==undefined);
};
const key=value=>typeof value==='number'?`time:${value}`:`date:${value}`;

/** Reuse the canonical Wilder implementation with a private ordinal calendar.
 * RSI depends on ordered closes; native intraday labels are not valid day keys
 * for that calculator. No synthetic date escapes this adapter or fills a gap. */
function indexFor(rows){
  if(cache.has(rows))return cache.get(rows);
  let result;
  try{
    if(rows.length>25000)throw new RangeError('RSI 원자료가 계산 가능 범위 25,000봉을 넘었습니다.');
    let previous=-Infinity;
    for(const row of rows){
      const original=keys(row)[0],time=typeof original==='number'?original:typeof original==='string'?Date.parse(original)/1000:NaN;
      if(!Number.isFinite(time)||time<=previous)throw new TypeError('RSI 원자료 시각은 중복 없이 오름차순이어야 합니다.');
      previous=time;
    }
    const prices=rows.map((row,index)=>[new Date(Date.UTC(2000,0,1)+index*day).toISOString().slice(0,10),Array.isArray(row)?row[1]:row?.close??row?.price]);
    const calculated=calculateRsiSeries(prices,14,9),values=new Map(),dates=new Map();
    for(const row of rows)for(const value of keys(row))if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)){
      const date=value.slice(0,10);dates.set(date,(dates.get(date)||0)+1);
    }
    rows.forEach((row,index)=>{
      for(const value of keys(row)){
        values.set(key(value),calculated[index].rsi);
        if(typeof value==='string'&&dates.get(value.slice(0,10))===1)values.set(key(value.slice(0,10)),calculated[index].rsi);
      }
    });
    result={values};
  }catch(error){result={reason:error instanceof Error?error.message:'RSI 원자료 확인이 필요합니다.'};}
  cache.set(rows,result);return result;
}

export function quoteRsiAt(rows,selection,{kind='observed'}={}){
  if(kind!=='observed')return unavailable(kind==='unavailable'?'선택한 관측값 없음':'미래 가정에 관측 RSI를 붙이지 않습니다.');
  if(!Array.isArray(rows)||!rows.length)return unavailable('RSI를 계산할 관측 종가가 없습니다.');
  const index=indexFor(rows);if(index.reason)return unavailable(index.reason);
  const candidates=typeof selection==='object'&&selection!==null?keys(selection):[selection];
  for(const candidate of candidates){
    const lookup=key(candidate);if(!index.values.has(lookup))continue;
    const value=index.values.get(lookup);
    return Number.isFinite(value)?{value,reason:'선택한 주기의 실제 종가 · Wilder RSI 14'}:unavailable('RSI 14에 필요한 이전 관측 봉이 부족합니다.');
  }
  return unavailable('선택한 날짜·주기와 일치하는 관측 RSI가 없습니다.');
}
