import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAuthRouter, hashPassword, type User, type UserStore } from '../src/auth.js';
import { createStudentRouter, ProjectError, type ProjectStore, type StudentProject } from '../src/student.js';
import { createProjectStore } from '../src/project-store.js';
import type { Pool } from 'pg';

test('Proyectos: sesión, propiedad, validaciones y reenvío de observados',async()=>{
 const hash=await hashPassword('Prueba-2026');
 const users:User[]=[1,2,3].map(id=>({id,full_name:`Prueba ${id}`,email:`user${id}@example.test`,password_hash:hash,role:id===3?'admin':'student'}));
 const userStore:UserStore={async get(id){return users.find(u=>u.id===id);},async find(email){return users.find(u=>u.email===email);},async create(){throw new Error('not used');}};
 const projects=new Map<number,StudentProject & {ownerId:number}>();let next=1;
 const store:ProjectStore={
  async list(ownerId){return [...projects.values()].filter(p=>p.ownerId===ownerId);},
  async get(ownerId,id){const p=projects.get(id);return p?.ownerId===ownerId?p:undefined;},
  async save(ownerId,input,pdf,id){
   const old=id?projects.get(id):undefined;
   if(id&&old?.ownerId!==ownerId)throw new ProjectError(404,'Proyecto no encontrado.');
   if(old&&old.status!=='observed')throw new ProjectError(409,'Solo puedes corregir proyectos observados.');
   const key=id??next++;
   projects.set(key,{...input,id:key,ownerId,category:'Software',status:'pending',observations:'',createdAt:old?.createdAt??new Date().toISOString(),updatedAt:new Date().toISOString(),documentName:pdf?.name??old?.documentName??null,storageKey:'internal-private-key'});return key;
  },downloadPath(){throw new Error('Not used');}
 };
 const app=express();app.use(express.json());const auth=createAuthRouter(userStore);app.use('/api/auth',auth);app.use('/api/student/projects',auth.authenticate,createStudentRouter(store));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
 const login=async(id:number)=>{const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`user${id}@example.test`,password:'Prueba-2026'})});assert.equal(response.status,200);return response.headers.get('set-cookie')!.split(';')[0]!;};
 const data=(file=true,payload='%PDF-1.7\nTest document\n%%EOF')=>{
  const form=new FormData();for(const [key,value] of Object.entries({title:'Proyecto de prueba',summary:'Resumen',objectives:'Objetivos',authors:'Autor',year:'2026',categoryId:'1'}))form.append(key,value);
  if(file)form.append('document',new Blob([payload],{type:'application/pdf'}),'proyecto.pdf');return form;
 };
 const send=(cookie:string,form:FormData,path='',method='POST',origin='http://localhost:4200')=>fetch(base+'/api/student/projects'+path,{method,headers:{Cookie:cookie,Origin:origin},body:form});
 try{
  assert.equal((await fetch(base+'/api/student/projects')).status,401);
  const first=await login(1),second=await login(2),admin=await login(3);
  assert.equal((await fetch(base+'/api/student/projects',{headers:{Cookie:admin}})).status,403);
  assert.equal((await send(first,data(),'','POST','https://example.org')).status,403);
  assert.equal((await send(first,data(false))).status,400);
  assert.equal((await send(first,data(true,'texto falso'))).status,400);
  const invalid=data();invalid.set('year','2.026');assert.equal((await send(first,invalid)).status,400);
  const response=await send(first,data());assert.equal(response.status,201);const {id}=await response.json() as {id:number};
  assert.equal(projects.get(id)?.status,'pending');
  let detail=await fetch(base+`/api/student/projects/${id}`,{headers:{Cookie:first}});assert.equal(detail.status,200);assert.equal((await detail.json() as Record<string,unknown>)['storageKey'],undefined);
  assert.equal((await fetch(base+`/api/student/projects/${id}`,{headers:{Cookie:second}})).status,404);
  assert.equal((await send(second,data(),`/${id}`,'PUT')).status,404);
  assert.equal((await send(first,data(),`/${id}`,'PUT')).status,409);
  projects.get(id)!.status='observed';projects.get(id)!.observations='Corregir objetivos';
  assert.equal((await send(first,data(false),`/${id}`,'PUT')).status,200);
  assert.equal(projects.get(id)?.status,'pending');assert.equal(projects.get(id)?.observations,'');assert.equal(projects.get(id)?.documentName,'proyecto.pdf');
  const list=await fetch(base+'/api/student/projects',{headers:{Cookie:second}});assert.deepEqual(await list.json(),[]);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

test('Repositorio SQL: verifica propietario y estado con bloqueo antes de actualizar',async()=>{
 for(const state of ['missing','pending','approved']){
  const calls:{sql:string;values?:unknown[]}[]=[];
  const client={async query(sql:string,values?:unknown[]){calls.push({sql,values});if(sql.includes('FOR UPDATE'))return {rows:state==='missing'?[]:[{status:state}]};return {rows:[]};},release(){}};
  const pool={async connect(){return client;}} as unknown as Pool;
  const store=createProjectStore(pool);
  await assert.rejects(store.save(42,{title:'T',summary:'S',objectives:'O',authors:'A',year:2026,categoryId:1},undefined,7),error=>error instanceof ProjectError&&error.status===(state==='missing'?404:409));
  assert.match(calls[1]!.sql,/owner_id=\$2 FOR UPDATE/);assert.deepEqual(calls[1]!.values,[7,42]);assert.equal(calls.at(-1)?.sql,'ROLLBACK');assert.ok(!calls.some(c=>c.sql.startsWith('UPDATE')));
 }
});
