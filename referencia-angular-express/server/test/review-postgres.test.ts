import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { REVIEW_SQL } from '../src/admin-store.js';

test('PostgreSQL prepara la consulta real de revisión sin error 42P08', {skip:process.env['RUN_POSTGRES_PREPARE']!=='1'},async()=>{
 const pool=new pg.Pool({connectionTimeoutMillis:3000});
 const client=await pool.connect();let prepared=false;
 try{
  assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name,'repositorio_proyectos');
  // PREPARE valida sintaxis y tipos; nunca ejecuta el UPDATE.
  await client.query(`PREPARE review_regression AS ${REVIEW_SQL}`);prepared=true;
  const result=await client.query("SELECT parameter_types::text AS types FROM pg_prepared_statements WHERE name='review_regression'");
  assert.equal(result.rows.length,1);assert.match(result.rows[0].types,/character varying/);
 }finally{
  if(prepared)await client.query('DEALLOCATE review_regression');
  client.release();await pool.end();
 }
});
