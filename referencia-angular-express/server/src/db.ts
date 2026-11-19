import pg from 'pg';
export const pool = new pg.Pool({ connectionTimeoutMillis: 3000, max: 5, idleTimeoutMillis: 10000 });
pool.on('error', () => console.error('Se perdió una conexión con PostgreSQL.'));
