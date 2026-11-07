#!/usr/bin/env node
import {access,readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {homedir,tmpdir,totalmem,availableParallelism} from 'node:os';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cloudflareRuntime as pinned} from './cloudflare-build-contract.mjs';

const repositoryRoot=fileURLToPath(new URL('..',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const gitBlob=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
const executable=async path=>access(path,constants.X_OK).then(()=>true,()=>false);

export async function runRuntimeCommand(command,args,{cwd=repositoryRoot,env=process.env,timeout=180000,log=()=>{},allowFailure=false}={}){
  return new Promise((accept,reject)=>{
    let output='',settled=false;
    const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe']});
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):accept(result);};
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new Error(command+' exceeded the runtime bootstrap bound'));},timeout);
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{const text=chunk.toString();output=(output+text).slice(-4*1024*1024);log(text);});
    child.on('error',error=>allowFailure?finish(null,{code:127,output:error.message}):finish(error));
    child.on('close',(code,signal)=>{
      const result={code:code??1,signal,output};
      if(result.code&&!allowFailure)finish(new Error(command+' failed ('+result.code+'): '+output.slice(-4000)));
      else finish(null,result);
    });
  });
}
async function commandPath(name){
  for(const entry of (process.env.PATH??'').split(':'))if(entry){const path=join(entry,name);if(await executable(path))return path;}
  return null;
}
async function inspectCommand(name,args){
  const path=await commandPath(name);if(!path)return {available:false};
  const result=await runRuntimeCommand(path,args,{timeout:15000,allowFailure:true});
  return {available:true,path,exitCode:result.code,version:result.output.trim().slice(0,1500)};
}
export async function inspectCloudflareRuntime(){
  const tools={};
  for(const [name,args] of [['git',['--version']],['curl',['--version']],['unzip',['-v']],['java',['-version']],['fc-list',['--version']],['apt-get',['--version']],['sudo',['-n','true']],['runuser',['--version']]])tools[name]=await inspectCommand(name,args);
  const osRelease=await readFile('/etc/os-release','utf8').catch(()=>null);
  const postgresPath='/usr/lib/postgresql/17/bin/postgres';
  const postgres=await executable(postgresPath)?await runRuntimeCommand(postgresPath,['--version'],{allowFailure:true}):null;
  return {schemaVersion:1,kind:'atlas-cloudflare-runtime-preflight',checkedAt:new Date().toISOString(),
    node:process.version,platform:process.platform,arch:process.arch,uid:process.getuid?.()??null,
    cpuCount:availableParallelism(),memoryBytes:totalmem(),osRelease,tools,
    canInstallPackages:process.getuid?.()===0||tools.sudo.exitCode===0,
    postgres:postgres?{path:postgresPath,version:postgres.output.trim(),exitCode:postgres.code}:{available:false},
    targetRuntimeVerified:false,gateStatus:'INSPECTED_ONLY',dockerRequired:false};
}

export async function bootstrapCloudflareBuild({root=repositoryRoot,log=()=>{},timeoutMs=480000}={}){
  const started=Date.now(),inspected=await inspectCloudflareRuntime();
  if(process.version!==pinned.node||process.platform!==pinned.platform||process.arch!==pinned.arch)
    throw new Error('Verification requires '+pinned.node+' linux/x64. Set NODE_VERSION=24.22.2 in Workers Builds; do not substitute Docker or relax immutable numerical checks.');
  if(!/\bVERSION_ID="24\.04"/.test(inspected.osRelease??''))throw new Error('The pinned runtime package installer requires the documented Ubuntu24.04 build image');
  const toolsDirectory=resolve(root,'build/cloudflare-tools');await mkdir(toolsDirectory,{recursive:true});
  const remaining=()=>{const value=timeoutMs-(Date.now()-started);if(value<1000)throw new Error('Cloudflare runtime installation exceeded its bound');return value;};
  const run=(command,args,options={})=>runRuntimeCommand(command,args,{cwd:root,log,timeout:Math.min(remaining(),180000),...options});
  const privileged=async(command,args)=>{
    if(!inspected.canInstallPackages)throw new Error('Required build tools are absent and the build image has neither root nor passwordless sudo. A preflight failure is not a verification pass.');
    return process.getuid?.()===0?run(command,args):run('sudo',['-n',command,...args]);
  };
  const apt=(...args)=>privileged('env',['DEBIAN_FRONTEND=noninteractive','apt-get','-o','Dpkg::Use-Pty=0',...args]);
  async function download(url,destination,expected,hashFn=sha){
    try{const bytes=await readFile(destination);if(hashFn(bytes)===expected)return;}catch(error){if(error.code!=='ENOENT')throw error;}
    await mkdir(dirname(destination),{recursive:true});
    const temporary=destination+'.download';
    try{
      await run('curl',['--fail','--location','--silent','--show-error','--retry','2','--connect-timeout','20','--max-time','180','--output',temporary,url]);
      const bytes=await readFile(temporary);if(hashFn(bytes)!==expected)throw new Error('Downloaded runtime bytes do not match the committed integrity pin: '+url);
      await writeFile(destination,bytes);
    }finally{await rm(temporary,{force:true});}
  }
  // Signed distribution packages supply the shared libraries. Chrome itself,
  // the Korean font, TLC and PostgreSQL server have exact committed pins.
  const chromePackages=['fontconfig','fonts-liberation','libasound2t64','libatk-bridge2.0-0t64','libatk1.0-0t64','libatspi2.0-0t64','libcairo2','libcups2t64','libdbus-1-3','libdrm2','libgbm1','libglib2.0-0t64','libgtk-3-0t64','libnspr4','libnss3','libpango-1.0-0','libx11-6','libxcb1','libxcomposite1','libxdamage1','libxext6','libxfixes3','libxkbcommon0','libxrandr2','unzip','ca-certificates','gnupg','util-linux'];
  const packageStatus=await run('dpkg-query',['-W','-f=${Package} ${Status}\n',...chromePackages],{allowFailure:true,log:()=>{}});
  const installed=new Set(packageStatus.output.split('\n').filter(line=>line.endsWith(' install ok installed')).map(line=>line.split(' ')[0]));
  const missing=chromePackages.filter(name=>!installed.has(name));
  const javaMajor=Number(inspected.tools.java.version?.match(/version "(\d+)/)?.[1]);
  if(!Number.isFinite(javaMajor)||javaMajor<17)missing.push('openjdk-21-jre-headless');
  const postgresPath='/usr/lib/postgresql/17/bin/postgres';
  const exactPostgres=inspected.postgres.version?.includes(' '+pinned.postgres.version+' ');
  if(missing.length||!exactPostgres){
    if(!inspected.canInstallPackages)throw new Error('Build preflight requires installable Chrome libraries, fontconfig, Java17+ and PostgreSQL17.11; privileged package installation is unavailable');
    if(!exactPostgres){
      const key=resolve(toolsDirectory,'pgdg.asc');
      await run('curl',['--fail','--location','--silent','--show-error','--max-time','60','--output',key,pinned.postgres.keyUrl]);
      const keys=await run('gpg',['--batch','--show-keys','--with-colons',key],{log:()=>{}});
      const fingerprints=keys.output.split('\n').filter(line=>line.startsWith('fpr:')).map(line=>line.split(':')[9]);
      if(fingerprints[0]!==pinned.postgres.fingerprint)throw new Error('Unexpected PostgreSQL signing-key fingerprint');
      await privileged('install',['-m','644',key,'/usr/share/keyrings/atlas-pgdg.asc']);
      const source=resolve(toolsDirectory,'atlas-pgdg.sources');
      await writeFile(source,'Types: deb\nURIs: https://apt.postgresql.org/pub/repos/apt\nSuites: noble-pgdg\nArchitectures: amd64\nComponents: main\nSigned-By: /usr/share/keyrings/atlas-pgdg.asc\n');
      await privileged('install',['-m','644',source,'/etc/apt/sources.list.d/atlas-pgdg.sources']);
      missing.push('postgresql-17='+pinned.postgres.packageVersion,'postgresql-client-17='+pinned.postgres.packageVersion);
    }
    await apt('update');await apt('install','-y','--no-install-recommends',...missing);
  }
  const archive=resolve(toolsDirectory,'chrome-'+pinned.chrome.version+'.zip');
  await download(pinned.chrome.url,archive,pinned.chrome.sha256);
  await run('unzip',['-q','-o',archive,'-d',toolsDirectory]);
  const chromePath=resolve(toolsDirectory,'chrome-linux64/chrome');
  const chromeVersion=(await run(chromePath,['--version'])).output.trim();
  if(!chromeVersion.includes(pinned.chrome.version))throw new Error('Pinned full Chrome version mismatch');
  const linked=await run('ldd',[chromePath],{log:()=>{}});
  if(linked.output.includes('not found'))throw new Error('Chrome shared libraries remain unavailable: '+linked.output);
  const fontDirectory=join(homedir(),'.local/share/fonts/atlas-ci');
  await mkdir(fontDirectory,{recursive:true});
  const fontPath=join(fontDirectory,'NotoSansCJKkr-Regular.otf');
  await download(pinned.font.url,fontPath,pinned.font.gitBlob,gitBlob);
  await download(pinned.font.licenseUrl,join(fontDirectory,'LICENSE'),pinned.font.licenseGitBlob,gitBlob);
  await run('fc-cache',['-f',fontDirectory]);
  const koreanFonts=await run('fc-list',[':lang=ko','file'],{log:()=>{}});
  if(!koreanFonts.output.includes(fontPath))throw new Error('The pinned Korean font is not registered with fontconfig');
  const tlcPath=resolve(root,'build/formal-tools/tla2tools-1.7.4.jar');
  await download(pinned.tlc.url,tlcPath,pinned.tlc.sha256);
  const javaPath=await commandPath('java');if(!javaPath)throw new Error('Java is unavailable after installation');
  const javaVersion=(await run(javaPath,['-version'])).output.trim();
  const postgresVersion=(await run(postgresPath,['--version'])).output.trim();
  if(!postgresVersion.includes(' '+pinned.postgres.version+' '))throw new Error('Expected exact PostgreSQL17.11 server');
  return {environment:{ATLAS_BROWSER_PATH:chromePath,TLA2TOOLS:tlcPath,JAVA:javaPath},
    receipt:{...inspected,gateStatus:'READY',targetRuntimeVerified:true,completedAt:new Date().toISOString(),
      chrome:{path:chromePath,version:chromeVersion,archiveSha256:pinned.chrome.sha256,mode:'full Chrome --headless=new'},
      font:{path:fontPath,gitBlob:pinned.font.gitBlob,licenseGitBlob:pinned.font.licenseGitBlob},
      java:{path:javaPath,version:javaVersion},tlc:{path:tlcPath,sha256:pinned.tlc.sha256},
      postgres:{path:postgresPath,version:postgresVersion},durationMs:Date.now()-started}};
}

export async function startIsolatedPostgres({log=()=>{}}={}){
  const directory=await mkdtemp(join(tmpdir(),'atlas-cloudflare-pg-'));
  const binaryDirectory='/usr/lib/postgresql/17/bin',isRoot=process.getuid?.()===0;
  const run=(binary,args)=>runRuntimeCommand(isRoot?'runuser':join(binaryDirectory,binary),isRoot?['-u','postgres','--',join(binaryDirectory,binary),...args]:args,{log,timeout:60000});
  let running=false;
  const cleanup=async()=>{
    if(running){await run('pg_ctl',['-D',join(directory,'data'),'-m','fast','-w','stop']);running=false;}
    await rm(directory,{recursive:true,force:true});
  };
  try{
    if(isRoot)await runRuntimeCommand('chown',['postgres:postgres',directory],{log});
    await run('initdb',['-D',join(directory,'data'),'-U','atlas','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale']);
    const port=await new Promise((accept,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):accept(port));});});
    await run('pg_ctl',['-D',join(directory,'data'),'-l',join(directory,'server.log'),'-o','-h 127.0.0.1 -p '+port+' -k '+directory,'-w','start']);running=true;
    await run('createdb',['-h','127.0.0.1','-p',String(port),'-U','atlas','atlas_market_lab']);
    const result=await run('psql',['-h','127.0.0.1','-p',String(port),'-U','atlas','-d','atlas_market_lab','-A','-t','-c','SHOW server_version_num']);
    if(result.output.trim()!=='170011')throw new Error('The live PostgreSQL server differs from pinned17.11');
    return {url:'postgresql://atlas@127.0.0.1:'+port+'/atlas_market_lab',port,serverVersion:'17.11',cleanup};
  }catch(error){await cleanup().catch(()=>{});throw error;}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);if(args.length!==1||!['--inspect','--install'].includes(args[0]))throw new Error('Use --inspect for read-only capabilities or --install for the pinned build tools');
    const receipt=args[0]==='--inspect'?await inspectCloudflareRuntime():(await bootstrapCloudflareBuild({log:text=>process.stdout.write(text)})).receipt;
    await mkdir(resolve(repositoryRoot,'build'),{recursive:true});
    await writeFile(resolve(repositoryRoot,'build/cloudflare-preflight.json'),JSON.stringify(receipt,null,2)+'\n');
    console.log('ATLAS_CLOUDFLARE_PREFLIGHT '+JSON.stringify(receipt));
  }catch(error){console.error(error.stack??error);process.exitCode=1;}
}
