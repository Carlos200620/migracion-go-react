import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export interface User { id: number; full_name: string; email: string; role: 'student' | 'admin'; password_hash: string; }
export interface UserStore {
 find(email: string): Promise<User | undefined>;
 get(id: number): Promise<User | undefined>;
 create(name: string, email: string, hash: string): Promise<User>;
}
export async function hashPassword(password: string) {
 const salt = randomBytes(16).toString('hex');
 const key = await derive(password, salt, 64) as Buffer;
 return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string) {
 const [algorithm, salt, hex] = hash.split('$');
 if (algorithm !== 'scrypt' || !salt || !hex || !/^[a-f0-9]{128}$/.test(hex)) return false;
 const key = await derive(password, salt, 64) as Buffer;
 return timingSafeEqual(key, Buffer.from(hex, 'hex'));
}
const publicUser = (u: User) => ({ id: u.id, fullName: u.full_name, email: u.email, role: u.role });
export function createAuthRouter(store: UserStore) {
 const router = Router();
 const sessions = new Map<string, { userId: number; expires: number }>();
 const lifetime = 8 * 60 * 60 * 1000;
 const cookieOptions = { httpOnly: true, sameSite: 'strict' as const, secure: process.env['NODE_ENV'] === 'production', path: '/api' };
 const tokenKey = (token: string) => createHash('sha256').update(token).digest('hex');
 const cookieToken = (cookie = '') => cookie.split(';').map(p => p.trim()).find(p => p.startsWith('rp_session='))?.slice(11) ?? '';
 const cleanup = () => { for (const [key, value] of sessions) if (value.expires <= Date.now()) sessions.delete(key); };
 const dummyHash = hashPassword(randomBytes(32).toString('hex'));
 router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
 router.use((req, res, next) => {
  if (req.method !== 'GET') {
   const allowed = new Set([process.env['APP_ORIGIN'] ?? 'http://localhost:4200', 'http://127.0.0.1:4200']);
   const origin = req.headers.origin;
   if (origin && !allowed.has(origin)) { res.status(403).json({ message: 'Origen no permitido.' }); return; }
   if (!req.is('application/json')) { res.status(415).json({ message: 'Se requiere JSON.' }); return; }
  }
  next();
 });
 const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Demasiados intentos. Inténtalo en 15 minutos.' } });
 router.post('/register', limiter, async (req, res) => {
  const { fullName, email, password } = req.body ?? {};
  if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 150 || typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
   res.status(400).json({ message: 'Revisa el nombre, el correo y la contraseña (entre 8 y 128 caracteres).' }); return;
  }
  try {
   const user = await store.create(fullName.trim(), email.trim().toLowerCase(), await hashPassword(password));
   res.status(201).json({ user: publicUser(user), message: 'Cuenta creada. Ya puedes iniciar sesión.' });
  } catch (error) {
   if ((error as { code?: string }).code === '23505') res.status(409).json({ message: 'Ya existe una cuenta con ese correo.' });
   else res.status(503).json({ message: 'No se pudo crear la cuenta. Comprueba la conexión con la base de datos.' });
  }
 });
 router.post('/login', limiter, async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length < 1 || password.length > 128) { res.status(400).json({ message: 'Introduce tu correo y contraseña.' }); return; }
  try {
   const user = await store.find(email.trim().toLowerCase());
   const valid = await verifyPassword(password, user?.password_hash ?? await dummyHash);
   if (!user || !valid) { res.status(401).json({ message: 'Correo o contraseña incorrectos.' }); return; }
   cleanup();
   if (sessions.size >= 10000) { res.status(503).json({ message: 'Inténtalo más tarde.' }); return; }
   sessions.delete(tokenKey(cookieToken(req.headers.cookie)));
   const token = randomBytes(32).toString('hex');
   sessions.set(tokenKey(token), { userId: user.id, expires: Date.now() + lifetime });
   res.cookie('rp_session', token, { ...cookieOptions, maxAge: lifetime }).json({ user: publicUser(user) });
  } catch { res.status(503).json({ message: 'No se pudo iniciar sesión. Comprueba la conexión con la base de datos.' }); }
 });
 router.get('/me', async (req, res) => {
  cleanup();
  const session = sessions.get(tokenKey(cookieToken(req.headers.cookie)));
  if (!session) { res.status(401).json({ message: 'Inicia sesión para continuar.' }); return; }
  try {
   const user = await store.get(session.userId);
   if (!user) { res.status(401).json({ message: 'La cuenta ya no está disponible.' }); return; }
   res.json({ user: publicUser(user) });
  } catch { res.status(503).json({ message: 'No se pudo comprobar la sesión.' }); }
 });
 router.post('/logout', (req, res) => {
  sessions.delete(tokenKey(cookieToken(req.headers.cookie)));
  res.clearCookie('rp_session', cookieOptions).json({ message: 'Sesión cerrada.' });
 });
 const authenticate: RequestHandler = async (req, res, next) => {
  cleanup();
  const session = sessions.get(tokenKey(cookieToken(req.headers.cookie)));
  if (!session) { res.status(401).json({ message: 'Tu sesión terminó. Vuelve a iniciar sesión.' }); return; }
  try {
   const user = await store.get(session.userId);
   if (!user) { res.status(401).json({ message: 'La cuenta no está disponible.' }); return; }
   res.locals['user'] = publicUser(user);
   next();
  } catch { res.status(503).json({ message: 'No se pudo comprobar la sesión.' }); }
 };
 return Object.assign(router, { authenticate });
}

