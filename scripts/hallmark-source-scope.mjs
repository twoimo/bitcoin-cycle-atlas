import assert from 'node:assert/strict';

export function countHallmarkSources(files){
  return {css:files.filter(path=>path.endsWith('.css')).length,html:files.filter(path=>path.endsWith('.html')).length};
}

export function verifyHallmarkSourceScope(baselineFiles,currentFiles){
  const baseline=countHallmarkSources(baselineFiles),current=countHallmarkSources(currentFiles);
  assert.deepEqual(baseline,{css:24,html:2},'Pinned baseline inventory changed');
  const currentPaths=new Set(currentFiles);
  const required=baselineFiles.filter(path=>path.endsWith('.css')||path.endsWith('.html'));
  const missing=required.filter(path=>!currentPaths.has(path));
  assert.deepEqual(missing,[],'Current source must keep every baseline screen/style path: '+missing.join(', '));
  return {baseline,current,preservedBaselinePaths:required};
}
