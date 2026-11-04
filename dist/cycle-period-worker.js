import {buildLongHorizonForecast} from './long-horizon-forecast.js';
import {calculateCyclePeriodSensitivity} from './cycle-period-comparison.js';
self.onmessage=event=>{
  const {id,revision,dataset,options}=event.data??{};
  try{self.postMessage({id,revision,status:'ready',model:calculateCyclePeriodSensitivity(dataset,options,{buildForecast:buildLongHorizonForecast})});}
  catch(error){self.postMessage({id,revision,status:'error',error:error.message||String(error)});}
};
