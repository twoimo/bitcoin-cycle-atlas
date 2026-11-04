import { readFile } from 'node:fs/promises';
import { createPool } from '../../api/src/repository.js';
import { migrateThemes,publishThemes } from '../../api/src/theme-repository.js';
const [command,path]=process.argv.slice(2);if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');if(!['migrate','import'].includes(command)||command==='import'&&!path)throw new Error('Usage: themes.ts migrate | import <snapshot>');
const pool=createPool(process.env.DATABASE_URL);try{if(command==='migrate'){await migrateThemes(pool);console.log('Themes migrated');}else console.log(JSON.stringify(await publishThemes(pool,JSON.parse(await readFile(path,'utf8')))));}finally{await pool.end();}
