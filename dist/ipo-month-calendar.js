const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso = date => date.toISOString().slice(0, 10);
const monthName = month => `${Number(month.slice(0,4))}년 ${Number(month.slice(5))}월`;
const kinds = [['청약','subscription'], ['수요예측','forecast']];

// Keep the captured months and this month, without rendering years of empty pages.
export function ipoMonthKeys(rows, today) {
  const months = new Set([today.slice(0,7)]);
  for (const row of rows) for (const [key] of kinds) {
    const dates=(row[key]??[]).filter(Boolean);
    if(!dates.length)continue;
    const ordinal=date=>Number(date.slice(0,4))*12+Number(date.slice(5,7))-1;
    for(let cursor=ordinal(dates[0]);cursor<=ordinal(dates.at(-1));cursor++) {
      months.add(`${String(Math.floor(cursor/12)).padStart(4,'0')}-${String(cursor%12+1).padStart(2,'0')}`);
    }
  }
  return [...months].sort();
}

export function ipoMonthCells(month) {
  const [year, number] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, number-1, 1));
  const start = first.getUTCDate() - first.getUTCDay();
  const count=Math.ceil((first.getUTCDay()+new Date(Date.UTC(year,number,0)).getUTCDate())/7)*7;
  return Array.from({length:count}, (_,index) => {
    const date = iso(new Date(Date.UTC(year,number-1,start+index)));
    return {date, day:Number(date.slice(-2)), outside:date.slice(0,7)!==month};
  });
}

export function ipoEventsOnDate(rows, date) {
  return kinds.flatMap(([key,kind]) => rows.filter(row => {
    const [start,end=start] = row[key] ?? [];
    return start && start <= date && date <= (end ?? start);
  }).map(row => ({row,kind,label:key}))).sort((a,b) => (a.kind==='subscription'?0:1)-(b.kind==='subscription'?0:1) || a.row['종목'].localeCompare(b.row['종목'],'ko'));
}

export function ipoMonthMarkup(rows, month, today) {
  const cells = ipoMonthCells(month);
  const counts = kinds.map(([label,kind]) => `${label} ${rows.filter(row => {
    const [start,end=start] = row[label] ?? [];
    return start && start.slice(0,7) <= month && (end??start).slice(0,7) >= month;
  }).length}종목`).join(' · ');
  return `<section class="ipo-month-page" data-ipo-month="${esc(month)}" aria-label="${esc(monthName(month))} 달력">
    <header class="ipo-month-heading"><h2>${esc(monthName(month))}</h2><p>${esc(counts)}</p></header>
    <div class="ipo-month-weekdays" aria-hidden="true">${['일','월','화','수','목','금','토'].map(day=>`<span>${day}</span>`).join('')}</div>
    <div class="ipo-month-grid" style="--ipo-weeks:${cells.length/7}" role="group" aria-label="${esc(monthName(month))} 날짜별 일정">${cells.map(cell=>{
      const events = ipoEventsOnDate(rows,cell.date);
      const summary = events.map(event=>`${event.label} ${event.row['종목']}`).join(', ');
      return `<button type="button" data-ipo-date="${cell.date}" class="ipo-month-day${cell.outside?' is-outside':''}${cell.date===today?' is-today':''}" ${cell.date===today?'aria-current="date"':''} aria-label="${esc(cell.date)}${cell.outside?' (다른 달)':''} · ${events.length?esc(summary):'일정 없음'}">
        <span class="ipo-day-number">${cell.day}</span><span class="ipo-day-events">${events.slice(0,2).map(event=>`<span class="ipo-cal-event" data-kind="${event.kind}"><span>${event.kind==='forecast'?'예측':'청약'}</span><strong>${esc(event.row['종목'])}</strong></span>`).join('')}</span>${events.length>2?`<span class="ipo-day-more">외 ${events.length-2}건</span>`:''}</button>`;
    }).join('')}</div>
  </section>`;
}

export function mountIpoMonthCalendar(root) {
  const host = root.querySelector('.ipo-month-pages');
  const pages = root.querySelector('.ipo-pages');
  const doc = root.ownerDocument, win = doc?.defaultView;
  let months=[], rows=[], today='', active=0, rendered=false;
  const sections=()=>[...(pages.querySelectorAll?.('[data-ipo-month], .ipo-list-page')??[])];
  const label=()=>root.querySelector('.ipo-page-label');
  function updatePage() {
    if(!pages.clientHeight)return;
    const visible=sections();
    if(visible.length)active=visible.reduce((best,section,index)=>Math.abs(section.offsetTop-(pages.scrollTop??0))<Math.abs(visible[best].offsetTop-(pages.scrollTop??0))?index:best,0);
    const text=active<months.length?`${active+1}/${months.length+1}`:'목록';
    if(label())label().textContent=text;
    sections().forEach((section,index)=>{section.inert=index!==active;});
    const prev=root.querySelector('[data-ipo-page="previous"]'),next=root.querySelector('[data-ipo-page="next"]');
    if(prev)prev.disabled=active===0;
    if(next)next.disabled=active===months.length;
  }
  function go(index, smooth=true) {
    active=Math.min(months.length,Math.max(0,index));
    if(!pages.clientHeight)return;
    if(typeof pages.scrollTo==='function')pages.scrollTo({top:sections()[active]?.offsetTop??active*pages.clientHeight,behavior:smooth&&!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'});
    updatePage();
  }
  pages.addEventListener?.('scroll',updatePage,{passive:true});
  pages.addEventListener?.('keydown',event=>{
    if(event.target!==pages&&!['PageDown','PageUp'].includes(event.key))return;
    const actions={PageDown:active+1,PageUp:active-1,Home:0,End:months.length};
    if(event.key in actions){event.preventDefault();pages.focus?.({preventScroll:true});go(actions[event.key]);}
  });
  let resize;
  if(win?.ResizeObserver){resize=new win.ResizeObserver(()=>go(active,false));resize.observe(pages);}
  function showDate(date) {
    const dialog=root.querySelector('.ipo-day-dialog');
    const title=dialog.querySelector('.ipo-day-title'),body=dialog.querySelector('.ipo-day-detail');
    title.textContent=`${date.replaceAll('-','.')} 일정`;
    const events=ipoEventsOnDate(rows,date);
    body.innerHTML=events.length?events.map(({row,label,kind})=>`<article class="ipo-date-event"><span class="ipo-cal-kind" data-kind="${kind}">${label}</span><h3>${esc(row['종목'])}</h3><p>${esc((row[label]??[]).filter(Boolean).join(' ~ '))}</p><p>주간사 · ${esc((row['주간사']??[]).join(' · ')||'미확인')}</p></article>`).join(''):'<p>현재 필터에 맞는 일정이 없습니다.</p>';
    dialog.showModal();
  }
  return {
    render(visibleRows, allRows, date) {
      const priorMonth=months[active], wasList=rendered&&active===months.length;
      rows=visibleRows;today=date;months=ipoMonthKeys(allRows,date);
      host.innerHTML=months.map(month=>ipoMonthMarkup(rows,month,today)).join('');
      go(wasList?months.length:Math.max(0,months.indexOf(priorMonth??today.slice(0,7))),false);
      rendered=true;
    },
    handleClick(event) {
      const close=event.target.closest('[data-ipo-day-close]');
      if(close){root.querySelector('.ipo-day-dialog').close();return;}
      const day=event.target.closest('[data-ipo-date]');
      if(day){showDate(day.dataset.ipoDate);return;}
      const button=event.target.closest('[data-ipo-page]');
      if(!button)return;
      const target=button.dataset.ipoPage;
      go(target==='previous'?active-1:target==='next'?active+1:target==='today'?months.indexOf(today.slice(0,7)):months.length);
    },
    destroy(){resize?.disconnect();},
  };
}
