// orderService.js — business rules + transactions. Every mutation runs in a
// READ COMMITTED transaction with SELECT ... FOR UPDATE on the order row.
// Confirm/un-backorder/cancel-from-confirmed also lock stock rows ordered by product_code.

const { AppError } = require('../errors');
const { getPool, withTransaction } = require('../db/pool');
const { canTransition, LINE_EDITABLE, STATUSES } = require('../domain/lifecycle');
const { isLabelledFor } = require('../domain/labels');
const { shortfalls } = require('../domain/stock');
const { serializeDetail, serializeSummary } = require('../serializers');
const { createOrder: createOrderSchema, addLineBody, transitionBody, addNoteBody, parseOr400 } = require('../validation/schemas');
const ordersRepo = require('../repositories/ordersRepo');
const productsRepo = require('../repositories/productsRepo');
const farmsRepo = require('../repositories/farmsRepo');

// ---------- list / get ----------
async function listOrders({ status, q, page, page_size }) {
  return await withTransaction(async client => {
    const { items, total } = await ordersRepo.listOrders(client, { status, q, page, page_size });
    return {
      items: items.map(r => serializeSummary(r)),
      page,
      page_size,
      total,
    };
  });
}

async function getOrder(orderId) {
  return await withTransaction(async client => {
    const detail = await ordersRepo.getOrderDetail(client, orderId);
    if (!detail) throw new AppError('NOT_FOUND', `Order ${orderId} not found`);
    return serializeDetail(detail, detail.lines, detail.notes);
  });
}

// ---------- create ----------
async function createOrder(data) {
  return await withTransaction(async client => {
    // Validate body
    const body = parseOr400(createOrderSchema, data);

    // Farm must exist
    const farm = await farmsRepo.findFarmById(client, body.farm_id);
    if (!farm) {
      throw new AppError('NOT_FOUND', `Farm ${body.farm_id} not found`);
    }

    const orderId = await ordersRepo.nextOrderId(client);
    const inserted = await ordersRepo.createOrderRow(client, {
      orderId,
      farmId: body.farm_id,
      field: body.field,
      status: 'DRAFT',
      idempotencyKey: body.idempotency_key,
    });

    if (inserted) {
      const detail = await ordersRepo.getOrderDetail(client, orderId);
      return { order: serializeDetail(detail, detail.lines, detail.notes), created: true };
    }

    // Conflict: fetch existing order for this (farm_id, idempotency_key)
    const existingResult = await client.query(
      `SELECT order_id FROM orders WHERE farm_id = $1 AND idempotency_key = $2`,
      [body.farm_id, body.idempotency_key]
    );
    if (!existingResult.rows.length) {
      throw new AppError('INTERNAL_ERROR', 'Idempotency conflict but no matching order found');
    }
    const detail = await ordersRepo.getOrderDetail(client, existingResult.rows[0].order_id);
    return { order: serializeDetail(detail, detail.lines, detail.notes), created: false };
  });
}

// ---------- add line ----------
async function addLine(orderId, data) {
  return await withTransaction(async client => {
    // 1. Order NOT_FOUND
    const order = await ordersRepo.lockOrder(client, orderId);
    if (!order) throw new AppError('NOT_FOUND', `Order ${orderId} not found`);

    // 2. Body VALIDATION_ERROR
    const body = parseOr400(addLineBody, data);

    // 3. Product NOT_FOUND
    const product = await productsRepo.findProductByCode(client, body.product_code);
    if (!product) {
      throw new AppError('NOT_FOUND', `Product ${body.product_code} not found`);
    }

    // 4. ORDER_IMMUTABLE
    if (!LINE_EDITABLE.includes(order.status)) {
      throw new AppError('ORDER_IMMUTABLE',
        `Order ${orderId} is ${order.status}; lines cannot be changed after shipment`);
    }

    // 5. PRODUCT_INACTIVE
    if (!product.active) {
      throw new AppError('PRODUCT_INACTIVE',
        `Product ${body.product_code} is inactive`);
    }

    // 6. LABEL_MISMATCH
    const field = {
      crop: order.field_crop,
      state: order.field_state,
      growth_stage: order.field_growth_stage,
    };
    const labels = await productsRepo.getLabelsForProduct(client, body.product_code);
    if (!isLabelledFor(labels, field)) {
      throw new AppError('LABEL_MISMATCH',
        `${body.product_code} is not labelled for ${field.crop} in ${field.state} at growth stage ${field.growth_stage}`);
    }

    const lineId = await ordersRepo.nextLineId(client);
    await ordersRepo.addLineRow(client, {
      lineId,
      orderId,
      productCode: body.product_code,
      qty: body.qty,
      unitPrice: product.unit_price,
    });
    await ordersRepo.touchOrder(client, orderId);

    const detail = await ordersRepo.getOrderDetail(client, orderId);
    return serializeDetail(detail, detail.lines, detail.notes);
  });
}

// ---------- transition ----------
async function transitionOrder(orderId, data) {
  return await withTransaction(async client => {
    // 1. Order NOT_FOUND
    const order = await ordersRepo.lockOrder(client, orderId);
    if (!order) throw new AppError('NOT_FOUND', `Order ${orderId} not found`);

    // 2. Body VALIDATION_ERROR
    const body = parseOr400(transitionBody, data);

    // 3. INVALID_TRANSITION (includes to == current)
    if (!canTransition(order.status, body.to)) {
      throw new AppError('INVALID_TRANSITION',
        `Cannot transition from ${order.status} to ${body.to}`);
    }
    if (order.status === body.to) {
      throw new AppError('INVALID_TRANSITION',
        `Order is already ${order.status}`);
    }

    // 4-a. DRAFT->SUBMITTED: no lines check
    if (order.status === 'DRAFT' && body.to === 'SUBMITTED') {
      const lines = await ordersRepo.getLinesForOrder(client, orderId);
      if (!lines.length) {
        throw new AppError('VALIDATION_ERROR',
          'Cannot submit an order with no lines');
      }
      // 4-b. DRAFT->SUBMITTED: farm on hold check
      const farmId = order.farm_id;
      if (farmId) {
        const farm = await farmsRepo.findFarmById(client, farmId);
        // If farm can't be resolved, treat as not on hold (decision documented)
        if (farm && farm.credit_hold) {
          throw new AppError('FARM_ON_HOLD',
            `Farm ${farmId} is on credit hold; cannot submit`);
        }
      }
    }

    // Execute the transition
    await executeTransition(client, order, body.to);
    await ordersRepo.insertStatusHistory(client, {
      orderId,
      from: order.status,
      to: body.to,
    });

    const detail = await ordersRepo.getOrderDetail(client, orderId);
    return serializeDetail(detail, detail.lines, detail.notes);
  });
}

async function executeTransition(client, order, to) {
  const from = order.status;
  const orderId = order.order_id;

  if (from === 'SUBMITTED' && to === 'CONFIRMED') {
    await handleConfirm(client, orderId);
    return;
  }
  if (from === 'BACKORDERED' && to === 'CONFIRMED') {
    await handleUnBackorder(client, orderId);
    return;
  }
  if (from === 'CONFIRMED' && to === 'CANCELLED') {
    await handleReleaseReservation(client, orderId);
    await ordersRepo.updateOrderStatus(client, orderId, 'CANCELLED');
    return;
  }
  if (from === 'CONFIRMED' && to === 'BACKORDERED') {
    await handleReleaseReservation(client, orderId);
    await ordersRepo.updateOrderStatus(client, orderId, 'BACKORDERED');
    return;
  }
  if (from === 'SUBMITTED' && to === 'CANCELLED') {
    await ordersRepo.updateOrderStatus(client, orderId, 'CANCELLED');
    return;
  }
  if (from === 'CONFIRMED' && to === 'SHIPPED') {
    await handleShip(client, orderId);
    return;
  }
  if (from === 'SHIPPED' && to === 'DELIVERED') {
    await ordersRepo.updateOrderStatus(client, orderId, 'DELIVERED');
    return;
  }
  if (from === 'DRAFT' && to === 'SUBMITTED') {
    await ordersRepo.updateOrderStatus(client, orderId, 'SUBMITTED');
    return;
  }
  throw new AppError('INTERNAL_ERROR', `Unhandled transition ${from} -> ${to}`);
}

// Confirm: lock stock, check shortfalls -> CONFIRMED or BACKORDERED
async function handleConfirm(client, orderId) {
  const lines = await ordersRepo.getLinesForOrder(client, orderId);
  const codes = [...new Set(lines.map(l => l.product_code))];
  const stock = await productsRepo.lockStock(client, codes);
  const result = shortfalls(lines, stock);

  if (result.sufficient) {
    // Reserve
    await adjustStock(client, lines, stock, 'reserve');
    await ordersRepo.updateOrderStatus(client, orderId, 'CONFIRMED');
  } else {
    await ordersRepo.updateOrderStatus(client, orderId, 'BACKORDERED');
  }
}

// Un-backorder: re-check stock; if still short -> 409
async function handleUnBackorder(client, orderId) {
  const lines = await ordersRepo.getLinesForOrder(client, orderId);
  const codes = [...new Set(lines.map(l => l.product_code))];
  const stock = await productsRepo.lockStock(client, codes);
  const result = shortfalls(lines, stock);

  if (!result.sufficient) {
    const codesStr = result.shortfalls.map(s => s.product_code).join(', ');
    throw new AppError('INVALID_TRANSITION',
      `Insufficient stock for ${codesStr}`);
  }

  await adjustStock(client, lines, stock, 'reserve');
  await ordersRepo.updateOrderStatus(client, orderId, 'CONFIRMED');
}

// Release reservation (available += reserved, reserved = 0)
async function handleReleaseReservation(client, orderId) {
  const lines = await ordersRepo.getLinesForOrder(client, orderId);
  const codes = [...new Set(lines.map(l => l.product_code))];
  const stock = await productsRepo.lockStock(client, codes);

  for (const line of lines) {
    const s = stock[line.product_code];
    if (s) {
      const released = Math.min(s.reserved, line.qty);
      await productsRepo.updateStockAvailable(client, line.product_code, s.available + released);
      await productsRepo.updateStockReserved(client, line.product_code, s.reserved - released);
    }
  }
}

// Ship: consume reservation (reserved -= qty)
async function handleShip(client, orderId) {
  const lines = await ordersRepo.getLinesForOrder(client, orderId);
  const codes = [...new Set(lines.map(l => l.product_code))];
  const stock = await productsRepo.lockStock(client, codes);

  for (const line of lines) {
    const s = stock[line.product_code];
    if (s) {
      const consume = Math.min(s.reserved, line.qty);
      await productsRepo.updateStockReserved(client, line.product_code, s.reserved - consume);
    }
  }
  await ordersRepo.updateOrderStatus(client, orderId, 'SHIPPED');
}

async function adjustStock(client, lines, stock, action) {
  for (const line of lines) {
    const s = stock[line.product_code];
    if (!s) continue;
    if (action === 'reserve') {
      await productsRepo.updateStockAvailable(client, line.product_code, s.available - line.qty);
      await productsRepo.updateStockReserved(client, line.product_code, s.reserved + line.qty);
    }
  }
}

// ---------- add note ----------
async function addNote(orderId, data) {
  return await withTransaction(async client => {
    const order = await ordersRepo.lockOrder(client, orderId);
    if (!order) throw new AppError('NOT_FOUND', `Order ${orderId} not found`);

    const body = parseOr400(addNoteBody, data);

    const noteId = await ordersRepo.nextNoteId(client);
    await ordersRepo.addNoteRow(client, {
      noteId,
      orderId,
      author: body.author,
      text: body.text,
    });
    await ordersRepo.touchOrder(client, orderId);

    const detail = await ordersRepo.getOrderDetail(client, orderId);
    return serializeDetail(detail, detail.lines, detail.notes);
  });
}

module.exports = {
  listOrders, getOrder, createOrder, addLine, transitionOrder, addNote,
};