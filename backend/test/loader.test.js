import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import { Pool } from 'pg';
import { checkTestDB, factories, query } from './helpers.js';
import { resetPool } from '../src/db/pool.js';

checkTestDB();

const TEST_DB = process.env.TEST_DATABASE_URL;
const directPool = new Pool({ connectionString: TEST_DB });

process.env.DATA_DIR = path.resolve(__dirname, 'fixtures');

beforeAll(async () => {
  // Ensure migrations are applied (setup.js globalSetup already ran, but clean state)
  const client = await directPool.connect();
  try {
    await client.query('DROP TABLE IF EXISTS notes, order_lines, orders, product_labels, products, farms, loader_runs, schema_migrations CASCADE');
    await client.query('DROP SEQUENCE IF EXISTS order_id_seq, line_id_seq, note_id_seq CASCADE');
  } finally {
    client.release();
  }
});

afterAll(async () => {
  resetPool();
  await directPool.end();
});

describe('Loader integration against fixtures', () => {
  it('first run loads all fixtures', async () => {
    const { run } = await import('../src/loader/index.js');
    const report = await run();

    expect(report.files.find(f => f.file === 'farms.csv').inserted).toBeGreaterThanOrEqual(7);
    expect(report.files.find(f => f.file === 'products.csv').inserted).toBeGreaterThanOrEqual(12);
    expect(report.files.find(f => f.file === 'orders.csv').inserted).toBeGreaterThanOrEqual(10);
    expect(report.files.find(f => f.file === 'order_lines.csv').inserted).toBeGreaterThanOrEqual(11);
    expect(report.files.find(f => f.file === 'notes.csv').inserted).toBeGreaterThanOrEqual(6);

    const farms = await query('SELECT * FROM farms ORDER BY id');
    expect(farms.rows.length).toBeGreaterThanOrEqual(7);
    const products = await query('SELECT * FROM products ORDER BY code');
    expect(products.rows.length).toBeGreaterThanOrEqual(12);
    const orders = await query('SELECT * FROM orders ORDER BY order_id');
    expect(orders.rows.length).toBeGreaterThanOrEqual(10);
    const lines = await query('SELECT * FROM order_lines ORDER BY line_id');
    expect(lines.rows.length).toBeGreaterThanOrEqual(11);
    const notes = await query('SELECT * FROM notes ORDER BY note_id');
    expect(notes.rows.length).toBeGreaterThanOrEqual(6);

    // Quarantine should exist (orphan lines, unknown products, etc.)
    const qtotal = report.summary.total_quarantined;
    expect(qtotal).toBeGreaterThan(0);
  });

  it('second run inserts 0 rows', async () => {
    const { run } = await import('../src/loader/index.js');
    const report = await run();
    const totalInserted = report.files.reduce((s, f) => s + f.inserted, 0);
    expect(totalInserted).toBe(0);
  });

  it('API-created orders survive a reload', async () => {
    await factories.makeFarm({ id: 'F-001', name: 'Loader Farm' });
    await query(
      `INSERT INTO orders (order_id, farm_id, field_crop, field_state, field_growth_stage, status, source, idempotency_key)
       VALUES ('ORD-9990', 'F-001', 'SOYBEAN', 'IA', 2, 'DRAFT', 'api', 'api-loader-test')
       ON CONFLICT (order_id) DO NOTHING`
    );

    const { run } = await import('../src/loader/index.js');
    await run();

    const { rows } = await query("SELECT * FROM orders WHERE order_id = 'ORD-9990'");
    expect(rows.length).toBe(1);
    expect(rows[0].source).toBe('api');
  });

  it('sequences are set past max imported id so no collision', async () => {
    const maxOrd = await query(
      `SELECT COALESCE(MAX(CAST(substring(order_id from 'ORD-(\\d+)') AS INTEGER)), 0) AS mx FROM orders`
    );
    const seqVal = await query(`SELECT last_value FROM order_id_seq`);
    expect(Number(seqVal.rows[0].last_value)).toBeGreaterThanOrEqual(Number(maxOrd.rows[0].mx));
  });
});