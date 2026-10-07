require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { pool } = require('../db/pool');
const { migrate } = require('../db/migrate');
const {
  FARM_COLUMNS, PRODUCT_COLUMNS, ORDER_COLUMNS, LINE_COLUMNS, NOTE_COLUMNS,
  resolveHeaders, assertRequired,
} = require('./columns');
const {
  normaliseFarmId, normaliseProductCode, normaliseOrderId, normaliseLineId, normaliseNoteId,
  normaliseBoolean, normaliseStatus, normaliseCrop, normaliseState, normaliseGrowthStage,
  normalisePrice, normaliseQty, normaliseTimestamp, parseLabelledFor,
} = require('./normalise');
const { printReport, buildReportJson } = require('./report');

const REQUIRED_FILES = ['farms.csv', 'products.csv', 'orders.csv', 'order_lines.csv', 'notes.csv'];

// ---------------- CSV reading ----------------
function readCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return new Promise((resolve, reject) => {
    parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true }, (err, records) => {
      if (err) reject(err);
      else resolve(records);
    });
  });
}

function assertFilesExist(dataDir) {
  const missing = REQUIRED_FILES.filter(f => !fs.existsSync(path.join(dataDir, f)));
  if (missing.length > 0) {
    throw new Error(
      `Missing required data files in ${dataDir}: ${missing.join(', ')}`
    );
  }
}

// ---------------- quarantine ----------------
function makeQuarantine() {
  const rows = [];     // { rule, file, row, message }
  const counts = {};   // rule -> count
  return {
    add(file, row, rule, message) {
      rows.push({ rule, file, row, message });
      counts[rule] = (counts[rule] || 0) + 1;
    },
    rows,
    counts,
  };
}

// ---------------- dedupe ----------------
// Tracks natural keys already seen in this run; later duplicates are quarantined
// (rule DUP_ROW for exact dupes, LAST_WINS otherwise, applied by key-map below).
function makeDeduper() {
  const seen = new Set();
  return (quarantine, file, rowNo, key, reason) => {
    if (seen.has(key)) {
      quarantine.add(file, rowNo, 'DUP_ROW', `${reason} (duplicate of an earlier row)`);
      return false;
    }
    seen.add(key);
    return true;
  };
}

// ---------------- row value accessor ----------------
// map: canonical -> fileHeader ; row: object keyed by fileHeader
const get = (row, map, canonical) => row[map[canonical]];

// ---------------- per-entity processing ----------------
async function loadFarms(client, filePath, stat, quarantine) {
  const records = await readCsv(filePath);
  stat.read = records.length;
  const headers = Object.keys(records[0] || {});
  const map = resolveHeaders(headers, FARM_COLUMNS);
  assertRequired(map, FARM_COLUMNS, 'farms.csv');
  const dedupe = makeDeduper();

  let rowNo = 0;
  for (const row of records) {
    rowNo++;
    const farmIdRes = normaliseFarmId(get(row, map, 'id'));
    if (farmIdRes.error) { quarantine.add('farms.csv', rowNo, farmIdRes.error.split('|')[0], farmIdRes.error); stat.quarantined++; continue; }
    const name = String(get(row, map, 'name') || '').trim();
    if (!name) { quarantine.add('farms.csv', rowNo, 'BLANK_REQUIRED', 'blank farm name'); stat.quarantined++; continue; }
    if (!dedupe(quarantine, 'farms.csv', rowNo, farmIdRes.value, 'farm id')) { stat.quarantined++; continue; }

    const creditHoldRes = normaliseBoolean(get(row, map, 'credit_hold'));
    if (creditHoldRes.error) { quarantine.add('farms.csv', rowNo, 'INV_BOOL', creditHoldRes.error); stat.quarantined++; continue; }
    const stateRaw = get(row, map, 'state');
    let state = null;
    if (stateRaw !== undefined && String(stateRaw).trim() !== '') {
      const stateRes = normaliseState(stateRaw);
      if (stateRes.error) { quarantine.add('farms.csv', rowNo, 'INV_STATE', stateRes.error); stat.quarantined++; continue; }
      state = stateRes.value;
    }

    const id = farmIdRes.value;
    const result = await client.query(
      `INSERT INTO farms (id, name, credit_hold, state, source)
       VALUES ($1, $2, $3, $4, 'import')
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         credit_hold = EXCLUDED.credit_hold,
         state = EXCLUDED.state,
         updated_at = NOW()
       WHERE farms.source = 'import'
         AND (farms.name, farms.credit_hold, farms.state) IS DISTINCT FROM
             (EXCLUDED.name, EXCLUDED.credit_hold, EXCLUDED.state)
       RETURNING (xmax = 0) AS inserted`,
      [id, name, creditHoldRes.value, state]
    );
    if (result.rowCount === 0) stat.unchanged++;
    else if (result.rows[0] && result.rows[0].inserted) stat.inserted++;
    else stat.updated++;
  }
}

async function loadProducts(client, filePath, stat, quarantine) {
  const records = await readCsv(filePath);
  stat.read = records.length;
  const headers = Object.keys(records[0] || {});
  const map = resolveHeaders(headers, PRODUCT_COLUMNS);
  assertRequired(map, PRODUCT_COLUMNS, 'products.csv');
  const dedupe = makeDeduper();

  let rowNo = 0;
  for (const row of records) {
    rowNo++;
    const codeRes = normaliseProductCode(get(row, map, 'code'));
    if (codeRes.error) { quarantine.add('products.csv', rowNo, 'INV_CODE', codeRes.error); stat.quarantined++; continue; }
    const description = String(get(row, map, 'description') || '').trim();
    if (!description) { quarantine.add('products.csv', rowNo, 'BLANK_REQUIRED', 'blank product description'); stat.quarantined++; continue; }
    if (!dedupe(quarantine, 'products.csv', rowNo, codeRes.value, 'product code')) { stat.quarantined++; continue; }

    const activeRes = normaliseBoolean(get(row, map, 'active'));
    if (activeRes.error) { quarantine.add('products.csv', rowNo, 'INV_BOOL', activeRes.error); stat.quarantined++; continue; }
    const priceRes = normalisePrice(get(row, map, 'price'));
    if (priceRes.error) { quarantine.add('products.csv', rowNo, 'INV_PRICE', priceRes.error); stat.quarantined++; continue; }

    let stockAvailable = 0, stockReserved = 0;
    const stockRaw = get(row, map, 'stock_available');
    if (stockRaw !== undefined && String(stockRaw).trim() !== '') {
      const s = normaliseQty(stockRaw);
      if (s.error) { quarantine.add('products.csv', rowNo, 'INV_QTY', s.error); stat.quarantined++; continue; }
      stockAvailable = s.value;
    }
    const reservedRaw = get(row, map, 'stock_reserved');
    if (reservedRaw !== undefined && String(reservedRaw).trim() !== '') {
      const s = normaliseQty(reservedRaw);
      if (s.error) { quarantine.add('products.csv', rowNo, 'INV_QTY', s.error); stat.quarantined++; continue; }
      stockReserved = s.value;
    }

    // labelled_for — parsed but validated lazily; malformed entries quarantine the product
    const labelRaw = get(row, map, 'labelled_for');
    let labels = [];
    if (labelRaw !== undefined && String(labelRaw).trim() !== '') {
      const lr = parseLabelledFor(labelRaw);
      if (lr.error) { quarantine.add('products.csv', rowNo, 'INV_LABEL', lr.error); stat.quarantined++; continue; }
      labels = lr.value;
    }

    const code = codeRes.value;
    const result = await client.query(
      `INSERT INTO products (code, description, active, unit_price, stock_available, stock_reserved, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'import')
       ON CONFLICT (code) DO UPDATE SET
         description = EXCLUDED.description,
         active = EXCLUDED.active,
         unit_price = EXCLUDED.unit_price,
         stock_available = EXCLUDED.stock_available,
         stock_reserved = EXCLUDED.stock_reserved,
         updated_at = NOW()
       WHERE products.source = 'import'
         AND (products.description, products.active, products.unit_price,
              products.stock_available, products.stock_reserved) IS DISTINCT FROM
             (EXCLUDED.description, EXCLUDED.active, EXCLUDED.unit_price,
              EXCLUDED.stock_available, EXCLUDED.stock_reserved)
       RETURNING (xmax = 0) AS inserted`,
      [code, description, activeRes.value, priceRes.value, stockAvailable, stockReserved]
    );
    if (result.rowCount === 0) stat.unchanged++;

    // product_labels: replace only if changed
    const { rows: existing } = await client.query(
      `SELECT crop, state, stage_min, stage_max FROM product_labels WHERE product_code = $1`,
      [code]
    );
    const existingKey = new Set(existing.map(l => `${l.crop}|${l.state}|${l.stage_min}|${l.stage_max}`));
    const newKey = new Set(labels.map(l => `${l.crop}|${l.state}|${l.stage_min}|${l.stage_max}`));
    const changed = existingKey.size !== newKey.size ||
      [...newKey].some(k => !existingKey.has(k));
    if (changed) {
      await client.query('DELETE FROM product_labels WHERE product_code = $1', [code]);
      for (const l of labels) {
        await client.query(
          `INSERT INTO product_labels (product_code, crop, state, stage_min, stage_max)
           VALUES ($1, $2, $3, $4, $5)`,
          [code, l.crop, l.state, l.stage_min, l.stage_max]
        );
      }
    }
  }
}

async function loadOrders(client, filePath, stat, quarantine) {
  const records = await readCsv(filePath);
  stat.read = records.length;
  const headers = Object.keys(records[0] || {});
  const map = resolveHeaders(headers, ORDER_COLUMNS);
  assertRequired(map, ORDER_COLUMNS, 'orders.csv');
  const dedupe = makeDeduper();

  let rowNo = 0;
  for (const row of records) {
    rowNo++;
    const orderIdRes = normaliseOrderId(get(row, map, 'order_id'));
    if (orderIdRes.error) { quarantine.add('orders.csv', rowNo, 'INV_ORDER_ID', orderIdRes.error); stat.quarantined++; continue; }
    const farmIdRes = normaliseFarmId(get(row, map, 'farm_id'));
    if (farmIdRes.error) { quarantine.add('orders.csv', rowNo, 'INV_FARM_ID', farmIdRes.error); stat.quarantined++; continue; }
    if (!dedupe(quarantine, 'orders.csv', rowNo, orderIdRes.value, 'order id')) { stat.quarantined++; continue; }

    const cropRes = normaliseCrop(get(row, map, 'field_crop'));
    if (cropRes.error) { quarantine.add('orders.csv', rowNo, 'INV_CROP', cropRes.error); stat.quarantined++; continue; }
    const stateRes = normaliseState(get(row, map, 'field_state'));
    if (stateRes.error) { quarantine.add('orders.csv', rowNo, 'INV_STATE', stateRes.error); stat.quarantined++; continue; }
    const stageRes = normaliseGrowthStage(get(row, map, 'field_growth_stage'));
    if (stageRes.error) { quarantine.add('orders.csv', rowNo, 'INV_STAGE', stageRes.error); stat.quarantined++; continue; }
    const statusRes = normaliseStatus(get(row, map, 'status'));
    if (statusRes.error) { quarantine.add('orders.csv', rowNo, 'INV_STATUS', statusRes.error); stat.quarantined++; continue; }

    const createdRaw = get(row, map, 'created_at');
    let createdAt = new Date().toISOString();
    if (createdRaw !== undefined && String(createdRaw).trim() !== '') {
      const t = normaliseTimestamp(createdRaw);
      if (t.error) { quarantine.add('orders.csv', rowNo, 'INV_DATE', t.error); stat.quarantined++; continue; }
      createdAt = t.value;
    }
    const updatedRaw = get(row, map, 'updated_at');
    let updatedAt = createdAt;
    if (updatedRaw !== undefined && String(updatedRaw).trim() !== '') {
      const t = normaliseTimestamp(updatedRaw);
      if (t.error) { quarantine.add('orders.csv', rowNo, 'INV_DATE', t.error); stat.quarantined++; continue; }
      updatedAt = t.value;
    }
    const idemRaw = get(row, map, 'idempotency_key');
    const idemKey = idemRaw !== undefined ? String(idemRaw).trim() : null;

    const result = await client.query(
      `INSERT INTO orders (order_id, farm_id, field_crop, field_state, field_growth_stage,
                           status, idempotency_key, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'import', $8, $9)
       ON CONFLICT (order_id) DO UPDATE SET
         farm_id = EXCLUDED.farm_id,
         field_crop = EXCLUDED.field_crop,
         field_state = EXCLUDED.field_state,
         field_growth_stage = EXCLUDED.field_growth_stage,
         status = EXCLUDED.status,
         idempotency_key = EXCLUDED.idempotency_key,
         updated_at = NOW()
       WHERE orders.source = 'import'
         AND (orders.farm_id, orders.field_crop, orders.field_state,
              orders.field_growth_stage, orders.status, orders.idempotency_key) IS DISTINCT FROM
             (EXCLUDED.farm_id, EXCLUDED.field_crop, EXCLUDED.field_state,
              EXCLUDED.field_growth_stage, EXCLUDED.status, EXCLUDED.idempotency_key)
       RETURNING (xmax = 0) AS inserted`,
      [orderIdRes.value, farmIdRes.value, cropRes.value, stateRes.value, stageRes.value,
       statusRes.value, idemKey, createdAt, updatedAt]
    );
    if (result.rowCount === 0) stat.unchanged++;
    else if (result.rows[0] && result.rows[0].inserted) stat.inserted++;
    else stat.updated++;
  }
}

async function loadLines(client, filePath, stat, quarantine, orderIds) {
  const records = await readCsv(filePath);
  stat.read = records.length;
  const headers = Object.keys(records[0] || {});
  const map = resolveHeaders(headers, LINE_COLUMNS);
  assertRequired(map, LINE_COLUMNS, 'order_lines.csv');
  const dedupe = makeDeduper();

  let rowNo = 0;
  for (const row of records) {
    rowNo++;
    const lineIdRes = normaliseLineId(get(row, map, 'line_id'));
    if (lineIdRes.error) { quarantine.add('order_lines.csv', rowNo, 'INV_LINE_ID', lineIdRes.error); stat.quarantined++; continue; }
    const orderIdRes = normaliseOrderId(get(row, map, 'order_id'));
    if (orderIdRes.error) { quarantine.add('order_lines.csv', rowNo, 'INV_ORDER_ID', orderIdRes.error); stat.quarantined++; continue; }
    if (!dedupe(quarantine, 'order_lines.csv', rowNo, lineIdRes.value, 'line id')) { stat.quarantined++; continue; }

    // orphan line: order not loaded
    if (!orderIds.has(orderIdRes.value)) {
      quarantine.add('order_lines.csv', rowNo, 'ORPHAN_LINE', `line references unknown order ${orderIdRes.value}`);
      stat.quarantined++;
      continue;
    }

    const productRes = normaliseProductCode(get(row, map, 'product_code'));
    if (productRes.error) { quarantine.add('order_lines.csv', rowNo, 'INV_CODE', productRes.error); stat.quarantined++; continue; }
    // unknown product: must already exist (products loaded earlier)
    const { rows: prodRows } = await client.query(
      'SELECT 1 FROM products WHERE code = $1', [productRes.value]
    );
    if (prodRows.length === 0) {
      quarantine.add('order_lines.csv', rowNo, 'UNKNOWN_PRODUCT', `line references unknown product ${productRes.value}`);
      stat.quarantined++;
      continue;
    }

    const qtyRes = normaliseQty(get(row, map, 'qty'));
    if (qtyRes.error) { quarantine.add('order_lines.csv', rowNo, 'INV_QTY', qtyRes.error); stat.quarantined++; continue; }
    const priceRaw = get(row, map, 'unit_price_snapshot');
    let price;
    if (priceRaw !== undefined && String(priceRaw).trim() !== '') {
      const p = normalisePrice(priceRaw);
      if (p.error) { quarantine.add('order_lines.csv', rowNo, 'INV_PRICE', p.error); stat.quarantined++; continue; }
      price = p.value;
    } else {
      const { rows: prodRows2 } = await client.query(
        'SELECT unit_price FROM products WHERE code = $1', [productRes.value]
      );
      price = prodRows2[0] ? prodRows2[0].unit_price : '0.00';
    }

    const result = await client.query(
      `INSERT INTO order_lines (line_id, order_id, product_code, qty, unit_price_snapshot, source)
       VALUES ($1, $2, $3, $4, $5, 'import')
       ON CONFLICT (line_id) DO UPDATE SET
         order_id = EXCLUDED.order_id,
         product_code = EXCLUDED.product_code,
         qty = EXCLUDED.qty,
         unit_price_snapshot = EXCLUDED.unit_price_snapshot
       WHERE order_lines.source = 'import'
         AND (order_lines.order_id, order_lines.product_code, order_lines.qty,
              order_lines.unit_price_snapshot) IS DISTINCT FROM
             (EXCLUDED.order_id, EXCLUDED.product_code, EXCLUDED.qty,
              EXCLUDED.unit_price_snapshot)
       RETURNING (xmax = 0) AS inserted`,
      [lineIdRes.value, orderIdRes.value, productRes.value, qtyRes.value, price]
    );
    if (result.rowCount === 0) stat.unchanged++;
    else if (result.rows[0] && result.rows[0].inserted) stat.inserted++;
    else stat.updated++;
  }
}

async function loadNotes(client, filePath, stat, quarantine, orderIds) {
  const records = await readCsv(filePath);
  stat.read = records.length;
  const headers = Object.keys(records[0] || {});
  const map = resolveHeaders(headers, NOTE_COLUMNS);
  assertRequired(map, NOTE_COLUMNS, 'notes.csv');
  const dedupe = makeDeduper();

  let rowNo = 0;
  for (const row of records) {
    rowNo++;
    const noteIdRes = normaliseNoteId(get(row, map, 'note_id'));
    if (noteIdRes.error) { quarantine.add('notes.csv', rowNo, 'INV_NOTE_ID', noteIdRes.error); stat.quarantined++; continue; }
    const orderIdRes = normaliseOrderId(get(row, map, 'order_id'));
    if (orderIdRes.error) { quarantine.add('notes.csv', rowNo, 'INV_ORDER_ID', orderIdRes.error); stat.quarantined++; continue; }
    if (!dedupe(quarantine, 'notes.csv', rowNo, noteIdRes.value, 'note id')) { stat.quarantined++; continue; }

    if (!orderIds.has(orderIdRes.value)) {
      quarantine.add('notes.csv', rowNo, 'ORPHAN_NOTE', `note references unknown order ${orderIdRes.value}`);
      stat.quarantined++;
      continue;
    }

    const authorRaw = String(get(row, map, 'author') || '').trim().toLowerCase();
    if (!['farm', 'ops'].includes(authorRaw)) {
      quarantine.add('notes.csv', rowNo, 'INV_AUTHOR', `"${get(row, map, 'author')}" is not a valid note author`);
      stat.quarantined++;
      continue;
    }
    const text = String(get(row, map, 'text') || '').trim();
    if (text.length < 1 || text.length > 2000) {
      quarantine.add('notes.csv', rowNo, 'BLANK_REQUIRED', 'note text must be 1..2000 chars');
      stat.quarantined++;
      continue;
    }
    const createdRaw = get(row, map, 'created_at');
    let createdAt = new Date().toISOString();
    if (createdRaw !== undefined && String(createdRaw).trim() !== '') {
      const t = normaliseTimestamp(createdRaw);
      if (t.error) { quarantine.add('notes.csv', rowNo, 'INV_DATE', t.error); stat.quarantined++; continue; }
      createdAt = t.value;
    }

    const result = await client.query(
      `INSERT INTO notes (note_id, order_id, author, text, source, created_at)
       VALUES ($1, $2, $3, $4, 'import', $5)
       ON CONFLICT (note_id) DO UPDATE SET
         order_id = EXCLUDED.order_id,
         author = EXCLUDED.author,
         text = EXCLUDED.text,
         created_at = EXCLUDED.created_at
       WHERE notes.source = 'import'
         AND (notes.order_id, notes.author, notes.text, notes.created_at) IS DISTINCT FROM
             (EXCLUDED.order_id, EXCLUDED.author, EXCLUDED.text, EXCLUDED.created_at)
       RETURNING (xmax = 0) AS inserted`,
      [noteIdRes.value, orderIdRes.value, authorRaw, text, createdAt]
    );
    if (result.rowCount === 0) stat.unchanged++;
    else if (result.rows[0] && result.rows[0].inserted) stat.inserted++;
    else stat.updated++;
  }
}

// ---------------- sequences ----------------
async function setSequences(client) {
  const orderMax = await client.query(`SELECT COALESCE(MAX(CAST(substring(order_id from 'ORD-(\d+)') AS INTEGER)), 10000) FROM orders`);
  const lineMax = await client.query(`SELECT COALESCE(MAX(CAST(substring(line_id from 'L-(\d+)') AS INTEGER)), 10000) FROM order_lines`);
  const noteMax = await client.query(`SELECT COALESCE(MAX(CAST(substring(note_id from 'N-(\d+)') AS INTEGER)), 10000) FROM notes`);
  const ids = [
    ['order_id_seq', orderMax.rows[0].coalesce],
    ['line_id_seq', lineMax.rows[0].coalesce],
    ['note_id_seq', noteMax.rows[0].coalesce],
  ];
  for (const [seq, max] of ids) {
    await client.query(`SELECT setval('${seq}', $1)`, [Math.max(max, 10000)]);
  }
}

// ---------------- main ----------------
async function run() {
  const dataDir = path.resolve(process.env.DATA_DIR || './data');
  assertFilesExist(dataDir);

  await migrate();

  const quarantine = makeQuarantine();
  const stats = [
    { file: 'farms.csv', read: 0, inserted: 0, updated: 0, unchanged: 0, quarantined: 0 },
    { file: 'products.csv', read: 0, inserted: 0, updated: 0, unchanged: 0, quarantined: 0 },
    { file: 'orders.csv', read: 0, inserted: 0, updated: 0, unchanged: 0, quarantined: 0 },
    { file: 'order_lines.csv', read: 0, inserted: 0, updated: 0, unchanged: 0, quarantined: 0 },
    { file: 'notes.csv', read: 0, inserted: 0, updated: 0, unchanged: 0, quarantined: 0 },
  ];

  const client = await pool.connect();
  try {
    // farms
    await client.query('BEGIN');
    await loadFarms(client, path.join(dataDir, 'farms.csv'), stats[0], quarantine);
    await client.query('COMMIT');

    // products
    await client.query('BEGIN');
    await loadProducts(client, path.join(dataDir, 'products.csv'), stats[1], quarantine);
    await client.query('COMMIT');

    // orders (fetch existing order ids after upsert)
    await client.query('BEGIN');
    await loadOrders(client, path.join(dataDir, 'orders.csv'), stats[2], quarantine);
    const { rows: orderRows } = await client.query('SELECT order_id FROM orders');
    const orderIds = new Set(orderRows.map(r => r.order_id));
    await client.query('COMMIT');

    // lines
    await client.query('BEGIN');
    await loadLines(client, path.join(dataDir, 'order_lines.csv'), stats[3], quarantine, orderIds);
    await client.query('COMMIT');

    // notes
    await client.query('BEGIN');
    await loadNotes(client, path.join(dataDir, 'notes.csv'), stats[4], quarantine, orderIds);
    await client.query('COMMIT');

    // sequences
    await client.query('BEGIN');
    await setSequences(client);
    await client.query('COMMIT');

    // record the run
    const report = buildReportJson(stats, quarantine.counts);
    await client.query(
      'INSERT INTO loader_runs (finished_at, report) VALUES (NOW(), $1)',
      [JSON.stringify(report)]
    );
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Write loader-report.json (gitignored)
  const report = buildReportJson(stats, quarantine.counts);
  const reportPath = path.resolve(dataDir, '..', 'loader-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  printReport(stats, quarantine.counts);

  return report;
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('LOAD FAILED:', err.message);
      process.exit(1);
    });
}

module.exports = { run, loadFarms, loadProducts, loadOrders, loadLines, loadNotes, setSequences };