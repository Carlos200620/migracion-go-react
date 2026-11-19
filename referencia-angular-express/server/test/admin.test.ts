import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Pool } from 'pg';
import { createAuthRouter, hashPassword, type User, type UserStore } from '../src/auth.js';
import { createAdminRouter, type AdminStore } from '../src/admin.js';
import { createAdminStore } from '../src/admin-store.js';
import { ProjectError } from '../src/student.js';

test('Administración: roles, aprobación, observaciones, versión y categorías',async()=>{
 const hash=await hashPassword('Prueba-2026');const accounts:User[]=[{id:1,full_name:'Admin Prueba',email:'admin@example.test',password_hash:hash,role:'admin'},{id:2,full_name:'Estudiante Prueba',email:'student@example.test',password_hash:hash,role:'student'}];
 const users:UserStore={async find(email){return accounts.find(u=>u.email===email);},async get(id){return accounts.find(u=>u.id===id);},async create(){throw new Error('Not used');}};
 let status='pending',version='version-1',observations='',reviewer=0;
 const categories:{id:number;name:string;description:string;active:boolean}[]=[];
 const store:AdminStore={
  async history(){return [];},async lifecycle(){return {cleanupPending:false};},
  async summary(){return {pending:status==='pending'?1:0,observed:status==='observed'?1:0,approved:status==='approved'?1:0};},
  async list(){return [{id:1,status,version}];},async get(id){return id===1?{id,status,version,observations}:undefined;},async document(){return undefined;},downloadPath(){throw new Error('Not used');},
  async review(id,admin,decision,notes,sentVersion){if(id!==1)throw new ProjectError(404,'No encontrado');if(status!=='pending'||sentVersion!==version)throw new ProjectError(409,'El proyecto cambió');status=decision;observations=notes;reviewer=admin;version='version-2';},
  async categories(){return categories;},async setCategoryActive(id,active){const c=categories.find(c=>c.id===id);if(!c)throw new ProjectError(404,'No encontrada');c.active=active;return c;},async saveCategory(input,id){if(id){const c=categories.find(c=>c.id===id);if(!c)throw new ProjectError(404,'No encontrada');Object.assign(c,input);return c;}const c={id:categories.length+1,...input};categories.push(c);return c;}
 };
 const app=express();app.use(express.json());const auth=createAuthRouter(users);app.use('/api/auth',auth);app.use('/api/admin',auth.authenticate,createAdminRouter(store));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const {port}=server.address() as {port:number};const base=`http://127.0.0.1:${port}`;
 const login=async(email:string)=>{const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Prueba-2026'})});assert.equal(r.status,200);return r.headers.get('set-cookie')!.split(';')[0]!;};
 const send=(cookie:string,path:string,body:unknown,method='POST',origin='http://localhost:4200')=>fetch(base+'/api/admin'+path,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await fetch(base+'/api/admin/summary')).status,401);const admin=await login('admin@example.test'),student=await login('student@example.test');
  for(const path of ['/summary','/projects','/projects/1','/projects/1/document','/categories'])assert.equal((await fetch(base+'/api/admin'+path,{headers:{Cookie:student}})).status,403);
  assert.equal((await send(student,'/projects/1/review',{decision:'approved',version})).status,403);
  assert.equal((await send(admin,'/projects/1/review',{decision:'approved',version},'POST','https://example.org')).status,403);
  assert.equal((await send(admin,'/projects/1/review',{decision:'observed',observations:'  ',version})).status,400);
  assert.equal((await send(admin,'/projects/1/review',{decision:'approved',version:'stale'})).status,409);
  assert.equal((await send(admin,'/projects/1/review',{decision:'approved',version,reviewerId:999})).status,200);assert.equal(reviewer,1);assert.equal(status,'approved');
  assert.equal((await send(admin,'/projects/1/review',{decision:'approved',version})).status,409);
  status='pending';version='version-3';
  assert.equal((await send(admin,'/projects/1/review',{decision:'observed',version,observations:'Ampliar objetivos.'})).status,200);assert.equal(observations,'Ampliar objetivos.');
  assert.equal((await send(admin,'/categories',{name:'  '})).status,400);
  assert.equal((await send(admin,'/categories',{name:'Software',description:'Aplicaciones',active:true})).status,201);
  assert.equal((await send(admin,'/categories/1',{name:'Software',description:'Aplicaciones',active:false},'PUT')).status,200);assert.equal(categories.length,1);assert.equal(categories[0]?.active,false);
  assert.equal((await send(student,'/categories/1/status',{active:true},'PATCH')).status,403);
  assert.equal((await send(admin,'/categories/1/status',{active:'true'},'PATCH')).status,400);
  assert.equal((await send(admin,'/categories/1/status',{active:true,name:'Cambio no permitido'},'PATCH')).status,200);assert.equal(categories[0]?.active,true);assert.equal(categories[0]?.name,'Software');
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

test('Revisión SQL: bloqueo, versión, estado y metadatos del revisor',async()=>{
 for(const state of ['stale','approved','missing','no-document','observed']){
  const calls:{sql:string;values?:unknown[]}[]=[];
  const client={async query(sql:string,values?:unknown[]){calls.push({sql,values});if(sql.includes('FOR UPDATE'))return {rows:state==='missing'?[]:[{status:state==='approved'?'approved':'pending',version:state==='stale'?'other':'v1'}]};return {rows:[]};},release(){}};
  const pool={async connect(){return client;}} as unknown as Pool;const store=createAdminStore(pool);
  if(state==='observed'){
   await store.review(7,42,'observed','Corregir objetivos','v1');const update=calls.find(c=>c.sql.startsWith('UPDATE'));assert.deepEqual(update?.values,['observed','Corregir objetivos',42,7]);assert.match(update!.sql,/published_at=CASE/);assert.equal(calls.at(-1)?.sql,'COMMIT');
  }else{
   await assert.rejects(store.review(7,42,'approved','','v1'),error=>error instanceof ProjectError&&error.status===(state==='missing'?404:409));assert.equal(calls.at(-1)?.sql,'ROLLBACK');assert.ok(!calls.some(c=>c.sql.startsWith('UPDATE')));
  }
  assert.match(calls[1]!.sql,/WHERE id=\$1 FOR UPDATE/);assert.deepEqual(calls[1]!.values,[7]);
 }
});


