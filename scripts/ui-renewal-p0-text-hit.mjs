// P0 text-only paint proof. No style, DOM, scrolling or input mutations.
// This collector is serialized into the inspected document: keep it standalone.
export function inspectP0TextInk(selector) {
  const result={selector,text:'',rect:null,glyphs:[],overlappingPaintCandidates:[],intersections:[],unmeasuredPseudos:[],issues:[]};
  const issue=message=>{if(!result.issues.includes(message))result.issues.push(message);};
  const rect=value=>({left:value.left,top:value.top,right:value.right,bottom:value.bottom,width:value.width,height:value.height});
  const positive=value=>value&&['left','top','right','bottom','width','height'].every(key=>Number.isFinite(value[key]))&&value.right>value.left&&value.bottom>value.top;
  const intersection=(a,b)=>{const left=Math.max(a.left,b.left),top=Math.max(a.top,b.top),right=Math.min(a.right,b.right),bottom=Math.min(a.bottom,b.bottom);return right>left&&bottom>top?{left,top,right,bottom,width:right-left,height:bottom-top}:null;};
  const value=(style,name,fallback='')=>String(style?.[name]??fallback);
  const alpha=colour=>{
    const text=String(colour||'').trim().toLowerCase();if(text==='transparent'||text==='none')return 0;
    const match=/^(rgba?|hsla?|color)\((.*)\)$/.exec(text);
    if(match){const parts=match[2].split('/'),comma=match[2].split(','),last=parts.length===2?parts[1]:comma.length===4?comma[3]:null;if(last==null)return 1;const number=Number.parseFloat(last);return Number.isFinite(number)?last.includes('%')?number/100:number:null;}
    if(/^#[\da-f]{3,8}$/i.test(text))return text.length===5?Number.parseInt(text[4]+text[4],16)/255:text.length===9?Number.parseInt(text.slice(-2),16)/255:1;
    return null;
  };
  const path=node=>{
    if(node.id)return '#'+CSS.escape(node.id);
    const parts=[];for(let current=node;current;current=current.parentElement){if(current.id){parts.unshift('#'+CSS.escape(current.id));break;}parts.unshift(current.tagName.toLowerCase()+`:nth-child(${[...current.parentElement?.children||[]].indexOf(current)+1})`);}return parts.join(' > ');
  };
  const styles=new Map(),style=node=>{if(!styles.has(node))styles.set(node,getComputedStyle(node));return styles.get(node);};
  const chain=node=>{const nodes=[];for(let current=node;current;current=current.parentElement)nodes.push(current);return nodes;};
  // Visibility may be restored by a descendant. Display, opacity and hidden
  // content still suppress its complete subtree.
  const hidden=node=>['hidden','collapse'].includes(style(node).visibility)||chain(node).some(current=>{const s=style(current);return current.hasAttribute?.('hidden')||s.display==='none'||Number(s.opacity)===0||s.contentVisibility==='hidden';});
  const effects=(node,s)=>{
    for(const [name,normal]of [['transform','none'],['translate','none'],['rotate','none'],['scale','none'],['perspective','none'],['filter','none'],['backdropFilter','none'],['mixBlendMode','normal'],['clipPath','none'],['maskImage','none']])if(value(s,name,normal)!==normal)issue(`${path(node)}: unsupported ${name}`);
    if(value(s,'clip','auto')!=='auto')issue(`${path(node)}: unsupported clip`);
  };
  let target;
  try{const nodes=[...document.querySelectorAll(selector)];if(nodes.length!==1){issue('text selector must identify exactly one element');return result;}target=nodes[0];}
  catch(error){issue(`text selector failed: ${error.message}`);return result;}
  result.text=target.textContent||'';result.rect=rect(target.getBoundingClientRect());
  result.viewport={width:innerWidth,height:innerHeight};
  if(!result.text.trim()){issue('text is empty or whitespace-only');return result;}
  if(!positive(result.rect)||!target.getClientRects().length){issue('text element has no positive rectangle');return result;}
  if(target.isConnected===false||hidden(target)){issue('text element is hidden or detached');return result;}
  if(typeof Intl==='undefined'||typeof Intl.Segmenter!=='function'){issue('grapheme segmentation is unavailable');return result;}
  const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'}),textNodes=[];
  const walk=node=>{for(const child of node.childNodes||[]){if(child.nodeType===3)textNodes.push(child);else if(child.nodeType===1)walk(child);}};walk(target);
  for(const textNode of textNodes){
    const sourceText=textNode.nodeValue??textNode.textContent??'',owner=textNode.parentElement;
    if(!sourceText.trim())continue;
    if(!owner||hidden(owner)){issue('a non-whitespace text node has no visible owner');continue;}
    const ownStyle=style(owner),foreground=ownStyle.webkitTextFillColor||ownStyle.color,inkAlpha=alpha(foreground);
    if(inkAlpha!==1)issue(`${path(owner)}: transparent or unsupported text ink`);
    if(value(ownStyle,'textShadow','none')!=='none'||value(ownStyle,'backgroundClip')==='text')issue(`${path(owner)}: unsupported text paint`);
    const ancestry=chain(owner);
    for(const node of ancestry){const s=style(node);effects(node,s);if(Number(s.opacity??1)!==1)issue(`${path(node)}: unsupported text group opacity`);}
    for(const part of segmenter.segment(sourceText)){
      if(!part.segment.trim())continue;
      if(result.glyphs.length>=256){issue('text exceeds the 256 glyph evidence bound');break;}
      const range=document.createRange(),startOffset=part.index,endOffset=part.index+part.segment.length;range.setStart(textNode,startOffset);range.setEnd(textNode,endOffset);
      const boxes=[...range.getClientRects()].map(rect);
      if(!boxes.length||boxes.some(box=>!positive(box))){issue('a non-whitespace grapheme has no positive Range rectangle');continue;}
      for(const box of boxes){
        const glyph={text:part.segment,ownerSelector:path(owner),ownerTag:owner.tagName,textNodeIndex:[...owner.childNodes].indexOf(textNode),sourceText,startOffset,endOffset,rect:box};
        if(box.left<0||box.top<0||box.right>innerWidth||box.bottom>innerHeight)issue('text ink is clipped by the viewport');
        for(const ancestor of ancestry){
          const s=style(ancestor),a=rect(ancestor.getBoundingClientRect());
          const left=a.left+(ancestor.clientLeft||0),top=a.top+(ancestor.clientTop||0),right=left+(ancestor.clientWidth??a.width),bottom=top+(ancestor.clientHeight??a.height);
          if(/^(auto|scroll|hidden|clip)$/.test(s.overflowX)&& (box.left<left||box.right>right)||/^(auto|scroll|hidden|clip)$/.test(s.overflowY)&&(box.top<top||box.bottom>bottom))issue(`${path(ancestor)}: text ink is clipped by overflow`);
        }
        result.glyphs.push(glyph);
      }
    }
  }
  if(!result.glyphs.length){issue('no visible non-whitespace text ink was collected');return result;}
  const add=(node,kind,box,extra={})=>{
    if(!positive(box))return;
    const overlaps=result.glyphs.flatMap((glyph,glyphIndex)=>{const hit=intersection(glyph.rect,box);return hit?[{glyphIndex,rect:hit,area:hit.width*hit.height}]:[];});if(!overlaps.length)return;
    if(result.intersections.length+overlaps.length>4096){issue('paint intersections exceed the 4096 evidence bound');return;}
    const relation=node===target?'self':node.contains(target)?'ancestor':target.contains(node)?'internal':'external';
    if((relation==='self'||relation==='ancestor')&&['background','border'].includes(kind))return;
    const id=`paint-${result.overlappingPaintCandidates.length}`;
    result.overlappingPaintCandidates.push({id,selector:path(node),kind,rect:box,relation,...extra});
    result.intersections.push(...overlaps.map(hit=>({...hit,candidateId:id})));
    effects(node,style(node));
  };
  const elements=[...document.querySelectorAll('*')];if(elements.length>20000){issue('document exceeds the 20000 element evidence bound');return result;}
  const svgShapes=new Set(['path','rect','circle','ellipse','line','polyline','polygon','use','image']);
  const replaced=new Set(['img','canvas','video','iframe','object','embed']);
  const shadowCandidates=(node,name,shadow,box)=>{
    if(!shadow||shadow==='none')return;
    // Computed shadows use absolute CSS lengths. This deliberately enlarged
    // envelope is only an unsupported-paint candidate, never an ink proof.
    const withoutColours=shadow.replace(/(?:rgba?|hsla?|color)\([^)]*\)/gi,'');
    for(const part of withoutColours.split(',')){
      const lengths=[...part.matchAll(/[-+]?(?:\d+(?:\.\d*)?|\.\d+)px\b/g)].map(match=>Number.parseFloat(match[0]));
      if(lengths.length<2||lengths.length>4||lengths.some(number=>!Number.isFinite(number))){issue(`${path(node)}: unsupported ${name} bounds`);continue;}
      const [x,y,blur=0,spread=0]=lengths,pad=Math.abs(spread)+3*Math.abs(blur),inset=/\binset\b/.test(part);
      const r=inset?box:{left:box.left+x-pad,top:box.top+y-pad,right:box.right+x+pad,bottom:box.bottom+y+pad,width:box.width+2*pad,height:box.height+2*pad};
      add(node,name,r,{unsupported:true});
    }
  };
  for(const node of elements){
    if(hidden(node))continue;
    const s=style(node),box=rect(node.getBoundingClientRect());
    const bg=alpha(s.backgroundColor);
    if(bg!==0&&s.backgroundColor)add(node,'background',box,{unsupported:bg===null});
    if(value(s,'backgroundImage','none')!=='none')add(node,'background',box,{unsupported:true});
    for(const [side,coordinates]of [['Top',{bottom:box.top+Number.parseFloat(s.borderTopWidth)}],['Bottom',{top:box.bottom-Number.parseFloat(s.borderBottomWidth)}],['Left',{right:box.left+Number.parseFloat(s.borderLeftWidth)}],['Right',{left:box.right-Number.parseFloat(s.borderRightWidth)}]]){
      const size=Number.parseFloat(s[`border${side}Width`]),colour=alpha(s[`border${side}Color`]),borderStyle=s[`border${side}Style`];
      if(size>0&&colour!==0&&borderStyle!=='none'&&borderStyle!=='hidden'){const r={...box,...coordinates};r.width=r.right-r.left;r.height=r.bottom-r.top;add(node,'border',r,{unsupported:colour===null});}
    }
    const tag=node.tagName.toLowerCase();
    if(replaced.has(tag))add(node,'replaced',box);
    const outlineWidth=Number.parseFloat(s.outlineWidth),outlineOffset=Number.parseFloat(s.outlineOffset)||0;
    if(outlineWidth>0&&!['none','hidden'].includes(s.outlineStyle)&&alpha(s.outlineColor)!==0){const pad=Math.max(0,outlineWidth+outlineOffset);add(node,'outline',{left:box.left-pad,top:box.top-pad,right:box.right+pad,bottom:box.bottom+pad,width:box.width+2*pad,height:box.height+2*pad},{unsupported:true});}
    shadowCandidates(node,'box-shadow',value(s,'boxShadow','none'),box);
    if([...node.childNodes||[]].some(child=>child.nodeType===3&&String(child.nodeValue??child.textContent??'').trim()))shadowCandidates(node,'text-shadow',value(s,'textShadow','none'),box);
    if(node.namespaceURI==='http://www.w3.org/2000/svg'&&svgShapes.has(tag)){
      const fill=alpha(s.fill),stroke=alpha(s.stroke),width=Number.parseFloat(s.strokeWidth)||0;
      if(fill!==0&&Number(s.fillOpacity??1)>0||stroke!==0&&width>0&&Number(s.strokeOpacity??1)>0){
        let pad=stroke!==0?width/2:0;const matrix=node.getScreenCTM?.();if(matrix&&s.vectorEffect!=='non-scaling-stroke')pad*=Math.max(Math.hypot(matrix.a,matrix.c),Math.hypot(matrix.b,matrix.d));
        const r={left:box.left-pad,top:box.top-pad,right:box.right+pad,bottom:box.bottom+pad,width:box.width+2*pad,height:box.height+2*pad};add(node,'svg',r,{unsupported:fill===null||stroke===null});
      }
    }
    for(const textNode of node.childNodes||[]){
      if(textNode.nodeType!==3||!String(textNode.nodeValue??textNode.textContent??'').trim()||textNodes.includes(textNode))continue;
      if(alpha(s.webkitTextFillColor||s.color)===0)continue;
      const range=document.createRange();range.selectNodeContents(textNode);for(const r of range.getClientRects())add(node,'text',rect(r));
    }
    for(const pseudo of ['::before','::after']){
      const ps=getComputedStyle(node,pseudo);if(!ps||['none','normal',''].includes(value(ps,'content'))||ps.display==='none'||ps.visibility==='hidden'||Number(ps.opacity)===0)continue;
      const content=value(ps,'content').replace(/^(['"])([\s\S]*)\1$/,'$2'),textPaint=Boolean(content.trim()&&Number.parseFloat(ps.fontSize)!==0&&alpha(ps.webkitTextFillColor||ps.color)!==0);
      const background=Boolean(ps.backgroundColor&&alpha(ps.backgroundColor)!==0)||value(ps,'backgroundImage','none')!=='none';
      const border=['Top','Right','Bottom','Left'].some(side=>Number.parseFloat(ps[`border${side}Width`])>0&&!['none','hidden'].includes(ps[`border${side}Style`])&&alpha(ps[`border${side}Color`])!==0);
      const unsupportedEffects=['filter','backdropFilter','boxShadow','textShadow'].filter(name=>value(ps,name,'none')!=='none');
      if(!textPaint&&!background&&!border&&!unsupportedEffects.length)continue;
      if(result.unmeasuredPseudos.length>=256){issue('pseudo paint exceeds the 256 evidence bound');continue;}
      const relation=node===target?'self':node.contains(target)?'ancestor':target.contains(node)?'internal':'external';
      // A pseudo can extend outside its owner's box. The native wrapper must
      // obtain its own backend-node quad before deciding whether it intersects.
      result.unmeasuredPseudos.push({selector:path(node),pseudo,relation,unsupportedEffects});
    }
  }
  for(const candidate of result.overlappingPaintCandidates)if(candidate.unsupported)issue(`${candidate.selector}: unsupported ${candidate.kind} paint`);
  return result;
}

/** Native integer hit probes ignore pointer-events without modifying the page.
 * Only the actual text element or its exact TextNode backend ID may pass. */
export async function verifyP0TextInk(cdp,selector) {
  const evidence={status:'unverified',reason:null,geometry:null,owners:[],probes:[],issues:[]};
  const unresolved=reason=>{evidence.status='unverified';evidence.reason=reason;return evidence;};
  try{
    const response=await cdp.send('Runtime.evaluate',{expression:`(${inspectP0TextInk.toString()})(${JSON.stringify(selector)})`,returnByValue:true,awaitPromise:true});
    if(response.exceptionDetails)return unresolved('text ink collection raised a browser exception');
    const geometry=response.result?.value;evidence.geometry=geometry;
    if(!geometry||geometry.selector!==selector||!geometry.text?.trim()||!geometry.rect||!Array.isArray(geometry.glyphs)||!geometry.glyphs.length)return unresolved('native text geometry is missing');
    if(!Array.isArray(geometry.issues)||!Array.isArray(geometry.intersections)||!Array.isArray(geometry.overlappingPaintCandidates))return unresolved('native text paint inventory is missing');
    if(geometry.issues.length){evidence.issues.push(...geometry.issues);return unresolved(geometry.issues.join('; '));}
    const documentNode=await cdp.send('DOM.getDocument',{depth:0}),rootId=documentNode.root?.nodeId;if(!rootId)return unresolved('CDP document node is missing');
    const owners=new Map(),allowed=[];
    const resolveOwner=async ownerSelector=>{
      if(owners.has(ownerSelector))return owners.get(ownerSelector);
      const selected=await cdp.send('DOM.querySelector',{nodeId:rootId,selector:ownerSelector});if(!selected.nodeId)throw new Error('the actual paint owner is missing');
      const described=await cdp.send('DOM.describeNode',{nodeId:selected.nodeId,depth:1}),node=described.node;
      if(node?.nodeType!==1||!Number.isInteger(node.backendNodeId)||node.backendNodeId<=0)throw new Error('the actual paint owner backend evidence is missing');
      owners.set(ownerSelector,node);evidence.owners.push({selector:ownerSelector,backendNodeId:node.backendNodeId});return node;
    };
    for(const glyph of geometry.glyphs){
      const owner=await resolveOwner(glyph.ownerSelector),text=owner.children?.[glyph.textNodeIndex];
      if(text?.nodeType!==3||!Number.isInteger(text.backendNodeId)||text.backendNodeId<=0||text.nodeValue!==glyph.sourceText||text.nodeValue.slice(glyph.startOffset,glyph.endOffset)!==glyph.text)return unresolved('the exact source TextNode or grapheme changed before probing');
      allowed.push(new Set([owner.backendNodeId,text.backendNodeId]));
    }
    if(!Array.isArray(geometry.unmeasuredPseudos))return unresolved('native pseudo paint inventory is missing');
    for(const pending of geometry.unmeasuredPseudos){
      const owner=await resolveOwner(pending.selector),pseudo=owner.pseudoElements?.find(node=>node.pseudoType===pending.pseudo.slice(2));
      if(!Number.isInteger(pseudo?.backendNodeId)||pseudo.backendNodeId<=0)return unresolved('native pseudo paint backend evidence is missing');
      const measured=await cdp.send('DOM.getBoxModel',{backendNodeId:pseudo.backendNodeId}),quad=measured.model?.border;
      if(!Array.isArray(quad)||quad.length!==8||!quad.every(Number.isFinite))return unresolved('native pseudo paint quad is missing');
      const left=Math.min(quad[0],quad[2],quad[4],quad[6]),right=Math.max(quad[0],quad[2],quad[4],quad[6]),top=Math.min(quad[1],quad[3],quad[5],quad[7]),bottom=Math.max(quad[1],quad[3],quad[5],quad[7]);
      const rect={left,top,right,bottom,width:right-left,height:bottom-top};
      if(!(rect.width>0&&rect.height>0))return unresolved('native pseudo paint has no positive quad');
      pending.nativeQuad=quad;pending.nativeRect=rect;pending.backendNodeId=pseudo.backendNodeId;
      if(pending.unsupportedEffects?.length)evidence.issues.push('pseudo effect can paint outside its native box');
      const overlaps=geometry.glyphs.flatMap((glyph,glyphIndex)=>{const a=glyph.rect,l=Math.max(a.left,left),r=Math.min(a.right,right),t=Math.max(a.top,top),b=Math.min(a.bottom,bottom);return r>l&&b>t?[{glyphIndex,rect:{left:l,top:t,right:r,bottom:b,width:r-l,height:b-t},area:(r-l)*(b-t)}]:[];});
      if(!overlaps.length)continue;
      const id=`paint-${geometry.overlappingPaintCandidates.length}`;
      geometry.overlappingPaintCandidates.push({id,selector:pending.selector,kind:'pseudo',rect,relation:pending.relation,pseudo:pending.pseudo,backendNodeId:pseudo.backendNodeId,nativeQuad:quad});
      geometry.intersections.push(...overlaps.map(hit=>({...hit,candidateId:id})));
    }
    const plan=[],integerBounds=rect=>{
      if(!rect||!['left','top','right','bottom'].every(key=>Number.isFinite(rect[key])))return null;
      const left=Math.floor(rect.left)+1,right=Math.ceil(rect.right)-1,top=Math.floor(rect.top)+1,bottom=Math.ceil(rect.bottom)-1;return right>=left&&bottom>=top?{left,right,top,bottom}:null;
    };
    const add=(glyphIndex,rect,candidateId=null)=>{
      const bounds=integerBounds(rect);if(!bounds){evidence.issues.push(candidateId?'positive paint intersection has no interior integer probe':'grapheme has no interior integer probe');return;}
      if(candidateId){
        if(plan.length+(bounds.right-bounds.left+1)*(bounds.bottom-bounds.top+1)>4096){evidence.issues.push('native text probes exceed the 4096 evidence bound');return;}
        for(let y=bounds.top;y<=bounds.bottom;y++)for(let x=bounds.left;x<=bounds.right;x++)plan.push({glyphIndex,candidateId,x,y});
      }else{
        const x=Math.min(bounds.right,Math.max(bounds.left,Math.round((rect.left+rect.right)/2))),y=Math.min(bounds.bottom,Math.max(bounds.top,Math.round((rect.top+rect.bottom)/2)));
        for(const [xx,yy]of new Map([[x,y],[bounds.left,bounds.top],[bounds.right,bounds.top],[bounds.left,bounds.bottom],[bounds.right,bounds.bottom]].map(point=>[point.join(','),point])).values())plan.push({glyphIndex,candidateId:null,x:xx,y:yy});
      }
    };
    geometry.glyphs.forEach((glyph,index)=>add(index,glyph.rect));
    for(const hit of geometry.intersections){if(!geometry.glyphs[hit.glyphIndex]||!geometry.overlappingPaintCandidates.some(item=>item.id===hit.candidateId)||!(hit.area>0)){evidence.issues.push('paint intersection evidence is inconsistent');continue;}add(hit.glyphIndex,hit.rect,hit.candidateId);}
    if(plan.length>4096)return unresolved('native text probes exceed the 4096 evidence bound');
    for(const point of plan){
      const hit=await cdp.send('DOM.getNodeForLocation',{x:point.x,y:point.y,ignorePointerEventsNone:true,includeUserAgentShadowDOM:true});
      let backendNodeId=hit.backendNodeId;if(!backendNodeId&&hit.nodeId)backendNodeId=(await cdp.send('DOM.describeNode',{nodeId:hit.nodeId,depth:0})).node?.backendNodeId;
      const probe={...point,backendNodeId:backendNodeId??null,allowedBackendNodeIds:[...allowed[point.glyphIndex]],accepted:Boolean(backendNodeId&&allowed[point.glyphIndex].has(backendNodeId))};evidence.probes.push(probe);
      if(!Number.isInteger(backendNodeId)||backendNodeId<=0)return unresolved('native text hit backend evidence is missing');
      if(!probe.accepted){evidence.status='failed';evidence.reason='native glyph paint is owned by an element other than its exact text owner or TextNode';return evidence;}
      if(point.candidateId){const candidate=geometry.overlappingPaintCandidates.find(item=>item.id===point.candidateId);if(candidate.kind==='pseudo'||candidate.relation==='internal'&&candidate.kind!=='text')evidence.issues.push('pseudo or internal non-text paint cannot be distinguished from its text owner');}
    }
    if(evidence.issues.length)return unresolved([...new Set(evidence.issues)].join('; '));
    if(!evidence.probes.length)return unresolved('no native text hit probes were collected');
    evidence.status='passed';evidence.reason='every grapheme and positive paint intersection is owned by its exact native text owner or TextNode';return evidence;
  }catch(error){return unresolved(`native text hit verification failed: ${error.message}`);}
}
