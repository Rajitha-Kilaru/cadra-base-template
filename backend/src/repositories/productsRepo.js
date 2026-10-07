// productsRepo.js — plain parameterised SQL.

async function listProducts(client) {
  const result = await client.query(
    `SELECT code, description, active, unit_price, stock_available, stock_reserved,
            created_at, updated_at
     FROM products
     ORDER BY code`
  );
  return result.rows;
}

async function findProductByCode(client, code) {
  const result = await client.query(
    `SELECT code, description, active, unit_price, stock_available, stock_reserved
     FROM products WHERE code = $1`,
    [code]
  );
  return result.rows[0] || null;
}

async function getLabelsForProduct(client, code) {
  const result = await client.query(
    `SELECT crop, state, stage_min, stage_max FROM product_labels WHERE product_code = $1`,
    [code]
  );
  return result.rows;
}

async function getStockForProducts(client, codes) {
  if (!codes.length) return {};
  const placeholders = codes.map((_, i) => `$${i + 1}`).join(',');
  const result = await client.query(
    `SELECT code, stock_available, stock_reserved
     FROM products
     WHERE code IN (${placeholders})`,
    codes
  );
  const map = {};
  for (const r of result.rows) {
    map[r.code] = { available: r.stock_available, reserved: r.stock_reserved };
  }
  return map;
}

// Lock stock rows for update, ordered by product_code to avoid deadlocks.
async function lockStock(client, codes) {
  if (!codes.length) return {};
  const placeholders = codes.map((_, i) => `$${i + 1}`).join(',');
  const result = await client.query(
    `SELECT code, stock_available, stock_reserved
     FROM products
     WHERE code IN (${placeholders})
     ORDER BY code
     FOR UPDATE`,
    codes
  );
  const map = {};
  for (const r of result.rows) {
    map[r.code] = { available: r.stock_available, reserved: r.stock_reserved };
  }
  return map;
}

async function updateStockAvailable(client, code, newAvailable) {
  await client.query(
    `UPDATE products SET stock_available = $2, updated_at = NOW() WHERE code = $1`,
    [code, newAvailable]
  );
}

async function updateStockReserved(client, code, newReserved) {
  await client.query(
    `UPDATE products SET stock_reserved = $2, updated_at = NOW() WHERE code = $1`,
    [code, newReserved]
  );
}

async function createProduct(client, { code, description, active, unitPrice, stockAvailable, stockReserved }) {
  const result = await client.query(
    `INSERT INTO products (code, description, active, unit_price, stock_available, stock_reserved, source)
     VALUES ($1, $2, $3, $4, $5, $6, 'api')
     ON CONFLICT (code) DO UPDATE SET
       description = EXCLUDED.description,
       active = EXCLUDED.active,
       unit_price = EXCLUDED.unit_price,
       stock_available = EXCLUDED.stock_available,
       stock_reserved = EXCLUDED.stock_reserved,
       updated_at = NOW()
     WHERE products.source = 'import'
     RETURNING code`,
    [code, description, active, unitPrice, stockAvailable, stockReserved]
  );
  return result.rows[0] || null;
}

async function updateProduct(client, code, { description, active, unitPrice, stockAvailable, stockReserved }) {
  const result = await client.query(
    `UPDATE products SET description = $2, active = $3, unit_price = $4,
       stock_available = $5, stock_reserved = $6, updated_at = NOW()
     WHERE code = $1 AND source = 'api'
     RETURNING code`,
    [code, description, active, unitPrice, stockAvailable, stockReserved]
  );
  return result.rows[0] || null;
}

async function deleteProduct(client, code) {
  const result = await client.query(
    `DELETE FROM products WHERE code = $1 AND source = 'api'
     RETURNING code`,
    [code]
  );
  return result.rows[0] || null;
}

async function replaceProductLabels(client, productCode, labels) {
  await client.query('DELETE FROM product_labels WHERE product_code = $1', [productCode]);
  for (const l of labels) {
    await client.query(
      `INSERT INTO product_labels (product_code, crop, state, stage_min, stage_max)
       VALUES ($1, $2, $3, $4, $5)`,
      [productCode, l.crop, l.state, l.stage_min, l.stage_max]
    );
  }
}

module.exports = {
  listProducts, findProductByCode, getLabelsForProduct, getStockForProducts, lockStock,
  updateStockAvailable, updateStockReserved,
  createProduct, updateProduct, deleteProduct, replaceProductLabels,
};