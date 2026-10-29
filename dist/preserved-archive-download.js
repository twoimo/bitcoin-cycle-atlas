const ARCHIVES=Object.freeze({
  ETHUSD:Object.freeze({id:'embedded-eth-data',file:'eth-ohlc.json'}),
  MSTR:Object.freeze({id:'embedded-mstr-data',file:'mstr-ohlc.json'}),
  BMNR:Object.freeze({id:'embedded-bmnr-data',file:'bmnr-ohlc.json'}),
});

/** Standalone downloads retain the embedded source text, not a parsed/updated series. */
export function bindPreservedArchiveDownload(root,symbol){
  if(!Object.hasOwn(ARCHIVES,symbol))throw new RangeError('Unsupported preserved archive');
  const archive=ARCHIVES[symbol],doc=root?.ownerDocument;
  const text=doc?.getElementById?.(archive.id)?.textContent;
  const link=root?.querySelector?.('a[href="./data/'+archive.file+'"]');
  if(!link||typeof text!=='string'||!text.trim())return null;
  const button=doc.createElement('button');button.type='button';button.className='subtle-button';
  button.dataset.preservedArchive=symbol;
  button.textContent='내장 일별 원자료(JSON) 저장';
  button.onclick=()=>{
    const view=doc.defaultView||globalThis;
    const url=view.URL.createObjectURL(new view.Blob([text],{type:'application/json;charset=utf-8'}));
    const target=doc.createElement('a');target.href=url;target.download=archive.file;
    doc.body.append(target);
    try{target.click();}
    finally{target.remove();view.setTimeout(()=>view.URL.revokeObjectURL(url),30000);}
  };
  link.replaceWith(button);
  return button;
}
