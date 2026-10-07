// ordersRepo.js — plain parameterised SQL. Every function takes a client
// (pool or transaction client). No string concatenation of user input.

// q is a case-insensitive substring of order_id OR farm name.
// Escape % and _ so user input is matched literally.
function escapeLike(s) {
  return s.replace(/[\\%_]/g, '\\$&');
}

async function listOrders(client, { status, q, page, page_size }) {
  const where = [];
  const params = [];
  let i = 1;

  if (status) {
    where.push(`o.status = $${i++}`);
    params.push(status);
  }
  if (q && String(q).trim() !== '') {
    const like = `%${escapeLike(q.trim())}%`;
    where.push(`(o.order_id ILIKE $${i} OR f.name ILIKE $${i})`);
    params.push(like);
    i++;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countResult = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM orders o
     LEFT JOIN farms f ON f.id = o.farm_id
     ${whereSql}`,
    params
  );
  const total = countResult.rows[0].total;

  const listParams = [...params, page_size, (page - 1) * page_size];
  const itemsResult = await client.query(
    `SELECT o.order_id, o.farm_id, f.name AS farm_name,
            o.field_crop, o.field_state, o.field_growth_stage,
            o.status, o.created_at, o.updated_at,
            (SELECT COUNT(*)::int FROM order_lines ol WHERE ol.order_id = o.order_id) AS line_count
     FROM orders o
     LEFT JOIN farms f ON f.id = o.farm_id
     ${whereSql}
     ORDER BY o.created_at DESC, o.order_id DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return { items: itemsResult.rows, total };
}

async function findOrderById(client, orderId) {
  const result = await client.query(
    `SELECT o.order_id, o.farm_id, f.name AS farm_name,
            o.field_crop, o.field_state, o.field_growth_stage,
            o.status, o.created_at, o.updated_at,
            (SELECT COUNT(*)::int FROM order_lines ol WHERE ol.order_id = o.order_id) AS line_count
     FROM orders o
     LEFT JOIN farms f ON f.id = o.farm_id
     WHERE o.order_id = $1`,
    [orderId]
  );
  return result.rows[0] || null;
}

async function getOrderDetail(client, orderId) {
  const order = await findOrderById(client, orderId);
  if (!order) return null;

  const linesResult = await client.query(
    `SELECT ol.line_id, ol.product_code, p.description, ol.qty, ol.unit_price_snapshot
     FROM order_lines ol
     LEFT JOIN products p ON p.code = ol.product_code
     WHERE ol.order_id = $1
     ORDER BY ol.line_id`,
    [orderId]
  );

  const notesResult = await client.query(
    `SELECT note_id, author, text, created_at
     FROM notes
     WHERE order_id = $1
     ORDER BY created_at DESC, note_id DESC`,
    [orderId]
  );

  return { ...order, lines: linesResult.rows, notes: notesResult.rows };
}

// Lock the order row for update (must be inside a transaction)
async function lockOrder(client, orderId) {
  const result = await client.query(
    `SELECT order_id, farm_id, field_crop, field_state, field_growth_stage,
            status, source, created_at, updated_at
     FROM orders
     WHERE order_id = $1
     FOR UPDATE`,
    [orderId]
  );
  return result.rows[0] || null;
}

async function createOrderRow(client, { orderId, farmId, field, status, idempotencyKey }) {
  const result = await client.query(
    `INSERT INTO orders (order_id, farm_id, field_crop, field_state, field_growth_stage,
                         status, idempotency_key, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'api')
     ON CONFLICT (farm_id, idempotency_key) DO NOTHING
     RETURNING order_id`,
    [orderId, farmId, field.crop, field.state, field.growth_stage, status, idempotencyKey]
  );
  return result.rows[0] || null;
}

async function nextOrderId(client) {
  const result = await client.query(`SELECT nextval('order_id_seq') AS n`);
  return `ORD-${result.rows[0].n}`;
}

async function updateOrderStatus(client, orderId, status) {
  await client.query(
    `UPDATE orders SET status = $2, updated_at = NOW() WHERE order_id = $1`,
    [orderId, status]
  );
}

async function touchOrder(client, orderId) {
  await client.query(
    `UPDATE orders SET updated_at = NOW() WHERE order_id = $1`,
    [orderId]
  );
}

async function insertStatusHistory(client, { orderId, from, to }) {
  await client.query(
    `INSERT INTO order_status_history (order_id, from_status, to_status)
     VALUES ($1, $2, $3)`,
    [orderId, from, to]
  );
}

async function addLineRow(client, { lineId, orderId, productCode, qty, unitPrice }) {
  await client.query(
    `INSERT INTO order_lines (line_id, order_id, product_code, qty, unit_price_snapshot, source)
     VALUES ($1, $2, $3, $4, $5, 'api')`,
    [lineId, orderId, productCode, qty, unitPrice]
  );
}

async function nextLineId(client) {
  const result = await client.query(`SELECT nextval('line_id_seq') AS n`);
  return `L-${result.rows[0].n}`;
}

async function addNoteRow(client, { noteId, orderId, author, text }) {
  await client.query(
    `INSERT INTO notes (note_id, order_id, author, text, source)
     VALUES ($1, $2, $3, $4, 'api')`,
    [noteId, orderId, author, text]
  );
}

async function nextNoteId(client) {
  const result = await client.query(`SELECT nextval('note_id_seq') AS n`);
  return `N-${result.rows[0].n}`;
}

async function getLinesForOrder(client, orderId) {
  const result = await client.query(
    `SELECT line_id, product_code, qty FROM order_lines WHERE order_id = $1 ORDER BY line_id`,
    [orderId]
  );
  return result.rows;
}

module.exports = {
  listOrders, findOrderById, getOrderDetail, lockOrder, createOrderRow, nextOrderId,
  updateOrderStatus, touchOrder, insertStatusHistory, addLineRow, nextLineId,
  addNoteRow, nextNoteId, getLinesForOrder,
};