// serializers.js — one place for NUMERIC -> JSON number, timestamps -> ISO 8601,
// field shape, summary vs detail.

function serializeOrder(order, lines = null, notes = null) {
  if (!order) return null;
  const base = {
    order_id: order.order_id,
    farm_id: order.farm_id,
    farm_name: order.farm_name || null,
    field: {
      crop: order.field_crop,
      state: order.field_state,
      growth_stage: order.field_growth_stage,
    },
    status: order.status,
    line_count: Number(order.line_count) || 0,
    created_at: order.created_at instanceof Date
      ? order.created_at.toISOString()
      : String(order.created_at || ''),
    updated_at: order.updated_at instanceof Date
      ? order.updated_at.toISOString()
      : String(order.updated_at || ''),
  };
  if (lines !== null) {
    base.lines = (lines || []).map(l => ({
      line_id: l.line_id,
      product_code: l.product_code,
      description: l.description || null,
      qty: Number(l.qty) || 0,
      unit_price_snapshot: l.unit_price_snapshot !== null && l.unit_price_snapshot !== undefined
        ? Number(l.unit_price_snapshot) : null,
    }));
  }
  if (notes !== null) {
    base.notes = (notes || []).map(n => ({
      note_id: n.note_id,
      author: n.author,
      text: n.text,
      created_at: n.created_at instanceof Date
        ? n.created_at.toISOString()
        : String(n.created_at || ''),
    }));
  }
  return base;
}

function serializeSummary(row) {
  return serializeOrder(row);
}

function serializeDetail(order, lines, notes) {
  return serializeOrder(order, lines, notes);
}

module.exports = { serializeOrder, serializeSummary, serializeDetail };