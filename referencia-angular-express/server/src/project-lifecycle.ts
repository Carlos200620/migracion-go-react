import type { Pool } from 'pg';
import { access, unlink } from 'node:fs/promises';
import { createProjectStore } from './project-store.js';
import { ProjectError } from './student.js';
export type LifecycleAction='withdraw'|'restore'|'delete';
export interface FileOperations {remove(key:string):Promise<void>;exists(key:string):Promise<void>;}
function fileOperations(pool:Pool):FileOperations {
 const files=createProjectStore(pool);
 return {remove:key=>unlink(files.downloadPath(key)),exists:key=>access(files.downloadPath(key))};
}
export async function flushDeletion(pool:Pool,key:string,io=fileOperations(pool)):Promise<boolean>{
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const job=await client.query('SELECT storage_key FROM pending_file_deletions WHERE storage_key=$1 FOR UPDATE',[key]);
  if(job.rows.length){
   const reference=await client.query('SELECT id FROM documents WHERE storage_key=$1',[key]);
   if(reference.rows.length)throw new Error('El archivo todavía está asociado a un documento.');
   try{await io.remove(key);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
   await client.query('DELETE FROM pending_file_deletions WHERE storage_key=$1',[key]);
  }
  await client.query('COMMIT');return true;
 }catch{await client.query('ROLLBACK').catch(()=>{});return false;}finally{client.release();}
}
export function createProjectLifecycle(pool:Pool,io=fileOperations(pool)){
 return {
  async history(id:number){return(await pool.query('SELECT id,action,actor_name AS "actorName",reason,previous_status AS "previousStatus",created_at AS "createdAt" FROM project_events WHERE project_id=$1 ORDER BY created_at DESC,id DESC',[id])).rows;},
  async run(id:number,actorId:number,action:LifecycleAction,reason:string,version:string,confirmation?:string){
   const client=await pool.connect();let key:string|undefined;
   try{
    await client.query('BEGIN');
    const project=(await client.query('SELECT id,title,status,updated_at::text AS version FROM projects WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!project)throw new ProjectError(404,'Proyecto no encontrado.');
    if(project.version!==version)throw new ProjectError(409,'El proyecto cambió. Recarga sus datos antes de continuar.');
    if(action==='withdraw'&&project.status!=='approved')throw new ProjectError(409,'Solo se pueden retirar proyectos publicados.');
    if(action==='restore'&&project.status!=='withdrawn')throw new ProjectError(409,'Solo se pueden restaurar proyectos retirados.');
    if(action==='delete'&&confirmation!==project.title)throw new ProjectError(400,'Escribe exactamente el título del proyecto para confirmar la eliminación.');
    const actor=(await client.query("SELECT full_name FROM users WHERE id=$1 AND role='admin'",[actorId])).rows[0];
    if(!actor)throw new ProjectError(403,'Se requiere una cuenta administradora.');
    const document=(await client.query('SELECT storage_key FROM documents WHERE project_id=$1',[id])).rows[0];
    if(action==='restore'){
     if(!document)throw new ProjectError(409,'No se puede restaurar un proyecto sin PDF.');
     try{await io.exists(document.storage_key);}catch{throw new ProjectError(409,'No se encuentra el PDF del proyecto.');}
    }
    await client.query('INSERT INTO project_events(project_id,project_title,actor_id,actor_name,action,previous_status,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,project.title,actorId,actor.full_name,action,project.status,reason]);
    if(action==='delete'){
     key=document?.storage_key;
     if(key)await client.query('INSERT INTO pending_file_deletions(storage_key) VALUES($1) ON CONFLICT DO NOTHING',[key]);
     await client.query('DELETE FROM projects WHERE id=$1',[id]);
    }else{
     const status=action==='withdraw'?'withdrawn':'approved';
     await client.query('UPDATE projects SET status=$1::varchar(20),withdrawal_reason=$2,updated_at=now() WHERE id=$3',[status,action==='withdraw'?reason:'',id]);
    }
    await client.query('COMMIT');
   }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
   let cleanupPending=false;
   if(key){try{cleanupPending=!await flushDeletion(pool,key,io);}catch{cleanupPending=true;}}
   return {cleanupPending};
  }
 };
}
export function startFileCleanup(pool:Pool){
 let running=false;
 const run=async()=>{
  if(running)return;running=true;
  try{const jobs=(await pool.query('SELECT storage_key FROM pending_file_deletions ORDER BY created_at LIMIT 25')).rows;for(const job of jobs)await flushDeletion(pool,job.storage_key);}
  catch(error){if((error as {code?:string}).code!=='42P01')console.error('No se pudo completar la limpieza de documentos pendientes.');}
  finally{running=false;}
 };
 void run();const timer=setInterval(()=>void run(),60000);timer.unref();return()=>clearInterval(timer);
}
