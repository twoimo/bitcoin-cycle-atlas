import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {canonicalRetiredPageEntry,canonicalNativeChartEntry,canonicalWorkspaceChartEntry} from '../dist/atlas-navigation.js';
import {parseComparisonUrl} from '../dist/comparison-url-state.js';
import {redirects} from '../scripts/cloudflare-artifact.mjs';

const at=href=>{const url=new URL(href,'https://atlas.example.com');return {protocol:url.protocol,pathname:url.pathname,search:url.search,hash:url.hash};};

test('saved conference links open the price chart without the player parameters',()=>{
  for(const [href,expected] of [
    ['/?page=conference&t=0&deck=final-290','/'],
    ['/?page=conference','/'],
    ['/?deck=r17-257&page=conference&t=3725','/'],
    ['/?page=conference&t=12&theme=dark#top','/?theme=dark#top'],
    ['/bitcoin-cycle-atlas/?page=conference&deck=final-290','/bitcoin-cycle-atlas/'],
  ]){
    const entry=canonicalRetiredPageEntry(at(href));
    assert.equal(entry,expected,href);
    assert.equal(parseComparisonUrl(new URL(entry,'https://atlas.example.com').search).view,'outlook',href+' parses to the price chart');
    assert.equal(canonicalNativeChartEntry(at(entry)),null,href+' stays on the root chart shell');
    assert.equal(canonicalWorkspaceChartEntry(at(entry)),null,href+' stays on the root chart shell');
  }
});

test('the redirect leaves live destinations and their own parameters alone',()=>{
  for(const href of ['/','/?page=outlook&t=4','/?page=relay','/?page=evidence&deck=x','/?page=data','/market-lab/'])
    assert.equal(canonicalRetiredPageEntry(at(href)),null,href);
});

test('a conference link that reaches the app without the redirect still renders the price chart',()=>{
  assert.equal(parseComparisonUrl('?page=conference&t=0&deck=final-290').view,'outlook');
});

test('the deployed site redirects every conference path to the chart',()=>{
  const rules=redirects.trim().split('\n').map(line=>line.split(' '));
  const resolve=path=>{
    for(const [source,destination,code] of rules){
      const splat=source.endsWith('/*')&&path.startsWith(source.slice(0,-1))?path.slice(source.length-1):null;
      if(source===path||splat!==null)return {location:destination.replace(':splat',splat??''),code};
    }
    return null;
  };
  const follow=path=>{for(let hops=0,next;hops<4&&(next=resolve(path));hops++)path=next.location;return path;};
  for(const path of ['/conference','/conference/','/conference/timeline.json','/conference/player.js','/bitcoin-cycle-atlas/conference/']){
    assert.equal(resolve(path)?.code,'301',path+' is a permanent redirect');
    assert.equal(follow(path),'/',path+' lands on the chart');
  }
  for(const path of ['/','/market-lab/','/conferences'])assert.equal(resolve(path),null,path+' is served as is');
  const files=execFileSync('git',['ls-files','dist'],{cwd:new URL('..',import.meta.url),encoding:'utf8'}).trim().split('\n');
  assert.ok(files.length>1000,'the deployed file list is read from git');
  for(const file of files)assert.equal(resolve(file.slice('dist'.length)),null,file+' is served as is');
});
