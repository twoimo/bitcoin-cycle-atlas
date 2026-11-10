import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {atlasReleaseNotes, atlasReleaseNotesVersion} from '../dist/release-notes.js';
import {mountReleaseNotes} from '../dist/release-notes-view.js';

const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const semver=value=>/^\d+\.\d+\.\d+$/.test(value);
const versionKey=value=>value.split('.').map(Number);

function sidebarDocument() {
  const {document,window}=parseHTML(`<aside class="atlas-sidebar">
    <button class="atlas-brand">비트코인 사이클</button>
    <nav class="atlas-nav"><button data-view="relay">릴레이 콘텐츠</button></nav>
    <div class="atlas-side-foot"><span>관측</span></div>
  </aside>`);
  return {document,window};
}

test('the managed release notes are ordered, complete and name the current package version',()=>{
  assert.ok(atlasReleaseNotes.length>=3);
  assert.equal(atlasReleaseNotesVersion,pkg.version);
  let previous=null;
  for(const entry of atlasReleaseNotes){
    assert.ok(semver(entry.version),entry.version);
    assert.match(entry.date,/^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.title.trim().length>=4,entry.version);
    assert.ok(entry.items.length>=1,entry.version);
    for(const item of entry.items) assert.ok(item.trim().length>=20,entry.version);
    if(previous){
      assert.ok(versionKey(entry.version).some((part,index)=>{
        const prior=versionKey(previous.version);
        if(part!==prior[index]){for(let earlier=0;earlier<index;earlier+=1){if(prior[earlier]!==versionKey(entry.version)[earlier])return false;}return part<prior[index];}
        return false;
      }),`${entry.version} must sort below ${previous.version}`);
      assert.ok(entry.date<=previous.date,`${entry.version} is newer than ${previous.version}`);
    }
    previous=entry;
  }
});

test('the sidebar mounts a managed trigger before the existing side foot and opens a local dialog',()=>{
  const {document,window}=sidebarDocument();
  const mounted=mountReleaseNotes({document});
  assert.ok(mounted);
  const block=document.querySelector('[data-atlas-release-notes]');
  const trigger=document.querySelector('.atlas-release-trigger');
  assert.ok(block);
  assert.ok(trigger);
  assert.equal(block.nextElementSibling?.className,'atlas-side-foot');
  assert.match(trigger.textContent,/릴리즈 노트/);
  assert.match(trigger.textContent,new RegExp('v'+pkg.version.replaceAll('.','\\.')));
  assert.equal(trigger.getAttribute('aria-expanded'),'false');

  const dialog=document.querySelector('#atlas-release-dialog');
  assert.ok(dialog);
  assert.equal(dialog.getAttribute('aria-modal'),'true');
  assert.equal(document.querySelectorAll('.atlas-release-current').length,1);
  assert.equal(document.querySelector('.atlas-release-current h3').textContent.includes('현재'),true);
  assert.ok(document.querySelectorAll('.atlas-release-entry details, details.atlas-release-entry').length>=1);

  trigger.dispatchEvent(new window.Event('click',{bubbles:true}));
  assert.equal(trigger.getAttribute('aria-expanded'),'true');
  assert.equal(dialog.hasAttribute('open'),true);
  dialog.querySelector('.atlas-release-close').dispatchEvent(new window.Event('click',{bubbles:true}));
  assert.equal(trigger.getAttribute('aria-expanded'),'false');
  assert.equal(dialog.hasAttribute('open'),false);
  mounted.destroy();
  assert.equal(document.querySelector('[data-atlas-release-notes]'),null);
  assert.equal(document.querySelector('#atlas-release-dialog'),null);
});

test('release note text is escaped and never becomes markup',()=>{
  const {document,window}=sidebarDocument();
  const data=[{version:'9.9.9',date:'2026-11-10',title:'<img src=x onerror=alert(1)>',
    items:['<script>alert(1)</script> 실제 문장입니다.']}];
  mountReleaseNotes({document,data});
  const dialog=document.querySelector('#atlas-release-dialog');
  assert.equal(dialog.querySelector('img'),null);
  assert.equal(dialog.querySelector('script'),null);
  assert.match(dialog.textContent,/<script>alert\(1\)<\/script>/);
  assert.match(dialog.textContent,/<img src=x onerror=alert\(1\)>/);
  const trigger=document.querySelector('.atlas-release-trigger');
  trigger.dispatchEvent(new window.Event('click',{bubbles:true}));
  dialog.querySelector('.atlas-release-close').dispatchEvent(new window.Event('click',{bubbles:true}));
});

test('mounting twice keeps one trigger and one dialog',()=>{
  const {document}=sidebarDocument();
  const first=mountReleaseNotes({document});
  const second=mountReleaseNotes({document});
  assert.ok(first);
  assert.equal(second,null);
  assert.equal(document.querySelectorAll('.atlas-release-trigger').length,1);
  assert.equal(document.querySelectorAll('#atlas-release-dialog').length,1);
});
