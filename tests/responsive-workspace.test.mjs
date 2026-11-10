import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {mountMobileWorkspace} from '../dist/mobile-workspace.js';

// The 2026-11-10 phone contract moves the ORIGINAL footer node into the
// details tray and restores it to its exact desktop slot. These tests use a
// real linkedom tree (no hand-rolled element mocks) so identity, sibling order
// and the nested-menu Escape owner are observable.

function fixture(t,{width=390}={}){
  const {document,window}=parseHTML(`<html><head></head><body data-shell="chart">
    <nav class="atlas-sidebar"><a class="atlas-brand" href="/">Atlas</a><button id="tool-a">그리기</button></nav>
    <div class="workspace"><div class="workbench-rail"><button id="rail-a">정보</button></div>
      <main id="stage-main"><header class="atlas-canvas-heading"><button class="workbench-symbol">BTCUSD</button></header>
        <div class="atlas-plot" id="plot"><svg id="source-chart"></svg></div>
        <footer class="workbench-bottom workbench-bottom-bar" aria-label="차트 기간·날짜·사건·가격축">
          <div class="workbench-bottom-scroll">
            <div class="workbench-range-controls"><select id="workbench-range-select" aria-label="차트 표시 기간"><option value="">기간</option><option value="5D" selected>5일</option><option value="1Y">1년</option></select></div>
            <button id="range-label" type="button">2026-11-10</button>
            <div class="workbench-axis" id="axis-a">가격축</div>
          </div>
          <button id="workbench-bottom-more" type="button" aria-expanded="false">⋯</button>
        </footer>
      </main>
    </div>
    <section class="workbench-bottom-menu" id="workbench-bottom-menu" hidden>
      <button role="menuitem" id="bottom-menu-item">기본 범위로</button>
    </section>
  </body></html>`);
  // Explicit focus tracking: focus is always requested by the test on the
  // original node, never implied by a click.
  let focused=document.body;
  Object.defineProperty(document,'activeElement',{configurable:true,get:()=>focused});
  const prototype=window.HTMLElement.prototype,priorFocus=prototype.focus;
  prototype.focus=function(){focused=this;this.dispatchEvent(new window.Event('focusin',{bubbles:true}));};
  t.after(()=>{prototype.focus=priorFocus;});
  const listeners=new Set();
  const media={query:'(max-width:620px)',matches:width<=620,addEventListener(type,fn){if(type==='change')listeners.add(fn);},removeEventListener(type,fn){if(type==='change')listeners.delete(fn);}};
  window.matchMedia=()=>media;
  const store=new Map();
  Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)}});
  const workspace=document.querySelector('.workspace'),stage=document.querySelector('#stage-main'),
    plot=document.querySelector('#plot'),footer=document.querySelector('.workbench-bottom-bar');
  // A real reader node (not a stub) so the owned-reader keydown deferral and
  // the sheet's `reader.contains(target)` check run against the actual tree.
  const readerNode=document.createElement('div');readerNode.id='reader-node';readerNode.hidden=true;
  const readerClose=document.createElement('button');readerClose.id='reader-close';readerClose.textContent='리더 닫기';
  readerNode.append(readerClose);plot.append(readerNode);
  const state={closed:0};
  const mount=()=>mountMobileWorkspace({workspace,stage,plot,reader:readerNode,closeReader({restoreFocus}={}){state.closed++;state.restoreFocus=restoreFocus;readerNode.hidden=true;}});
  const resize=value=>{media.matches=value<=620;for(const fn of [...listeners])fn({matches:media.matches});};
  return {document,window,workspace,stage,plot,footer,readerNode,readerClose,media,resize,mount,state,listeners};
}

const fires=(node,type,init={})=>node.dispatchEvent(new node.ownerDocument.defaultView.Event(type,{bubbles:true,cancelable:true,...init}));
const keydown=(node,key)=>{const event=new node.ownerDocument.defaultView.Event('keydown',{bubbles:true,cancelable:true});event.key=key;node.dispatchEvent(event);return event;};

test('the original footer moves into the details tray as one owned node, keeping its value',t=>{
  const f=fixture(t);
  const before={parent:f.footer.parentElement,next:f.footer.nextSibling,select:f.document.querySelector('#workbench-range-select'),axis:f.document.querySelector('#axis-a')};
  const controller=f.mount();t.after(()=>controller.destroy());
  const rail=f.document.querySelector('.workbench-rail');
  assert.equal(f.workspace.dataset.mobile,'true');
  assert.ok(f.document.querySelector('.workbench-bottom-bar')===f.footer,'no clone replaces the footer');
  assert.ok(f.footer.parentNode===rail,'the phone tray owns the original footer');
  assert.ok(f.footer.querySelector('#workbench-range-select')===before.select,'the original range select moves with the footer');
  assert.equal(before.select.value,'5D','the selected range survives the move');
  assert.ok(f.footer.querySelector('#axis-a')===before.axis,'axis identity is preserved');
  const marker=[...f.stage.childNodes].find(node=>node.nodeType===8&&node.data==='desktop chart footer');
  assert(marker,'a desktop restore marker holds the original slot');
  assert.ok(marker.parentNode===f.stage,'the marker stays in the chart stage, not in the tray');
  assert.equal([...f.stage.childNodes].includes(f.footer),false,'the stage no longer renders the footer while the tray owns it');
  assert.equal(f.document.querySelectorAll('.workbench-bottom-bar').length,1,'the footer is never duplicated');
});

test('widening to desktop returns the same footer node to its exact original slot and order',t=>{
  const f=fixture(t);
  const index=[...f.stage.children].indexOf(f.footer);
  const controller=f.mount();t.after(()=>controller.destroy());
  assert.ok(f.footer.parentNode===f.document.querySelector('.workbench-rail'));
  f.resize(1024);
  assert.equal(f.workspace.dataset.mobile,'false');
  assert.ok(f.footer.parentNode===f.stage,'desktop restore returns the footer to the chart stage');
  assert.ok(f.footer.previousSibling?.nodeType===8&&f.footer.previousSibling.data==='desktop chart footer','the footer returns beside its own restore marker');
  assert.equal([...f.stage.children].indexOf(f.footer),index,'the footer returns to its original element index');
  assert.equal(f.document.querySelectorAll('.workbench-bottom-bar').length,1);
  assert.equal(f.document.querySelector('#workbench-range-select').value,'5D','range value is untouched by the round trip');
  f.resize(390);
  assert.ok(f.footer.parentNode===f.document.querySelector('.workbench-rail'),'re-entering phone re-uses the same node');
});

test('destroy restores the footer and clears the phone marker while the tray still owns it',t=>{
  const f=fixture(t);
  const index=[...f.stage.children].indexOf(f.footer);
  const controller=f.mount();
  assert.ok(f.footer.parentNode===f.document.querySelector('.workbench-rail'));
  controller.destroy();
  assert.ok(f.footer.parentNode===f.stage,'destroy never strands the footer inside the removed tray');
  assert.equal([...f.stage.children].indexOf(f.footer),index);
  assert.equal(f.workspace.dataset.mobile,undefined,'the phone flag is cleared on destroy');
  assert.equal(f.document.querySelector('#mobile-tools-toggle'),null,'inserted tray buttons are removed');
  assert.equal(f.document.querySelector('#mobile-details-toggle'),null);
  assert.ok(f.document.querySelector('.workbench-bottom-bar')===f.footer);
});

test('Escape inside the nested bottom menu belongs to the menu, not the open tray',t=>{
  const f=fixture(t);
  const controller=f.mount();t.after(()=>controller.destroy());
  const rail=f.document.querySelector('.workbench-rail'),details=f.document.querySelector('#mobile-details-toggle');
  fires(details,'click');
  assert.equal(rail.dataset.mobileOpen,'true');
  const item=f.document.querySelector('#bottom-menu-item');
  const nested=keydown(item,'Escape');
  assert.equal(nested.defaultPrevented,false,'the tray must not consume the nested menu Escape');
  assert.equal(rail.dataset.mobileOpen,'true','the details tray stays open while its menu handles Escape');
  const own=keydown(f.document.querySelector('#rail-a'),'Escape');
  assert.equal(own.defaultPrevented,true);
  assert.equal(rail.dataset.mobileOpen,undefined,'an Escape on the tray itself still closes it');
});

test('the bottom-menu modal notification keeps its owning details tray open',t=>{
  const f=fixture(t);
  const controller=f.mount();t.after(()=>controller.destroy());
  const rail=f.document.querySelector('.workbench-rail');
  fires(f.document.querySelector('#mobile-details-toggle'),'click');
  assert.equal(rail.dataset.mobileOpen,'true');
  f.document.dispatchEvent(new f.window.CustomEvent('atlas:modal-open',{detail:{id:'workbench-bottom-menu'}}));
  assert.equal(rail.dataset.mobileOpen,'true','the menu the footer opened stays over its own tray');
  f.document.dispatchEvent(new f.window.CustomEvent('atlas:modal-open',{detail:{id:'atlas-display-options'}}));
  assert.equal(rail.dataset.mobileOpen,undefined,'an unrelated modal still dismisses the tray');
});

test('an unrelated modal still dismisses the details tray when no footer owns the sheet',t=>{
  const f=fixture(t);
  f.footer.remove();
  const controller=f.mount();t.after(()=>controller.destroy());
  const rail=f.document.querySelector('.workbench-rail');
  fires(f.document.querySelector('#mobile-details-toggle'),'click');
  f.document.dispatchEvent(new f.window.CustomEvent('atlas:modal-open',{detail:{id:'workbench-bottom-menu'}}));
  assert.equal(rail.dataset.mobileOpen,undefined,'without a footer owner the existing dismissal is unchanged');
});

test('opening the other sheet dismisses the first, and a foreign sheet closes both',t=>{
  const f=fixture(t);
  const controller=f.mount();t.after(()=>controller.destroy());
  const sidebar=f.document.querySelector('.atlas-sidebar'),rail=f.document.querySelector('.workbench-rail');
  fires(f.document.querySelector('#mobile-tools-toggle'),'click');
  assert.equal(sidebar.dataset.mobileOpen,'true');
  fires(f.document.querySelector('#mobile-details-toggle'),'click');
  assert.equal(sidebar.dataset.mobileOpen,undefined,'the second tray takes over from the first');
  assert.equal(rail.dataset.mobileOpen,'true');
  f.document.dispatchEvent(new f.window.CustomEvent('atlas:mobile-sheet-open',{detail:{id:'atlas-shell-features-panel'}}));
  assert.equal(rail.dataset.mobileOpen,undefined,'a different sheet (the heading disclosure) dismisses the tray');
  fires(f.document.querySelector('#mobile-details-toggle'),'click');
  assert.equal(rail.dataset.mobileOpen,'true');
  f.document.dispatchEvent(new f.window.CustomEvent('atlas:mobile-sheet-open',{detail:{id:rail.id}}));
  assert.equal(rail.dataset.mobileOpen,'true','a sheet naming this tray does not close it');
});

test('desktop keeps the footer in the stage and never opens a tray',t=>{
  const f=fixture(t,{width:1024});
  const controller=f.mount();t.after(()=>controller.destroy());
  assert.equal(f.workspace.dataset.mobile,'false');
  assert.equal(f.footer.parentElement,f.stage);
  fires(f.document.querySelector('#mobile-details-toggle'),'click');
  assert.equal(f.document.querySelector('.workbench-rail').dataset.mobileOpen,undefined);
});

test('the phone contract CSS pins the dock and the tray footer to 44px controls',()=>{
  const css=readFileSync(new URL('../dist/atlas-shell.css',import.meta.url),'utf8');
  const {document}=parseHTML('<html><head></head><body></body></html>');
  const style=document.createElement('style');style.textContent=css;document.head.append(style);
  const rules=[...style.sheet.cssRules].filter(rule=>rule.type===4).flatMap(rule=>[...rule.cssRules].map(child=>({media:rule.media.mediaText,rule:child})));
  const normalized=value=>value.replace(/["\s]/g,'');
  const pick=(part,{media='(max-width:620px)',within=null}={})=>rules.find(entry=>entry.media===media&&entry.rule.selectorText
    &&normalized(entry.rule.selectorText).includes(normalized(part))
    &&(!within||normalized(entry.rule.selectorText).includes(normalized(within))))?.rule.style;
  const dock=pick('[data-mobile-heading=phone-dock]');
  assert(dock,'the phone dock rule exists inside the 620px block');
  assert.equal(dock.getPropertyValue('order'),'100','the dock sits below the plot');
  assert.equal(normalized(dock.getPropertyValue('border-top')),'1pxsolidvar(--border)');
  assert.match(normalized(dock.getPropertyValue('height')),/48px/);
  const symbol=pick('is(.symbol-selector-trigger,.workbench-symbol)',{within:'phone-dock'});
  assert(symbol,'the symbol trigger keeps a 44px target inside the dock');
  assert.equal(symbol.getPropertyValue('height'),'44px');
  assert.equal(symbol.getPropertyValue('min-width'),'80px');
  const buttons=pick('is(.workbench-icon,.mobile-workbench-button)',{within:'phone-dock'});
  assert(buttons,'dock buttons keep their 44px target');
  assert.equal(buttons.getPropertyValue('width'),'44px');
  assert.equal(buttons.getPropertyValue('height'),'44px');
  const interval=pick('#workbench-interval-select',{within:'phone-dock'});
  assert(interval,'the interval select stays a real 44px/16px control');
  assert.equal(interval.getPropertyValue('height'),'44px');
  assert.equal(interval.getPropertyValue('font-size'),'16px');
  const dockReset=pick('phone-dock]::after');
  assert.equal(dockReset.getPropertyValue('display'),'none','the dock drops the removed two-row pseudo spacer');
  const toggle=pick('.shell-feature-toggle::after',{within:'phone-dock'});
  assert(toggle,'the disclosure trigger keeps a visible glyph instead of a label');
  assert.equal(normalized(toggle.getPropertyValue('content')).replace(/["']/g,''),'⋯');
  assert.equal(toggle.getPropertyValue('font-size'),'24px');
  const secondary=pick('[data-mobile-secondary]',{within:'phone-dock'});
  assert.equal(secondary.getPropertyValue('min-height'),'44px','moved secondary controls stay tappable');
  const panel=pick('.shell-feature-panel',{within:'phone-dock'});
  assert.equal(panel.getPropertyValue('position'),'fixed');
  assert.match(normalized(panel.getPropertyValue('inset')),/calc\(48px\+var\(--mobile-bottom,0px\)\)/,'the disclosure panel clears the dock');
  const trayFooter=pick('.workbench-rail[data-mobile-open=true]>.workbench-bottom-bar');
  assert(trayFooter,'the tray footer rule exists');
  assert.match(normalized(trayFooter.getPropertyValue('min-height')),/48px/);
  const trayControls=pick('.workbench-rail .workbench-bottom-bar :is(button,select)');
  assert.equal(trayControls.getPropertyValue('min-height'),'44px');
  assert.equal(trayControls.getPropertyValue('height'),'44px');
  const traySelect=pick('.workbench-rail .workbench-bottom-bar select');
  assert.equal(traySelect.getPropertyValue('font-size'),'16px','16px keeps iOS from zooming the tray select');
  const overlay=rules.find(entry=>entry.media==='(min-width:621px) and (max-width:959px)'
    &&entry.rule.selectorText&&normalized(entry.rule.selectorText).includes('chart-details-panel'))?.rule.style;
  assert(overlay,'portrait tablets overlay the reader instead of shrinking the plot');
  assert.equal(overlay.getPropertyValue('position'),'fixed');
  assert.match(normalized(overlay.getPropertyValue('width')),/min\(360px,calc\(100vw-112px\)\)/);
});

test('a footer-owned date dialog keeps the details sheet behind it, yields Escape, and clears on close',t=>{
  const f=fixture(t);
  const controller=f.mount();t.after(()=>controller.destroy());
  const rail=f.document.querySelector('.workbench-rail');
  fires(f.document.querySelector('#mobile-details-toggle'),'click');
  assert.equal(rail.dataset.mobileOpen,'true');
  // Explicit real-node focus: the harness does not synthesise focus on click,
  // so the footer-owner path is entered through the original control itself.
  const footerOpener=f.document.querySelector('#range-label');
  footerOpener.focus();
  assert.ok(f.document.activeElement===footerOpener);
  const dialog=f.document.createElement('div');dialog.id='chart-date-dialog';
  const inner=f.document.createElement('button');dialog.append(inner);f.document.body.append(dialog);
  f.document.dispatchEvent(new f.window.CustomEvent('atlas:modal-open',{detail:{id:'chart-date-dialog'}}));
  assert.equal(rail.dataset.mobileOpen,'true','the details sheet stays mounted behind its own date dialog');
  assert.equal(f.footer.parentNode,rail,'the footer that opened the dialog stays in the sheet');
  const yielded=keydown(inner,'Escape');
  assert.equal(yielded.defaultPrevented,false,'the top date dialog keeps its Escape');
  assert.equal(rail.dataset.mobileOpen,'true','the sheet does not steal Escape from the owned dialog');
  fires(dialog,'close');
  assert.ok(f.document.activeElement===footerOpener,'closing the dialog leaves focus on the visible footer opener');
  assert.ok(footerOpener.isConnected&&!footerOpener.hidden);
  const after=f.document.querySelector('#chart-date-dialog');
  const released=keydown(after,'Escape');
  assert.equal(released.defaultPrevented,true,'ownership is cleared by the capture close listener');
  assert.equal(rail.dataset.mobileOpen,undefined,'the sheet closes once it no longer owns the dialog');
});

test('a footer-owned reader keeps the sheet open, and focus outside the footer keeps the old dismissal',t=>{
  const f=fixture(t);
  const controller=f.mount();t.after(()=>controller.destroy());
  const rail=f.document.querySelector('.workbench-rail');
  fires(f.document.querySelector('#mobile-details-toggle'),'click');
  const footerOpener=f.document.querySelector('#range-label');
  footerOpener.focus();
  f.readerNode.hidden=false;
  f.document.dispatchEvent(new f.window.CustomEvent('atlas:panel-state',{detail:{open:true}}));
  assert.equal(rail.dataset.mobileOpen,'true','opening the reader from the footer keeps its own sheet behind it');
  const yielded=keydown(f.readerClose,'Escape');
  assert.equal(yielded.defaultPrevented,false,'the reader owns Escape while the sheet owns the reader');
  assert.equal(rail.dataset.mobileOpen,'true');
  f.document.dispatchEvent(new f.window.CustomEvent('atlas:panel-state',{detail:{open:false}}));
  f.document.dispatchEvent(new f.window.CustomEvent('atlas:modal-open',{detail:{id:'chart-date-dialog'}}));
  assert.equal(rail.dataset.mobileOpen,'true','the footer still owns the sheet, so a footer-opened dialog keeps it');
  f.document.querySelector('#rail-a').focus();
  f.document.dispatchEvent(new f.window.CustomEvent('atlas:modal-open',{detail:{id:'atlas-display-options'}}));
  assert.equal(rail.dataset.mobileOpen,undefined,'with focus outside the footer the pre-existing dismissal still applies');
});
