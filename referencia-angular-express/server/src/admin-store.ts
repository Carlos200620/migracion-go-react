import { createProjectLifecycle } from './project-lifecycle.js';
import type { Pool } from 'pg';
import { access } from 'node:fs/promises';
import { ProjectError } from './student.js';
import { createProjectStore } from './project-store.js';
import type { AdminStore } from './admin.js';
export const REVIEW_SQL="UPDATE projects SET status=$1::varchar(20),observations=$2,reviewed_by=$3,published_at=CASE WHEN $1::varchar(20)='approved' THEN now() ELSE NULL END,updated_at=now() WHERE id=$4";
const fields=`p.id,p.title,p.summary,p.objectives,p.authors,p.year,p.category_id AS "categoryId",c.name AS category,p.status,p.observations,p.withdrawal_reason AS "withdrawalReason",p.created_at AS "createdAt",p.updated_at AS "updatedAt",p.updated_at::text AS version,p.published_at AS "publishedAt",u.full_name AS "studentName",d.original_name AS "documentName"`;
const joins=`FROM projects p JOIN users u ON u.id=p.owner_id JOIN categories c ON c.id=p.category_id LEFT JOIN documents d ON d.project_id=p.id`;
export function createAdminStore(pool:Pool):AdminStore{
 const files=createProjectStore(pool);const lifecycle=createProjectLifecycle(pool);
 return {
  downloadPath:files.downloadPath,history:lifecycle.history,lifecycle:lifecycle.run,
  async summary(){return (await pool.query("SELECT count(*) FILTER(WHERE status='pending')::integer AS pending,count(*) FILTER(WHERE status='observed')::integer AS observed,count(*) FILTER(WHERE status='approved')::integer AS approved FROM projects")).rows[0];},
  async list(){return (await pool.query(`SELECT ${fields} ${joins} ORDER BY p.updated_at DESC,p.id DESC`)).rows;},
  async get(id){return (await pool.query(`SELECT ${fields} ${joins} WHERE p.id=$1`,[id])).rows[0];},
  async document(id){return (await pool.query('SELECT storage_key AS key,original_name AS name FROM documents WHERE project_id=$1',[id])).rows[0];},
  async review(id,reviewerId,decision,observations,version){
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    const result=await client.query('SELECT status,updated_at::text AS version FROM projects WHERE id=$1 FOR UPDATE',[id]);const project=result.rows[0];
    if(!project)throw new ProjectError(404,'Proyecto no encontrado.');
    if(project.status!=='pending'||project.version!==version)throw new ProjectError(409,'El proyecto cambió o ya fue revisado. Recarga su detalle antes de continuar.');
    if(decision==='approved'){
     const doc=(await client.query('SELECT storage_key FROM documents WHERE project_id=$1',[id])).rows[0];
     if(!doc)throw new ProjectError(409,'El proyecto no tiene un PDF adjunto.');
     try{await access(files.downloadPath(doc.storage_key));}catch{throw new ProjectError(409,'No se encuentra el PDF. No se puede publicar este proyecto.');}
    }
    await client.query(REVIEW_SQL,[decision,observations,reviewerId,id]);
    await client.query('COMMIT');
   }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
  },
  async categories(){return (await pool.query('SELECT c.id,c.name,c.description,c.active,(SELECT count(*)::integer FROM projects p WHERE p.category_id=c.id) AS "projectCount" FROM categories c ORDER BY c.name')).rows;},
  async setCategoryActive(id,active){
   const result=await pool.query('UPDATE categories SET active=$1 WHERE id=$2 RETURNING id,name,description,active',[active,id]);
   if(!result.rows[0])throw new ProjectError(404,'Categoría no encontrada.');return result.rows[0];
  },
  async saveCategory(input,id){
   const duplicate=await pool.query('SELECT id FROM categories WHERE lower(name)=lower($1) AND ($2::integer IS NULL OR id<>$2)',[input.name,id??null]);
   if(duplicate.rows.length)throw new ProjectError(409,'Ya existe una categoría con ese nombre.');
   const result=id===undefined?await pool.query('INSERT INTO categories(name,description,active) VALUES($1,$2,$3) RETURNING id,name,description,active',[input.name,input.description,input.active]):await pool.query('UPDATE categories SET name=$1,description=$2,active=$3 WHERE id=$4 RETURNING id,name,description,active',[input.name,input.description,input.active,id]);
   if(!result.rows[0])throw new ProjectError(404,'Categoría no encontrada.');return result.rows[0];
  }
 };
}



