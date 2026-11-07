import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyProjectBrowserResource,verifyProjectGeneratedImages} from '../scripts/browser-project-resource-policy.mjs';

const origin='http://127.0.0.1:34729',projectRoot='/bitcoin-cycle-atlas/';
const options={origin,projectRoot};
const documentUrl=origin+projectRoot+'market-lab/charts/?symbol=HYPE&embedded=1';
const svgUrl='blob:'+origin+'/7137d8b6-0981-45ef-8d4a-eacbd7ce685f';
const pngUrl='blob:'+origin+'/461a455c-7274-413e-8146-827a39d433db';
const request=(url=svgUrl)=>({requestId:'123.45',url,origin,method:'GET',resourceType:'Image',frameId:'FRAME-EXPORT',loaderId:'LOADER-EXPORT',documentUrl,initiator:{type:'script'}});
const exported=()=>({symbol:'HYPE',frameId:'FRAME-EXPORT',documentUrl,svgUrl,pngUrl,previewSrc:pngUrl,previewComplete:true,previewWidth:320,previewHeight:400});

test('SVG rasterization and PNG preview blobs must match actual project export links in their owning frame',()=>{
  const requests=[request(svgUrl),request(pngUrl)],exports=[exported()];
  for(const item of requests)assert.equal(classifyProjectBrowserResource(item,options),'generated-image-candidate');
  const verified=verifyProjectGeneratedImages(requests,exports,options);
  assert.deepEqual(verified.map(item=>item.format),['svg','png']);
  assert.ok(verified.every(item=>item.symbol==='HYPE'&&item.ownership==='observed-project-export-link-and-frame'));
  assert.equal(verified[0].url,svgUrl);assert.equal(verified[0].documentUrl,documentUrl);assert.equal(verified[0].origin,origin);
  assert.deepEqual(verified[0].initiator,{type:'script'});
  assert.deepEqual(requests,[request(svgUrl),request(pngUrl)],'Policy verification cannot rewrite captured network events');
});

test('ordinary project resources remain scoped, and every same-origin network escape still fails',()=>{
  for(const resourceType of ['Image','Script','Document','Fetch','XHR','Stylesheet','Font']){
    assert.equal(classifyProjectBrowserResource({...request(origin+projectRoot+'assets/chart.js'),resourceType},options),'project');
    for(const path of ['/assets/chart.js','/market-lab/charts/','/bitcoin-cycle-atlas-escape/image.png','/bitcoin-cycle-atlas/%2e%2e/image.png'])
      assert.equal(classifyProjectBrowserResource({...request(origin+path),resourceType},options),'outside-project',resourceType+' '+path);
  }
  assert.equal(classifyProjectBrowserResource(request('https://example.com/image.png'),options),'external','External network handling remains with the existing network/error guards');
});

test('blob scripts, documents, fetches, invalid URLs and non-project owners cannot use the image exception',()=>{
  for(const patch of [
    ...['Script','Document','Fetch','XHR','Other','Media','Font','Stylesheet'].map(resourceType=>({resourceType})),
    {method:'POST'},{method:'HEAD'},{method:undefined},{frameId:''},{documentUrl:undefined},
    {documentUrl:origin+'/'},{documentUrl:'https://example.com'+projectRoot+'charts/'},{documentUrl:origin+'/bitcoin-cycle-atlas-other/'},
    {url:svgUrl+'?x=1'},{url:svgUrl+'#fragment'},{url:'blob:'+origin+'/not-generated-uuid'},
    {url:'blob:'+origin+projectRoot+'image.png'},{url:'blob:'+origin+'/7137d8b6-0981-45ef-8d4a-eacbd7ce685f/extra'},
  ]){
    const item={...request(),...patch};assert.equal(classifyProjectBrowserResource(item,options),'outside-project',JSON.stringify(patch));
    assert.throws(()=>verifyProjectGeneratedImages([item],[exported()],options));
  }
  for(const url of ['blob:null/7137d8b6-0981-45ef-8d4a-eacbd7ce685f','blob:http://127.0.0.1:34730/7137d8b6-0981-45ef-8d4a-eacbd7ce685f'])
    assert.throws(()=>verifyProjectGeneratedImages([request(url)],[exported()],options));
});

test('even a plausible same-origin image blob fails without its exact observed export URL and frame',()=>{
  for(const exports of [[],[{...exported(),frameId:'OTHER-FRAME'}],[{...exported(),svgUrl:pngUrl}],
    [{...exported(),documentUrl:origin+'/outside/'}],[{...exported(),previewSrc:origin+'/external-preview.png'}],
    [exported(),exported()],
  ])assert.throws(()=>verifyProjectGeneratedImages([request()],exports,options));
  const unknown=request('blob:'+origin+'/dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  assert.equal(classifyProjectBrowserResource(unknown,options),'generated-image-candidate');
  assert.throws(()=>verifyProjectGeneratedImages([unknown],[exported()],options),/must match one actual project export/);
});

test('same-document instrument history changes retain scoped ownership without admitting another frame or root',()=>{
  const exportOwner={...exported(),documentUrl:origin+projectRoot+'market-lab/charts/?symbol=HYPE&tab=export'};
  assert.equal(verifyProjectGeneratedImages([request()],[exportOwner],options).length,1);
  assert.throws(()=>verifyProjectGeneratedImages([{...request(),documentUrl:origin+'/outside/'}],[exportOwner],options));
});
