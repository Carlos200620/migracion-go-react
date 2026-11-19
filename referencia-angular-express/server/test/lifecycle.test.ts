import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type {Pool} from 'pg';
import {createAdminRouter,type AdminStore} from '../src/admin.js';
import {createProjectLifecycle,flushDeletion} from '../src/project-lifecycle.js';
import {ProjectError} from '../src/student.js';

test('Acciones administrativas exigen rol, motivo y versión; transmiten el actor de sesión',async()=>{
 const calls:unknown[][]=[];
 const store:AdminStore={async summary(){return{};},async list(){return[];},async get(){return undefined;},async document(){return undefined;},downloadPath(){return'';},async review(){},async categories(){return[];},async saveCategory(){return{};},async setCategoryActive(){return{};},async history(){return[];},async lifecycle(...args){calls.push(args);return{cleanupPending:false};}};
 const app=express();app.use(express.json());app.use('/api/admin',(req,res,next)=>{res.locals['user']={id:17,role:req.header('x-role')??'student'};next();},createAdminRouter(store));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const {port}=server.address() as {port:number};
 const send=(body:unknown,role='admin')=>fetch(`http://127.0.0.1:${port}/api/admin/projects/1/lifecycle`,{method:'POST',headers:{'Content-Type':'application/json','x-role':role},body:JSON.stringify(body)});
 try{
  assert.equal((await send({action:'delete',reason:'Duplicado',version:'v1',confirmation:'Informe'},'student')).status,403);
  assert.equal((await send({action:'withdraw',reason:' ',version:'v1'})).status,400);
  assert.equal((await send({action:'delete',reason:'Duplicado',version:'v1'})).status,400);
  assert.equal((await send({action:'restore',reason:'Corregido'})).status,400);assert.equal(calls.length,0);
  assert.equal((await send({action:'withdraw',reason:'Publicado por error',version:'v1',actorId:999})).status,200);
  assert.deepEqual(calls[0],[1,17,'withdraw','Publicado por error','v1',undefined]);
 }finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
});

function fixture(status='approved',failRemove=false){
 const calls:{sql:string;values?:unknown[]}[]=[];let deleted=false,job=false;let removes=0;let failure=failRemove;
 const client={async query(sql:string,values?:unknown[]){calls.push({sql,values});
  if(sql.startsWith('SELECT id,title,status'))return{rows:deleted?[]:[{id:1,title:'Informe',status,version:'v1'}]};
  if(sql.startsWith('SELECT full_name'))return{rows:[{full_name:'Administrador'}]};
  if(sql.startsWith('SELECT storage_key FROM documents'))return{rows:[{storage_key:'11111111-1111-4111-8111-111111111111.pdf'}]};
  if(sql.startsWith('INSERT INTO pending_file_deletions'))job=true;
  if(sql.startsWith('DELETE FROM projects'))deleted=true;
  if(sql.startsWith('SELECT storage_key FROM pending_file_deletions'))return{rows:job?[{storage_key:'key'}]:[]};
  if(sql.startsWith('SELECT id FROM documents'))return{rows:deleted?[]:[{id:1}]};
  if(sql.startsWith('DELETE FROM pending_file_deletions'))job=false;
  return{rows:[]};},release(){}};
 const pool={async connect(){return client;},query:client.query} as unknown as Pool;
 const io={async exists(){},async remove(){assert.ok(calls.some(c=>c.sql==='COMMIT'));removes++;if(failure)throw new Error('Archivo bloqueado');}};
 return{pool,io,calls,get removes(){return removes;},setFailure(value:boolean){failure=value;}};
}
test('Retiro/restauración registran auditoría y bloquean estados o versiones incompatibles',async()=>{
 for(const [status,action] of [['approved','withdraw'],['withdrawn','restore']] as const){
  const f=fixture(status);await createProjectLifecycle(f.pool,f.io).run(1,17,action,'Motivo','v1');
  const audit=f.calls.find(c=>c.sql.startsWith('INSERT INTO project_events'));assert.deepEqual(audit?.values,[1,'Informe',17,'Administrador',action,status,'Motivo']);
  const update=f.calls.find(c=>c.sql.startsWith('UPDATE projects'));assert.equal(update?.values?.[0],action==='withdraw'?'withdrawn':'approved');assert.equal(f.removes,0);
 }
 const f=fixture('approved');const service=createProjectLifecycle(f.pool,f.io);
 await assert.rejects(service.run(1,17,'restore','Motivo','v1'),e=>e instanceof ProjectError&&e.status===409);
 await assert.rejects(service.run(1,17,'withdraw','Motivo','obsoleta'),e=>e instanceof ProjectError&&e.status===409);
 await assert.rejects(service.run(1,17,'delete','Motivo','v1','Otro título'),e=>e instanceof ProjectError&&e.status===400);
 assert.ok(!f.calls.some(c=>c.sql.startsWith('DELETE FROM projects')));assert.equal(f.removes,0);
});
test('Eliminar exige título exacto, registra auditoría y reintenta limpieza sin perder el encargo',async()=>{
 const f=fixture('approved',true);const result=await createProjectLifecycle(f.pool,f.io).run(1,17,'delete','Duplicado','v1','Informe');
 assert.equal(result.cleanupPending,true);const deletion=f.calls.findIndex(c=>c.sql.startsWith('DELETE FROM projects'));const queue=f.calls.findIndex(c=>c.sql.startsWith('INSERT INTO pending_file_deletions'));assert.ok(queue>=0&&queue<deletion);assert.equal(f.removes,1);
 f.setFailure(false);assert.equal(await flushDeletion(f.pool,'11111111-1111-4111-8111-111111111111.pdf',f.io),true);assert.equal(f.removes,2);assert.ok(f.calls.some(c=>c.sql.startsWith('DELETE FROM pending_file_deletions')));
});
