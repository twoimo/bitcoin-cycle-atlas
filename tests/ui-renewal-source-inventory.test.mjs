import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {listP0SourceFiles} from '../scripts/verify-ui-renewal-p0-browser.mjs';

test('P0 source inventory follows current tracked and new worktree bytes and discloses removed generated names',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'atlas-p0-inventory-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
  git('init','--quiet');await mkdir(path.join(root,'dist/assets'),{recursive:true});
  for(const name of ['stable.js','old-hash.js'])await writeFile(path.join(root,'dist/assets',name),'export const value=1;');
  await writeFile(path.join(root,'.gitignore'),'dist/assets/ignored.js\n');git('add','.');
  await rm(path.join(root,'dist/assets/old-hash.js'));
  for(const name of ['new-hash.js','ignored.js'])await writeFile(path.join(root,'dist/assets',name),'export const value=2;');
  const result=listP0SourceFiles(root,'dist/*.js');
  assert.deepEqual(result.files,['dist/assets/new-hash.js','dist/assets/stable.js']);
  assert.deepEqual(result.removedTrackedFiles,['dist/assets/old-hash.js']);
});
