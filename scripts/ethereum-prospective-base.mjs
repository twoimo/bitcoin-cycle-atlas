import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseEthArchive} from '../dist/eth-market-data.js';
import {ETH_PROSPECTIVE_PRICE_POLICY} from '../dist/ethereum-prospective-prices.js';
import {normalizeForecastTimestamp} from '../dist/forecast-information-time.js';

export const ETH_COMMITTED_BASE_POLICY=Object.freeze({
  version:'eth-current-committed-base-1',
  path:ETH_PROSPECTIVE_PRICE_POLICY.basePath,
  maximumBytes:ETH_PROSPECTIVE_PRICE_POLICY.maximumBaseBytes,
  acceptsDirtyWorkingCopy:false,automaticallyRefreshesBase:false,
  historicalProviderAuthenticityProven:false,
});
const HEX40=/^[a-f0-9]{40}$/;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const blob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');

/** A new, explicitly committed archive can be consumed without changing the
 * frozen price-model source graph. This validates its exact Git membership and
 * clocks, not the provider's historical authenticity or a future refresh. */
export function validateEthereumCommittedBase({workingBytes,committedBytes,sourceCommit,sourceTree,
  gitBlobSha,path=ETH_COMMITTED_BASE_POLICY.path,mode='100644',collectedAt}={}){
  const policy=ETH_COMMITTED_BASE_POLICY;
  if(!HEX40.test(sourceCommit)||!HEX40.test(sourceTree)||!HEX40.test(gitBlobSha))throw new TypeError('Exact committed base identities required');
  if(path!==policy.path||mode!=='100644')throw new TypeError('Expected the regular committed ETH base path');
  if(!Buffer.isBuffer(workingBytes)||!Buffer.isBuffer(committedBytes)||!workingBytes.length||
    workingBytes.length>policy.maximumBytes||committedBytes.length>policy.maximumBytes)
    throw new RangeError('Bounded nonempty committed base bytes required');
  if(!workingBytes.equals(committedBytes))throw new Error('Working ETH base differs from the exact committed blob');
  if(blob(committedBytes)!==gitBlobSha)throw new Error('Committed ETH base Git blob hash mismatch');
  const text=committedBytes.toString('utf8');
  if(!Buffer.from(text,'utf8').equals(committedBytes))throw new TypeError('Lossless UTF-8 ETH base required');
  const at=normalizeForecastTimestamp(collectedAt,'base.collectedAt');
  const archive=parseEthArchive(JSON.parse(text));
  if(Date.parse(archive.retrievedAt)>Date.parse(at)||archive.requestedEnd*1000>Date.parse(at))
    throw new RangeError('Committed ETH base cannot contain future acquisition or observation clocks');
  return {base:{text,sourceCommit,gitBlobSha,collectedAt:at},
    receipt:{policy:policy.version,path,mode,sourceCommit,sourceTree,gitBlobSha,
      bytes:committedBytes.length,sha256:sha(committedBytes),collectedAt:at,
      archiveRetrievedAt:archive.retrievedAt,requestedStart:archive.requestedStart,requestedEnd:archive.requestedEnd,
      firstDate:archive.firstDate,lastDate:archive.lastDate,candles:archive.candles.length,
      sourceUrl:'https://github.com/twoimo/bitcoin-cycle-atlas/blob/'+sourceCommit+'/'+path,
      exactCommittedBytes:true,workingCopyMatched:true,automaticallyRefreshed:false,
      historicalProviderAuthenticityProven:false,
      limitation:'A reviewed committed base can roll forward without changing model code. This reader neither refreshes that base nor authenticates historical provider publication.'}};
}

export async function readEthereumCommittedBase({repositoryRoot,sourceCommit,sourceTree,clock=()=>new Date().toISOString()}={}){
  if(typeof repositoryRoot!=='string'||!isAbsolute(repositoryRoot)||!HEX40.test(sourceCommit)||!HEX40.test(sourceTree))
    throw new TypeError('Absolute repository root and exact source commit/tree required');
  const root=await realpath(repositoryRoot),path=ETH_COMMITTED_BASE_POLICY.path;
  const git=args=>execFileSync('git',args,{cwd:root,timeout:10000,maxBuffer:ETH_COMMITTED_BASE_POLICY.maximumBytes+65536});
  if(git(['rev-parse',sourceCommit+'^{tree}']).toString('utf8').trim()!==sourceTree)
    throw new Error('Committed ETH base source tree mismatch');
  const listing=git(['ls-tree',sourceCommit,'--',path]).toString('utf8');
  const entry=listing.match(/^([0-7]{6}) blob ([a-f0-9]{40})\t([^\r\n]+)\n$/);
  if(!entry||entry[1]!=='100644'||entry[3]!==path)throw new Error('ETH base must be one regular committed Git blob');
  const file=resolve(root,path),info=await lstat(file),actual=await realpath(file),location=relative(root,actual);
  if(!info.isFile()||info.isSymbolicLink()||location.startsWith('..')||isAbsolute(location)||info.size>ETH_COMMITTED_BASE_POLICY.maximumBytes)
    throw new Error('ETH base must be a bounded regular file inside the repository');
  const [workingBytes,committedBytes]=await Promise.all([readFile(actual),Promise.resolve(git(['cat-file','blob',entry[2]]))]);
  const collectedAt=clock();
  return validateEthereumCommittedBase({workingBytes,committedBytes,sourceCommit,sourceTree,gitBlobSha:entry[2],path,mode:entry[1],collectedAt});
}
