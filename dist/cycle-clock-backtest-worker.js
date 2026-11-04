import {buildCycleClockBacktest} from './cycle-clock-backtest.js';
self.onmessage=({data})=>{
  const {id,revision,dataset,options}=data;
  try{self.postMessage({id,revision,status:'ready',model:buildCycleClockBacktest(dataset,options)});}
  catch(error){self.postMessage({id,revision,status:'error',error:error.message??String(error)});}
};
