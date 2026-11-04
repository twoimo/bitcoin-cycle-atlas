/** An IDB read/write transaction serializes concurrent writers under the same request key. */
export function createMonthlyBacktestStore(factory=globalThis.indexedDB){
  if(!factory?.open)throw new Error('월말 고정본을 보존할 브라우저 저장소를 사용할 수 없습니다.');
  function action(key,value){
    if(!/^[a-f0-9]{64}$/.test(key))return Promise.reject(new TypeError('Invalid monthly request key'));
    return new Promise((resolve,reject)=>{
      let db,transaction,result,done=false;
      const finish=error=>{if(done)return;done=true;clearTimeout(timer);db?.close();error?reject(error):resolve(result);};
      const timer=setTimeout(()=>{try{transaction?.abort();}catch{}finish(new Error('월말 고정본 저장 응답이 지연됐습니다. 다시 확인하면 수락된 기록부터 복원합니다.'));},15000);
      let opening;try{opening=factory.open('atlas-monthly-backtests',1);}catch(error){finish(error);return;}
      opening.onupgradeneeded=()=>{if(!opening.result.objectStoreNames.contains('forecasts'))opening.result.createObjectStore('forecasts');};
      opening.onerror=()=>finish(opening.error??new Error('월말 저장소를 열지 못했습니다.'));
      opening.onblocked=()=>finish(new Error('다른 탭이 월말 저장소를 사용 중입니다.'));
      opening.onsuccess=()=>{
        db=opening.result;if(done){db.close();return;}
        try{
          transaction=db.transaction('forecasts',value===undefined?'readonly':'readwrite');
          const store=transaction.objectStore('forecasts'),read=store.get(key);
          read.onsuccess=()=>{result=read.result;if(result===undefined&&value!==undefined){store.add(value,key);result=value;}};
          transaction.oncomplete=()=>finish();transaction.onabort=transaction.onerror=()=>finish(transaction.error??new Error('월말 고정본 저장이 실패했습니다. 기존 기록은 유지됩니다.'));
        }catch(error){finish(error);}
      };
    });
  }
  return {get:key=>action(key),putIfAbsent:(key,value)=>action(key,value)};
}
