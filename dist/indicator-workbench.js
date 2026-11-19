import { INDICATORS, readIndicatorState, normalizeIndicatorState, isIndicatorVisible } from './indicator-state.js?v=1.29.1';
import {mountDialogViewport} from './dialog-viewport.js?v=1.29.0';
import {indicatorReadout,indicatorReadoutDate} from './indicator-readouts.js?v=1.29.0';
import {INDICATOR_SETTINGS,indicatorSettings,indicatorSupportsInterval} from './indicator-settings.js?v=1.29.0';
import {mountIndicatorSettingsDialog} from './indicator-settings-dialog.js?v=1.29.1';
import {INDICATOR_PREFERENCES_KEY,MAX_TEMPLATE_NAME,readIndicatorPreferences,writeIndicatorPreferences,toggleIndicatorFavorite,saveIndicatorTemplate,deleteIndicatorTemplate,indicatorLibraryItems,hasIndicatorTemplate} from './indicator-preferences.js?v=1.29.1';

const ICONS={eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',hidden:'<path d="m3 3 18 18M10 5a12 12 0 0 1 2 0c6.5 0 10 7 10 7a20 20 0 0 1-3 4M6 6a20 20 0 0 0-4 6s3.5 7 10 7a12 12 0 0 0 5-1"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',expand:'<path d="m7 10 5 5 5-5"/>',collapse:'<path d="m7 14 5-5 5 5"/>'};
const glyph=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
ICONS.star='<path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2L2.9 9.6l6.3-.9L12 3Z"/>';
ICONS.settings='<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z"/><circle cx="12" cy="12" r="3"/>';
const LEGEND_LABELS={readout:'가격 · OHLC',source:'자료 출처',legend:'범례',volume:'Vol',history:'역사 사건',range:'수요·채택 범위','cycle-timing':'사이클 시계',drawdown:'전고점 대비',states:'시장 국면',fibonacci:'피보나치'};

/** Display controls already have their own HUD; only real indicators get value rows. */
export function chartIndicatorItems(state) {
  const items=INDICATORS.filter(item=>item.category!=='표시'&&state.added.includes(item.id));
  return [...items.filter(item=>item.id==='volume'),...items.filter(item=>item.id!=='volume')];
}

export function mountIndicatorWorkbench({plot,stage}) {
  const doc=plot.ownerDocument;
  let state=readIndicatorState(location.search),category='전체',view='all',selectedIndicator=null,intraday=false,cycle=null,listKey='',dialogKey='',opener=null;
  const storageProvider=()=>doc.defaultView.localStorage;
  let preferences=readIndicatorPreferences(storageProvider);
  let readoutFrame=0;
  const readoutRows=new Map(),dialogReadoutRows=new Map(),readoutContext={selection:null,workbench:{},cycle:null,analyses:new Map()};
  const command=(action,id,extra={})=>doc.dispatchEvent(new CustomEvent('atlas:indicator-command',{detail:{action,id,...extra}}));
  const settingsDialog=mountIndicatorSettingsDialog({doc,getState:()=>state,command});
  const makeButton=(label,icon,action)=>{const b=doc.createElement('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.innerHTML=glyph(icon);b.onclick=action;return b;};
  const manager=doc.createElement('section');manager.id='chart-indicator-manager';manager.className='chart-indicator-manager indicator-legend';manager.setAttribute('aria-label','추가한 인디케이터');manager.setAttribute('aria-describedby','indicator-readout-date');
  const list=doc.createElement('div');list.id='chart-indicator-list';list.className='chart-indicator-list';
  list.setAttribute('role','list');
  const readoutDate=doc.createElement('p');readoutDate.id='indicator-readout-date';readoutDate.className='indicator-readout-date';
  const fold=doc.createElement('button');fold.type='button';fold.id='indicator-legend-toggle';fold.className='indicator-legend-toggle';fold.setAttribute('aria-controls',list.id);
  const mobileLayout=()=>doc.defaultView.matchMedia?.('(max-width:620px)')?.matches??false;
  fold.onclick=()=>{if(!mobileLayout())command('collapse');};
  manager.append(readoutDate,list,fold);plot.append(manager);
  // Observe layout boxes, never the price path. Wrapped readouts determine the
  // legend position; the actual plot height bounds its scrollable overflow.
  const readoutNode=plot.querySelector('#lab-metrics'),sourceNode=plot.querySelector('.workbench-market-info'),legendNode=plot.querySelector('.lab-chart-foot');
  let hudLayoutFrame=0,lastHudLayoutKey='';
  const hudNodes=[manager,readoutNode,sourceNode,legendNode].filter(Boolean),overlayGeometry=new WeakMap();
  function scheduleHudLayoutChange(){
    if(hudLayoutFrame)return;
    hudLayoutFrame=requestAnimationFrame(()=>{
      hudLayoutFrame=0;
      // Read after observed heights settle: wrapped OHLC/provenance can move
      // the context card, whose height can reposition the study controls.
      const origin=plot.getBoundingClientRect(),key=JSON.stringify(hudNodes.map(node=>{
        if(node.hidden)return null;
        const box=node.getBoundingClientRect();
        return box.width>0&&box.height>0?[box.left-origin.left,box.top-origin.top,box.width,box.height]:null;
      }));
      if(key===lastHudLayoutKey)return;lastHudLayoutKey=key;
      doc.dispatchEvent(new CustomEvent('atlas:hud-layout-change'));
    });
  }
  const overlaySizes=new WeakMap(),overlayResize=new ResizeObserver(entries=>{
    let offsetChanged=false,geometryChanged=false;
    for(const entry of entries){
      const width=entry.borderBoxSize?.[0]?.inlineSize??entry.contentRect.width,height=entry.borderBoxSize?.[0]?.blockSize??entry.contentRect.height;
      if(!Number.isFinite(width)||!Number.isFinite(height)||width<0||height<0)continue;
      const sizeKey=`${width}/${height}`;
      if(overlayGeometry.get(entry.target)!==sizeKey){overlayGeometry.set(entry.target,sizeKey);if(entry.target!==plot)geometryChanged=true;}
      const pixels=Math.ceil(height);
      if(overlaySizes.get(entry.target)===pixels)continue;overlaySizes.set(entry.target,pixels);
      const property=entry.target===plot?'--plot-height':entry.target===manager?'--indicator-manager-height':entry.target===readoutNode?'--readout-height':entry.target===legendNode?'--chart-legend-height':'--source-height';
      plot.style.setProperty(property,`${pixels}px`);
      if(entry.target===readoutNode||entry.target===sourceNode)offsetChanged=true;
    }
    if(offsetChanged)updateOverlayOffsets();
    if(geometryChanged)scheduleHudLayoutChange();
  });
  for(const node of [plot,manager,readoutNode,sourceNode,legendNode])if(node)overlayResize.observe(node);

  const dialog=doc.createElement('dialog');dialog.id='indicator-library';dialog.className='indicator-library indicator-browser';dialog.setAttribute('aria-labelledby','indicator-library-title');dialog.setAttribute('aria-describedby','indicator-library-description indicator-readout-date');
  const dialogHeader=doc.createElement('header');dialogHeader.className='indicator-library-heading';
  const title=doc.createElement('h2');title.id='indicator-library-title';title.className='indicator-browser-title';title.textContent='지표';
  const searchIcon=doc.createElement('span');searchIcon.className='indicator-browser-search-icon';searchIcon.setAttribute('aria-hidden','true');searchIcon.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m13 13 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const search=doc.createElement('input');search.type='search';search.id='indicator-search';search.placeholder='지표 이름 검색';search.setAttribute('aria-label','지표 검색');search.autocomplete='off';
  const close=makeButton('지표 창 닫기','close',()=>dialog.close());dialogHeader.append(title,searchIcon,search,close);
  const description=doc.createElement('p');description.id='indicator-library-description';description.textContent='';
  const views=doc.createElement('div');views.className='indicator-library-views';views.setAttribute('role','group');views.setAttribute('aria-label','지표 목록');
  for(const [id,label] of [['all','둘러보기'],['shared','최근 공유'],['added','내 지표'],['favorites','즐겨찾기']]){
    const b=doc.createElement('button');b.type='button';b.dataset.indicatorView=id;b.textContent=label;b.setAttribute('aria-pressed',String(id===view));
    b.onclick=()=>{view=id;category='전체';dialogKey='';paintDialog();};views.append(b);
  }
  const results=doc.createElement('div');results.id='indicator-library-results';results.className='indicator-library-results';
  const resultCount=doc.createElement('p');resultCount.className='indicator-result-count';resultCount.setAttribute('role','status');resultCount.setAttribute('aria-live','polite');
  const templatePanel=doc.createElement('section');templatePanel.className='indicator-template-panel';templatePanel.hidden=true;templatePanel.setAttribute('aria-label','저장한 지표 조합');
  const templateForm=doc.createElement('form');templateForm.className='indicator-template-form';
  const templateLabel=doc.createElement('label');templateLabel.htmlFor='indicator-template-name';templateLabel.textContent='현재 지표 조합 저장';
  const templateName=doc.createElement('input');templateName.id='indicator-template-name';templateName.placeholder='이름';templateName.maxLength=MAX_TEMPLATE_NAME;templateName.autocomplete='off';templateName.required=true;
  const templateSave=doc.createElement('button');templateSave.type='submit';templateSave.textContent='저장';templateForm.append(templateLabel,templateName,templateSave);
  const templateNote=doc.createElement('p');templateNote.className='indicator-template-note';templateNote.textContent='이 브라우저에 최대 8개';
  const templateRows=doc.createElement('div');templateRows.className='indicator-template-list';templatePanel.append(templateForm,templateNote,templateRows);
  const preferenceStatus=doc.createElement('p');preferenceStatus.className='indicator-preference-status';preferenceStatus.setAttribute('role','status');preferenceStatus.setAttribute('aria-live','polite');preferenceStatus.hidden=true;
  const footer=doc.createElement('footer');
  const options=doc.createElement('div');options.className='indicator-library-options';
  const listOption=doc.createElement('label');listOption.className='indicator-list-option';
  const listVisible=doc.createElement('input');listVisible.type='checkbox';listVisible.id='indicator-list-visibility';listVisible.setAttribute('aria-controls','chart-indicator-list');
  listVisible.onchange=()=>{if(listVisible.checked!==!state.collapsed)command('collapse');};
  listOption.append(listVisible,doc.createTextNode('차트의 지표 이름·값 펼치기'));
  const all=doc.createElement('button');all.type='button';all.id='indicator-visibility-all';all.onclick=()=>command(chartIndicatorItems(state).some(item=>isIndicatorVisible(state,item.id))?'hide-all':'show-all');
  options.append(listOption,all);
  const help=doc.createElement('p');help.className='indicator-library-help';help.textContent='';
  footer.append(options,help);
  const featured=doc.createElement('section');featured.className='indicator-browser-featured';featured.setAttribute('aria-label','이 차트의 지표');
  const featuredHead=doc.createElement('div');featuredHead.className='indicator-browser-section-head';
  const featuredTitle=doc.createElement('strong');featuredTitle.textContent='이 차트의 지표';
  const featuredNote=doc.createElement('span');featuredNote.textContent='가격 차트';
  featuredHead.append(featuredTitle,featuredNote);
  const featuredStrip=doc.createElement('div');featuredStrip.className='indicator-browser-cards';featured.append(featuredHead,featuredStrip);
  const sharedEmpty=doc.createElement('p');sharedEmpty.className='indicator-empty';sharedEmpty.hidden=true;sharedEmpty.textContent='공유된 지표 없음';
  const listPane=doc.createElement('div');listPane.className='indicator-browser-list';listPane.append(featured,resultCount,results,sharedEmpty,templatePanel,preferenceStatus,footer);
  const detail=doc.createElement('aside');detail.className='indicator-browser-detail';detail.setAttribute('aria-label','선택한 지표');
  const detailPreview=doc.createElement('div');detailPreview.className='indicator-browser-preview';
  const detailTitle=doc.createElement('h3');detailTitle.id='indicator-browser-detail-title';
  const detailBy=doc.createElement('span');detailBy.className='indicator-browser-by';detailBy.textContent='Cycle Atlas';
  const detailActions=doc.createElement('div');detailActions.className='indicator-browser-actions';
  const detailAdd=doc.createElement('button');detailAdd.type='button';detailAdd.className='indicator-browser-add';
  const detailStar=doc.createElement('button');detailStar.type='button';detailStar.className='indicator-library-favorite indicator-browser-star';detailStar.innerHTML=glyph('star');
  detailActions.append(detailAdd,detailStar);
  const detailDesc=doc.createElement('p');detailDesc.className='indicator-browser-desc';
  const detailFacts=doc.createElement('dl');detailFacts.className='indicator-browser-facts';
  const detailRelated=doc.createElement('div');detailRelated.className='indicator-browser-related';
  detail.append(detailPreview,detailTitle,detailBy,detailActions,detailDesc,detailFacts,detailRelated);
  const body=doc.createElement('div');body.className='indicator-browser-body';body.append(listPane,detail);
  dialog.append(dialogHeader,description,views,body);doc.body.append(dialog);
  const dialogViewport=mountDialogViewport(dialog);
  templateName.addEventListener('input',()=>{templateSave.textContent=hasIndicatorTemplate(preferences,templateName.value)?'덮어쓰기':'저장';});
  templateForm.addEventListener('submit',event=>{
    event.preventDefault();const saved=saveIndicatorTemplate(preferences,templateName.value,state);
    if(saved.error){announcePreference(saved.error);templateName.focus();return;}
    persistPreferences(saved.preferences,`“${saved.template.name}” 지표 조합을 ${saved.replaced?'덮어썼습니다':'저장했습니다'}.`);
    templateName.value='';templateSave.textContent='저장';paintTemplateRows();templateName.focus();
  });

  function indicatorAnchor(){
    const compact=doc.body.classList.contains('atlas-funnest-compact');
    const visible=compact?doc.querySelector('.atlas-trade-indicators'):null;
    const bounds=visible?.getBoundingClientRect?.();
    return bounds&&bounds.width>0?visible:doc.getElementById('atlas-mode-menu');
  }
  function placeIndicator(){
    const view=doc.defaultView;
    if(!view||!Number.isFinite(view.innerWidth)||!Number.isFinite(view.innerHeight))return;
    const desktop=view.innerWidth>1024;
    const phone=view.innerWidth<=640;
    const panelWidth=phone?view.innerWidth-16:!desktop?Math.min(360,view.innerWidth-16):Math.min(560,view.innerWidth-32);
    const shared=[['position','fixed'],['margin','0'],['right','auto'],['bottom','auto'],['height','auto'],['width',`${panelWidth}px`],['max-width',`${panelWidth}px`]];
    if(desktop){
      const maxHeight=Math.min(480,Math.max(240,view.innerHeight-160));
      for(const [name,value] of [...shared,['left','50%'],['top','50%'],['max-height',`${maxHeight}px`],['transform','translate(-50%, -50%)']])dialog.style.setProperty(name,value);
      return;
    }
    const bounds=indicatorAnchor()?.getBoundingClientRect?.()||{right:16,bottom:40,width:32};
    const top=Math.max(8,(bounds.bottom||40)+8);
    const margin=phone?8:16;
    for(const [name,value] of [...shared,
      ['left',`${phone?8:Math.max(margin,Math.min(view.innerWidth-panelWidth-margin,(bounds.right||panelWidth)-panelWidth))}px`],
      ['top',`${top}px`],
      ['max-height',`${Math.min(480,Math.max(240,view.innerHeight-top-96))}px`],
      ['transform','none'],
    ])dialog.style.setProperty(name,value);
  }
  function open(trigger){
    if(dialog.open){dialog.close();return;}
    opener=trigger||doc.activeElement;search.value='';category='전체';dialogKey='';preferenceStatus.hidden=true;
    doc.dispatchEvent(new CustomEvent('atlas:modal-open',{detail:{id:dialog.id}}));
    placeIndicator();dialog.showModal();paintDialog();(view==='templates'?templateName:search).focus();
    doc.querySelector('#atlas-mode-menu')?.setAttribute('aria-expanded','true');
  }
  function announcePreference(message){preferenceStatus.textContent=message;preferenceStatus.hidden=false;}
  function persistPreferences(next,message){
    preferences=next;const saved=writeIndicatorPreferences(preferences,storageProvider);
    announcePreference(saved?message:'브라우저에 저장할 수 없어 이번 탭에서만 유지됩니다.');dialogKey='';return saved;
  }
  function paintTemplateRows(){
    const focused=doc.activeElement?.closest?.('[data-template-name]')?.dataset.templateName,action=doc.activeElement?.dataset.templateAction;
    templateRows.replaceChildren();
    for(const template of preferences.templates){
      const row=doc.createElement('div');row.className='indicator-template-row';row.dataset.templateName=template.name;
      const apply=doc.createElement('button');apply.type='button';apply.className='indicator-template-apply';apply.dataset.templateAction='apply';
      const name=doc.createElement('strong');name.textContent=template.name;
      const detail=doc.createElement('small');const visible=template.state.added.length-template.state.hidden.length;
      detail.textContent=`${template.state.added.length}개 · ${visible}개 표시 · 이름·값 ${template.state.collapsed?'접힘':'펼침'}${template.state.minimized.length?` · 분석 창 ${template.state.minimized.length}개 접힘`:''}`;
      apply.append(name,detail);apply.setAttribute('aria-label',`${template.name} 지표 조합 적용`);
      apply.onclick=()=>{command('replace',null,{state:template.state});announcePreference(`“${template.name}” 지표 조합을 적용했습니다.`);};
      const remove=makeButton(`${template.name} 템플릿 삭제`,'close',()=>{persistPreferences(deleteIndicatorTemplate(preferences,template.name),`“${template.name}” 템플릿을 삭제했습니다.`);paintTemplateRows();templateSave.textContent=hasIndicatorTemplate(preferences,templateName.value)?'덮어쓰기':'저장';templateName.focus();});remove.className='indicator-library-eye';remove.dataset.templateAction='remove';row.append(apply,remove);templateRows.append(row);
    }
    if(!preferences.templates.length){const empty=doc.createElement('p');empty.className='indicator-empty';empty.textContent='저장한 조합 없음';templateRows.append(empty);}
    if(view==='templates')resultCount.textContent=`저장한 조합 ${preferences.templates.length}개 / 8개`;
    if(focused){const row=[...templateRows.children].find(node=>node.dataset.templateName===focused);(row?.querySelector(`[data-template-action="${action}"]`)||templateName).focus({preventScroll:true});}
  }
  function applyDisplay(){
    for(const [id,selector] of [['readout','#lab-metrics'],['source','.workbench-market-info'],['legend','.lab-chart-foot']]){
      const node=plot.querySelector(selector);if(node)node.hidden=!isIndicatorVisible(state,id);
    }
    updateOverlayOffsets();
  }
  function updateOverlayOffsets(){
    // Actual wrapped text height is measured by ResizeObserver, never by a
    // pointer handler. Position changes cannot resize these absolute overlays.
    const sourceTop=7+(isIndicatorVisible(state,'readout')?(overlaySizes.get(readoutNode)??36)+4:0);
    const indicatorTop=sourceTop+(isIndicatorVisible(state,'source')?(overlaySizes.get(sourceNode)??20)+6:0);
    for(const [property,value] of [['--source-top',sourceTop],['--indicator-top',indicatorTop]])if(plot.style.getPropertyValue(property)!==`${value}px`)plot.style.setProperty(property,`${value}px`);
  }
  function paintValueRows(rows,details,{chart=false}={}){
    for(const {item,row,value,name} of rows.values()){
      if(!details.has(item.id))details.set(item.id,indicatorReadout(item,readoutContext));
      const detail=details.get(item.id),text=chart&&item.id==='volume'?detail.value.replace(/^Vol\s+/u,''):detail.value;
      if(value.textContent!==text)value.textContent=text;
      if(value.dataset.tone!==detail.tone)value.dataset.tone=detail.tone;
      const title=`${item.label} · ${text} · ${detail.title}`+(!indicatorSupportsInterval(state,item.id,readoutContext.workbench.frequency)?' · 현재 가격 간격에서 그래프 자동 숨김 · 지표 설정에서 변경 가능':'');
      if(name.title!==title)name.title=title;
      if(item.analysis)name.setAttribute('aria-label',`${item.label} · ${text} · 분석 창으로 이동`);
      if(row.dataset.value!==detail.value)row.dataset.value=detail.value;
      value.hidden=!indicatorSettings(state,item.id).values;
    }
  }
  function paintReadouts(){
    if(readoutFrame)cancelAnimationFrame(readoutFrame);readoutFrame=0;if(manager.hidden&&!dialog.open)return;
    const date=indicatorReadoutDate(readoutContext.selection);if(readoutDate.textContent!==date)readoutDate.textContent=date;
    const details=new Map();
    if(!manager.hidden)paintValueRows(readoutRows,details,{chart:true});
    if(dialog.open)paintValueRows(dialogReadoutRows,details);
  }
  // Hover only touches existing value nodes, at most once per animation frame.
  // Folded rows update too, so expanding never reveals a stale selected date.
  function scheduleReadouts(){if((!manager.hidden||dialog.open)&&!readoutFrame)readoutFrame=requestAnimationFrame(paintReadouts);}
  function paintList(){
    const focusedNode=doc.activeElement,focusedRow=focusedNode?.closest?.('[data-indicator-row]'),focused=focusedRow?.dataset.indicatorRow,action=focusedNode?.dataset.indicatorAction;
    const previousRows=[...list.children],focusedIndex=previousRows.indexOf(focusedRow),focusedInManager=manager.contains(focusedNode);
    const items=chartIndicatorItems(state);
    applyDisplay();manager.dataset.collapsed=String(state.collapsed);manager.hidden=!items.length;list.hidden=state.collapsed;readoutDate.hidden=state.collapsed;
    fold.hidden=!items.length;fold.setAttribute('aria-expanded',String(!state.collapsed));fold.innerHTML=glyph(state.collapsed?'expand':'collapse');fold.title=`지표 이름·값 ${state.collapsed?'펼치기':'접기'} · ${items.length}개`;fold.setAttribute('aria-label',fold.title);
    const mobile=mobileLayout();
    fold.disabled=mobile;listVisible.disabled=mobile;
    if(mobile){fold.title='모바일에서는 지표 이름·값 항상 접힘 · 인디케이터 메뉴에서 관리';fold.setAttribute('aria-label',fold.title);}
    listVisible.checked=!state.collapsed;
    const hasVisible=items.some(item=>isIndicatorVisible(state,item.id));all.textContent=hasVisible?'지표 일괄 숨김':'지표 일괄 표시';all.disabled=!items.length;all.title=`가격·OHLC, 출처, 범례를 유지하고 지표를 ${hasVisible?'모두 숨기기':'모두 표시'}`;all.setAttribute('aria-label',all.title);
    const key=JSON.stringify([state.added,state.hidden,state.collapsed,state.settings,intraday,readoutContext.workbench.frequency]);if(key===listKey){scheduleReadouts();return;}listKey=key;
    list.replaceChildren();readoutRows.clear();
    for(const item of items){
      const visible=isIndicatorVisible(state,item.id),unavailable=intraday&&item.dailyOnly||!indicatorSupportsInterval(state,item.id,readoutContext.workbench.frequency),row=doc.createElement('div');row.className='indicator-row';row.dataset.indicatorRow=item.id;row.dataset.visible=String(visible);row.dataset.unavailable=String(Boolean(unavailable));
      row.setAttribute('role','listitem');
      const name=doc.createElement(item.analysis?'button':'div');name.className='indicator-name';
      const label=doc.createElement('span');label.className='indicator-label';label.textContent=LEGEND_LABELS[item.id]||item.label;label.title=item.label;
      const value=doc.createElement('strong');value.className='indicator-value';value.textContent='자료 대기';name.append(label,value);
      if(item.analysis){name.type='button';name.dataset.indicatorAction='inspect';name.title=`${item.label} 분석 창으로 이동`;name.onclick=()=>{if(!visible)command('visibility',item.id);if(state.minimized.includes(item.id))command('minimize',item.id);if(state.maximized&&state.maximized!==item.id)command('maximize',item.id);command('activate',item.id);const window=doc.getElementById(`analysis-window-${item.id}`);window?.scrollIntoView({block:'nearest',inline:'nearest'});window?.querySelector('svg')?.focus({preventScroll:true});};}
      if(unavailable)name.title=`${item.description} · 현재 가격 간격에서는 그래프가 표시되지 않습니다. 지표 설정에서 지원 간격을 확인하세요.`;
      const settings=makeButton(`${item.label} 설정`,'settings',()=>settingsDialog.open(item.id,settings));settings.className='indicator-row-action';settings.dataset.indicatorAction='settings';
      const eye=makeButton(`${item.label} ${visible?'숨기기':'표시'}`,visible?'eye':'hidden',()=>command('visibility',item.id));eye.className='indicator-row-action';eye.dataset.indicatorAction='visibility';eye.setAttribute('aria-pressed',String(visible));
      const remove=makeButton(`${item.label} 삭제`,'close',()=>command('remove',item.id));remove.className='indicator-row-action';remove.dataset.indicatorAction='remove';
      row.append(name);if(INDICATOR_SETTINGS[item.id])row.append(settings);row.append(eye,remove);list.append(row);readoutRows.set(item.id,{item,row,value,name});
    }
    if(focusedInManager){
      const shown=state.collapsed?[]:[...list.children],same=shown.find(row=>row.dataset.indicatorRow===focused),nearby=shown[Math.min(Math.max(focusedIndex,0),shown.length-1)];
      const fallback=dialog.open?search:doc.querySelector('#atlas-mode-menu')||(opener?.isConnected?opener:null);
      const rowTarget=same||nearby;
      const target=manager.hidden?fallback:state.collapsed||focusedNode===fold?fold:rowTarget?.querySelector(`[data-indicator-action="${action||'visibility'}"]`)||rowTarget?.querySelector('[data-indicator-action]')||(!fold.hidden?fold:fallback);
      target?.focus({preventScroll:true});
    }
    paintReadouts();
  }
  function paintDialog(){
    const libraryView=view==='favorites'||view==='added'?view:'all';
    const items=view==='shared'?[]:indicatorLibraryItems({query:search.value,category:view==='all'?category:'전체',view:libraryView,state,preferences});
    if(!items.some(item=>item.id===selectedIndicator))selectedIndicator=items[0]?.id??null;
    const key=JSON.stringify([state.added,state.hidden,state.primary,state.settings,preferences.favorites,category,view,search.value,intraday,selectedIndicator]);if(key===dialogKey)return;dialogKey=key;
    for(const b of views.children)b.setAttribute('aria-pressed',String(b.dataset.indicatorView===view));
    featured.hidden=true;sharedEmpty.hidden=view!=='shared';results.hidden=view==='shared';templatePanel.hidden=view!=='added';search.hidden=false;
    featuredStrip.replaceChildren();
    if(view==='added')paintTemplateRows();
    const focused=doc.activeElement?.closest?.('[data-library-indicator]')?.dataset.libraryIndicator,action=doc.activeElement?.dataset.libraryAction;results.replaceChildren();dialogReadoutRows.clear();
    for(const item of items){
      const added=state.added.includes(item.id),visible=isIndicatorVisible(state,item.id),wrapper=doc.createElement('div');wrapper.className='indicator-library-row';wrapper.dataset.libraryIndicator=item.id;wrapper.dataset.added=String(added);wrapper.dataset.visible=String(visible);wrapper.dataset.selected=String(item.id===selectedIndicator);
      const favorite=preferences.favorites.includes(item.id),star=makeButton(`${item.label} 즐겨찾기 ${favorite?'해제':'추가'}`,'star',()=>{const next=toggleIndicatorFavorite(preferences,item.id);persistPreferences(next,`${item.label} 즐겨찾기를 ${next.favorites.includes(item.id)?'추가했습니다':'해제했습니다'}.`);paintDialog();});star.className='indicator-library-favorite';star.dataset.libraryAction='favorite';star.setAttribute('aria-pressed',String(favorite));wrapper.append(star);
      const row=doc.createElement('button');row.type='button';row.className='indicator-library-item';row.dataset.indicatorId=item.id;row.dataset.libraryAction='select';row.setAttribute('aria-pressed',String(item.id===selectedIndicator));row.setAttribute('aria-label',`${item.label} 설명 보기`);
      const text=doc.createElement('span'),name=doc.createElement('strong');name.textContent=item.label;text.append(name);
      if(intraday&&item.dailyOnly){const detailLine=doc.createElement('small');detailLine.textContent='1D·1W';text.append(detailLine);}
      row.append(text);row.onclick=()=>{selectedIndicator=item.id;dialogKey='';paintDialog();};wrapper.append(row);
      const membership=doc.createElement('button');membership.type='button';membership.className='indicator-browser-row-add';membership.dataset.libraryAction='membership';membership.textContent=added?'빼기':'추가';membership.setAttribute('aria-pressed',String(added));membership.setAttribute('aria-label',`${item.label} · ${added?'차트에서 빼기':'차트에 추가'}`);membership.onclick=()=>command('toggle',item.id);wrapper.append(membership);
      if(added){
        const value=doc.createElement('small');value.className='indicator-library-value indicator-value';value.id=`indicator-library-value-${item.id}`;value.textContent='자료 대기';text.append(value);row.setAttribute('aria-describedby',value.id);
        const eye=makeButton(`${item.label} ${visible?'숨기기':'표시'}`,visible?'eye':'hidden',()=>command('visibility',item.id));eye.className='indicator-library-eye';eye.dataset.libraryAction='visibility';eye.setAttribute('aria-pressed',String(visible));eye.setAttribute('aria-describedby',value.id);wrapper.append(eye);
        if(INDICATOR_SETTINGS[item.id]){const settings=makeButton(`${item.label} 설정`,'settings',()=>settingsDialog.open(item.id,settings));settings.className='indicator-library-eye';settings.dataset.libraryAction='settings';wrapper.append(settings);}
        dialogReadoutRows.set(item.id,{item,row:wrapper,value,name:row});
      }
      results.append(wrapper);
    }
    resultCount.hidden=view==='shared'||(view==='all'&&!search.value.trim());resultCount.textContent=view==='added'?`내 지표 ${items.length}개`:`${items.length}개`;
    if(view!=='shared'&&!items.length){const empty=doc.createElement('p');empty.className='indicator-empty';empty.textContent=search.value.trim()?'검색 결과 없음':view==='favorites'?'즐겨찾기 없음':view==='added'?'추가한 지표 없음':'지표 없음';results.append(empty);}
    const selected=INDICATORS.find(item=>item.id===selectedIndicator);
    detail.hidden=!selected;if(selected){
      const added=state.added.includes(selected.id),visible=isIndicatorVisible(state,selected.id),favorite=preferences.favorites.includes(selected.id);
      detailPreview.replaceChildren();detailTitle.textContent=selected.label;detailDesc.textContent=selected.description;
      detailAdd.textContent=added?'차트에서 빼기':'+ 차트에 추가';detailAdd.setAttribute('aria-pressed',String(added));detailAdd.onclick=()=>command('toggle',selected.id);
      detailStar.setAttribute('aria-label',`${selected.label} 즐겨찾기 ${favorite?'해제':'추가'}`);detailStar.setAttribute('aria-pressed',String(favorite));detailStar.onclick=()=>{const next=toggleIndicatorFavorite(preferences,selected.id);persistPreferences(next,`${selected.label} 즐겨찾기를 ${next.favorites.includes(selected.id)?'추가했습니다':'해제했습니다'}.`);paintDialog();};
      detailFacts.replaceChildren();
      for(const [term,value] of [['분류',selected.category],['표시 위치',selected.analysis?'분석 창':selected.category==='표시'?'차트 위 읽기':'가격 차트'],['이 차트',added?(visible?'켜짐':'숨김'):'없음']]){
        const row=doc.createElement('div'),termNode=doc.createElement('dt'),valueNode=doc.createElement('dd');termNode.textContent=term;valueNode.textContent=value;row.append(termNode,valueNode);detailFacts.append(row);
      }
      detailRelated.replaceChildren();const relatedTitle=doc.createElement('strong');relatedTitle.textContent='같은 분류';detailRelated.append(relatedTitle);
      for(const item of INDICATORS.filter(item=>item.category===selected.category&&item.id!==selected.id).slice(0,4)){
        const link=doc.createElement('button');link.type='button';link.textContent=item.label;link.onclick=()=>{selectedIndicator=item.id;dialogKey='';paintDialog();};detailRelated.append(link);
      }
    }
    if(focused)(results.querySelector(`[data-library-indicator="${focused}"] [data-library-action="${action}"]`)||results.querySelector(`[data-indicator-id="${focused}"]`)||search).focus({preventScroll:true});
    paintReadouts();
  }
  search.addEventListener('input',paintDialog);
  dialog.addEventListener('close',()=>{
    if(dialog.open)return;doc.querySelector('#atlas-mode-menu')?.setAttribute('aria-expanded','false');
    // Native close events can be queued after another modal takes focus.
    if(doc.querySelector('dialog[open]'))return;
    const visible=node=>node?.isConnected&&node.getClientRects().length;
    const mobile=doc.getElementById('mobile-details-toggle'),trigger=doc.getElementById('atlas-mode-menu');
    const target=visible(opener)?opener:visible(mobile)?mobile:visible(trigger)?trigger:plot.querySelector('svg:not([hidden])');
    target?.focus({preventScroll:true});
  });
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  dialog.addEventListener('keydown',event=>{
    event.stopPropagation();if(event.key!=='Tab')return;
    const focusable=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(node=>!node.closest('[hidden]')&&node.tabIndex!==-1);
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first?.focus();}
  });
  const onOpen=event=>open(event.detail?.opener);
  const onPlace=()=>{if(dialog.open)placeIndicator();};
  const onPointerDown=event=>{
    if(!dialog.open||dialog.contains(event.target)||event.target.closest?.('.atlas-trade-indicators,#atlas-mode-menu'))return;
    dialog.close();
  };
  doc.defaultView?.addEventListener('resize',onPlace);
  doc.addEventListener('pointerdown',onPointerDown,true);
  const onState=event=>{state=normalizeIndicatorState(event.detail.indicators||state);cycle=event.detail.cycleCalibration||cycle;readoutContext.cycle=cycle;paintList();if(dialog.open)paintDialog();settingsDialog.update();};
  const onWorkbench=event=>{
    intraday=Boolean(event.detail.intraday);readoutContext.workbench=event.detail;paintList();
    // A completed chart and its indicator values must share the same selection.
    // Ordinary pointer updates remain coalesced by onReadout below.
    paintReadouts();
    if(dialog.open)paintDialog();
  };
  const onReadout=event=>{readoutContext.selection=event.detail;scheduleReadouts();};
  const onAnalysis=event=>{const detail=event.detail;if(!detail?.mode)return;readoutContext.analyses.set(detail.mode,{...readoutContext.analyses.get(detail.mode),...detail});scheduleReadouts();};
  const onPreferences=event=>{if(event.key!==INDICATOR_PREFERENCES_KEY&&event.key!==null)return;preferences=readIndicatorPreferences(storageProvider);dialogKey='';if(dialog.open)paintDialog();templateSave.textContent=hasIndicatorTemplate(preferences,templateName.value)?'덮어쓰기':'저장';};
  doc.defaultView?.addEventListener('storage',onPreferences);
  doc.addEventListener('atlas:indicator-library',onOpen);doc.addEventListener('atlas:indicator-state',onState);doc.addEventListener('atlas:workbench-state',onWorkbench);doc.addEventListener('atlas:readout',onReadout);doc.addEventListener('atlas:analysis-state',onAnalysis);paintList();
  for(const name of ['wheel','pointerdown','dblclick','contextmenu'])manager.addEventListener(name,event=>event.stopPropagation(),name==='wheel'?{passive:true}:undefined);
  return {open,destroy(){doc.removeEventListener('atlas:indicator-library',onOpen);doc.removeEventListener('atlas:indicator-state',onState);doc.removeEventListener('atlas:workbench-state',onWorkbench);doc.removeEventListener('atlas:readout',onReadout);doc.removeEventListener('atlas:analysis-state',onAnalysis);doc.removeEventListener('pointerdown',onPointerDown,true);doc.defaultView?.removeEventListener('resize',onPlace);doc.defaultView?.removeEventListener('storage',onPreferences);if(readoutFrame)cancelAnimationFrame(readoutFrame);if(hudLayoutFrame)cancelAnimationFrame(hudLayoutFrame);overlayResize.disconnect();settingsDialog.destroy();dialogViewport.destroy();dialog.remove();manager.remove();}};
}
