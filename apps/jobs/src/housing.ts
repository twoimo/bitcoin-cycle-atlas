import { readFile } from 'node:fs/promises';
import { createPool,migrate } from '../../api/src/db.js';
import { publishHousing } from '../../api/src/housing-repository.js';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
const [command,path]=process.argv.slice(2);
if(!['migrate','import'].includes(command)||command==='import'&&!path)throw new Error('Usage: housing.ts migrate | import <snapshot>');
const pool=createPool(process.env.DATABASE_URL);
try{if(command==='migrate'){await migrate(pool,['002_housing']);console.log('Housing migrated');}else console.log(JSON.stringify(await publishHousing(pool,JSON.parse(await readFile(path,'utf8')))));}finally{await pool.end();}
