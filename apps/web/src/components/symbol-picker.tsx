import { useEffect, useRef } from 'react';
import { mountSymbolSelector } from '../../../../dist/symbol-selector.js';

export function SymbolPicker({symbol,onSelect}:{symbol:string;onSelect:(symbol:string)=>void}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const picker = mountSymbolSelector({button:button.current,symbol,onSelect:(value:string,url:string) => {
      if (['TQQQ','SOXL','233740'].includes(value)) onSelect(value);
      else globalThis.location.assign(url);
    }});
    return () => picker.destroy();
  },[symbol,onSelect]);
  return <button ref={button} type="button" aria-label={`종목 선택 · ${symbol}`}>{symbol}</button>;
}
