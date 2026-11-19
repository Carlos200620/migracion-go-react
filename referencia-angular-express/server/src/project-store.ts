import type { Pool } from 'pg';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ProjectError, type ProjectStore, type StudentProject } from './student.js';
const uploads=fileURLToPath(new URL('../uploads/',import.meta.url));
const fields=`p.id,p.title,p.summary,p.objectives,p.authors,p.year,p.category_id AS "categoryId",c.name AS category,p.status,p.observations,p.withdrawal_reason AS "withdrawalReason",p.created_at AS "createdAt",p.updated_at AS "updatedAt",d.original_name AS "documentName",d.storage_key AS "storageKey"`;
export function createProjectStore(pool:Pool):ProjectStore {
 return {
  downloadPath(key){if(!/^[a-f0-9-]{36}\.pdf$/.test(key))throw new ProjectError(404,'Documento no encontrado.');return join(uploads,key);},
  async list(ownerId){return (await pool.query<StudentProject>(`SELECT ${fields} FROM projects p JOIN categories c ON c.id=p.category_id LEFT JOIN documents d ON d.project_id=p.id WHERE p.owner_id=$1 ORDER BY p.updated_at DESC,p.id DESC`,[ownerId])).rows;},
  async get(ownerId,id){return (await pool.query<StudentProject>(`SELECT ${fields} FROM projects p JOIN categories c ON c.id=p.category_id LEFT JOIN documents d ON d.project_id=p.id WHERE p.owner_id=$1 AND p.id=$2`,[ownerId,id])).rows[0];},
  async save(ownerId,input,pdf,id){
   const client=await pool.connect();let key:string|undefined;let oldKey:string|undefined;let committed=false;let written=false;
   try {
    await client.query('BEGIN');
    if(id!==undefined){
     const existing=await client.query('SELECT status FROM projects WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,ownerId]);
     if(!existing.rows[0])throw new ProjectError(404,'Proyecto no encontrado.');
     if(existing.rows[0].status!=='observed')throw new ProjectError(409,'Solo puedes corregir proyectos observados.');
    }
    const category=await client.query('SELECT id FROM categories WHERE id=$1 AND active=true',[input.categoryId]);
    if(!category.rows.length)throw new ProjectError(400,'Selecciona una categoría activa.');
    const values=[input.title,input.summary,input.objectives,input.authors,input.year,input.categoryId];
    if(id===undefined){
     if(!pdf)throw new ProjectError(400,'Adjunta un documento PDF.');
     const created=await client.query("INSERT INTO projects(title,summary,objectives,authors,year,category_id,owner_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",[...values,ownerId]);id=created.rows[0].id as number;
    }else{
     await client.query("UPDATE projects SET title=$1,summary=$2,objectives=$3,authors=$4,year=$5,category_id=$6,status='pending',observations='',reviewed_by=NULL,published_at=NULL,updated_at=now() WHERE id=$7 AND owner_id=$8",[...values,id,ownerId]);
    }
    if(pdf){
     oldKey=(await client.query('SELECT storage_key FROM documents WHERE project_id=$1',[id])).rows[0]?.storage_key;
     key=`${randomUUID()}.pdf`;
     await mkdir(uploads,{recursive:true});
     await writeFile(join(uploads,key),pdf.buffer,{flag:'wx'});written=true;
     await client.query("INSERT INTO documents(project_id,original_name,storage_key,mime_type,size_bytes) VALUES($1,$2,$3,'application/pdf',$4) ON CONFLICT(project_id) DO UPDATE SET original_name=EXCLUDED.original_name,storage_key=EXCLUDED.storage_key,size_bytes=EXCLUDED.size_bytes,created_at=now()",[id,pdf.name,key,pdf.buffer.length]);
    }else{
     const document=await client.query('SELECT id FROM documents WHERE project_id=$1',[id]);
     if(!document.rows.length)throw new ProjectError(400,'Adjunta un documento PDF.');
    }
    await client.query('COMMIT');committed=true;
    if(oldKey && /^[a-f0-9-]{36}\.pdf$/.test(oldKey))await unlink(join(uploads,oldKey)).catch(()=>console.error('Quedó un PDF anterior pendiente de limpieza.'));
    return id!;
   }catch(error){
    if(!committed){await client.query('ROLLBACK').catch(()=>{});if(key && written)await unlink(join(uploads,key)).catch(()=>{});}
    throw error;
   }finally{client.release();}
  }
 };
}


