-- 001_init.sql — Prairie Ridge Ag Supply Ordering System
-- Run by migrate.js. Idempotent (IF NOT EXISTS).

-- ============ migration tracking ============
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ sequences for API-generated IDs ============
-- The loader sets each sequence PAST the max imported id so new ORD-/L-/N- ids never collide.
CREATE SEQUENCE IF NOT EXISTS order_id_seq START 10000;
CREATE SEQUENCE IF NOT EXISTS line_id_seq  START 10000;
CREATE SEQUENCE IF NOT EXISTS note_id_seq  START 10000;

-- ============ catalog ============
CREATE TABLE IF NOT EXISTS farms (
  id          TEXT PRIMARY KEY,                 -- canonical F-### (e.g. F-020)
  name        TEXT NOT NULL,
  credit_hold BOOLEAN NOT NULL DEFAULT FALSE,
  state       TEXT,                             -- USPS code; NULL if unknown in export
  source      TEXT NOT NULL DEFAULT 'import' CHECK (source IN ('import','api')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  code        TEXT PRIMARY KEY,                 -- canonical AAA-9999 (2-3 letter prefix allowed)
  description TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  unit_price  NUMERIC(10,2) NOT NULL DEFAULT 0, -- money NEVER stored as float
  -- stock: integers >= 0. Warehouse-level stock (if in export) is summed here.
  stock_available INTEGER NOT NULL DEFAULT 0 CHECK (stock_available >= 0),
  stock_reserved  INTEGER NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0),
  source      TEXT NOT NULL DEFAULT 'import' CHECK (source IN ('import','api')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_labels (
  id           SERIAL PRIMARY KEY,
  product_code TEXT NOT NULL REFERENCES products(code) ON DELETE CASCADE,
  crop         TEXT NOT NULL,
  state        TEXT NOT NULL,                   -- USPS code, or '*' = all states
  stage_min    INTEGER NOT NULL DEFAULT 1,      -- inclusive
  stage_max    INTEGER NOT NULL DEFAULT 5,      -- inclusive
  UNIQUE (product_code, crop, state, stage_min, stage_max)
);
CREATE INDEX IF NOT EXISTS idx_product_labels_lookup
  ON product_labels(product_code, crop, state, stage_min, stage_max);

-- ============ ordering ============
CREATE TABLE IF NOT EXISTS orders (
  order_id           TEXT PRIMARY KEY,          -- canonical ORD-#### (e.g. ORD-6001)
  farm_id            TEXT,                      -- deliberately NOT a hard FK: contract allows
  --                                            -- orders whose farm can't be resolved (farm_name null)
  field_crop         TEXT NOT NULL,
  field_state        TEXT NOT NULL,
  field_growth_stage INTEGER NOT NULL CHECK (field_growth_stage BETWEEN 1 AND 5),
  status             TEXT NOT NULL DEFAULT 'DRAFT' CHECK (
    status IN ('DRAFT','SUBMITTED','CONFIRMED','BACKORDERED','SHIPPED','DELIVERED','CANCELLED')),
  idempotency_key    TEXT,
  source             TEXT NOT NULL DEFAULT 'import' CHECK (source IN ('import','api')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (farm_id, idempotency_key)   -- idempotent creation; NULLs never collide
);
CREATE INDEX IF NOT EXISTS idx_orders_created_at  ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status      ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_farm_id     ON orders(farm_id);
CREATE INDEX IF NOT EXISTS idx_orders_lower_orderid ON orders(lower(order_id));
CREATE INDEX IF NOT EXISTS idx_orders_field_state ON orders(field_state);

CREATE TABLE IF NOT EXISTS order_lines (
  line_id            TEXT PRIMARY KEY,          -- canonical L-#### (e.g. L-7001)
  order_id           TEXT NOT NULL REFERENCES orders(order_id),
  product_code       TEXT NOT NULL REFERENCES products(code),
  qty                INTEGER NOT NULL CHECK (qty > 0),
  unit_price_snapshot NUMERIC(10,2) NOT NULL,   -- money NEVER stored as float
  source             TEXT NOT NULL DEFAULT 'import' CHECK (source IN ('import','api')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_lines_order_id ON order_lines(order_id);

CREATE TABLE IF NOT EXISTS notes (
  note_id    TEXT PRIMARY KEY,                  -- canonical N-#### (e.g. N-7001)
  order_id   TEXT NOT NULL REFERENCES orders(order_id),
  author     TEXT NOT NULL CHECK (author IN ('farm','ops')),
  text       TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  source     TEXT NOT NULL DEFAULT 'import' CHECK (source IN ('import','api')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notes_order_id_created ON notes(order_id, created_at DESC);

-- ============ loader bookkeeping ============
CREATE TABLE IF NOT EXISTS loader_runs (
  id          SERIAL PRIMARY KEY,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  report      JSONB
);

-- ============ label-compliance lookup (domain) ============
-- Given a product and an order's (crop, state, growth_stage), true iff a label row
-- matches where state = order state OR '*', and stage_min <= stage <= stage_max.
--   SELECT EXISTS (
--     SELECT 1 FROM product_labels pl
--     WHERE pl.product_code = $1                    -- product_code
--       AND pl.crop = $2                            -- order.field_crop
--       AND (pl.state = $3 OR pl.state = '*')       -- order.field_state
--       AND $4 BETWEEN pl.stage_min AND pl.stage_max -- order.field_growth_stage
--   );