import { createHash } from 'node:crypto';

const listingLabel = '지분증권 등 상장을 위한 공모여부';
const listingValues = ['코스닥시장 신규상장', '유가증권시장 신규상장', '코넥스시장 신규상장'];
const norm = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, '');
const digest = value => createHash('sha256').update(value).digest('hex');
const entity = value => String(value ?? '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, dec) => {
  const number = parseInt(hex || dec, hex ? 16 : 10);
  return number <= 0x10ffff && number >= 0 ? String.fromCodePoint(number) : '';
});
const text = html => entity(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const attribute = (source, name) => entity(source.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] ?? '');

// Match complete innermost tables only. A nested outer table, comment, script,
// or paragraph cannot supply another table's field value. Unknown layouts stay
// unclassified instead of falling back to a nearby keyword.
export function flatTables(input) {
  const html = String(input ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const stack = [], result = [];
  for (const match of html.matchAll(/<\/?table\b[^>]*>/gi)) {
    if (!/^<\//.test(match[0])) {
      if (stack.length) stack.at(-1).nested = true;
      stack.push({start:match.index, nested:false});
    } else if (stack.length) {
      const item = stack.pop();
      if (item.nested) continue;
      const raw = html.slice(item.start, match.index + match[0].length);
      const rows = [...raw.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => [...row[1].matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map(cell => {
        const colspan = Number(attribute(cell[2], 'colspan') || 1);
        return {text:text(cell[3]), colspan:Number.isInteger(colspan) && colspan > 0 && colspan <= 32 ? colspan : 0};
      }));
      result.push({html:raw, rows});
    }
  }
  return result;
}

function listingValue(cells) {
  const value = norm(cells.map(cell => cell.text).join(' ')).replace(/^예/, '');
  return listingValues.find(item => norm(item) === value) ?? null;
}

export function findListingTable(html) {
  const observed = [];
  for (const table of flatTables(html)) for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex++) {
    const row = table.rows[rowIndex], index = row.findIndex(cell=>norm(cell.text) === norm(listingLabel));
    if (index < 0) continue;
    const proof = {found:true,value:null,fragment:row.map(cell=>cell.text).join(' '),tableSha256:digest(table.html)};
    const inline = row.slice(index+1), inlineValue = listingValue(inline);
    if (inline.length) {
      observed.push({...proof,value:inlineValue,fragment:[listingLabel,...inline.map(cell=>cell.text)].join(' ')});
      continue;
    }
    const next = table.rows[rowIndex+1];
    if (!next?.length || row.some(cell=>!cell.colspan) || next.some(cell=>!cell.colspan)) { observed.push(proof); continue; }
    const start = row.slice(0,index).reduce((sum,cell)=>sum+cell.colspan,0), span = row[index].colspan;
    const slots = next.flatMap(cell=>Array.from({length:cell.colspan},()=>cell));
    const headerSlots = row.reduce((sum,cell)=>sum+cell.colspan,0);
    if (row.length !== 1 && slots.length !== headerSlots) { observed.push(proof); continue; }
    const selected = row.length === 1 ? next : [...new Set(slots.slice(start,start+span))];
    observed.push({...proof,value:listingValue(selected),fragment:[listingLabel,...selected.map(cell=>cell.text)].join(' ')});
  }
  if (!observed.length) return {found:false,value:null,fragment:null};
  const values = new Set(observed.map(item=>item.value));
  if (values.size > 1) return {...observed[0],value:null,ambiguous:true,evidence:observed};
  return observed[0];
}

export function findOfferFields(html) {
  const found = [];
  for (const table of flatTables(html)) for (let index = 0; index + 1 < table.rows.length; index++) {
    const headers = table.rows[index], values = table.rows[index+1];
    if (headers.length !== values.length || headers.some(cell => cell.colspan !== 1) || values.some(cell => cell.colspan !== 1)) continue;
    const names = headers.map(cell => norm(cell.text));
    if (names.includes('청약기일') && names.includes('납입기일')) found.push({kind:'dates', subscriptionText:values[names.indexOf('청약기일')].text, paymentText:values[names.indexOf('납입기일')].text, tableSha256:digest(table.html)});
    if (names.includes('모집(매출)가액') && names.includes('증권수량')) found.push({kind:'price', priceText:values[names.indexOf('모집(매출)가액')].text, methodText:names.includes('모집(매출)방법') ? values[names.indexOf('모집(매출)방법')].text : null, tableSha256:digest(table.html)});
  }
  const dates = found.filter(item => item.kind === 'dates');
  const prices = found.filter(item => item.kind === 'price');
  const unique = rows => [...new Map(rows.map(row => [JSON.stringify(Object.fromEntries(Object.entries(row).filter(([key])=>key!=='tableSha256'))),row])).values()];
  const dateValues = unique(dates), priceValues = unique(prices);
  return {dates:dateValues.length === 1 ? dateValues[0] : null, price:priceValues.length === 1 ? priceValues[0] : null, ambiguousDates:dateValues.length > 1, ambiguousPrice:priceValues.length > 1, ambiguous:dateValues.length > 1 || priceValues.length > 1};
}

// Only the two real public controls observed on DART are lineage evidence.
// The attachment or combined mobile selector is not a company-name join.
export function documentLinks(html) {
  const links = [];
  for (const select of String(html ?? '').matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const id = attribute(select[1], 'id');
    if (!['family','ref'].includes(id)) continue;
    for (const option of select[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
      const value = attribute(option[1], 'value');
      const rcpNo = /^rcpNo=(\d{14})$/.exec(value)?.[1];
      if (!rcpNo) continue;
      const label = text(option[2]);
      links.push({control:id, rcpNo, label, title:attribute(option[1],'title'), receiptDate:/^\d{4}\.\d{2}\.\d{2}/.exec(label)?.[0].replaceAll('.','-') ?? null});
    }
  }
  return links;
}
