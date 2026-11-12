import test from 'node:test';
import assert from 'node:assert/strict';
import {parseP1Arguments,p1Widths,p1Destinations,p1Cases,p1FinalStatus,validateP1Target,validateP1Layout,inspectP1Snapshot,isP1RouteReady,planP1NativeReveal,activateP1Navigation} from '../scripts/verify-ui-renewal-p1-browser.mjs';

const clone = value => structuredClone(value);
const box = (left,top,width,height) => ({left,top,right:left+width,bottom:top+height,width,height});
const native = () => ({box:box(4,4,100,44),clip:box(4,4,100,44),painted:true,disabled:false,topmost:true,inside:true,outline:'solid',outlineWidth:2});
function layout(spec=p1Cases.find(s=>s.caseId==='evidence-1440')) {
  const gutter=spec.width>=768?24:12,width=Math.min(spec.limit||spec.width,spec.width-gutter*2),left=(spec.width-width)/2;
  return {page:spec.hosted?'outlook':spec.page,center:spec.hosted?spec.id:null,shell:spec.limit?'dashboard':'chart',overflow:0,
    headings:{count:1,paintedCount:1,title:spec.title,rect:box(20,12,100,20),describedBy:'atlas-page-description',description:'Source basis',inHeader:Boolean(spec.limit),duplicateTitles:[],glyphs:[box(20,12,100,20)],nativeTextHit:{status:'passed'}},
    navOwners:1,nav:p1Destinations.map(d=>({id:d.id,active:d.id===spec.id?'page':null,painted:true,rect:box(0,0,100,44),radii:['999px','999px','999px','999px']})),
    container:{painted:true,maxWidth:`${spec.limit}px`,rect:box(left,112,width,700)},
    workspace:{rect:box(0,112,spec.width,740),paddingLeft:`${gutter}px`,paddingRight:`${gutter}px`,borderLeftWidth:'0px',borderRightWidth:'0px'},
    section:{painted:true,radii:['16px','16px','16px','16px'],background:'rgb(255, 255, 255)'},
    child:spec.hosted?{overflow:0}:null};
}
function completeReport() {
  return {sourceStable:true,failures:[],layouts:p1Cases.map(s=>({...s,status:'passed'})),journeys:p1Widths.flatMap(width=>['pointer','keyboard'].map(mode=>({id:`${mode}-${width}`,status:'passed',chartReturn:{destination:'relay',status:'passed'},steps:p1Destinations.map(d=>({destination:d.id,status:'passed'}))})))};
}
function routeReadiness(id='relay',{hosted=false}={}) {
  const page=id==='market-us'?'market':id,content=()=>({painted:true,populated:true,busy:false,loading:false});
  return {boot:'ready',readyState:'complete',page:hosted?'outlook':page,center:hosted?id:null,activeNavigation:[id],section:content(),frameCount:hosted?1:0,
    frame:hosted?{painted:true,status:'ready',loaded:id==='market-us',epoch:1,busy:false,child:{readyState:'complete',boot:id==='market-us'?null:'ready',page,workspace:id==='market-us'?'market':null,workspacePainted:id==='market-us',loadingKind:null,section:content(),panel:content()}}:null};
}
function snapshotCdp(state,{text=state.headings.title,rect=state.headings.rect,issues=[],hit=2}={}) {
  const calls=[];
  const geometry={selector:'#atlas-page-heading',text,rect,issues,intersections:[],overlappingPaintCandidates:[],unmeasuredPseudos:[],
    glyphs:[{text,rect,ownerSelector:'#atlas-page-heading',textNodeIndex:0,sourceText:text,startOffset:0,endOffset:text.length}]};
  let evaluations=0;
  return {calls,async send(method,params) {
    calls.push({method,params});
    if(method==='Runtime.evaluate')return {result:{value:clone(evaluations++===0?state:geometry)}};
    if(method==='DOM.getDocument')return {root:{nodeId:1}};
    if(method==='DOM.querySelector')return {nodeId:2};
    if(method==='DOM.describeNode')return {node:{nodeType:1,backendNodeId:2,children:[{nodeType:3,backendNodeId:3,nodeValue:text}]}};
    if(method==='DOM.getNodeForLocation')return {backendNodeId:hit};
    throw new Error(`Unexpected CDP method: ${method}`);
  }};
}

test('P1 requires a new output path and rejects incomplete/unknown switches',()=>{
  assert.throws(()=>parseP1Arguments([]),/NEW_DIRECTORY/);
  for(const args of [['--out'],['--out','--browser'],['--allow-overflow','1'],['--source-only']])assert.throws(()=>parseP1Arguments(args));
  assert.equal(parseP1Arguments(['--out','receipt'],'/tmp/p1').out,'/tmp/p1/receipt');
  assert.equal(parseP1Arguments(['--help']).help,true);
});
test('P1 matrix contains all seven destinations at exactly four requested widths',()=>{
  assert.deepEqual(p1Widths,[320,390,768,1440]);
  assert.deepEqual(p1Destinations.map(s=>s.id),['outlook','market-us','evidence','data','ipo','relay','conference']);
  assert.equal(p1Cases.length,28);assert.equal(new Set(p1Cases.map(s=>s.caseId)).size,28);
  for(const spec of p1Cases)assert.deepEqual(validateP1Layout(layout(spec),spec),[]);
});
test('native reach rejects covered, clipped, disabled and undersized controls',()=>{
  assert.deepEqual(validateP1Target(native()),[]);
  for(const patch of [{painted:false},{disabled:true},{topmost:false},{box:box(4,4,43.99,44)},{clip:box(4.02,4,99.98,44)}])assert.ok(validateP1Target({...native(),...patch}).length);
  assert.ok(validateP1Target(null).length);assert.ok(validateP1Target({...native(),box:{...native().box,left:NaN}}).length);
});
test('keyboard reach additionally requires real target focus and visible 2px ring',()=>{
  assert.deepEqual(validateP1Target(native(),{keyboard:true}),[]);
  for(const patch of [{inside:false},{outline:'none'},{outlineWidth:1.99}])assert.ok(validateP1Target({...native(),...patch},{keyboard:true}).length);
});
test('readiness rejects an old destination, an unpainted body and any incomplete direct route',()=>{
  assert.equal(isP1RouteReady(routeReadiness(),'relay',{direct:true}),true);
  for(const change of [s=>s.boot='loading',s=>s.readyState='interactive',s=>s.page='conference',s=>s.activeNavigation=['conference'],s=>s.activeNavigation.push('outlook'),s=>s.frameCount=1,s=>s.section.painted=false,s=>s.section.populated=false,s=>s.section.busy=true,s=>s.section.loading=true]) {
    const state=routeReadiness();change(state);assert.equal(isP1RouteReady(state,'relay',{direct:true}),false);
  }
  assert.equal(isP1RouteReady(routeReadiness('relay',{hosted:true}),'relay',{direct:true}),false);
});
test('the actual React market contract requires host acknowledgement and loaded content without a legacy boot flag',()=>{
  const good=routeReadiness('market-us',{hosted:true});
  assert.equal(good.frame.child.boot,null);assert.equal(isP1RouteReady(good,'market-us'),true);
  for(const change of [s=>s.boot='loading',s=>s.center='evidence',s=>s.page='market',s=>s.frameCount=0,s=>s.frameCount=2,s=>s.frame=null,
    s=>s.frame.loaded=false,s=>s.frame.status='loading',s=>s.frame.painted=false,s=>s.frame.busy=true,s=>s.frame.epoch=0,s=>s.frame.epoch=NaN,
    s=>s.frame.child=null,s=>s.frame.child.readyState='loading',s=>s.frame.child.page='relay',s=>s.frame.child.workspace=null,s=>s.frame.child.workspacePainted=false,
    s=>s.frame.child.section.busy=true,s=>s.frame.child.section.populated=false,s=>s.frame.child.panel.painted=false,s=>s.frame.child.panel.populated=false,
    s=>s.frame.child.panel.loading=true,s=>s.frame.child.section.loading=true,s=>s.frame.child.loadingKind='diagnosis']) {
    const state=clone(good);change(state);assert.equal(isP1RouteReady(state,'market-us'),false);
  }
});
test('a hosted legacy page must own a populated ready child rather than an arbitrary ready iframe',()=>{
  const good=routeReadiness('relay',{hosted:true});assert.equal(isP1RouteReady(good,'relay'),true);
  for(const change of [s=>s.frame.child.boot=null,s=>s.frame.child.boot='error',s=>s.frame.child.page='ipo',s=>s.frame.child.section.populated=false,s=>s.frame.child.section.loading=true,s=>s.frame.status='error']) {
    const state=clone(good);change(state);assert.equal(isP1RouteReady(state,'relay'),false);
  }
});
test('an overshooting product arrow falls back to one bounded native wheel edge movement',()=>{
  const geometry=position=>({x:100,y:22,horizontal:true,vertical:false,owner:'atlas-nav',target:box(121-position,0,113,44),clip:box(0,0,200,44),before:{left:position,top:0},maximum:{left:500,top:0},
    button:{direction:position>121?'previous':'next',selector:position>121?'previous-button':'next-button'}});
  let position=0,history={},actions=[];
  for(let i=0;i<4;i++) {
    const action=planP1NativeReveal(geometry(position),history);if(!action)break;
    actions.push(action);history=action.next;position+=action.kind==='arrow'?(action.selector==='next-button'?150:-150):action.deltaX;
  }
  assert.deepEqual(actions.map(a=>a.kind),['arrow','wheel']);
  assert.equal(actions[0].selector,'next-button');assert.equal(actions[1].overshoot,true);
  assert.equal(actions[1].deltaX,-29);assert.equal(position,121);
  const target=geometry(position).target;assert.ok(target.left>=0 && target.right<=200);
  assert.equal(history.wheelOnly,true);
  const nearEnd=geometry(490);nearEnd.target=box(210,0,113,44);nearEnd.button=null;
  assert.equal(planP1NativeReveal(nearEnd).deltaX,10);
  const nearStart=geometry(5);nearStart.target=box(-20,0,113,44);nearStart.button=null;
  assert.equal(planP1NativeReveal(nearStart).deltaX,-5);
  assert.equal(planP1NativeReveal({...nearStart,before:{left:0,top:0}}),null);
});
test('a native pointer document navigation waits through old and destroyed contexts before paint or destination evidence',async()=>{
  const destination=p1Destinations.find(d=>d.id==='evidence'),step={inputs:[],status:'unverified'},calls=[];
  let released=false,observations=0,destinationReady=false;
  const cdp={async send(method,params){
    calls.push({method,params});
    if(method==='Input.dispatchMouseEvent'){if(params.type==='mouseReleased')released=true;return {};}
    if(method!=='Runtime.evaluate')throw new Error(`Unexpected CDP method: ${method}`);
    const expression=params.expression;
    if(expression.includes('function readNativeInteractiveTarget'))return {result:{value:{...native(),x:54,y:26}}};
    if(expression.includes('function readP1RouteReadiness')){
      assert.equal(released,true);observations++;
      if(observations===1)throw new Error('Execution context was destroyed');
      if(observations===2)return {result:{value:routeReadiness('relay')}};
      destinationReady=true;return {result:{value:routeReadiness('evidence')}};
    }
    if(expression.includes('function inspectP1Page')){assert.equal(destinationReady,true);return {result:{value:layout(p1Cases.find(s=>s.caseId==='evidence-1440'))}};}
    if(expression.includes('document.visibilityState')){assert.equal(destinationReady,true,'paint readiness must follow the requested destination');return {result:{value:'visible'}};}
    if(expression.includes('document.fonts.ready')){assert.equal(destinationReady,true,'fonts must be awaited in the destination document');return {result:{value:undefined}};}
    if(expression.includes('document.body.dataset.shell'))return {result:{value:false}};
    throw new Error(`Unexpected browser evaluation: ${expression.slice(0,100)}`);
  }};
  await activateP1Navigation(cdp,destination,'pointer',step);
  assert.equal(observations,3);assert.equal(step.status,'passed');assert.equal(step.readiness.page,'evidence');
  assert.deepEqual(calls.filter(c=>c.method==='Input.dispatchMouseEvent').map(c=>c.params.type),['mousePressed','mouseReleased']);
  assert.equal(step.inputs.filter(i=>i.kind==='pointer').length,1);
});
test('one pixel of document overflow or extra/hidden h1 never passes',()=>{
  const spec=p1Cases.find(s=>s.caseId==='evidence-1440');
  for(const change of [s=>s.overflow=1,s=>s.headings.count=2,s=>s.headings.paintedCount=0,s=>s.headings.glyphs[0].right=1440.01,s=>s.headings.duplicateTitles.push('content-title')]){const s=layout(spec);change(s);assert.ok(validateP1Layout(s,spec).length);}
});
test('positive h1 geometry cannot substitute for complete native text paint evidence',()=>{
  const spec=p1Cases.find(s=>s.caseId==='evidence-1440');
  for(const proof of [undefined,{status:'failed',reason:'covered glyph'},{status:'unverified',reason:'clipped glyph'}]) {
    const state=layout(spec);state.headings.nativeTextHit=proof;
    assert.ok(validateP1Layout(state,spec).some(f=>f.includes('native text paint')));
  }
});
test('P1 snapshot retains unchanged P0 native owner probes and rejects covered or clipped heading paint',async()=>{
  const spec=p1Cases.find(s=>s.caseId==='evidence-1440');
  const cdp=snapshotCdp(layout(spec)),state=await inspectP1Snapshot(cdp,spec);
  assert.deepEqual(validateP1Layout(state,spec),[]);
  assert.equal(state.headings.nativeTextHit.status,'passed');
  assert.ok(state.headings.nativeTextHit.probes.length>0);
  assert.ok(cdp.calls.filter(call=>call.method==='DOM.getNodeForLocation').every(call=>call.params.ignorePointerEventsNone===true));
  for(const options of [{hit:4},{issues:['#heading-parent: text ink is clipped by overflow']}]) {
    const blocked=await inspectP1Snapshot(snapshotCdp(layout(spec),options),spec);
    assert.notEqual(blocked.headings.nativeTextHit.status,'passed');
    assert.ok(validateP1Layout(blocked,spec).some(f=>f.includes('native text paint')));
  }
});
test('text or position changes between shell and native ink observations cannot pass',async()=>{
  const spec=p1Cases.find(s=>s.caseId==='evidence-1440');
  for(const options of [{text:'다른 제목'},{rect:box(21,12,100,20)}]) {
    const state=await inspectP1Snapshot(snapshotCdp(layout(spec),options),spec);
    assert.equal(state.headings.nativeTextHit.status,'unverified');
    assert.match(state.headings.nativeTextHit.reason,/changed during native hit verification/);
    assert.ok(validateP1Layout(state,spec).some(f=>f.includes('native text paint')));
  }
});
test('containers must have both requested max-width and actual centered geometry',()=>{
  const spec=p1Cases.find(s=>s.caseId==='evidence-1440');
  for(const change of [s=>s.container.maxWidth='1280px',s=>s.container.rect.width=1000,s=>s.container.rect.left+=1,s=>s.headings.inHeader=false,s=>s.section.radii[0]='0px',s=>s.section.background='transparent']){const s=layout(spec);change(s);assert.ok(validateP1Layout(s,spec).length);}
});
test('nonfinite, missing or invalid container boxes and workspace insets never pass',()=>{
  const spec=p1Cases.find(s=>s.caseId==='evidence-1440');
  for(const owner of ['container','workspace'])for(const key of ['left','right','top','bottom','width','height'])for(const value of [NaN,Infinity,undefined,null]) {
    const state=layout(spec);state[owner].rect[key]=value;
    assert.ok(validateP1Layout(state,spec).length,`${owner}.${key}: ${value}`);
  }
  for(const key of ['paddingLeft','paddingRight','borderLeftWidth','borderRightWidth'])for(const value of ['NaNpx','Infinity',undefined,'auto','-1px']) {
    const state=layout(spec);state.workspace[key]=value;
    assert.ok(validateP1Layout(state,spec).length,`${key}: ${value}`);
  }
  for(const change of [s=>s.container.rect.height=0,s=>s.workspace.rect.height=-1,s=>s.workspace.rect.right+=1,s=>s.workspace.paddingLeft='2000px']) {
    const state=layout(spec);change(state);assert.ok(validateP1Layout(state,spec).length);
  }
});
test('all navigation identities, active owner and pill paint are retained',()=>{
  const spec=p1Cases.find(s=>s.caseId==='relay-390');
  for(const change of [s=>s.nav.pop(),s=>s.navOwners=2,s=>s.nav[0].active='page',s=>s.nav.reverse(),s=>s.nav[0].radii[0]='2px']){const s=layout(spec);change(s);assert.ok(validateP1Layout(s,spec).length);}
});
test('canonical market route is measured as hosted chart and never falsely called dashboard',()=>{
  const spec=p1Cases.find(s=>s.caseId==='market-us-1440'),s=layout(spec);assert.deepEqual(validateP1Layout(s,spec),[]);
  for(const change of [s=>s.child=null,s=>s.child.overflow=1,s=>s.center=null,s=>s.shell='dashboard']){const next=clone(s);change(next);assert.ok(validateP1Layout(next,spec).length);}
});
test('blocked/native-zero and missing/mislabeled/duplicate routes cannot qualify P1',()=>{
  assert.equal(p1FinalStatus({failures:['launch blocked'],layouts:[],journeys:[]}).qualifiesP1Verification,false);
  const good=completeReport();assert.equal(p1FinalStatus(good).qualifiesP1Verification,true);
  for(const change of [r=>r.layouts.pop(),r=>r.layouts[0].caseId='wrong',r=>r.layouts[0].caseId=r.layouts[1].caseId,r=>r.journeys.pop(),r=>r.journeys[0].steps.pop(),r=>r.journeys[0].steps[0].destination='wrong',r=>r.journeys[0].steps[0].destination=r.journeys[0].steps[1].destination]){const r=clone(good);change(r);assert.equal(p1FinalStatus(r).qualifiesP1Verification,false);}
});
test('complete case counts cannot override failures, missing source identity or failed input',()=>{
  for(const change of [r=>r.sourceStable=false,r=>delete r.sourceStable,r=>r.failures.push('error'),r=>r.layouts[0].status='unverified',r=>r.journeys[0].status='failed',r=>r.journeys[0].steps[0].status='failed',r=>delete r.journeys[0].chartReturn,r=>r.journeys[0].chartReturn.status='failed']){const r=completeReport();change(r);assert.equal(p1FinalStatus(r).qualifiesP1Verification,false);}
});
