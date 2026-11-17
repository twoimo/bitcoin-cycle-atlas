import {INDICATORS} from './indicator-state.js?v=1.29.0';
import {INDICATOR_SETTINGS,INDICATOR_SETTING_INTERVALS,indicatorSettings} from './indicator-settings.js?v=1.29.0';

/** An editor of only settings that the shipped graph actually consumes. */
export function mountIndicatorSettingsDialog({doc,getState,command}){
  const dialog=doc.createElement('dialog');dialog.id='indicator-settings';dialog.className='indicator-settings-dialog';dialog.setAttribute('aria-labelledby','indicator-settings-title');dialog.setAttribute('aria-describedby','indicator-settings-description');
  const header=doc.createElement('header'),title=doc.createElement('h2');title.id='indicator-settings-title';
  const close=doc.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','지표 설정 닫기');close.onclick=()=>dialog.close();header.append(title,close);
  const description=doc.createElement('p');description.id='indicator-settings-description';
  const tabs=doc.createElement('div');tabs.className='indicator-settings-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','지표 설정 구분');
  const tabOrder=['inputs','style','visibility'];
  const tabButtons={};
  for(const [tabId,label] of [['inputs','입력'],['style','스타일'],['visibility','표시']]){
    const button=doc.createElement('button');button.type='button';button.className='indicator-settings-tab';button.id=`indicator-settings-tab-${tabId}`;button.setAttribute('role','tab');button.setAttribute('aria-controls',`indicator-settings-panel-${tabId}`);button.dataset.settingsTab=tabId;button.textContent=label;button.onclick=()=>showTab(tabId);tabButtons[tabId]=button;tabs.append(button);
  }
  const content=doc.createElement('div');content.className='indicator-settings-content';
  const status=doc.createElement('p');status.className='indicator-settings-status';status.setAttribute('role','status');
  const footer=doc.createElement('footer'),reset=doc.createElement('button'),done=doc.createElement('button');reset.type=done.type='button';reset.className='indicator-settings-reset';done.className='indicator-settings-done';reset.textContent='이 지표 기본값';done.textContent='완료';done.onclick=()=>dialog.close();footer.append(reset,done);
  dialog.append(header,description,tabs,content,status,footer);doc.body.append(dialog);
  let id=null,opener=null,origin=null,fields=[];
  function showTab(name){
    for(const button of Object.values(tabButtons)){const on=button.dataset.settingsTab===name;button.setAttribute('aria-selected',on?'true':'false');button.tabIndex=on?0:-1;}
    for(const panel of content.querySelectorAll('[data-settings-panel]'))panel.hidden=panel.dataset.settingsPanel!==name;
  }
  const fieldset=(parent,label)=>{const set=doc.createElement('fieldset'),legend=doc.createElement('legend');legend.textContent=label;set.append(legend);parent.append(set);return set;};
  const change=patch=>command('settings',id,{patch});
  function checkbox(parent,key,text){
    const label=doc.createElement('label'),input=doc.createElement('input');input.type='checkbox';input.dataset.setting=key;input.onchange=()=>change({[key]:input.checked});const span=doc.createElement('span');span.textContent=text;label.append(input,span);parent.append(label);fields.push({key,input,set:value=>{input.checked=value;}});
  }
  function panel(name){
    const node=doc.createElement('div');node.className='indicator-settings-panel';node.id=`indicator-settings-panel-${name}`;node.dataset.settingsPanel=name;node.setAttribute('role','tabpanel');node.setAttribute('aria-labelledby',`indicator-settings-tab-${name}`);content.append(node);return node;
  }
  function build(){
    const definition=INDICATOR_SETTINGS[id],item=INDICATORS.find(item=>item.id===id);content.replaceChildren();fields=[];
    title.textContent=`${item.label} 설정`;description.textContent=item.description;
    const inputsPanel=panel('inputs'),stylePanel=panel('style'),visibilityPanel=panel('visibility');
    if(definition.inputs){
      const set=fieldset(inputsPanel,'입력');
      for(const [key,inputDefinition] of Object.entries(definition.inputs)){
        const label=doc.createElement('label');label.className='indicator-setting-select';const span=doc.createElement('span');span.textContent=inputDefinition.label;label.append(span);
        const input=doc.createElement('select');input.dataset.setting=`inputs.${key}`;input.setAttribute('aria-label',inputDefinition.label);
        for(const [value,text] of inputDefinition.options){const option=doc.createElement('option');option.value=value;option.textContent=text;input.append(option);}
        input.onchange=()=>change({inputs:{[key]:input.value}});label.append(input);set.append(label);fields.push({key:`inputs.${key}`,input,set:value=>{input.value=value;}});
      }
    }else{
      const empty=doc.createElement('p');empty.textContent='이 지표에는 계산에 넣는 입력 항목이 없습니다.';inputsPanel.append(empty);
    }
    const display=fieldset(stylePanel,'값과 눈금');checkbox(display,'values','지표 이름 옆에 선택한 값 표시');
    if(definition.axisLabels)checkbox(display,'axisLabels','이 지표의 축 숫자 표시');
    const valueNote=doc.createElement('p');valueNote.textContent='값을 꺼도 그래프와 계산은 유지됩니다. 가격·날짜, 자료 출처와 관측·가정 구분은 바꾸지 않습니다.';display.append(valueNote);
    const styles=[['opacity','그래프 불투명도',.15,1,.05],['lineWidth','선 굵기 배율',.5,3,.25],['fillOpacity','채움 불투명도 배율',0,1,.05]].filter(([key])=>definition[key]);
    if(styles.length){
      const set=fieldset(stylePanel,'스타일');
      for(const [key,labelText,min,max,step] of styles){
        const rowLabel=key==='lineWidth'&&id==='volume'?'가정 거래량선 굵기':key==='lineWidth'&&['turns','cycle-landmarks'].includes(id)?'원 테두리 굵기 배율':labelText;
        const label=doc.createElement('label');label.className='indicator-setting-range';const text=doc.createElement('span');text.textContent=rowLabel;
        const input=doc.createElement('input');input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.dataset.setting=key;input.setAttribute('aria-label',rowLabel);
        const output=doc.createElement('output');const format=value=>key==='lineWidth'?`${Number(value)}×`:`${Math.round(Number(value)*100)}%`;
        input.oninput=()=>{output.textContent=format(input.value);input.setAttribute('aria-valuetext',output.textContent);};input.onchange=()=>change({[key]:Number(input.value)});
        label.append(text,input,output);set.append(label);fields.push({key,input,set:value=>{input.value=String(value);output.textContent=format(value);input.setAttribute('aria-valuetext',output.textContent);}});
      }
      const styleNote=doc.createElement('p');styleNote.textContent=`원래 색상과 관측 실선·잠정/가정 점선은 유지합니다. 배율 100% / 1×가 원래 표현입니다.${id==='volume'?' 선 굵기는 1D·1W의 미래 가정 거래량선에 적용됩니다.':''}`;set.append(styleNote);
    }
    const intervals=fieldset(visibilityPanel,'표시할 가격 간격');intervals.className='indicator-setting-intervals';
    for(const interval of INDICATOR_SETTING_INTERVALS.filter(item=>definition.intervals.includes(item.id))){
      const label=doc.createElement('label'),input=doc.createElement('input');input.type='checkbox';input.dataset.setting=`interval.${interval.id}`;
      input.onchange=()=>{const current=indicatorSettings(getState(),id).intervals;change({intervals:input.checked?[...current,interval.id]:current.filter(value=>value!==interval.id)});};
      const span=doc.createElement('span');span.textContent=interval.label;label.append(input,span);intervals.append(label);fields.push({key:`interval.${interval.id}`,input,set:value=>{input.checked=value;}});
    }
    const intervalNote=doc.createElement('p');intervalNote.textContent='선택하지 않은 간격에서는 그래프만 자동으로 숨깁니다. 지표 추가 상태, 눈 아이콘과 값 표시 설정은 유지됩니다.';intervals.append(intervalNote);
    showTab(definition.inputs?'inputs':'style');
  }
  function update(){
    if(!id||!dialog.open)return;const state=getState();
    if(!state.added.includes(id)){dialog.close();return;}
    const settings=indicatorSettings(state,id);
    for(const field of fields){const [group,key]=field.key.split('.');field.set(group==='inputs'?settings.inputs[key]:group==='interval'?settings.intervals.includes(key):settings[field.key]);}
    status.textContent=settings.intervals.length?'변경 내용은 즉시 반영됩니다. 작업공간·공유 링크·지표 템플릿을 저장할 때 함께 포함됩니다.':'표시할 간격이 없습니다. 간격을 선택하면 해당 그래프가 다시 나타납니다.';
  }
  function open(nextId,trigger){
    if(!INDICATOR_SETTINGS[nextId]||!getState().added.includes(nextId))return false;
    id=nextId;opener=trigger||doc.activeElement;origin=opener?.closest?.('[data-library-indicator]')?'library':opener?.closest?.('[data-indicator-row]')?'row':'analysis';build();
    doc.dispatchEvent(new CustomEvent('atlas:modal-open',{detail:{id:dialog.id}}));
    if(!dialog.open)dialog.showModal();update();(fields.find(field=>!field.input.closest('[hidden]'))?.input||done).focus();return true;
  }
  reset.onclick=()=>command('settings-reset',id);
  dialog.addEventListener('close',()=>{
    if(dialog.open)return;const visible=node=>node?.isConnected&&node.getClientRects().length;
    const selector=origin==='library'?`[data-library-indicator="${id}"] [data-library-action="settings"]`:origin==='row'?`[data-indicator-row="${id}"] [data-indicator-action="settings"]`:`#analysis-window-${id} [data-analysis-action="settings"]`;
    const replacement=doc.querySelector(selector),other=doc.querySelector('dialog[open]');
    const target=visible(opener)?opener:visible(replacement)?replacement:other?.id==='indicator-library'?doc.getElementById('indicator-search'):doc.getElementById('atlas-mode-menu');
    if(other&&!other.contains(target))return;target?.focus({preventScroll:true});
  });
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();});
  dialog.addEventListener('keydown',event=>{
    event.stopPropagation();if(event.key==='Escape'){event.preventDefault();dialog.close();return;}
    if((event.key==='ArrowRight'||event.key==='ArrowLeft')&&doc.activeElement?.getAttribute('role')==='tab'){
      event.preventDefault();const current=tabOrder.indexOf(doc.activeElement.dataset.settingsTab);const step=event.key==='ArrowRight'?1:-1;const next=tabOrder[(current+step+tabOrder.length)%tabOrder.length];showTab(next);tabButtons[next].focus();return;
    }
    if(event.key!=='Tab')return;
    const controls=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(node=>!node.closest('[hidden]')),first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first?.focus();}
  });
  const requested=event=>open(event.detail?.id,event.detail?.opener);doc.addEventListener('atlas:indicator-settings-open',requested);
  return {open,update,element:dialog,destroy(){doc.removeEventListener('atlas:indicator-settings-open',requested);dialog.remove();}};
}
