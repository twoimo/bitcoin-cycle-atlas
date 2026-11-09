import {priceLegendMarkup} from '../price-legend.js?v=1.31.3';
import {mountChartLegend,writeChartLegendMarkup} from './chart-legend.js?v=1.36.1';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const entry=(label,title,className='price-legend-item')=>`<span class="${className}" title="${esc(title||label)}">${esc(label)}</span>`;

/** Keep native instrument labels owned by their source renderer. The shared
 * disclosure copies only currently offered series and their original meaning. */
export function nativeChartLegendMarkup({symbol,chartType,series,source}={}){
  if(!series)return '';
  const noteVisible=source&&!source.hidden;
  const future=noteVisible?[...source.children].filter((node,index)=>!node.hidden&&!node.matches('.eth-observed-key,#equity-vintage')&&!(symbol!=='ETHUSD'&&index===0)&&node.textContent.trim()):[];
  const vintage=noteVisible?source.querySelector('#equity-vintage'):null;
  const clock=[series.lastDate,series.retrievedAt&&`수집 ${series.retrievedAt}`].filter(Boolean).join(' · ');
  const sourceLabel=`${series.source||symbol} · ${symbol==='ETHUSD'?'UTC':'뉴욕 세션'}`;
  return priceLegendMarkup({candles:chartType==='candles',source:series.source||symbol,compact:true})+
    future.map(node=>entry(node.textContent.trim(),node.title||source.title||node.textContent.trim())).join('')+
    entry(sourceLabel,[sourceLabel,clock].filter(Boolean).join(' · '),'native-legend-basis')+
    (vintage?.textContent.trim()?entry(vintage.textContent.trim(),vintage.title,'native-legend-basis'):'');
}

export function mountNativeChartLegend({plot,symbol,state,getSeries}={}){
  const doc=plot.ownerDocument,original=plot.querySelector('#eth-forecast-note,.equity-legend');
  const foot=doc.createElement('div'),source=doc.createElement('div');
  foot.className='lab-chart-foot';source.id='atlas-chart-legend';source.className='lab-legend';foot.append(source);plot.append(foot);
  original?.classList.add('native-chart-legend-source');original?.setAttribute('aria-hidden','true');
  const controller=mountChartLegend({plot,groups:[
    {id:'price',label:'가격 계열',shortLabel:'가격',selector:'.price-legend-item'},
    {id:'basis',label:'출처·해석',shortLabel:'근거',selector:'.native-legend-basis'},
  ]});
  return {
    update(){const series=getSeries();foot.hidden=!series;writeChartLegendMarkup(source,nativeChartLegendMarkup({symbol,chartType:state.chartType,series,source:original}));controller.refresh();},
    destroy(){controller.destroy();foot.remove();original?.classList.remove('native-chart-legend-source');original?.removeAttribute('aria-hidden');},
  };
}
