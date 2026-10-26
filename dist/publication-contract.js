const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
function identity(sourceCommit, digest) {
  if (!COMMIT.test(sourceCommit) || !HASH.test(digest)) throw new TypeError('Publication requires exact source and content identities');
}
export function createPublication({sourceCommit, digest}) {
  identity(sourceCommit, digest);
  return Object.freeze({phase:'collected',sourceCommit,digest,validatedDigest:null,servedDigest:null,servedCommit:null,reason:null});
}
export function validatePublication(state, {checkedDigest, valid}) {
  if (state.phase!=='collected') throw new Error('Only a collected candidate can be validated');
  identity(state.sourceCommit, checkedDigest);
  if (valid!==true || checkedDigest!==state.digest) return Object.freeze({...state,phase:'held',reason:'validation-failed'});
  return Object.freeze({...state,phase:'verified',validatedDigest:checkedDigest});
}
export function preparePublication(state, {currentCommit, currentDigest}) {
  if (state.phase!=='verified') throw new Error('Only verified content can be prepared');
  identity(currentCommit, currentDigest);
  if (currentCommit!==state.sourceCommit) return Object.freeze({...state,phase:'superseded',reason:'source-changed'});
  if (currentDigest!==state.digest || state.validatedDigest!==state.digest) return Object.freeze({...state,phase:'held',reason:'content-changed'});
  return Object.freeze({...state,phase:'ready'});
}
export function confirmPublication(state, {servedCommit, servedDigest}) {
  if (state.phase!=='ready') throw new Error('Only prepared content can be confirmed');
  identity(servedCommit, servedDigest);
  if (servedCommit!==state.sourceCommit || servedDigest!==state.digest) return Object.freeze({...state,phase:'held',reason:'served-content-mismatch'});
  return Object.freeze({...state,phase:'confirmed',servedCommit,servedDigest});
}
