import assert from 'node:assert/strict';
// Parsed SVG fixture: real painter code runs, but native layout/pointer APIs do not.
export class SvgNode {
  constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.attrs=new Map();this.children=[];this.dataset={};this.value='';}
  setAttribute(key,value){this.attrs.set(key,String(value));if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,l)=>l.toUpperCase())]=String(value);}
  getAttribute(key){return this.attrs.get(key)??null;}
  removeAttribute(key){this.attrs.delete(key);}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  set textContent(value){this.value=String(value);this.children=[];}
  get textContent(){return this.value+this.children.map(child=>child.textContent).join('');}
  set innerHTML(markup){this.children=[];const stack=[this];for(const token of markup.match(/<[^>]+>|[^<]+/g)??[]){if(token.startsWith('</')){assert.equal(stack.pop().tagName,token.slice(2,-1));continue;}if(token.startsWith('<')){const node=new SvgNode(token.match(/^<([\w:-]+)/)[1],this.ownerDocument);for(const [,key,value]of token.matchAll(/([\w:-]+)="([^"]*)"/g))node.setAttribute(key,value);stack.at(-1).append(node);if(!token.endsWith('/>'))stack.push(node);}else{const node=new SvgNode('#text',this.ownerDocument);node.value=token;stack.at(-1).append(node);}}assert.equal(stack.length,1);}
  get innerHTML(){return this.children.map(node=>node.tagName==='#text'?node.value:`<${node.tagName}${[...node.attrs].map(([key,value])=>` ${key}="${value}"`).join('')}>${node.value}${node.innerHTML}</${node.tagName}>`).join('');}
  matches(selector){const tag=selector.match(/^[a-zA-Z][\w-]*/)?.[0],cls=selector.match(/\.([\w-]+)/)?.[1],attr=selector.match(/\[([\w-]+)(?:(\$?=)"([^"]*)")?\]/);if(tag&&tag!==this.tagName)return false;if(cls&&!(this.getAttribute('class')??'').split(' ').includes(cls))return false;if(attr){const value=this.getAttribute(attr[1]);if(value===null||attr[2]==='$='&&!value.endsWith(attr[3])||attr[2]==='='&&value!==attr[3])return false;}return Boolean(tag||cls||attr);}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(selector.split(',').some(v=>child.matches(v.trim()))?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  closest(selector){return this.matches(selector)?this:this.parentElement?.closest?.(selector)??null;}
  focus(){}
}
export function svgFixture(width=1440,height=760){const queue=new Map();let id=0;const doc={createElementNS:(_,tag)=>new SvgNode(tag,doc),defaultView:{requestAnimationFrame(fn){queue.set(++id,fn);return id;},cancelAnimationFrame(i){queue.delete(i);}}};const svg=new SvgNode('svg',doc);Object.assign(svg,{id:'lab-chart',clientWidth:width,clientHeight:height,parentElement:{style:{setProperty(){}}},getBoundingClientRect:()=>({left:0,top:0,width,height})});return {svg,flush(){const all=[...queue.values()];queue.clear();all.forEach(fn=>fn());}};}
