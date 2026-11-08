#!/usr/bin/env node
import {access,readFile,writeFile,mkdir,mkdtemp,rm,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {tmpdir,totalmem,availableParallelism,userInfo} from 'node:os';
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
    let output='',problem=null,spawnError=null,killTimer;
    const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe']});
    const stop=error=>{
      problem??=error;if(killTimer)return;
      child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),500);
    };
    const timer=setTimeout(()=>stop(new Error(command+' exceeded the runtime bootstrap bound')),timeout);
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{
      const text=chunk.toString();output=(output+text).slice(-4*1024*1024);
      if(!problem)try{log(text);}catch(error){stop(error);}
    });
    child.on('error',error=>{spawnError=error;});
    child.on('close',(code,signal)=>{
      clearTimeout(timer);clearTimeout(killTimer);
      if(problem){reject(problem);return;}
      if(spawnError){allowFailure?accept({code:127,output:spawnError.message}):reject(spawnError);return;}
      const result={code:code??1,signal,output};
      if(result.code&&!allowFailure)reject(new Error(command+' failed ('+result.code+'): '+output.slice(-4000)));
      else accept(result);
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
  for(const [name,args] of [['git',['--version']],['curl',['--version']],['unzip',['-v']],['tar',['--version']],['dpkg-deb',['--version']],['ldd',['--version']],['gpgv',['--version']],['java',['-version']],['fc-list',['--version']],['apt-get',['--version']],['sudo',['-n','true']],['runuser',['--version']]])tools[name]=await inspectCommand(name,args);
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

// Alternate official endpoints for these exact reviewed release bytes only.
// A changed pin must not silently reuse an asset from an earlier release.
const runtimeAssetFallbacks=[
  {url:'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jre_x64_linux_hotspot_21.0.13_9.tar.gz',
    sha256:'a535a1df9c6284d9618872984e026ae0352d1f7e9e0605425c0e6114f47351dd',
    api:'https://api.github.com/repos/adoptium/temurin21-binaries/releases/assets/665758876'},
  {url:'https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar',
    sha256:'936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88',
    api:'https://api.github.com/repos/tlaplus/tlaplus/releases/assets/184694200'},
];

// Keep every transport inside the caller's existing remaining-budget runner.
export function createRuntimeDownloader(run,log=()=>{}){
  return async function download(url,destination,expected,hashFn=sha){
    try{const bytes=await readFile(destination);if(hashFn(bytes)===expected)return;}catch(error){if(error.code!=='ENOENT')throw error;}
    await mkdir(dirname(destination),{recursive:true});
    const temporary=destination+'.download';
    try{
      log('ATLAS_RUNTIME_DOWNLOAD '+JSON.stringify({url,integrity:expected})+'\n');
      const args=['--fail','--location','--silent','--show-error','--retry','2','--connect-timeout','20','--max-time','180','--output',temporary];
      const fallback=runtimeAssetFallbacks.find(asset=>asset.url===url&&asset.sha256===expected);
      if(!fallback)await run('curl',[...args,url]);
      else{
        const result=await run('curl',[...args,'--write-out','\nATLAS_RUNTIME_HTTP_STATUS:%{http_code}\n',url],{allowFailure:true});
        if(result.code!==0){
          // curl --write-out describes the final transfer, unlike stderr which
          // may also contain an earlier retry's status. Timeouts/TLS/logging
          // failures, 4xx responses and missing/ambiguous status fail closed.
          const statuses=[...result.output.matchAll(/^ATLAS_RUNTIME_HTTP_STATUS:(\d{3})\r?$/gm)];
          const status=statuses.length===1?Number(statuses[0][1]):0;
          if(result.code!==22||status<500||status>599)throw new Error('curl failed ('+result.code+'): '+result.output.slice(-4000));
          await rm(temporary,{force:true});
          log('ATLAS_RUNTIME_DOWNLOAD '+JSON.stringify({url:fallback.api,integrity:expected,originalUrl:url,afterHttpStatus:status})+'\n');
          await run('curl',[...args,'--header','Accept: application/octet-stream',fallback.api]);
        }
      }
      const bytes=await readFile(temporary);if(hashFn(bytes)!==expected)throw new Error('Downloaded runtime bytes do not match the committed integrity pin: '+url);
      await writeFile(destination,bytes);
    }finally{await rm(temporary,{force:true});}
  };
}

async function runtimeContext({root=repositoryRoot,log=()=>{},timeoutMs=480000}={}){
  const started=Date.now(),inspected=await inspectCloudflareRuntime();
  if(process.version!==pinned.node||process.platform!==pinned.platform||process.arch!==pinned.arch)
    throw new Error('Verification requires '+pinned.node+' linux/x64. Set NODE_VERSION=24.22.2 in Workers Builds; do not substitute Docker or relax immutable numerical checks.');
  if(!/\bVERSION_ID="24\.04"/.test(inspected.osRelease??''))throw new Error('The pinned runtime package installer requires the documented Ubuntu24.04 build image');
  const toolsDirectory=resolve(root,'build/cloudflare-tools');await mkdir(toolsDirectory,{recursive:true});
  const remaining=()=>{const value=timeoutMs-(Date.now()-started);if(value<1000)throw new Error('Cloudflare runtime installation exceeded its bound');return value;};
  const run=(command,args,options={})=>runRuntimeCommand(command,args,{cwd:root,log,timeout:Math.min(remaining(),180000),...options});
  const download=createRuntimeDownloader(run,log);
  return {root,started,inspected,toolsDirectory,run,download};
}

async function installFormalTools(context){
  const {root,toolsDirectory,run,download}=context;
  const archive=resolve(toolsDirectory,'temurin-'+pinned.java.version+'-'+pinned.java.build+'.tar.gz'),javaDirectory=resolve(toolsDirectory,'java');
  await download(pinned.java.url,archive,pinned.java.sha256);
  await mkdir(javaDirectory,{recursive:true});
  await run('tar',['--extract','--gzip','--file',archive,'--directory',javaDirectory,'--strip-components=1','--no-same-owner','--no-same-permissions']);
  const javaPath=resolve(javaDirectory,'bin/java'),javaVersion=(await run(javaPath,['-version'])).output.trim();
  if(!javaVersion.includes('version "'+pinned.java.version+'"')||!javaVersion.includes('Temurin-'+pinned.java.version+'+'+pinned.java.build))throw new Error('Pinned portable Java version mismatch');
  const tlcPath=resolve(root,'build/formal-tools/tla2tools-1.7.4.jar');
  await download(pinned.tlc.url,tlcPath,pinned.tlc.sha256);
  return {environment:{JAVA:javaPath,TLA2TOOLS:tlcPath},
    java:{path:javaPath,version:javaVersion,archiveSha256:pinned.java.sha256},tlc:{path:tlcPath,sha256:pinned.tlc.sha256}};
}

/** The scheduled producer needs canonical Node and the identical formal tools,
 * without downloading a browser/database or implying a deployment gate pass. */
export async function bootstrapCloudflareFormal(options={}){
  const context=await runtimeContext({timeoutMs:180000,...options}),formal=await installFormalTools(context);
  return {environment:formal.environment,receipt:{...context.inspected,kind:'atlas-cloudflare-formal-runtime',gateStatus:'FORMAL_TOOLS_READY',
    java:formal.java,tlc:formal.tlc,portable:true,completedAt:new Date().toISOString(),durationMs:Date.now()-context.started}};
}

// Only packages corresponding to observed missing SONAMEs are requested. APT
// resolves their dependencies from signed Noble metadata; no maintainer script
// runs and no system package, keyring, source list or database is modified.
const libraryPackages={
  'libasound.so.2':'libasound2t64','libatk-1.0.so.0':'libatk1.0-0t64','libatk-bridge-2.0.so.0':'libatk-bridge2.0-0t64','libatspi.so.0':'libatspi2.0-0t64',
  'libcairo.so.2':'libcairo2','libcups.so.2':'libcups2t64','libdbus-1.so.3':'libdbus-1-3','libdrm.so.2':'libdrm2','libgbm.so.1':'libgbm1',
  'libglib-2.0.so.0':'libglib2.0-0t64','libgobject-2.0.so.0':'libglib2.0-0t64','libgio-2.0.so.0':'libglib2.0-0t64','libgthread-2.0.so.0':'libglib2.0-0t64',
  'libgtk-3.so.0':'libgtk-3-0t64','libgdk-3.so.0':'libgtk-3-0t64','libnspr4.so':'libnspr4','libplc4.so':'libnspr4','libplds4.so':'libnspr4',
  'libnss3.so':'libnss3','libnssutil3.so':'libnss3','libsmime3.so':'libnss3','libpango-1.0.so.0':'libpango-1.0-0','libpangocairo-1.0.so.0':'libpangocairo-1.0-0',
  'libX11.so.6':'libx11-6','libX11-xcb.so.1':'libx11-xcb1','libxcb.so.1':'libxcb1','libXcomposite.so.1':'libxcomposite1','libXdamage.so.1':'libxdamage1',
  'libXext.so.6':'libxext6','libXfixes.so.3':'libxfixes3','libxkbcommon.so.0':'libxkbcommon0','libXrandr.so.2':'libxrandr2','libXrender.so.1':'libxrender1',
  'libXau.so.6':'libxau6','libXdmcp.so.6':'libxdmcp6','libxshmfence.so.1':'libxshmfence1','libudev.so.1':'libudev1','libexpat.so.1':'libexpat1',
  'libfontconfig.so.1':'libfontconfig1','libfreetype.so.6':'libfreetype6','libharfbuzz.so.0':'libharfbuzz0b','libpng16.so.16':'libpng16-16t64',
  'libicuuc.so.74':'libicu74','libicui18n.so.74':'libicu74','libicudata.so.74':'libicu74','libLLVM.so.19.1':'libllvm19',
  'libldap.so.2':'libldap2','liblber.so.2':'libldap2','libssl.so.3':'libssl3t64','libcrypto.so.3':'libssl3t64','liblz4.so.1':'liblz4-1','libzstd.so.1':'libzstd1',
  'libpam.so.0':'libpam0g','libgssapi_krb5.so.2':'libgssapi-krb5-2','libkrb5.so.3':'libkrb5-3','libk5crypto.so.3':'libk5crypto3','libkrb5support.so.0':'libkrb5support0',
  'libxml2.so.2':'libxml2','libxslt.so.1':'libxslt1.1','libreadline.so.8':'libreadline8t64','libsystemd.so.0':'libsystemd0','libuuid.so.1':'libuuid1',
  'libtinfo.so.6':'libtinfo6','libsasl2.so.2':'libsasl2-2','libedit.so.2':'libedit2','libffi.so.8':'libffi8','libz.so.1':'zlib1g',
};
export function missingRuntimePackages(output){
  const missing=[...String(output).matchAll(/^\s*(\S+)\s+=>\s+not found\s*$/gm)].map(match=>match[1]);
  const unknown=missing.filter(name=>!Object.hasOwn(libraryPackages,name));
  if(unknown.length)throw new Error('Unmapped missing runtime libraries; add a reviewed Ubuntu dependency: '+unknown.join(', '));
  return [...new Set(missing.map(name=>libraryPackages[name]))].sort();
}

async function privateApt(context,portableRoot,environment){
  const {toolsDirectory,run}=context,aptRoot=resolve(toolsDirectory,'apt'),keyring='/usr/share/keyrings/ubuntu-archive-keyring.gpg';
  await access(keyring,constants.R_OK);
  for(const child of ['state/lists/partial','cache/archives/partial','etc/parts','log'])await mkdir(resolve(aptRoot,child),{recursive:true});
  const sources=resolve(aptRoot,'etc/sources.list'),config=resolve(aptRoot,'etc/apt.conf');
  await writeFile(sources,['deb [arch=amd64 signed-by='+keyring+'] https://archive.ubuntu.com/ubuntu noble main universe',
    'deb [arch=amd64 signed-by='+keyring+'] https://archive.ubuntu.com/ubuntu noble-updates main universe',
    'deb [arch=amd64 signed-by='+keyring+'] https://security.ubuntu.com/ubuntu noble-security main universe'].join('\n')+'\n');
  const settings={'Dir::State':resolve(aptRoot,'state'),'Dir::State::status':'/var/lib/dpkg/status','Dir::Cache':resolve(aptRoot,'cache'),
    'Dir::Log':resolve(aptRoot,'log'),'Dir::Etc::sourcelist':sources,'Dir::Etc::sourceparts':'-',
    'Dir::Etc::parts':resolve(aptRoot,'etc/parts'),'Dir::Etc::main':config,'Debug::NoLocking':'true',
    'APT::Sandbox::User':userInfo().username,'Acquire::Languages':'none','Acquire::Retries':'2','APT::Get::List-Cleanup':'false'};
  // APT_CONFIG is read before system apt.conf.d. Command-line Dir overrides
  // alone arrive too late to prevent inherited system-cache cleanup hooks.
  await writeFile(config,Object.entries(settings).map(([key,value])=>key+' '+JSON.stringify(value)+';').join('\n')+'\n');
  const aptEnvironment={...environment,APT_CONFIG:config};
  const args=Object.entries(settings).flatMap(([key,value])=>['-o',key+'='+value]);
  // APT checks InRelease signatures using the image's Ubuntu archive keyring,
  // then verifies package hashes from that authenticated index before writing.
  await run('apt-get',[...args,'update'],{env:aptEnvironment});
  const extracted=new Set(),receipts=[];
  return {receipts,async extract(packages){
    await run('apt-get',[...args,'--download-only','--assume-yes','--no-install-recommends','--reinstall','install',...packages],{env:aptEnvironment});
    const directory=resolve(aptRoot,'cache/archives');
    for(const filename of (await readdir(directory)).filter(name=>name.endsWith('.deb')).sort()){
      if(extracted.has(filename))continue;
      const path=resolve(directory,filename),bytes=await readFile(path);
      await run('dpkg-deb',['--extract',path,portableRoot],{env:environment});extracted.add(filename);
      receipts.push({file:filename,sha256:sha(bytes),bytes:bytes.length,source:'Ubuntu Noble signed APT metadata',systemInstalled:false});
    }
  }};
}

export async function bootstrapCloudflareBuild(options={}){
  const context=await runtimeContext(options),{root,started,inspected,toolsDirectory,run,download}=context;
  const formal=await installFormalTools(context),portableRoot=resolve(toolsDirectory,'root');
  await mkdir(portableRoot,{recursive:true});
  const environment={...process.env,...formal.environment,
    LD_LIBRARY_PATH:[resolve(portableRoot,'usr/lib/x86_64-linux-gnu'),resolve(portableRoot,'lib/x86_64-linux-gnu')].join(':'),
    PATH:[resolve(portableRoot,'usr/bin'),process.env.PATH??''].join(':')};
  const postgresPackages=[];
  for(const item of pinned.postgres.packages){
    const path=resolve(toolsDirectory,'packages',new URL(item.url).pathname.split('/').at(-1));
    await download(item.url,path,item.sha256);await run('dpkg-deb',['--extract',path,portableRoot]);
    postgresPackages.push({name:item.name,version:item.version,sha256:item.sha256,systemInstalled:false});
  }
  const binaryDirectory=resolve(portableRoot,'usr/lib/postgresql/17/bin'),shareDirectory=resolve(portableRoot,'usr/share/postgresql/17');
  const postgresPath=resolve(binaryDirectory,'postgres');
  const archive=resolve(toolsDirectory,'chrome-'+pinned.chrome.version+'.zip');
  await download(pinned.chrome.url,archive,pinned.chrome.sha256);
  await run('unzip',['-q','-o',archive,'-d',toolsDirectory]);
  const chromePath=resolve(toolsDirectory,'chrome-linux64/chrome');
  const dynamicBinaries=[chromePath,postgresPath,...['initdb','pg_ctl','createdb','psql'].map(name=>resolve(binaryDirectory,name)),resolve(portableRoot,'usr/lib/postgresql/17/lib/llvmjit.so')];
  let apt=null;
  for(let round=0;round<4;round++){
    const linked=[];for(const binary of dynamicBinaries)linked.push((await run('ldd',[binary],{env:environment,log:()=>{}})).output);
    const packages=missingRuntimePackages(linked.join('\n'));
    if(!inspected.tools['fc-list'].available&&round===0)packages.push('fontconfig');
    if(!packages.length)break;
    if(round===3)throw new Error('Portable shared-library resolution did not converge: '+packages.join(', '));
    apt??=await privateApt(context,portableRoot,environment);await apt.extract(packages);
  }
  const chromeVersion=(await run(chromePath,['--version'],{env:environment})).output.trim();
  if(!chromeVersion.includes(pinned.chrome.version))throw new Error('Pinned full Chrome version mismatch');
  const fontDirectory=resolve(toolsDirectory,'fonts'),fontConfig=resolve(toolsDirectory,'fonts.conf');
  await mkdir(fontDirectory,{recursive:true});
  const fontPath=join(fontDirectory,'NotoSansCJKkr-Regular.otf');
  await download(pinned.font.url,fontPath,pinned.font.gitBlob,gitBlob);
  await download(pinned.font.licenseUrl,join(fontDirectory,'LICENSE'),pinned.font.licenseGitBlob,gitBlob);
  const xml=value=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
  const fontCache=resolve(toolsDirectory,'font-cache');await mkdir(fontCache,{recursive:true});
  await writeFile(fontConfig,'<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><include ignore_missing="yes">/etc/fonts/fonts.conf</include><dir>'+xml(fontDirectory)+'</dir><cachedir>'+xml(fontCache)+'</cachedir></fontconfig>\n');
  environment.FONTCONFIG_FILE=fontConfig;
  await run('fc-cache',['-f',fontDirectory],{env:environment});
  const koreanFonts=await run('fc-list',[':lang=ko','file'],{env:environment,log:()=>{}});
  if(!koreanFonts.output.includes(fontPath))throw new Error('The pinned Korean font is not registered with fontconfig');
  const postgresVersion=(await run(postgresPath,['--version'],{env:environment})).output.trim();
  if(!postgresVersion.includes(' '+pinned.postgres.version+' '))throw new Error('Expected exact PostgreSQL17.11 server');
  const childEnvironment={ATLAS_BROWSER_PATH:chromePath,...formal.environment,LD_LIBRARY_PATH:environment.LD_LIBRARY_PATH,PATH:environment.PATH,FONTCONFIG_FILE:fontConfig};
  return {environment:childEnvironment,postgres:{binaryDirectory,shareDirectory},
    receipt:{...inspected,gateStatus:'READY',targetRuntimeVerified:true,completedAt:new Date().toISOString(),
      portable:true,systemPackagesModified:false,dependencyPackages:apt?.receipts??[],
      chrome:{path:chromePath,version:chromeVersion,archiveSha256:pinned.chrome.sha256,mode:'full Chrome --headless=new'},
      font:{path:fontPath,gitBlob:pinned.font.gitBlob,licenseGitBlob:pinned.font.licenseGitBlob},
      java:formal.java,tlc:formal.tlc,
      postgres:{path:postgresPath,version:postgresVersion,packages:postgresPackages,databaseVerified:false},durationMs:Date.now()-started}};
}

const allocatePostgresPort=()=>new Promise((accept,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):accept(port));});});

export async function startIsolatedPostgres({log=()=>{},binaryDirectory='/usr/lib/postgresql/17/bin',shareDirectory=null,environment=process.env,runCommand=runRuntimeCommand,allocatePort=allocatePostgresPort}={}){
  const directory=await mkdtemp(join(tmpdir(),'atlas-cloudflare-pg-'));
  const isRoot=process.getuid?.()===0;
  const run=(binary,args,{log:commandLog=log}={})=>runCommand(isRoot?'runuser':join(binaryDirectory,binary),isRoot?['-u','postgres','--',join(binaryDirectory,binary),...args]:args,{env:environment,log:commandLog,timeout:60000});
  let running=false;
  const cleanup=async({log:cleanupLog=log}={})=>{
    if(running){await run('pg_ctl',['-D',join(directory,'data'),'-m','fast','-w','stop'],{log:cleanupLog});running=false;}
    await rm(directory,{recursive:true,force:true});
  };
  try{
    if(isRoot)await runCommand('chown',['postgres:postgres',directory],{log});
    await run('initdb',['-D',join(directory,'data'),...(shareDirectory?['-L',shareDirectory]:[]),'-U','atlas','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale']);
    const port=await allocatePort();
    if(!Number.isInteger(port)||port<1||port>65535)throw new Error('The isolated PostgreSQL port is invalid');
    await run('pg_ctl',['-D',join(directory,'data'),'-l',join(directory,'server.log'),'-o','-h 127.0.0.1 -p '+port+' -k '+directory,'-w','start']);running=true;
    await run('createdb',['-h','127.0.0.1','-p',String(port),'-U','atlas','atlas_market_lab']);
    const result=await run('psql',['-h','127.0.0.1','-p',String(port),'-U','atlas','-d','atlas_market_lab','-A','-t','-c','SHOW server_version_num']);
    if(result.output.trim()!=='170011')throw new Error('The live PostgreSQL server differs from pinned17.11');
    return {url:'postgresql://atlas@127.0.0.1:'+port+'/atlas_market_lab',port,serverVersion:'17.11',cleanup};
  }catch(error){
    try{await cleanup();}catch(cleanupError){throw new AggregateError([error,cleanupError],'PostgreSQL startup and cleanup failed',{cause:error});}
    throw error;
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);if(args.length!==1||!['--inspect','--install','--verify-runtime','--formal'].includes(args[0]))throw new Error('Use --inspect, --install, --verify-runtime or --formal');
    const log=text=>process.stdout.write(text);let receipt;
    if(args[0]==='--inspect')receipt=await inspectCloudflareRuntime();
    else if(args[0]==='--formal')receipt=(await bootstrapCloudflareFormal({log})).receipt;
    else{
      const runtime=await bootstrapCloudflareBuild({log});receipt=runtime.receipt;
      if(args[0]==='--verify-runtime'){
        const database=await startIsolatedPostgres({log,...runtime.postgres,environment:{...process.env,...runtime.environment}});
        try{receipt.postgres.databaseVerified=true;receipt.postgres.serverVersion=database.serverVersion;}
        finally{await database.cleanup();}
        receipt.gateStatus='RUNTIME_VERIFIED';receipt.databaseCleanedUp=true;receipt.completedAt=new Date().toISOString();
      }
    }
    await mkdir(resolve(repositoryRoot,'build'),{recursive:true});
    await writeFile(resolve(repositoryRoot,'build/cloudflare-preflight.json'),JSON.stringify(receipt,null,2)+'\n');
    console.log('ATLAS_CLOUDFLARE_PREFLIGHT '+JSON.stringify(receipt));
  }catch(error){console.error(error.stack??error);process.exitCode=1;}
}
