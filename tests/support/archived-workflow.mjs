import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';

const root=new URL('../../',import.meta.url);
// Historical shell/handoff negative controls still run. This helper also
// proves that reading them does not silently reactivate their old triggers.
export function readArchivedWorkflow(name){
  const migration=JSON.parse(readFileSync(new URL('ops/ci-migration.json',root),'utf8'));
  assert.equal(migration.provider,'cloudflare-workers-builds');
  assert.equal(migration.automaticGithubActions,false);
  assert.deepEqual(readdirSync(new URL('.github/workflows/',root)).filter(file=>/\.ya?ml$/i.test(file)),[],'GitHub Actions must remain disabled after migration');
  const entry=migration.archives.find(item=>item.name===name);assert.ok(entry,'No archived workflow named '+name);
  assert.equal(entry.path,'ops/github-actions-archive/'+name+'.yml');
  assert.equal(existsSync(new URL(entry.previousPath,root)),false,'Archived trigger must not remain executable');
  const bytes=readFileSync(new URL(entry.path,root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,'The archived gate contract changed');
  assert.ok(entry.replacement,'An explicit replacement obligation is required');
  return bytes.toString('utf8');
}
