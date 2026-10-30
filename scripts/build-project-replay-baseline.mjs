import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {PROJECT_REPLAY_ORIGIN} from '../dist/project-replay-baseline.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const blob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');

export async function projectReplayBaselineText({directory=root}={}){
  const origin=PROJECT_REPLAY_ORIGIN;
  const [artifact,input]=await Promise.all([
    readFile(resolve(directory,origin.sourceArtifactPath)),
    readFile(resolve(directory,'research-data/project-origin/bitcoin-first-input.json')),
  ]);
  if(sha256(artifact)!==origin.sourceArtifactSha256||blob(artifact)!==origin.sourceArtifactGitBlob)throw new Error('Initial-commit forecast artifact changed');
  if(sha256(input)!==origin.sourceInputSha256||blob(input)!==origin.sourceInputGitBlob)throw new Error('Initial-commit input snapshot changed');
  const original=JSON.parse(artifact),dataset=JSON.parse(input);
  const scenario=original.scenarios.find(row=>row.id==='base');
  if(!scenario)throw new Error('The original base scenario is absent');
  const context=Object.fromEntries(['version','asOf','referenceDate','referenceTimezone','displayStart','displayEnd','observables','nominalClock'].map(key=>[key,original[key]]));
  const {archivePath,archiveSha256,...provenance}=origin;
  const url='https://github.com/twoimo/bitcoin-cycle-atlas/blob/'+origin.sourceCommit+'/';
  return canonicalForecastJson({schemaVersion:1,kind:'atlas-project-origin-baseline',context,dataset,scenario,
    provenance:{...provenance,sourceArtifactUrl:url+origin.sourceArtifactPath,sourceInputUrl:url+origin.sourceInputPath,
      repositoryUrl:'https://github.com/twoimo/bitcoin-cycle-atlas',
      derivation:'Exact first-commit input snapshot and base scenario extracted from the unchanged first-commit result; no model recalculation.'}})+'\n';
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const text=await projectReplayBaselineText(),file=resolve(root,'dist',PROJECT_REPLAY_ORIGIN.archivePath);
  if(process.argv.includes('--check')){
    if(await readFile(file,'utf8')!==text)throw new Error('Project-origin bundle differs from the original committed artifacts');
    if(sha256(text)!==PROJECT_REPLAY_ORIGIN.archiveSha256)throw new Error('Project-origin bundle differs from the reviewed runtime hash');
  }else await writeFile(file,text);
  console.log(JSON.stringify({file,bytes:Buffer.byteLength(text),sha256:sha256(text),origin:PROJECT_REPLAY_ORIGIN.startDate,sourceAsOf:PROJECT_REPLAY_ORIGIN.asOf}));
}
