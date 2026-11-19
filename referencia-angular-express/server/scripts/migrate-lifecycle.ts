// Migración de estructura: no cambia estados ni elimina proyectos o PDF.
import {readFile} from 'node:fs/promises';
import {pool} from '../src/db.js';
const client=await pool.connect();
try{
 const database=(await client.query('SELECT current_database() AS name')).rows[0].name;
 if(database!=='repositorio_proyectos')throw new Error('WRONG_DATABASE');
 const sql=await readFile(new URL('../database/002_project_lifecycle.sql',import.meta.url),'utf8');
 await client.query(sql);
 console.log('MIGRATION_OK: estado Retirado, motivo, historial y cola de limpieza preparados. No se modificaron proyectos ni PDF.');
}catch{
 await client.query('ROLLBACK').catch(()=>{});console.error('No se pudo aplicar la migración. No se muestran credenciales.');process.exitCode=1;
}finally{client.release();await pool.end();}
