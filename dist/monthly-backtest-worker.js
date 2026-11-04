import {createCutoffBacktestForecast} from './replay-cutoff-forecast.js';
self.onmessage=async({data})=>{
  const {id,revision,dataset}=data;
  try{const model=await createCutoffBacktestForecast(dataset);self.postMessage({id,revision,status:'ready',model});}
  catch(error){self.postMessage({id,revision,status:'error',error:error.message??String(error)});}
};
