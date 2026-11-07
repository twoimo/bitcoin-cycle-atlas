import assert from 'node:assert/strict';

const blobId=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function project(options){
  const origin=new URL(options.origin).origin,root=options.projectRoot;
  assert.equal(options.origin,origin,'The browser resource owner must be an exact origin');
  assert.ok(typeof root==='string'&&root.startsWith('/')&&root.endsWith('/'),'An explicit project path prefix is required');
  return {origin,root};
}

function projectDocument(value,{origin,root}){
  try{const url=new URL(value);return url.origin===origin&&url.pathname.startsWith(root)&&['http:','https:'].includes(url.protocol);}
  catch{return false;}
}

/** Blob URLs identify browser-held bytes, not a server path. Only image GETs
 * from a project document can be candidates, and candidates still require the
 * observed export-link/frame check below before the browser case may pass. */
export function classifyProjectBrowserResource(request,options){
  const owner=project(options),url=new URL(request.url);
  if(url.origin!==owner.origin)return 'external';
  if(['http:','https:'].includes(url.protocol)&&url.pathname.startsWith(owner.root))return 'project';
  const prefix=owner.origin+'/';
  if(url.protocol==='blob:'&&request.resourceType==='Image'&&request.method==='GET'&&!url.search&&!url.hash
    &&url.pathname.startsWith(prefix)&&blobId.test(url.pathname.slice(prefix.length))
    &&typeof request.frameId==='string'&&request.frameId.length>0&&projectDocument(request.documentUrl,owner))return 'generated-image-candidate';
  return 'outside-project';
}

export function verifyProjectGeneratedImages(requests,exports,options){
  assert.ok(Array.isArray(requests)&&Array.isArray(exports),'Generated image observations are required');
  const owner=project(options);
  return requests.map(request=>{
    assert.equal(classifyProjectBrowserResource(request,options),'generated-image-candidate','A non-image or unowned resource cannot use the export exception');
    // History-based instrument routes can update a document URL without
    // replacing its frame. Both URLs must stay in the project; the exact blob
    // link and frame identity bind the request to the observed export.
    const matches=exports.filter(exported=>exported.frameId===request.frameId
      &&projectDocument(exported.documentUrl,owner)&&[exported.svgUrl,exported.pngUrl].includes(request.url));
    assert.equal(matches.length,1,'Generated image must match one actual project export link and its document/frame owner: '+JSON.stringify(request));
    const exported=matches[0];
    assert.ok([exported.svgUrl,exported.pngUrl].includes(exported.previewSrc),'Export preview must use its observed SVG/PNG blob');
    return {...request,symbol:exported.symbol,format:request.url===exported.svgUrl?'svg':'png',exportDocumentUrl:exported.documentUrl,
      ownership:'observed-project-export-link-and-frame'};
  });
}
