import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('./',import.meta.url));
const temp=fileURLToPath(new URL('./test-temp/',import.meta.url));
mkdirSync(temp,{recursive:true});
const result=spawnSync(process.execPath,['node_modules/@angular/cli/bin/ng.js','test',...process.argv.slice(2)],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,TEMP:temp,TMP:temp,TMPDIR:temp}});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
