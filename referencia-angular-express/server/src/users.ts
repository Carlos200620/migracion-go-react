import { pool } from './db.js';
import { User, UserStore } from './auth.js';
export const users: UserStore = {
 async find(email) { return (await pool.query<User>('SELECT id, full_name, email, role, password_hash FROM users WHERE lower(email)=$1', [email])).rows[0]; },
 async get(id) { return (await pool.query<User>('SELECT id, full_name, email, role, password_hash FROM users WHERE id=$1', [id])).rows[0]; },
 async create(name, email, hash) { return (await pool.query<User>("INSERT INTO users (full_name,email,password_hash,role) VALUES ($1,$2,$3,'student') RETURNING id,full_name,email,role,password_hash", [name,email,hash])).rows[0]!; }
};
