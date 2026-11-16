export function withRequestTimeout(request,message,{signal,timeoutMs=15000}={}){
  const controller=new AbortController();
  let timer;
  const stopped=new Promise((_,reject)=>{
    const stop=reason=>{controller.abort();reject(reason);};
    timer=setTimeout(()=>stop(new Error(message)),timeoutMs);
    signal?.addEventListener('abort',()=>stop(signal.reason),{once:true});
  });
  return Promise.race([Promise.resolve().then(()=>request({signal:controller.signal})),stopped]).finally(()=>clearTimeout(timer));
}
