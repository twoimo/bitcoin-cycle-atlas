import {cp,copyFile,mkdtemp,realpath,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';

const run=promisify(execFile);

export function packagingFixtureEnvironment(environment=process.env){
  const result={...environment};
  // A deliberately unrelated temporary Git repository is not the CI source.
  // Production verification still receives the original, unmodified identity.
  for(const name of Object.keys(result))if(name==='WORKERS_CI'||name.startsWith('WORKERS_CI_')||name.startsWith('GITHUB_')||
    ['ATLAS_CHECKOUT_SHA','ATLAS_REFRESH_OUTCOMES'].includes(name))delete result[name];
  return result;
}

export async function isolatedPackagingFixture(sourceRoot,{prefix='atlas-packaging-',environment=process.env}={}){
  const directory=await realpath(await mkdtemp(resolve(tmpdir(),prefix))),env=packagingFixtureEnvironment(environment);
  try{
    await Promise.all([
      cp(resolve(sourceRoot,'dist'),resolve(directory,'dist'),{recursive:true}),
      cp(resolve(sourceRoot,'scripts'),resolve(directory,'scripts'),{recursive:true}),
      copyFile(resolve(sourceRoot,'package.json'),resolve(directory,'package.json')),
    ]);
    await run('git',['init','--quiet'],{cwd:directory,env});
    await run('git',['-c','user.name=Atlas Packaging Test','-c','user.email=packaging-test@example.invalid','-c','core.hooksPath=/dev/null',
      'commit','--allow-empty','--no-gpg-sign','--quiet','-m','Isolated packaging fixture'],{cwd:directory,env});
    return {directory,dist:resolve(directory,'dist'),environment:env,cleanup:()=>rm(directory,{recursive:true,force:true})};
  }catch(error){await rm(directory,{recursive:true,force:true});throw error;}
}
