import {useLayoutEffect,useRef} from 'react';
import {enhanceSkeleton,skeletonMarkup} from '../../../../dist/loading-surfaces.js';
export type LoadingKind='chart'|'rsi'|'diagnosis'|'scenario'|'cashflow'|'table'|'list'|'detail';
export function LoadingSkeleton({kind='chart',label='자료 로딩'}:{kind?:LoadingKind;label?:string}){
  const host=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>enhanceSkeleton(host.current?.firstElementChild),[kind,label]);
  return <div className="ml-loading-skeleton" ref={host} dangerouslySetInnerHTML={{__html:skeletonMarkup(kind,label)}}/>;
}
