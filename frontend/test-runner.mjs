import {mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const temp=path.resolve('.test-temp');mkdirSync(temp,{recursive:true});
const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,TEMP:temp,TMP:temp,TMPDIR:temp}});
process.exit(result.status??1);
