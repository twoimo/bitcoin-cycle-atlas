import {utcDay,dateFromDay} from '../../dist/cycle-engine.js';

// Synthetic short reversal episodes exercise a valid near-term forecast when
// a longer requested horizon crosses the last estimated anchor. No market data.
export function shortCycleFixture(endDay=950){
  const anchors=[[0,50],[50,100],[100,30],[250,180],[300,54],[450,270],
    [500,81],[650,350],[700,105],[850,420],[900,126],[1050,480]];
  const first=utcDay('2015-01-01'),rows=[];let segment=1;
  for(let i=0;i<=endDay;i++){
    while(anchors[segment][0]<i)segment++;
    const [ld,lp]=anchors[segment-1],[rd,rp]=anchors[segment],f=(i-ld)/(rd-ld);
    rows.push({date:dateFromDay(first+i),epochDay:first+i,price:Math.exp((1-f)*Math.log(lp)+f*Math.log(rp))});
  }
  return rows;
}
