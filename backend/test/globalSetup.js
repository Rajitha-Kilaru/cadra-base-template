// globalSetup.js — vitest global setup: run once before any test file.
// Enforces the TEST_DATABASE_URL safety rule, then runs migrations when a test DB is
// configured. Unit tests (no DB) can run without a test DB; integration test files
// enforce TEST_DATABASE_URL themselves via checkTestDB() in helpers.js.
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

export default async function globalSetup() {
  const TEST_DB = process.env.TEST_DATABASE_URL;
  const DEV_DB = process.env.DATABASE_URL;

  if (TEST_DB && DEV_DB && TEST_DB === DEV_DB) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL (refusing to wipe the dev DB)');
  }

  if (!TEST_DB) {
    return; // unit-only run; integration tests will fail with a clear message
  }

  const pool = new Pool({ connectionString: TEST_DB });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map(r => r.filename));
    const dir = path.resolve(process.cwd(), 'migrations');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}