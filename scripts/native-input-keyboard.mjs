// Native text replacement for browser harnesses. Keep the platform shortcut
// and Chromium's editing command together: headless macOS does not traverse
// AppKit's Command+A menu translation. No value assignment or DOM event shim.
import assert from 'node:assert/strict';

export async function replaceNativeInputText({cdp,evaluate,context=cdp,settled,until,selector,text,platform=process.platform}) {
  assert.equal(typeof text,'string','Native text replacement requires a string');
  const before=await evaluate(context,selector=>{
    const node=document.querySelector(selector);
    if(!node)throw new Error('Missing '+selector);
    node.focus({preventScroll:true});
    return {value:node.value,focused:document.activeElement===node};
  },selector);
  assert.equal(before.focused,true,'Native text input owns focus: '+selector);
  const modifiers=platform==='darwin'?4:2;
  for(const type of ['rawKeyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{
    type,key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers,
    ...(type==='rawKeyDown'?{commands:['selectAll']}:{})
  });
  const selection=await evaluate(context,selector=>{
    const node=document.querySelector(selector);
    return {value:node?.value,focused:document.activeElement===node,start:node?.selectionStart,end:node?.selectionEnd};
  },selector);
  assert.equal(selection.focused,true,'Native select-all keeps input focus: '+selector);
  // Number inputs expose null selection endpoints. Every input still has to
  // satisfy the exact final value readback below before its caller can proceed.
  if(Number.isInteger(selection.start)&&Number.isInteger(selection.end)){
    assert.deepEqual([selection.start,selection.end],[0,selection.value.length],'Native select-all covers the existing text: '+selector);
  }
  await cdp.send('Input.insertText',{text});
  await settled(context);
  let observed;
  try{
    await until(async()=>{
      observed=await evaluate(context,selector=>document.querySelector(selector)?.value,selector);
      return observed===text;
    },'native text replacement: '+selector);
  }catch(error){
    error.message+='; expected='+JSON.stringify(text)+'; observed='+JSON.stringify(observed);
    throw error;
  }
  return {selector,requested:text,platform,modifiers,before:before.value,selection,observed};
}
