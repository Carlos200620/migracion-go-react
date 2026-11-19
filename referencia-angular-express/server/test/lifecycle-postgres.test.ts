import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {createProjectLifecycle} from '../src/project-lifecycle.js';

test('PostgreSQL real: retirar, restaurar y eliminar con tablas temporales aisladas', {skip:process.env['RUN_LIFECYCLE_POSTGRES']!=='1'},async()=>{
 const connection=new pg.Pool({connectionTimeoutMillis:3000});const client=await connection.connect();
 // Todas las tablas y secuencias son TEMP: no se escriben cuentas/proyectos reales.
 try{
  assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name,'repositorio_proyectos');
  for(const file of ['001_initial.sql','002_project_lifecycle.sql']){
   const sql=(await readFile(new URL(`../database/${file}`,import.meta.url),'utf8')).replaceAll('CREATE TABLE IF NOT EXISTS','CREATE TEMP TABLE IF NOT EXISTS');await client.query(sql);
  }
  const names=['users','categories','projects','documents','project_events','pending_file_deletions'];
  for(const name of names){const result=await client.query('SELECT relpersistence FROM pg_class WHERE oid=to_regclass($1)',[name]);assert.equal(result.rows[0]?.relpersistence,'t');}
  const student=(await client.query("INSERT INTO users(full_name,email,password_hash) VALUES('Estudiante temporal','student@example.test','test') RETURNING id")).rows[0].id;
  const admin=(await client.query("INSERT INTO users(full_name,email,password_hash,role) VALUES('Admin temporal','admin@example.test','test','admin') RETURNING id")).rows[0].id;
  const category=(await client.query('SELECT id FROM categories LIMIT 1')).rows[0].id;
  const project=(await client.query("INSERT INTO projects(owner_id,category_id,title,summary,objectives,authors,year,status,reviewed_by,published_at) VALUES($1,$2,'Proyecto temporal','Resumen','Objetivos','Autor',2026,'approved',$3,now()) RETURNING id",[student,category,admin])).rows[0].id;
  const key='11111111-1111-4111-8111-111111111111.pdf';await client.query("INSERT INTO documents(project_id,original_name,storage_key,mime_type,size_bytes) VALUES($1,'temporal.pdf',$2,'application/pdf',100)",[project,key]);
  const files=new Set([key]);const io={async exists(k:string){assert.ok(files.has(k));},async remove(k:string){files.delete(k);}};
  const adapter={query:client.query.bind(client),async connect(){return {query:client.query.bind(client),release(){}};}} as unknown as pg.Pool;
  const service=createProjectLifecycle(adapter,io);
  const version=async()=> (await client.query('SELECT updated_at::text AS version FROM projects WHERE id=$1',[project])).rows[0].version;
  await service.run(project,admin,'withdraw','Publicado por error',await version());
  assert.equal((await client.query("SELECT id FROM projects WHERE status='approved'")).rows.length,0);assert.ok(files.has(key));
  await service.run(project,admin,'restore','Publicación validada',await version());
  assert.equal((await client.query("SELECT id FROM projects WHERE status='approved'")).rows.length,1);
  await service.run(project,admin,'delete','Duplicado de prueba',await version(),'Proyecto temporal');
  assert.equal((await client.query('SELECT id FROM projects')).rows.length,0);assert.equal((await client.query('SELECT id FROM documents')).rows.length,0);assert.equal(files.size,0);
  assert.equal((await client.query('SELECT id FROM project_events')).rows.length,3);assert.equal((await client.query('SELECT storage_key FROM pending_file_deletions')).rows.length,0);
 }finally{client.release();await connection.end();}
});
