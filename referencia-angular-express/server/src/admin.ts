import type { LifecycleAction } from './project-lifecycle.js';
import { Router, type ErrorRequestHandler } from 'express';
import { ProjectError } from './student.js';
export interface CategoryInput {name:string;description:string;active:boolean;}
export interface AdminStore {
 summary():Promise<unknown>;
 list():Promise<Record<string,unknown>[]>;
 get(id:number):Promise<Record<string,unknown>|undefined>;
 document(id:number):Promise<{key:string;name:string}|undefined>;
 downloadPath(key:string):string;
 review(id:number,reviewerId:number,decision:'approved'|'observed',observations:string,version:string):Promise<void>;
 categories():Promise<unknown[]>;
 saveCategory(input:CategoryInput,id?:number):Promise<unknown>;
 setCategoryActive(id:number,active:boolean):Promise<unknown>;
 history(id:number):Promise<unknown[]>;
 lifecycle(id:number,actorId:number,action:LifecycleAction,reason:string,version:string,confirmation?:string):Promise<{cleanupPending:boolean}>;
}
export function createAdminRouter(store:AdminStore){
 const router=Router();
 router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');if(res.locals['user']?.role!=='admin'){res.status(403).json({message:'Esta sección requiere una cuenta administradora.'});return;}next();});
 router.use((req,res,next)=>{
  if(req.method!=='GET'){
   const origin=req.headers.origin;
   if(origin&&![process.env['APP_ORIGIN']??'http://localhost:4200','http://127.0.0.1:4200'].includes(origin)){res.status(403).json({message:'Origen no permitido.'});return;}
   if(!req.is('application/json')){res.status(415).json({message:'Se requiere JSON.'});return;}
  }next();
 });
 const idOf=(value:unknown)=>{const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw new ProjectError(400,'Identificador no válido.');return id;};
 router.get('/summary',async(_req,res,next)=>{try{res.json(await store.summary());}catch(e){next(e);}});
 router.get('/projects',async(_req,res,next)=>{try{res.json(await store.list());}catch(e){next(e);}});
 router.get('/projects/:id',async(req,res,next)=>{try{const p=await store.get(idOf(req.params['id']));if(!p)throw new ProjectError(404,'Proyecto no encontrado.');res.json(p);}catch(e){next(e);}});
 router.get('/projects/:id/document',async(req,res,next)=>{try{
  const doc=await store.document(idOf(req.params['id']));if(!doc)throw new ProjectError(404,'Documento no encontrado.');
  res.setHeader('X-Content-Type-Options','nosniff');res.download(store.downloadPath(doc.key),doc.name,error=>{if(error&&!res.headersSent)res.status(404).json({message:'El documento no está disponible.'});});
 }catch(e){next(e);}});
 router.post('/projects/:id/review',async(req,res,next)=>{try{
  const {decision,observations='',version}=req.body??{};
  if(!['approved','observed'].includes(decision)||typeof observations!=='string'||observations.length>5000||typeof version!=='string'||!version||version.length>100)throw new ProjectError(400,'Selecciona una decisión válida y revisa las observaciones (máximo 5000 caracteres).');
  if(decision==='observed'&&!observations.trim())throw new ProjectError(400,'Escribe las observaciones para devolver el proyecto.');
  await store.review(idOf(req.params['id']),res.locals['user'].id,decision,observations.trim(),version);
  res.json({message:decision==='approved'?'Proyecto aprobado y publicado.':'Proyecto devuelto con observaciones.'});
 }catch(e){next(e);}});
 router.get('/projects/:id/history',async(req,res,next)=>{try{res.json(await store.history(idOf(req.params['id'])));}catch(e){next(e);}});
 router.post('/projects/:id/lifecycle',async(req,res,next)=>{try{
  const {action,reason,version,confirmation}=req.body??{};
  if(!['withdraw','restore','delete'].includes(action)||typeof reason!=='string'||!reason.trim()||reason.trim().length>1000||typeof version!=='string'||!version||version.length>100||(action==='delete'&&typeof confirmation!=='string'))throw new ProjectError(400,'Completa el motivo (máximo 1000 caracteres) y confirma la acción.');
  const result=await store.lifecycle(idOf(req.params['id']),res.locals['user'].id,action,reason.trim(),version,confirmation);
  res.json({...result,message:action==='withdraw'?'Proyecto retirado del catálogo.':action==='restore'?'Proyecto restaurado y publicado.':result.cleanupPending?'Proyecto eliminado. La eliminación del PDF se reintentará automáticamente.':'Proyecto y PDF eliminados.'});
 }catch(e){next(e);}});
 router.get('/categories',async(_req,res,next)=>{try{res.json(await store.categories());}catch(e){next(e);}});
 const category=(body:unknown):CategoryInput=>{
  const {name,description='',active=true}=(body??{}) as CategoryInput;
  if(typeof name!=='string'||!name.trim()||name.trim().length>100||typeof description!=='string'||description.length>1000||typeof active!=='boolean')throw new ProjectError(400,'Completa el nombre (hasta 100 caracteres) y la descripción (hasta 1000).');
  return {name:name.trim(),description:description.trim(),active};
 };
 router.post('/categories',async(req,res,next)=>{try{res.status(201).json(await store.saveCategory(category(req.body)));}catch(e){next(e);}});
 router.put('/categories/:id',async(req,res,next)=>{try{res.json(await store.saveCategory(category(req.body),idOf(req.params['id'])));}catch(e){next(e);}});
 router.patch('/categories/:id/status',async(req,res,next)=>{try{
  if(typeof req.body?.active!=='boolean')throw new ProjectError(400,'Indica un estado de categoría válido.');
  res.json(await store.setCategoryActive(idOf(req.params['id']),req.body.active));
 }catch(e){next(e);}});
 const errors:ErrorRequestHandler=(e,_req,res,_next)=>{
  if(e instanceof ProjectError){res.status(e.status).json({message:e.message});return;}
  if(e?.code==='23505'){res.status(409).json({message:'Ya existe una categoría con ese nombre.'});return;}
  const unavailable=['ECONNREFUSED','ECONNRESET','ETIMEDOUT','57P01','57P02','57P03'].includes(e?.code);
  res.status(unavailable?503:500).json({message:unavailable?'No se pudo conectar con PostgreSQL. Inténtalo nuevamente.':'No se pudo completar la operación. Inténtalo nuevamente; si persiste, informa del error.'});
 };
 router.use(errors);return router;
}



