import {createPool,migrate} from '../../api/src/repository.js';
import {migrateUsCollection,runUsCollection} from '../../api/src/us-collector.js';
const [command,...extra]=process.argv.slice(2);
if(!['migrate','collect'].includes(command)||extra.length)throw new Error('Usage: us-market.ts migrate | collect');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
const pool=createPool(process.env.DATABASE_URL);
try {
  await migrate(pool);await migrateUsCollection(pool);
  if(command==='migrate')console.log(JSON.stringify({status:'migrated'}));
  else {const result=await runUsCollection(pool,{force:true});console.log(JSON.stringify(result));if(result.status==='failed')process.exitCode=1;}
} finally {await pool.end();}
