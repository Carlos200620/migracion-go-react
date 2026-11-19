import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAuthRouter, type User, type UserStore } from '../src/auth.js';

test('Registro, login, sesión y logout con almacén aislado', async () => {
 let user: User | undefined;
 const store: UserStore = {
  async find(email) { return user?.email === email ? user : undefined; },
  async get(id) { return user?.id === id ? user : undefined; },
  async create(name, email, hash) {
   if (user) throw Object.assign(new Error('duplicate'), {code:'23505'});
   return user = {id:1, full_name:name, email, password_hash:hash, role:'student'};
  }
 };
 const app = express(); app.use(express.json()); app.use('/api/auth', createAuthRouter(store));
 const server = app.listen(0,'127.0.0.1');
 await new Promise<void>(resolve => server.once('listening',resolve));
 const address = server.address() as {port:number};
 const base = `http://127.0.0.1:${address.port}/api/auth`;
 const post = (path:string, body:unknown, cookie='',origin='http://localhost:4200') => fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:origin},body:JSON.stringify(body)});
 try {
  assert.equal((await fetch(base+'/me')).status,401);
  assert.equal((await post('/register',{fullName:'D',email:'bad',password:'123'})).status,400);
  assert.equal((await post('/register',{},'','https://example.org')).status,403);
  let response=await post('/register',{fullName:'Davis Prueba',email:'ADMIN@example.test',password:'Prueba-segura-2026',role:'admin'});
  assert.equal(response.status,201);
  const registered=await response.json() as {user:Record<string,unknown>};
  assert.equal(registered.user['role'],'student');
  assert.equal(registered.user['email'],'admin@example.test');
  assert.equal(registered.user['password_hash'],undefined);
  assert.notEqual(user!.password_hash,'Prueba-segura-2026');
  assert.equal((await post('/register',{fullName:'Otra persona',email:'admin@example.test',password:'Prueba-segura-2026'})).status,409);
  assert.equal((await post('/login',{email:'admin@example.test',password:'incorrecta'})).status,401);
  assert.equal((await post('/login',{email:'nadie@example.test',password:'incorrecta'})).status,401);
  response=await post('/login',{email:'ADMIN@example.test',password:'Prueba-segura-2026'});
  assert.equal(response.status,200);
  const setCookie=response.headers.get('set-cookie')!;
  assert.match(setCookie,/HttpOnly/); assert.match(setCookie,/SameSite=Strict/);
  const cookie=setCookie.split(';')[0]!;
  response=await fetch(base+'/me',{headers:{Cookie:cookie}});
  assert.equal(response.status,200);
  assert.equal((await response.json() as {user:User}).user.role,'student');
  assert.equal((await post('/logout',{},cookie)).status,200);
  assert.equal((await fetch(base+'/me',{headers:{Cookie:cookie}})).status,401);
 } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});
