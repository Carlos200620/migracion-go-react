import { Router, type ErrorRequestHandler } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
export class ProjectError extends Error { constructor(public status: number, message: string) { super(message); } }
export interface ProjectInput { title: string; summary: string; objectives: string; authors: string; year: number; categoryId: number; }
export interface PdfInput { buffer: Buffer; name: string; }
export interface StudentProject extends ProjectInput {
 id: number; category: string; status: 'pending'|'observed'|'approved'|'withdrawn'; observations: string; withdrawalReason?:string; createdAt: string; updatedAt: string;
 documentName: string | null; storageKey?: string | null;
}
export interface ProjectStore {
 list(ownerId: number): Promise<StudentProject[]>;
 get(ownerId: number, id: number): Promise<StudentProject | undefined>;
 save(ownerId: number, input: ProjectInput, pdf?: PdfInput, id?: number): Promise<number>;
 downloadPath(key: string): string;
}
export function validateInput(body: Record<string, unknown>): ProjectInput {
 const text = (key: string, max: number) => {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new ProjectError(400, 'Completa los campos obligatorios y respeta sus límites.');
  return value.trim();
 };
 const yearText=text('year',4), categoryText=text('categoryId',10);
 const year=Number(yearText), categoryId=Number(categoryText);
 if (!/^\d{4}$/.test(yearText) || year<1900 || year>2100 || !/^\d+$/.test(categoryText) || !Number.isSafeInteger(categoryId) || categoryId<1) throw new ProjectError(400,'Selecciona una categoría y un año válido (1900–2100).');
 return { title:text('title',200), summary:text('summary',10000), objectives:text('objectives',10000), authors:text('authors',500), year, categoryId };
}
export function validatePdf(file?: Express.Multer.File): PdfInput | undefined {
 if (!file) return undefined;
 if (file.size === 0 || file.size>10485760 || !/\.pdf$/i.test(file.originalname) || file.mimetype !== 'application/pdf' || file.buffer.subarray(0,5).toString() !== '%PDF-' || !file.buffer.subarray(-1024).includes(Buffer.from('%%EOF'))) throw new ProjectError(400,'Adjunta un PDF válido de hasta 10 MB.');
 return {buffer:file.buffer,name:file.originalname.replace(/[\x00-\x1f\\/]/g,'_').slice(0,255)};
}
export function createStudentRouter(store: ProjectStore) {
 const router=Router();
 router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store'); if(res.locals['user']?.role!=='student'){res.status(403).json({message:'Esta sección es para estudiantes.'});return;}next();});
 router.use((req,res,next)=>{
  if(req.method!=='GET') {
   const origin=req.headers.origin;
   const allowed=[process.env['APP_ORIGIN'] ?? 'http://localhost:4200','http://127.0.0.1:4200'];
   if(origin && !allowed.includes(origin)){res.status(403).json({message:'Origen no permitido.'});return;}
   if(!req.is('multipart/form-data')){res.status(415).json({message:'Envía el formulario con su documento adjunto.'});return;}
  }
  next();
 });
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10485760,files:1,fields:6,fieldSize:40000,parts:7}}).single('document');
 const limiter=rateLimit({windowMs:15*60*1000,limit:20,legacyHeaders:false,standardHeaders:'draft-8',message:{message:'Demasiados envíos. Inténtalo más tarde.'}});
 const owner=(res: {locals: Record<string,any>})=>res.locals['user'].id as number;
 const idFrom=(value: unknown)=>{const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw new ProjectError(400,'Identificador no válido.');return id;};
 const visible=(project:StudentProject)=>{const {storageKey,...data}=project;return data;};
 router.get('/',async(_req,res,next)=>{try{res.json((await store.list(owner(res))).map(visible));}catch(error){next(error);}});
 router.get('/:id',async(req,res,next)=>{try{const project=await store.get(owner(res),idFrom(req.params['id']));if(!project)throw new ProjectError(404,'Proyecto no encontrado.');res.json(visible(project));}catch(error){next(error);}});
 router.get('/:id/document',async(req,res,next)=>{
  try{
   const project=await store.get(owner(res),idFrom(req.params['id']));
   if(!project?.storageKey)throw new ProjectError(404,'Documento no encontrado.');
   res.setHeader('X-Content-Type-Options','nosniff');
   res.download(store.downloadPath(project.storageKey),project.documentName ?? 'proyecto.pdf',error=>{if(error && !res.headersSent)res.status(404).json({message:'El documento no está disponible.'});});
  }catch(error){next(error);}
 });
 router.post('/',limiter,upload,async(req,res,next)=>{try{
  const input=validateInput(req.body ?? {});const pdf=validatePdf(req.file);
  if(!pdf)throw new ProjectError(400,'Adjunta el documento PDF de tu proyecto.');
  const id=await store.save(owner(res),input,pdf);res.status(201).json({id,message:'Tu proyecto fue enviado a revisión.'});
 }catch(error){next(error);}});
 router.put('/:id',limiter,upload,async(req,res,next)=>{try{
  const id=await store.save(owner(res),validateInput(req.body ?? {}),validatePdf(req.file),idFrom(req.params['id']));
  res.json({id,message:'El proyecto fue reenviado a revisión.'});
 }catch(error){next(error);}});
 const errors:ErrorRequestHandler=(error,_req,res,_next)=>{
  if(error instanceof ProjectError){res.status(error.status).json({message:error.message});return;}
  if(error instanceof multer.MulterError){res.status(400).json({message:error.code==='LIMIT_FILE_SIZE'?'El PDF supera el límite de 10 MB.':'Envía un solo PDF y los campos del formulario.'});return;}
  res.status(503).json({message:'No se pudo completar la operación. Comprueba la API y PostgreSQL.'});
 };
 router.use(errors);
 return router;
}


