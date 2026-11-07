import {readArchivedWorkflow} from './support/archived-workflow.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const workflow=readArchivedWorkflow('eth-model-evaluation');
const hash=text=>createHash('sha256').update(text).digest('hex');
const checkout='actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';
const upload='actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02';
const download='actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093';
function jobs(source=workflow){
  const body=source.split('\njobs:\n')[1];assert.ok(body,'Workflow jobs are required');
  const headers=[...body.matchAll(/^  ([\w-]+):\n/gm)];
  return Object.fromEntries(headers.map((match,index)=>[match[1],body.slice(match.index,headers[index+1]?.index??body.length)]));
}
function steps(job){return job.split(/(?=^      - )/m).slice(1);}
function step(job,name){const found=steps(job).find(block=>block.startsWith('      - name: '+name+'\n'));assert.ok(found,'Missing step: '+name);return found;}
function between(body,start,end){const a=body.indexOf(start),b=body.indexOf(end,a);assert.ok(a>=0&&b>a,'Missing or reordered preserved steps');return body.slice(a,b).trim();}
function artifactPaths(block){const match=block.match(/^          path: \|\n((?:            .+\n)+)/m);assert.ok(match,'A complete artifact path list is required');return match[1].trim().split('\n').map(line=>line.trim());}

// These fingerprints describe the original sequential fe0bca workflow, not
// the new orchestration. Moving it cannot delete, rewrite or reorder a gate.
test('Parallel ETH evidence retains every original model command and its original failure policy',()=>{
  const {models}=jobs();
  const original=between(models,'      - name: Test candidate equations','      - name: Bind all completed model outputs');
  assert.equal(hash(original),'33c7f3e56c36b5ffd57e7cc484858a8bb66984d37386bc2d111b0d80bcdadace');
  assert.equal((workflow.match(/continue-on-error: true/g)||[]).length,5,'Only the five original bounded acquisition attempts may continue after errors');
  assert.match(models,/run: node scripts\/eth-evidence-handoff\.mjs capture-model/);
});

test('Independent models and full native producers keep the 35-minute cap and exact PR source',()=>{
  const found=jobs();assert.deepEqual(Object.keys(found),['models','browser','evaluate']);
  for(const path of ['scripts/eth-browser-case-specs.mjs','scripts/eth-evidence-handoff.mjs','tests/eth-browser-case-specs.test.mjs','tests/eth-evidence-handoff.test.mjs','tests/eth-evidence-workflow.test.mjs'])assert.ok(workflow.includes("      - '"+path+"'"),'A change to '+path+' must trigger the complete evidence workflow');
  assert.match(workflow,/ETH_EVIDENCE_SOURCE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  for(const [name,body] of Object.entries(found)){
    assert.match(body,/^    timeout-minutes: 35$/m,name);
    assert.ok(body.includes(checkout),name+': pinned checkout');
    assert.match(body,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/,name);
    assert.match(body,/node-version: '24'/,name);
  }
  for(const name of ['models','browser']){
    const body=found[name];assert.doesNotMatch(body,/^    needs:/m,'The long producers must actually run independently');
    for(const field of ['source_sha','source_tree','run_id','run_attempt'])assert.ok(body.includes(field+': ${{ steps.identity.outputs.'+field+' }}'));
    assert.ok(body.includes('test "$(git rev-parse HEAD)" = "$ETH_EVIDENCE_SOURCE_SHA"'));
  }
  assert.match(found.evaluate,/^    needs: \[models, browser\]$/m);
  assert.match(found.evaluate,/^    if: \$\{\{ always\(\) \}\}$/m);
  const native=between(found.browser,'      - name: Install a pinned Korean font','      - name: Preserve the complete or interrupted native browser evidence');
  assert.match(native,/ATLAS_BROWSER_CASE_SCOPE: all/,'The native run cannot be replaced with a partial scope');
  assert.equal(hash(native.replace('          ATLAS_BROWSER_CASE_SCOPE: all\n','')),'318103637531ee76dce141590b4504024642d245c2282b4ae8863c8670a090a4');
});

test('The required evaluate gate rejects failed cancelled skipped and missing producer evidence',()=>{
  const guard=step(jobs().evaluate,'Require both complete producers and their exact artifact identities');
  assert.match(guard,/if: \$\{\{ always\(\) \}\}/);
  const script=guard.split('        run: |\n')[1].split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
  const valid={MODELS_RESULT:'success',BROWSER_RESULT:'success',MODELS_ARTIFACT_ID:'101',BROWSER_ARTIFACT_ID:'102'};
  const run=patch=>spawnSync('bash',['-c',script],{encoding:'utf8',env:{...process.env,...valid,...patch}});
  assert.equal(run({}).status,0);
  for(const key of ['MODELS_RESULT','BROWSER_RESULT'])for(const value of ['failure','cancelled','skipped',''])assert.notEqual(run({[key]:value}).status,0,key+'='+value);
  for(const key of ['MODELS_ARTIFACT_ID','BROWSER_ARTIFACT_ID'])assert.notEqual(run({[key]:''}).status,0,key);
});

test('The join restores exactly the producer artifact IDs and propagates producer-specific attempts',()=>{
  const {evaluate}=jobs();
  const restores=steps(evaluate).filter(block=>block.includes('uses: '+download));assert.equal(restores.length,2);
  for(const [producer,path] of [['models','build'],['browser','build/eth-browser']]){
    const restore=restores.find(block=>block.includes('artifact-ids: ${{ needs.'+producer+'.outputs.artifact_id }}'));assert.ok(restore,producer);
    assert.ok(restore.includes('always() && needs.'+producer+".outputs.artifact_id != ''"));
    assert.match(restore,/merge-multiple: true/,'An exact-ID download otherwise adds a directory named after the artifact');
    assert.ok(restore.includes('          path: '+path+'\n'));
    assert.doesNotMatch(restore,/^          (name|pattern|run-id|repository):/m,'No other-run or name wildcard fallback');
  }
  const join=step(evaluate,'Verify joined source run attempt complete native scope and artifact bytes');
  for(const [prefix,producer] of [['MODEL','models'],['BROWSER','browser']])for(const field of ['artifact_id','source_sha','source_tree','run_id','run_attempt']){
    assert.ok(join.includes('ETH_EVIDENCE_'+prefix+'_'+field.toUpperCase()+': ${{ needs.'+producer+'.outputs.'+field+' }}'),prefix+' '+field);
  }
  assert.match(join,/run: node scripts\/eth-evidence-handoff\.mjs verify-joined/);
  assert.doesNotMatch(join,/continue-on-error:|if:/);
  const bind=step(evaluate,'Bind exact committed sources inputs and execution evidence for external review');
  assert.equal(hash(bind.trim()),'66ef43b1c58327feb868ed60c5c635f74bda8268ce0d57bd9efbf4e766ec2440');
  assert.ok(evaluate.indexOf(join)<evaluate.indexOf(bind),'The original source book cannot bind unverified parallel evidence');
});

test('All original artifact paths and partial producer evidence survive without overwriting earlier attempts',()=>{
  const found=jobs();
  const final=step(found.evaluate,'Preserve complete source-identified candidate evidence');
  const paths=artifactPaths(final),extra=['build/eth-model-handoff.json','build/eth-evidence-joined.json'];
  const original=paths.filter(path=>!extra.includes(path));
  assert.equal(original.length,35);assert.equal(hash(original.join('\n')),'07e275b8a1dce2d7a9c9f69bf74e6d44916615247fcadf63b9d7296598c9aed8');
  assert.deepEqual(paths.slice(-2),extra);
  const model=step(found.models,'Preserve model evidence including incomplete acquisition receipts');
  assert.deepEqual(artifactPaths(model),[...original.filter(path=>!['build/eth-review-packet','build/eth-browser'].includes(path)),extra[0]]);
  const browser=step(found.browser,'Preserve the complete or interrupted native browser evidence');assert.match(browser,/^          path: build\/eth-browser$/m);
  for(const block of [model,browser,final]){
    assert.ok(block.includes(upload));assert.match(block,/if: always\(\)/);assert.match(block,/if-no-files-found: error/);assert.match(block,/retention-days: 30/);
  }
  assert.doesNotMatch(workflow,/overwrite:/,'An interrupted artifact is evidence and must not be deleted on retry');
  assert.ok(final.includes("name: eth-candidate-evidence-${{ github.event.pull_request.head.sha }}${{ github.run_attempt != 1 && format('-attempt-{0}', github.run_attempt) || '' }}"),'Attempt 1 keeps the original name; later attempts preserve the earlier artifact under a distinct name');
  for(const block of [model,browser])assert.ok(block.includes('${{ github.run_id }}-attempt-${{ github.run_attempt }}'));
});
