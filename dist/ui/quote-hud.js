const missing='—';
const number=new Intl.NumberFormat('en-US',{minimumFractionDigits:1,maximumFractionDigits:1});
const zoneName=zone=>({'America/New_York':'NY','Asia/Seoul':'KST',UTC:'UTC'}[zone]||zone||'UTC');
const present=value=>value!==null&&value!==undefined&&String(value).trim()!=='';

/** These are source calendar labels, not instants to convert to another zone.
 * In particular a US equity's synthetic UTC midnight still names its NY session. */
export function quoteTimestamp(value,{timezone='UTC',intraday=false}={}){
  if(!present(value))return missing;
  const literal=String(value),date=literal.slice(0,10).replaceAll('-','.');
  return `${date}${intraday&&literal.length>=16?' '+literal.slice(11,16):''} ${zoneName(timezone)}`;
}

/** One DOM owner for native and React charts. Values never replace the fields,
 * so loading, missing observations and pointer inspection retain the same slots. */
export function mountQuoteHud(host,{ids={}}={}){
  const doc=host.ownerDocument,fields={};
  const make=(tag,field)=>{
    const node=doc.createElement(tag);node.className=`quote-hud-${field}`;
    node.dataset.quoteField=field;if(ids[field])node.id=ids[field];fields[field]=node;return node;
  };
  const main=doc.createElement('div'),meta=doc.createElement('div');
  main.className='quote-hud-row quote-hud-main';meta.className='quote-hud-row quote-hud-meta';
  main.append(make('strong','name'),make('span','interval'),make('span','kind'),make('strong','price'),make('span','change'));
  const source=make('span','source'),time=make('time','time'),rsi=make('span','rsi');
  const rsiLabel=doc.createElement('span'),rsiValue=doc.createElement('b');
  rsiLabel.textContent='RSI14';rsiValue.dataset.quoteRsiValue='true';rsi.append(rsiLabel,rsiValue);
  meta.append(source,time,rsi);const detail=make('span','detail');detail.classList.add('quote-hud-detail');
  host.classList.add('atlas-quote-hud');host.setAttribute('role','group');host.removeAttribute('aria-live');
  host.replaceChildren(main,meta,detail);
  function update(quote){
    quote=quote||{};
    const kind=quote.kind==='forecast'||quote.kind==='simulated'?'assumption':quote.kind==='observed'?'observed':'unavailable';
    const name=quote.name||quote.symbol||missing,fullName=quote.fullName||name,interval=quote.interval||missing;
    const change=kind==='observed'&&Number.isFinite(quote.changePct)?quote.changePct:null;
    const changeText=kind==='observed'&&present(quote.changeText)?String(quote.changeText):change===null?missing:`${change<0?'−':change>0?'+':''}${number.format(Math.abs(change))}%`;
    const intraday=!['1D','1W','1M',missing].includes(interval);
    const clock=present(quote.timestampText)?String(quote.timestampText):quoteTimestamp(quote.dateTime,{timezone:quote.timezone,intraday});
    const rsiNumber=kind==='observed'&&Number.isFinite(quote.rsi)&&quote.rsi>=0&&quote.rsi<=100?quote.rsi:null;
    fields.name.textContent=name;fields.name.title=fullName;fields.name.setAttribute('aria-label',fullName);
    fields.interval.textContent=interval;fields.interval.setAttribute('aria-label',`가격 주기 ${interval}`);
    fields.kind.textContent=kind==='assumption'?'가정':kind==='observed'?(quote.priceLabel||'종가'):missing;
    fields.kind.title=quote.kindLabel||(kind==='assumption'?'조건부 미래 가정':kind==='observed'?'관측 종가':'자료 없음');
    fields.price.textContent=kind!=='unavailable'&&present(quote.priceText)?String(quote.priceText):missing;
    fields.price.setAttribute('aria-label',`${fields.kind.title} ${fields.price.textContent}`);
    fields.change.textContent=`전봉 ${changeText}`;fields.change.dataset.tone=change===null||change===0?'neutral':change<0?'down':'up';
    fields.change.setAttribute('aria-label',`직전 봉 종가 대비 ${changeText}`);
    fields.time.textContent=clock;
    if(present(quote.dateTime))fields.time.setAttribute('datetime',String(quote.dateTime));else fields.time.removeAttribute('datetime');
    fields.time.setAttribute('aria-label',`${kind==='observed'?'관측':kind==='assumption'?'가정':'선택'} 시각 ${clock}${quote.timezone?' · '+quote.timezone:''}`);
    fields.source.textContent=quote.source||missing;fields.source.title=quote.sourceDescription||quote.source||'출처 없음';
    fields.source.setAttribute('aria-label',`가격 출처 ${fields.source.title}`);
    const sourceVisible=quote.sourceVisible===undefined?host.dataset.sourceVisible!=='false':quote.sourceVisible!==false;
    host.dataset.sourceVisible=String(sourceVisible);fields.source.dataset.sourceVisible=String(sourceVisible);
    fields.source.style.visibility=sourceVisible?'':'hidden';fields.source.setAttribute('aria-hidden',String(!sourceVisible));
    rsiValue.textContent=rsiNumber===null?missing:number.format(rsiNumber);
    fields.rsi.title=quote.rsiReason||`${interval} 종가의 Wilder RSI 14`;
    fields.rsi.setAttribute('aria-label',`RSI 14 ${rsiValue.textContent} · ${fields.rsi.title}`);
    detail.textContent=quote.detailText||'';
    host.dataset.symbol=quote.symbol||'';host.dataset.kind=quote.kind||'unavailable';host.dataset.quoteState=kind;
    host.dataset.quoteInterval=interval;
    host.dataset.quoteIntraday=String(intraday);
    host.setAttribute('aria-label',`${fullName} · ${interval} 가격 계기판`);
    host.title=quote.description||`${fullName} · ${fields.kind.title} ${fields.price.textContent} · 전봉 ${changeText} · ${clock} · RSI14 ${rsiValue.textContent}`;
  }
  update({});
  return {update,destroy(){host.replaceChildren();host.classList.remove('atlas-quote-hud');}};
}
