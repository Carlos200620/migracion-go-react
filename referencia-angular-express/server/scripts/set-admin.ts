// Ejecutar únicamente después de autorizar la promoción de la cuenta elegida.
import { pool } from '../src/db.js';
const email=process.argv[2]?.trim();
if(!email||!email.includes('@')){console.error('Indica el correo de una cuenta ya registrada.');process.exitCode=1;await pool.end();}
else{
 const client=await pool.connect().catch(()=>null);
 if(!client){console.error('No se pudo conectar con PostgreSQL.');process.exitCode=1;await pool.end();}
 else{
  try{
   const database=(await client.query('SELECT current_database() AS name')).rows[0]?.name;
   if(database!=='repositorio_proyectos')throw new Error('WRONG_DATABASE');
   await client.query('BEGIN');
   const rows=(await client.query('SELECT id,role FROM users WHERE lower(email)=lower($1) FOR UPDATE',[email])).rows;
   if(rows.length!==1){await client.query('ROLLBACK');console.log('ACCOUNT_NOT_FOUND: registra primero la cuenta desde Crear cuenta.');process.exitCode=2;}
   else{
    await client.query("UPDATE users SET role='admin' WHERE id=$1",[rows[0].id]);
    await client.query('COMMIT');console.log('ADMIN_READY: la cuenta indicada tiene el rol de administrador.');
   }
  }catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(error instanceof Error&&error.message==='WRONG_DATABASE'?'Se detuvo la operación: la base configurada no es repositorio_proyectos.':'No se pudo asignar el rol. No se muestran credenciales.');process.exitCode=1;}
  finally{client.release();await pool.end();}
 }
}
