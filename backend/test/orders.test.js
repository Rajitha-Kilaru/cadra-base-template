import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { checkTestDB, truncateAll, factories, query, resetTestPool } from './helpers.js';

checkTestDB();

beforeAll(async () => {});
beforeEach(async () => {
  await truncateAll();
  await factories.makeFarm({ id: 'F-999', name: 'Test Farm', state: 'IA' });
  await factories.makeFarm({ id: 'F-888', name: 'Other Farm', state: 'IA', credit_hold: true });
});
afterAll(async () => { await resetTestPool(); });

const createReq = data =>
  request(app).post('/api/orders').send(data);
const addLineReq = (id, data) =>
  request(app).post(`/api/orders/${id}/lines`).send(data);
const transitionReq = (id, data) =>
  request(app).post(`/api/orders/${id}/transition`).send(data);
const noteReq = (id, data) =>
  request(app).post(`/api/orders/${id}/notes`).send(data);

describe('health', () => {
  it('GET /api/health -> 200 {"status":"ok"}', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/orders (list)', () => {
  beforeEach(async () => {
    // Three orders for F-999, one for F-888
    await factories.makeOrder({ idempotency_key: 'k1' });
    await factories.makeOrder({ idempotency_key: 'k2' });
    await factories.makeOrder({ idempotency_key: 'k3' });
    await factories.makeOrder({ idempotency_key: 'k4', status: 'SUBMITTED' });
  });

  it('default paging: page=1 page_size=20', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, page_size: 20 });
    expect(res.body.items.length).toBe(4);
    expect(res.body.total).toBe(4);
  });

  it('page_size max 100 is accepted', async () => {
    const res = await request(app).get('/api/orders?page_size=100');
    expect(res.status).toBe(200);
    expect(res.body.page_size).toBe(100);
  });

  it('page_size 101 -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app).get('/api/orders?page_size=101');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('page 0 -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app).get('/api/orders?page=0');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('non-integer page -> 400', async () => {
    const res = await request(app).get('/api/orders?page=abc');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('invalid status -> 400', async () => {
    const res = await request(app).get('/api/orders?status=BOGUS');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('status filter works', async () => {
    const res = await request(app).get('/api/orders?status=SUBMITTED');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].status).toBe('SUBMITTED');
  });

  it('q matches order_id case-insensitively', async () => {
    const res = await request(app).get('/api/orders?q=ord-1');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('q matches farm name case-insensitively', async () => {
    const res = await request(app).get('/api/orders?q=other farm');
    expect(res.status).toBe(200);
    expect(res.body.items.every(i => i.farm_name === 'Other Farm')).toBe(true);
  });

  it('q + status combine with AND', async () => {
    const res = await request(app).get('/api/orders?q=test farm&status=SUBMITTED');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].farm_name).toBe('Test Farm');
    expect(res.body.items[0].status).toBe('SUBMITTED');
  });

  it('no match -> 200 empty items total 0', async () => {
    const res = await request(app).get('/api/orders?q=zzzzzznomatch');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], total: 0 });
  });

  it('orders ordered by created_at desc', async () => {
    const res = await request(app).get('/api/orders');
    const ids = res.body.items.map(i => i.order_id);
    const { rows } = await query('SELECT order_id, created_at FROM orders ORDER BY created_at DESC, order_id DESC');
    expect(ids).toEqual(rows.map(r => r.order_id));
  });

  it('summaries carry no lines/notes keys', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.body.items[0]).not.toHaveProperty('lines');
    expect(res.body.items[0]).not.toHaveProperty('notes');
  });

  it('farm_name is null for unknown farm', async () => {
    await factories.makeOrder({ farm_id: 'F-777', idempotency_key: 'k-unknown' });
    const res = await request(app).get('/api/orders');
    const item = res.body.items.find(i => i.farm_id === 'F-777');
    expect(item.farm_name).toBeNull();
  });
});

describe('GET /api/orders/:id (detail)', () => {
  let orderId;
  beforeEach(async () => {
    orderId = await factories.makeOrder({ idempotency_key: 'k-detail' });
    await factories.makeProduct({ code: 'DET-0001', description: 'Detail Product', unit_price: '12.34' });
    await factories.makeLabel('DET-0001', 'SOYBEAN', 'IA', 2, 2);
    await factories.addLine(orderId, 'DET-0001', 3, '12.34');
    await factories.addNote(orderId, 'farm', 'First note');
    await factories.addNote(orderId, 'ops', 'Second note');
  });

  it('200 with lines and notes (notes newest first)', async () => {
    const res = await request(app).get(`/api/orders/${orderId}`);
    expect(res.status).toBe(200);
    expect(res.body.order_id).toBe(orderId);
    expect(res.body.field).toEqual({ crop: 'SOYBEAN', state: 'IA', growth_stage: 2 });
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0].unit_price_snapshot).toBe(12.34); // JSON number
    expect(res.body.lines[0].description).toBe('Detail Product');
    expect(res.body.notes.map(n => n.text)).toEqual(['Second note', 'First note']);
    expect(res.body.line_count).toBe(1);
  });

  it('timestamps are ISO 8601 strings', async () => {
    const res = await request(app).get(`/api/orders/${orderId}`);
    expect(res.body.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(res.body.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('unknown order -> 404 envelope', async () => {
    const res = await request(app).get('/api/orders/ORD-99999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/orders (create)', () => {
  const validBody = {
    farm_id: 'F-999',
    field: { crop: 'SOYBEAN', state: 'IA', growth_stage: 2 },
    idempotency_key: 'create-key-1',
  };

  it('201 with a new DRAFT order', async () => {
    const res = await createReq(validBody);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.farm_name).toBe('Test Farm');
    expect(res.body.order_id).toMatch(/^ORD-\d+$/);
    expect(res.body.lines).toEqual([]);
    expect(res.body.notes).toEqual([]);
  });

  it('same farm + same key -> 200 same order_id, one row only', async () => {
    const first = await createReq(validBody);
    const second = await createReq(validBody);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.order_id).toBe(first.body.order_id);
    const { rows } = await query('SELECT COUNT(*)::int AS c FROM orders WHERE idempotency_key = $1', ['create-key-1']);
    expect(rows[0].c).toBe(1);
  });

  it('same key, different farm -> new order', async () => {
    await factories.makeFarm({ id: 'F-777', name: 'Third Farm' });
    const a = await createReq(validBody);
    const b = await createReq({ ...validBody, farm_id: 'F-777' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.order_id).not.toBe(b.body.order_id);
  });

  it('10 parallel identical requests -> exactly one order', async () => {
    const key = 'create-key-parallel';
    const results = await Promise.all(
      Array.from({ length: 10 }, () => createReq({ ...validBody, idempotency_key: key }))
    );
    const orderIds = results.map(r => r.body.order_id);
    expect(new Set(orderIds).size).toBe(1);
    const { rows } = await query('SELECT COUNT(*)::int AS c FROM orders WHERE idempotency_key = $1', [key]);
    expect(rows[0].c).toBe(1);
  });

  it('unknown farm -> 404', async () => {
    const res = await createReq({ ...validBody, farm_id: 'F-NOPE' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('missing field values -> 400 VALIDATION_ERROR', async () => {
    for (const bad of [
      { ...validBody, field: { crop: '', state: 'IA', growth_stage: 2 } },
      { ...validBody, field: { crop: 'SOYBEAN', state: '', growth_stage: 2 } },
      { ...validBody, field: { crop: 'SOYBEAN', state: 'IA', growth_stage: -1 } },
      { ...validBody, farm_id: '' },
      { ...validBody, idempotency_key: '' },
    ]) {
      const res = await createReq(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('farm_id normalised (F999 -> F-999)', async () => {
    const res = await createReq({ ...validBody, farm_id: 'f999' });
    expect(res.status).toBe(201);
    expect(res.body.farm_id).toBe('F-999');
  });
});

describe('POST /api/orders/:id/lines (add line)', () => {
  let orderId;
  beforeEach(async () => {
    orderId = await factories.makeOrder({ idempotency_key: 'k-lines' });
    await factories.makeProduct({ code: 'LIN-0001', description: 'Line Product', unit_price: '25.50', stock_available: 50 });
    await factories.makeLabel('LIN-0001', 'SOYBEAN', 'IA', 2, 2);
  });

  it('201, line_count increments, snapshot equals product price', async () => {
    const res = await addLineReq(orderId, { product_code: 'LIN-0001', qty: 2 });
    expect(res.status).toBe(201);
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0].qty).toBe(2);
    expect(res.body.lines[0].unit_price_snapshot).toBe(25.5);
    expect(res.body.line_count).toBe(1);
  });

  it('snapshot does not change if product price later changes', async () => {
    await addLineReq(orderId, { product_code: 'LIN-0001', qty: 1 });
    await query(`UPDATE products SET unit_price = '99.99' WHERE code = 'LIN-0001'`);
    const res = await request(app).get(`/api/orders/${orderId}`);
    expect(res.body.lines[0].unit_price_snapshot).toBe(25.5);
  });

  it('product code variants normalised', async () => {
    for (const variant of ['lin0001', 'LIN 0001', 'LIN_0001', 'LIN-0001']) {
      const res = await addLineReq(orderId, { product_code: variant, qty: 1 });
      expect(res.status).toBe(201);
      expect(res.body.lines[0].product_code).toBe('LIN-0001');
    }
  });

  it('qty 0 / -1 / 1.5 / "2" -> 400', async () => {
    for (const qty of [0, -1, 1.5, '2']) {
      const res = await addLineReq(orderId, { product_code: 'LIN-0001', qty });
      expect(res.status, `qty=${qty}`).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('invalid product code -> 400 (body before product lookup)', async () => {
    const res = await addLineReq(orderId, { product_code: '!!!', qty: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('unknown order with bad body -> 404 (NOT_FOUND beats body)', async () => {
    const res = await addLineReq('ORD-99999', { product_code: '!!!', qty: -5 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('bad body on existing order -> 400', async () => {
    const res = await addLineReq(orderId, { product_code: '!!!', qty: -5 });
    expect(res.status).toBe(400);
  });

  it('unknown product -> 404', async () => {
    const res = await addLineReq(orderId, { product_code: 'NOPE-0001', qty: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('unknown product on SHIPPED order -> 404 (NOT_FOUND beats ORDER_IMMUTABLE)', async () => {
    const shipped = await factories.makeOrder({ idempotency_key: 'k-shipped-404', status: 'SHIPPED' });
    const res = await addLineReq(shipped, { product_code: 'NOPE-0001', qty: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('inactive product on SHIPPED order -> 409 ORDER_IMMUTABLE (immutability beats inactive)', async () => {
    await factories.makeProduct({ code: 'INA-0001', active: false });
    const shipped = await factories.makeOrder({ idempotency_key: 'k-shipped-inactive', status: 'SHIPPED' });
    const res = await addLineReq(shipped, { product_code: 'INA-0001', qty: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_IMMUTABLE');
  });

  it('inactive + unlabelled -> 422 PRODUCT_INACTIVE (inactive beats label mismatch)', async () => {
    await factories.makeProduct({ code: 'INA-0002', active: false });
    const res = await addLineReq(orderId, { product_code: 'INA-0002', qty: 1 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PRODUCT_INACTIVE');
  });

  it('unlabelled -> 422 LABEL_MISMATCH with exact message format', async () => {
    await factories.makeProduct({ code: 'UNL-0001', description: 'Unlabelled', active: true });
    const res = await addLineReq(orderId, { product_code: 'UNL-0001', qty: 1 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('LABEL_MISMATCH');
    expect(res.body.error.message).toBe('UNL-0001 is not labelled for SOYBEAN in IA at growth stage 2');
  });

  it('labelled for wrong crop -> 422', async () => {
    await factories.makeProduct({ code: 'WRC-0001', active: true });
    await factories.makeLabel('WRC-0001', 'CORN', 'IA', 2, 2);
    const res = await addLineReq(orderId, { product_code: 'WRC-0001', qty: 1 });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('WRC-0001 is not labelled for SOYBEAN in IA at growth stage 2');
  });

  it('labelled for wrong state -> 422', async () => {
    await factories.makeProduct({ code: 'WRS-0001', active: true });
    await factories.makeLabel('WRS-0001', 'SOYBEAN', 'MN', 2, 2);
    const res = await addLineReq(orderId, { product_code: 'WRS-0001', qty: 1 });
    expect(res.status).toBe(422);
  });

  it('labelled for wrong stage -> 422', async () => {
    await factories.makeProduct({ code: 'WRG-0001', active: true });
    await factories.makeLabel('WRG-0001', 'SOYBEAN', 'IA', 5, 5);
    const res = await addLineReq(orderId, { product_code: 'WRG-0001', qty: 1 });
    expect(res.status).toBe(422);
  });

  it('wildcard state label works', async () => {
    await factories.makeProduct({ code: 'WLD-0001', active: true });
    await factories.makeLabel('WLD-0001', 'SOYBEAN', '*', 1, 5);
    const res = await addLineReq(orderId, { product_code: 'WLD-0001', qty: 1 });
    expect(res.status).toBe(201);
  });

  it('lines allowed in DRAFT and SUBMITTED, rejected in other statuses', async () => {
    const statuses = ['CONFIRMED', 'BACKORDERED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
    for (const status of statuses) {
      const oid = await factories.makeOrder({ idempotency_key: `k-immutable-${status}`, status });
      const res = await addLineReq(oid, { product_code: 'LIN-0001', qty: 1 });
      expect(res.status, status).toBe(409);
      expect(res.body.error.code).toBe('ORDER_IMMUTABLE');
    }
    // SUBMITTED allowed
    const sub = await factories.makeOrder({ idempotency_key: 'k-immutable-SUBMITTED', status: 'SUBMITTED' });
    const res = await addLineReq(sub, { product_code: 'LIN-0001', qty: 1 });
    expect(res.status).toBe(201);
  });
});

describe('POST /api/orders/:id/transition', () => {
  let orderId;
  beforeEach(async () => {
    orderId = await factories.makeOrder({ idempotency_key: 'k-txn' });
    await factories.makeProduct({ code: 'TXN-0001', unit_price: '10.00', stock_available: 100 });
    await factories.makeLabel('TXN-0001', 'SOYBEAN', 'IA', 2, 2);
    await factories.addLine(orderId, 'TXN-0001', 5, '10.00');
  });

  it('valid moves succeed', async () => {
    expect((await transitionReq(orderId, { to: 'SUBMITTED' })).status).toBe(200);
    expect((await transitionReq(orderId, { to: 'CONFIRMED' })).status).toBe(200);
    expect((await transitionReq(orderId, { to: 'SHIPPED' })).status).toBe(200);
    expect((await transitionReq(orderId, { to: 'DELIVERED' })).status).toBe(200);
  });

  it('same-status move -> 409 INVALID_TRANSITION', async () => {
    const res = await transitionReq(orderId, { to: 'DRAFT' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('DRAFT->CONFIRMED -> 409 INVALID_TRANSITION', async () => {
    const res = await transitionReq(orderId, { to: 'CONFIRMED' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('unknown "to" -> 400', async () => {
    const res = await transitionReq(orderId, { to: 'BOGUS' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('unknown order -> 404', async () => {
    const res = await transitionReq('ORD-99999', { to: 'SUBMITTED' });
    expect(res.status).toBe(404);
  });

  it('empty DRAFT submit -> 400 VALIDATION_ERROR', async () => {
    const empty = await factories.makeOrder({ idempotency_key: 'k-empty' });
    const res = await transitionReq(empty, { to: 'SUBMITTED' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('credit-hold farm submit -> 409 FARM_ON_HOLD', async () => {
    const hold = await factories.makeOrder({ farm_id: 'F-888', idempotency_key: 'k-hold' });
    await factories.addLine(hold, 'TXN-0001', 1, '10.00');
    const res = await transitionReq(hold, { to: 'SUBMITTED' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FARM_ON_HOLD');
  });

  it('credit-hold farm can still add lines to DRAFT', async () => {
    const hold = await factories.makeOrder({ farm_id: 'F-888', idempotency_key: 'k-hold-lines' });
    const res = await addLineReq(hold, { product_code: 'TXN-0001', qty: 1 });
    expect(res.status).toBe(201);
  });

  it('on-hold + empty order -> 400 (VALIDATION_ERROR precedes FARM_ON_HOLD)', async () => {
    const hold = await factories.makeOrder({ farm_id: 'F-888', idempotency_key: 'k-hold-empty' });
    const res = await transitionReq(hold, { to: 'SUBMITTED' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('invalid move on on-hold farm -> 409 INVALID_TRANSITION', async () => {
    const hold = await factories.makeOrder({ farm_id: 'F-888', idempotency_key: 'k-hold-invalid' });
    const res = await transitionReq(hold, { to: 'DELIVERED' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('SUBMITTED->CANCELLED works', async () => {
    await transitionReq(orderId, { to: 'SUBMITTED' });
    const res = await transitionReq(orderId, { to: 'CANCELLED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('CONFIRMED->CANCELLED works', async () => {
    await transitionReq(orderId, { to: 'SUBMITTED' });
    await transitionReq(orderId, { to: 'CONFIRMED' });
    const res = await transitionReq(orderId, { to: 'CANCELLED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('CONFIRMED->BACKORDERED then un-backorder', async () => {
    await transitionReq(orderId, { to: 'SUBMITTED' });
    await transitionReq(orderId, { to: 'CONFIRMED' });
    const bo = await transitionReq(orderId, { to: 'BACKORDERED' });
    expect(bo.status).toBe(200);
    expect(bo.body.status).toBe('BACKORDERED');
    const back = await transitionReq(orderId, { to: 'CONFIRMED' });
    expect(back.status).toBe(200);
    expect(back.body.status).toBe('CONFIRMED');
  });
});

describe('stock behaviour', () => {
  beforeEach(async () => {
    await factories.makeProduct({ code: 'STK-0001', unit_price: '10.00', stock_available: 5, stock_reserved: 0 });
    await factories.makeLabel('STK-0001', 'SOYBEAN', 'IA', 2, 2);
  });

  async function orderWith(qtyA, qtyB = null) {
    const oid = await factories.makeOrder({ idempotency_key: `k-stock-${Math.random()}` });
    await factories.addLine(oid, 'STK-0001', qtyA, '10.00');
    if (qtyB !== null) await factories.addLine(oid, 'STK-0001', qtyB, '10.00');
    await transitionReq(oid, { to: 'SUBMITTED' });
    return oid;
  }

  it('confirm with enough stock -> CONFIRMED and stock reserved', async () => {
    const oid = await orderWith(3);
    const res = await transitionReq(oid, { to: 'CONFIRMED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CONFIRMED');
    const { rows } = await query("SELECT stock_available, stock_reserved FROM products WHERE code = 'STK-0001'");
    expect(rows[0].stock_available).toBe(2);
    expect(rows[0].stock_reserved).toBe(3);
  });

  it('shortfall -> BACKORDERED and stock untouched', async () => {
    const oid = await orderWith(9);
    const res = await transitionReq(oid, { to: 'CONFIRMED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('BACKORDERED');
    const { rows } = await query("SELECT stock_available, stock_reserved FROM products WHERE code = 'STK-0001'");
    expect(rows[0].stock_available).toBe(5);
    expect(rows[0].stock_reserved).toBe(0);
  });

  it('two lines same product sum exceeds stock -> BACKORDERED', async () => {
    const oid = await orderWith(3, 3); // sum 6 > 5
    const res = await transitionReq(oid, { to: 'CONFIRMED' });
    expect(res.body.status).toBe('BACKORDERED');
  });

  it('un-backorder while short -> 409 and still BACKORDERED', async () => {
    const oid = await orderWith(9);
    await transitionReq(oid, { to: 'CONFIRMED' });
    const res = await transitionReq(oid, { to: 'CONFIRMED' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(res.body.error.message).toContain('insufficient stock');
    const get = await request(app).get(`/api/orders/${oid}`);
    expect(get.body.status).toBe('BACKORDERED');
  });

  it('add stock then un-backorder -> CONFIRMED', async () => {
    const oid = await orderWith(9);
    await transitionReq(oid, { to: 'CONFIRMED' });
    await query(`UPDATE products SET stock_available = 20 WHERE code = 'STK-0001'`);
    const res = await transitionReq(oid, { to: 'CONFIRMED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CONFIRMED');
  });

  it('cancel from CONFIRMED releases reservation', async () => {
    const oid = await orderWith(3);
    await transitionReq(oid, { to: 'CONFIRMED' });
    await transitionReq(oid, { to: 'CANCELLED' });
    const { rows } = await query("SELECT stock_available, stock_reserved FROM products WHERE code = 'STK-0001'");
    expect(rows[0].stock_available).toBe(5);
    expect(rows[0].stock_reserved).toBe(0);
  });

  it('CONFIRMED->BACKORDERED releases reservation', async () => {
    const oid = await orderWith(3);
    await transitionReq(oid, { to: 'CONFIRMED' });
    await transitionReq(oid, { to: 'BACKORDERED' });
    const { rows } = await query("SELECT stock_available, stock_reserved FROM products WHERE code = 'STK-0001'");
    expect(rows[0].stock_available).toBe(5);
    expect(rows[0].stock_reserved).toBe(0);
  });

  it('SHIPPED consumes reservation', async () => {
    const oid = await orderWith(3);
    await transitionReq(oid, { to: 'CONFIRMED' });
    await transitionReq(oid, { to: 'SHIPPED' });
    const { rows } = await query("SELECT stock_available, stock_reserved FROM products WHERE code = 'STK-0001'");
    expect(rows[0].stock_available).toBe(2);
    expect(rows[0].stock_reserved).toBe(0);
  });

  it('two orders confirmed concurrently -> stock never goes negative', async () => {
    // Product with stock 5; both orders want 4 -> only one can confirm
    const oid1 = await orderWith(4);
    const oid2 = await orderWith(4);
    const [r1, r2] = await Promise.all([
      transitionReq(oid1, { to: 'CONFIRMED' }),
      transitionReq(oid2, { to: 'CONFIRMED' }),
    ]);
    const confirmedCount = [r1.body.status, r2.body.status].filter(s => s === 'CONFIRMED').length;
    const backorderedCount = [r1.body.status, r2.body.status].filter(s => s === 'BACKORDERED').length;
    expect(confirmedCount).toBe(1);
    expect(backorderedCount).toBe(1);
    const { rows } = await query("SELECT stock_available, stock_reserved FROM products WHERE code = 'STK-0001'");
    expect(rows[0].stock_available).toBeGreaterThanOrEqual(0);
    expect(rows[0].stock_available).toBe(1);
    expect(rows[0].stock_reserved).toBe(4);
  });
});

describe('notes', () => {
  let orderId;
  beforeEach(async () => {
    orderId = await factories.makeOrder({ idempotency_key: 'k-notes' });
  });

  it('text is trimmed and stored', async () => {
    const res = await noteReq(orderId, { author: 'farm', text: '  hello world  ' });
    expect(res.status).toBe(201);
    expect(res.body.notes[0].text).toBe('hello world');
  });

  it('blank text -> 400', async () => {
    const res = await noteReq(orderId, { author: 'farm', text: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('2000 chars ok, 2001 -> 400', async () => {
    const ok = await noteReq(orderId, { author: 'farm', text: 'x'.repeat(2000) });
    expect(ok.status).toBe(201);
    const bad = await noteReq(orderId, { author: 'farm', text: 'x'.repeat(2001) });
    expect(bad.status).toBe(400);
  });

  it('invalid author -> 400', async () => {
    const res = await noteReq(orderId, { author: 'admin', text: 'hi' });
    expect(res.status).toBe(400);
  });

  it('notes newest first', async () => {
    await noteReq(orderId, { author: 'farm', text: 'one' });
    await new Promise(r => setTimeout(r, 5));
    await noteReq(orderId, { author: 'ops', text: 'two' });
    const res = await request(app).get(`/api/orders/${orderId}`);
    expect(res.body.notes.map(n => n.text)).toEqual(['two', 'one']);
  });

  it('updated_at changes after adding a note', async () => {
    const before = (await request(app).get(`/api/orders/${orderId}`)).body.updated_at;
    await noteReq(orderId, { author: 'farm', text: 'new' });
    const after = (await request(app).get(`/api/orders/${orderId}`)).body.updated_at;
    expect(after).not.toBe(before);
  });
});

describe('immutability after SHIPPED', () => {
  let orderId;
  beforeEach(async () => {
    orderId = await factories.makeOrder({ idempotency_key: 'k-immut' });
    await factories.makeProduct({ code: 'IMM-0001', unit_price: '10.00', stock_available: 10 });
    await factories.makeLabel('IMM-0001', 'SOYBEAN', 'IA', 2, 2);
    await factories.addLine(orderId, 'IMM-0001', 1, '10.00');
    await transitionReq(orderId, { to: 'SUBMITTED' });
    await transitionReq(orderId, { to: 'CONFIRMED' });
    await transitionReq(orderId, { to: 'SHIPPED' });
  });

  it('adding lines after SHIPPED -> 409 ORDER_IMMUTABLE', async () => {
    const res = await addLineReq(orderId, { product_code: 'IMM-0001', qty: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_IMMUTABLE');
  });

  it('only DELIVERED allowed after SHIPPED', async () => {
    const bad = await transitionReq(orderId, { to: 'CONFIRMED' });
    expect(bad.status).toBe(409);
    const good = await transitionReq(orderId, { to: 'DELIVERED' });
    expect(good.status).toBe(200);
  });

  it('notes still allowed after SHIPPED', async () => {
    const res = await noteReq(orderId, { author: 'farm', text: 'post-ship note' });
    expect(res.status).toBe(201);
  });
});

describe('persistence across reads and restart', () => {
  it('a mutation is visible on a fresh GET', async () => {
    const oid = await factories.makeOrder({ idempotency_key: 'k-persist' });
    await factories.makeProduct({ code: 'PER-0001', unit_price: '5.00', stock_available: 10 });
    await factories.makeLabel('PER-0001', 'SOYBEAN', 'IA', 2, 2);
    await addLineReq(oid, { product_code: 'PER-0001', qty: 1 });
    const res = await request(app).get(`/api/orders/${oid}`);
    expect(res.body.lines).toHaveLength(1);
  });

  it('survives a simulated restart (pool close + recreate)', async () => {
    const oid = await factories.makeOrder({ idempotency_key: 'k-restart' });
    await factories.addNote(oid, 'farm', 'before restart');

    resetTestPool(); // simulate restart: drop pool connections

    const { query } = await import('./helpers.js');
    const res = await query(`SELECT order_id FROM orders WHERE order_id = $1`, [oid]);
    expect(res.rows[0].order_id).toBe(oid);
    const notes = await query(`SELECT text FROM notes WHERE order_id = $1`, [oid]);
    expect(notes.rows[0].text).toBe('before restart');
  });
});

describe('error envelope & no leaks', () => {
  it('malformed JSON -> 400 VALIDATION_ERROR envelope', async () => {
    const res = await request(app).post('/api/orders')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('unknown route -> 404 NOT_FOUND envelope', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('no stack traces leak on a forced 500', async () => {
    // Force an unhandled error by making the service throw
    const { orderService } = await import('../src/services/orderService.js');
    const orig = orderService.getOrder;
    orderService.getOrder = async () => { throw new Error('boom stack trace secret'); };
    try {
      const res = await request(app).get('/api/orders/ORD-12345');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(res.body)).not.toContain('at ');
      expect(JSON.stringify(res.body)).not.toContain('Error:');
      expect(JSON.stringify(res.body)).not.toContain('boom');
    } finally {
      orderService.getOrder = orig;
    }
  });

  it('error bodies never contain stack lines', async () => {
    const res = await request(app).get('/api/orders?page_size=101');
    expect(JSON.stringify(res.body)).not.toMatch(/\s+at\s/);
  });
});