import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildModelComponentArtifact,parseModelArtifactArgs,reportModelArtifactFailure} from './cloudflare-model-artifact.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
try{
  const {mode}=parseModelArtifactArgs(process.argv.slice(2));
  const artifact=await buildModelComponentArtifact({root,mode});
  console.log(JSON.stringify({status:'MODEL_COMPONENT_PREPARED',sourceCommit:artifact.sourceCommit,sourceTree:artifact.sourceTree,
    runId:artifact.runId,mode,origin:artifact.origin,component:artifact.component,qualifiesFullVerification:false}));
}catch(error){reportModelArtifactFailure(error);process.exitCode=1;}
