import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {replaceNativeInputText} from '../scripts/native-input-keyboard.mjs';

// This transport model checks the platform contract and readback failure paths.
// It does not emulate AppKit or establish real-browser event.isTrusted evidence.
function fixture({platform='linux',value='3725초',number=false,ignoreSelectAll=false,
  loseFocus=false,appendInstead=false,delayedReadbacks=0}={}) {
  const selector='[data-role="test-input"]',calls=[],reads=[];
  let current=value,start=value.length,end=value.length,active=null,pending=null,polls=0;
  const node={
    type:number?'number':'search',
    get value(){return current;},
    set value(_value){throw new Error('DOM value assignment is forbidden');},
    get selectionStart(){return number?null:start;},
    get selectionEnd(){return number?null:end;},
    focus(){active=node;},
    select(){throw new Error('DOM selection shortcut is forbidden');},
    setSelectionRange(){throw new Error('DOM selection shortcut is forbidden');},
    dispatchEvent(){throw new Error('Synthetic input events are forbidden');},
  };
  const document={get activeElement(){return active;},querySelector:query=>query===selector?node:null};
  const page=vm.createContext({document});
  const cdp={async send(method,params){
    calls.push({method,params:structuredClone(params)});
    if(method==='Input.dispatchKeyEvent'){
      if(params.type==='rawKeyDown'&&params.key==='a'&&params.code==='KeyA'
        &&params.modifiers===(platform==='darwin'?4:2)&&params.commands?.includes('selectAll')&&!ignoreSelectAll){
        start=0;end=current.length;
      }
      if(loseFocus)active=null;
      return {};
    }
    assert.equal(method,'Input.insertText','Only native keyboard and text commands are allowed');
    assert.equal(active,node,'Text must reach the focused input');
    const next=appendInstead?current+params.text:current.slice(0,start)+params.text+current.slice(end);
    if(delayedReadbacks)pending=next;else current=next;
    start=end=next.length;
    return {};
  }};
  const evaluate=async(context,fn,...args)=>{
    assert.equal(context,cdp,'Reader stays in the input document');
    reads.push(String(fn));
    return structuredClone(await vm.runInContext(`(${fn.toString()})(...args)`,
      Object.assign(page,{args})));
  };
  const settled=async context=>{assert.equal(context,cdp);};
  const until=async(read,label)=>{
    for(let attempt=0;attempt<5;attempt++){
      if(pending!==null&&attempt>=delayedReadbacks){current=pending;pending=null;}
      polls++;
      const result=await read();
      if(result)return result;
    }
    throw new Error('Readback did not settle: '+label);
  };
  return {calls,reads,selector,get value(){return current;},get polls(){return polls;},
    run:text=>replaceNativeInputText({cdp,evaluate,settled,until,selector,text,platform})};
}

for(const [platform,modifiers] of [['darwin',4],['linux',2],['win32',2]]){
  test(`${platform} selects all through its native shortcut before replacing text`,async()=>{
    const f=fixture({platform,value:'original query'}),receipt=await f.run('3725초');
    assert.equal(f.value,'3725초');
    assert.equal(receipt.before,'original query');assert.equal(receipt.observed,'3725초');
    assert.equal(receipt.platform,platform);assert.equal(receipt.modifiers,modifiers);
    assert.deepEqual(f.calls,[
      {method:'Input.dispatchKeyEvent',params:{type:'rawKeyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers,commands:['selectAll']}},
      {method:'Input.dispatchKeyEvent',params:{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers}},
      {method:'Input.insertText',params:{text:'3725초'}},
    ]);
    for(const source of f.reads){
      assert.doesNotMatch(source,/\.value\s*=(?!=)/,'Readers never assign the input value');
      assert.doesNotMatch(source,/dispatchEvent|new (?:Input)?Event/,'Readers never synthesize input events');
    }
  });
}

test('repeated Hangul search replaces the previous query exactly once on macOS',async()=>{
  const f=fixture({platform:'darwin',value:''});
  await f.run('3725초');
  const second=await f.run('3725초');
  assert.equal(f.value,'3725초');assert.equal(second.before,'3725초');assert.equal(second.observed,'3725초');
  assert.equal(f.calls.filter(call=>call.method==='Input.insertText').length,2);
  await f.run('25초');
  assert.equal(f.value,'25초','A shorter query cannot retain any previous suffix');
});

test('number input with null selection endpoints still requires exact replacement',async()=>{
  const f=fixture({platform:'darwin',value:'1',number:true}),receipt=await f.run('2');
  assert.equal(receipt.selection.start,null);assert.equal(receipt.selection.end,null);
  assert.equal(receipt.observed,'2');assert.equal(f.value,'2');
});

test('an ignored native select-all fails before any text can be appended',async()=>{
  const f=fixture({platform:'darwin',ignoreSelectAll:true});
  await assert.rejects(f.run('3725초'),/select-all covers the existing text/);
  assert.equal(f.value,'3725초');
  assert.equal(f.calls.filter(call=>call.method==='Input.insertText').length,0);
});

test('focus loss after the shortcut prevents text delivery to another control',async()=>{
  const f=fixture({loseFocus:true});
  await assert.rejects(f.run('3725초'),/select-all keeps input focus/);
  assert.equal(f.calls.filter(call=>call.method==='Input.insertText').length,0);
});

test('append behavior fails exact readback and preserves expected and observed text',async()=>{
  const f=fixture({platform:'darwin',appendInstead:true});
  await assert.rejects(f.run('3725초'),error=>{
    assert.match(error.message,/expected="3725초"/);
    assert.match(error.message,/observed="3725초3725초"/);
    return true;
  });
  assert.equal(f.calls.filter(call=>call.method==='Input.insertText').length,1,'A mismatch cannot retry insertion');
});

test('pending readback is polled without repeating native text insertion',async()=>{
  const f=fixture({value:'old query',delayedReadbacks:2}),receipt=await f.run('3725초');
  assert.ok(f.polls>1,'The helper must wait for the actual value');
  assert.equal(receipt.observed,'3725초');assert.equal(f.value,'3725초');
  assert.equal(f.calls.filter(call=>call.method==='Input.insertText').length,1);
});
