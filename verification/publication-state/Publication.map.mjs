export const readerActions=['Validate','Prepare','Confirm'];
export function state(v){
  const states={collected:'공개 후보 수집',verified:'내용 검증 완료',held:'불일치로 보류',superseded:'기준 코드 변경 · 후보 폐기',ready:'확인한 묶음 준비',confirmed:'공개 식별자 확인'};
  if(['ready','confirmed'].includes(v.phase)&&v.preparedCommit!==0)return '이전 코드 후보가 준비됨';
  if(['ready','confirmed'].includes(v.phase)&&v.preparedDigest!==0)return '변경된 파일이 준비됨';
  if(v.phase==='confirmed'&&(v.servedCommit!==0||v.servedDigest!==0))return '다른 공개물을 확인으로 오인';
  return states[v.phase]+(v.currentCommit===1&&['collected','verified'].includes(v.phase)?' · 코드 변경':'')+(v.currentDigest===1&&['collected','verified'].includes(v.phase)?' · 파일 변경':'');
}
export function step(action){return {Validate:'파일 묶음 검증',Reject:'자료 계약 위반',Prepare:'발행 직전 코드·파일 대조',Confirm:'실제 공개 식별자 대조',ChangeSource:'기준 코드 변경',ChangeFiles:'후보 파일 변경'}[action]||action;}
export function cause(v){if(v.preparedCommit!==0)return '코드 판본 확인 누락';if(v.preparedDigest!==0)return '검증 후 파일 해시 확인 누락';return '공개 응답 식별자 확인 누락';}
