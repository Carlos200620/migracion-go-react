import { startFileCleanup } from './project-lifecycle.js';
import { createAdminRouter } from './admin.js';
import { createAdminStore } from './admin-store.js';
import { createStudentRouter } from './student.js';
import { createProjectStore } from './project-store.js';
import { createAuthRouter } from './auth.js';
import { users } from './users.js';
import express from 'express';
import { pool } from './db.js';
const app = express();
const stopCleanup=startFileCleanup(pool);
app.use('/api/projects',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
const auth=createAuthRouter(users);
app.use('/api/auth',auth);
app.use('/api/admin',auth.authenticate,createAdminRouter(createAdminStore(pool)));
app.use('/api/student/projects',auth.authenticate,createStudentRouter(createProjectStore(pool)));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'repositorio-api' }));
app.get('/api/health/database', async (_req, res) => {
 try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
 catch { res.status(503).json({ message: 'PostgreSQL no está disponible. Revisa el servicio y la configuración local.' }); }
});
const fields = `p.id, p.title, p.summary, p.objectives, p.authors, p.year, c.name AS category, p.published_at AS "publishedAt", EXISTS(SELECT 1 FROM documents d WHERE d.project_id = p.id) AS "hasDocument"`;
app.get('/api/projects', async (_req, res) => {
 try {
  const result = await pool.query(`SELECT ${fields} FROM projects p JOIN categories c ON c.id=p.category_id WHERE p.status='approved' ORDER BY p.published_at DESC, p.id DESC LIMIT 200`);
  res.json(result.rows);
 } catch { res.status(503).json({ message: 'No se pudo cargar el catálogo. Comprueba PostgreSQL y el esquema de datos.' }); }
});
app.get('/api/projects/:id', async (req, res) => {
 const id = Number(req.params.id);
 if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ message: 'Identificador no válido' }); return; }
 try {
  const result = await pool.query(`SELECT ${fields} FROM projects p JOIN categories c ON c.id=p.category_id WHERE p.status='approved' AND p.id=$1`, [id]);
  if (!result.rows.length) { res.status(404).json({ message: 'Proyecto no encontrado' }); return; }
  res.json(result.rows[0]);
 } catch { res.status(503).json({ message: 'No se pudo consultar el proyecto.' }); }
});
app.get('/api/projects/:id/document',async(req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<1){res.status(400).json({message:'Identificador no válido.'});return;}
 try{
  const result=await pool.query("SELECT d.storage_key AS key,d.original_name AS name FROM documents d JOIN projects p ON p.id=d.project_id WHERE p.id=$1 AND p.status='approved'",[id]);
  const doc=result.rows[0];if(!doc){res.status(404).json({message:'Documento no encontrado.'});return;}
  res.setHeader('X-Content-Type-Options','nosniff');
  res.download(createProjectStore(pool).downloadPath(doc.key),doc.name,error=>{if(error&&!res.headersSent)res.status(404).json({message:'El documento no está disponible.'});});
 }catch{res.status(503).json({message:'No se pudo consultar el documento.'});}
});
app.get('/api/categories', async (_req, res) => {
 try { const result = await pool.query('SELECT id, name, description FROM categories WHERE active=true ORDER BY name'); res.json(result.rows); }
 catch { res.status(503).json({ message: 'No se pudieron consultar las categorías.' }); }
});
app.use((_req, res) => res.status(404).json({ message: 'Ruta no encontrada' }));
const port = Number(process.env['PORT'] ?? 3000);
const server = app.listen(port, '127.0.0.1', () => console.log(`API disponible en http://localhost:${port}`));
function shutdown() { stopCleanup();server.close(() => { void pool.end(); }); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);





