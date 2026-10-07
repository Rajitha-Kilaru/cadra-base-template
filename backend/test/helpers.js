// helpers.js — test data factories + DB utilities, imported by test files.
import { Pool } from 'pg';

const TEST_DB = process.env.TEST_DATABASE_URL;
const DEV_DB = process.env.DATABASE_URL;

export function checkTestDB() {
  if (!TEST_DB) throw new Error('TEST_DATABASE_URL must be set for integration tests');
  if (TEST_DB && DEV_DB && TEST_DB === DEV_DB) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL (refusing to wipe the dev DB)');
  }
}

let _pool = null;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: TEST_DB });
  return _pool;
}

export async function resetTestPool() {
  if (_pool) { try { await _pool.end(); } catch {} _pool = null; }
}

export async function truncateAll() {
  const client = await getPool().connect();
  try {
    await client.query(`
      TRUNCATE TABLE
        order_status_history, notes, order_lines, orders,
        product_labels, products, farms, loader_runs
      RESTART IDENTITY CASCADE
    `);
    await client.query('ALTER SEQUENCE order_id_seq RESTART WITH 10000');
    await client.query('ALTER SEQUENCE line_id_seq  RESTART WITH 10000');
    await client.query('ALTER SEQUENCE note_id_seq  RESTART WITH 10000');
  } finally { client.release(); }
}

export async function query(sql, params = []) {
  return getPool().query(sql, params);
}

// ---------- factories ----------
export const factories = {
  async makeFarm(overrides = {}) {
    const defaults = { id: 'F-999', name: 'Test Farm', credit_hold: false, state: 'IA', source: 'api' };
    const f = { ...defaults, ...overrides };
    await query(
      `INSERT INTO farms (id, name, credit_hold, state, source)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, credit_hold=EXCLUDED.credit_hold`,
      [f.id, f.name, f.credit_hold, f.state, f.source]
    );
    return f;
  },

  async makeProduct(overrides = {}) {
    const defaults = {
      code: 'TST-0001', description: 'Test Product', active: true,
      unit_price: '50.00', stock_available: 100, stock_reserved: 0, source: 'api',
    };
    const p = { ...defaults, ...overrides };
    await query(
      `INSERT INTO products (code, description, active, unit_price, stock_available, stock_reserved, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (code) DO UPDATE SET
         description=EXCLUDED.description, active=EXCLUDED.active,
         unit_price=EXCLUDED.unit_price, stock_available=EXCLUDED.stock_available,
         stock_reserved=EXCLUDED.stock_reserved`,
      [p.code, p.description, p.active, p.unit_price, p.stock_available, p.stock_reserved, p.source]
    );
    return p;
  },

  async makeLabel(productCode, crop, state, stageMin, stageMax) {
    await query(
      `INSERT INTO product_labels (product_code, crop, state, stage_min, stage_max)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (product_code, crop, state, stage_min, stage_max) DO NOTHING`,
      [productCode, crop, state, stageMin, stageMax]
    );
  },

  async makeOrder(overrides = {}) {
    const defaults = {
      farm_id: 'F-999', field_crop: 'SOYBEAN', field_state: 'IA',
      field_growth_stage: 2, status: 'DRAFT', idempotency_key: null, source: 'api',
    };
    const o = { ...defaults, ...overrides };
    const next = await query(`SELECT nextval('order_id_seq') AS n`);
    const orderId = `ORD-${next.rows[0].n}`;
    await query(
      `INSERT INTO orders (order_id, farm_id, field_crop, field_state, field_growth_stage, status, idempotency_key, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [orderId, o.farm_id, o.field_crop, o.field_state, o.field_growth_stage, o.status, o.idempotency_key, o.source]
    );
    return orderId;
  },

  async addLine(orderId, productCode, qty, unitPrice) {
    const next = await query(`SELECT nextval('line_id_seq') AS n`);
    const lineId = `L-${next.rows[0].n}`;
    const price = unitPrice !== undefined ? unitPrice : '50.00';
    await query(
      `INSERT INTO order_lines (line_id, order_id, product_code, qty, unit_price_snapshot, source)
       VALUES ($1,$2,$3,$4,$5,'api')`,
      [lineId, orderId, productCode, qty, price]
    );
    return lineId;
  },

  async addNote(orderId, author = 'farm', text = 'Test note') {
    const next = await query(`SELECT nextval('note_id_seq') AS n`);
    const noteId = `N-${next.rows[0].n}`;
    await query(
      `INSERT INTO notes (note_id, order_id, author, text, source)
       VALUES ($1,$2,$3,$4,'api')`,
      [noteId, orderId, author, text]
    );
    return noteId;
  },
};