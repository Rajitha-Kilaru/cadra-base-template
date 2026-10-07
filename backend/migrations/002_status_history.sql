-- 002_status_history.sql — optional audit trail for order status transitions.
CREATE TABLE IF NOT EXISTS order_status_history (
  id          SERIAL PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(order_id),
  from_status TEXT NOT NULL,
  to_status   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_status_history_order ON order_status_history(order_id, created_at DESC);