import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateHousing,type MonthlyPoint,type HousingSnapshot } from '@atlas/domain/housing';

// Network-free importer: only exact, receipt-hashed official responses enter the snapshot.
const root=new URL('../docs/real-estate/raw/',import.meta.url);
const receipts=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const ids=['A_2024_00554','A_2024_00178'];
const raw:Record<string,{CATE1:string;[key:string]:string}[]>={};
for(const id of ids){
  const bytes=await readFile(new URL(`${id}.json`,root)),receipt=receipts.find((r:{tableId:string})=>r.tableId===id);
  if(!receipt||createHash('sha256').update(bytes).digest('hex')!==receipt.sha256)throw new Error('Official response hash mismatch');
  raw[id]=JSON.parse(bytes.toString()).DATA;
}
const definition=JSON.parse(await readFile(new URL('A_2024_00178-meta.json',root),'utf8')).data.DATA;
function points(row:Record<string,string>):MonthlyPoint[]{
  return Object.entries(row).filter(([k])=>/^COL_\d{6}100001OD$/.test(k)).flatMap(([k,v])=>{
    if(v==='-'||v==='')return [];
    if(!/^[\d,.]+$/.test(v))throw new Error(`Unknown observation ${v}`);
    return [[`${k.slice(4,8)}-${k.slice(8,10)}`,Number(v.replaceAll(',',''))] as MonthlyPoint];
  }).sort(([a],[b])=>a.localeCompare(b));
}
const snapshot:HousingSnapshot={schemaVersion:1,generatedAt:new Date(Math.max(...receipts.map((r:{retrievedAt:string})=>Date.parse(r.retrievedAt)))+1).toISOString(),volumeBasis:'report-month',priceBasis:'contract-month',indexBase:definition.rpstuiNm,
  sources:ids.map((id,i)=>{const r=receipts.find((r:{tableId:string})=>r.tableId===id);return {id,title:i?'아파트 매매 실거래가격지수':'아파트 매매거래현황',url:`https://www.reb.or.kr/r-one/portal/stat/easyStatPage/${id}.do`,sha256:r.sha256,retrievedAt:r.retrievedAt,unit:i?definition.rpstuiNm:'건',clockBasis:i?'계약월 · 비계절조정':'신고월 · 비계절조정'};}),
  regions:[['busan','부산','26000000'],['seoul','서울','11000000'],['gyeonggi','경기','41000000'],['national','전국','1000010']].map(([id,label,code])=>{
    const find=(table:string)=>{const rows=raw[table].filter(r=>r.CATE1===label);if(rows.length!==1)throw new Error(`Ambiguous region ${label}`);return points(rows[0]);};
    return {id,label,code,volume:find(ids[0]),price:find(ids[1])};
  })};
validateHousing(snapshot);
await mkdir(new URL('../dist/data/',import.meta.url),{recursive:true});
const body=JSON.stringify(snapshot);
await writeFile(new URL('../dist/data/housing.json',import.meta.url),body+'\n');
console.log(JSON.stringify({revision:createHash('sha256').update(body).digest('hex'),regions:snapshot.regions.map(r=>({id:r.id,volume:r.volume.length,price:r.price.length,latestVolume:r.volume.at(-1),latestPrice:r.price.at(-1)}))}));
