// columns.js — header alias mapping for each CSV entity.
// Accepted aliases are case/space/underscore-insensitive.
// The first canonical name in each list is the DB column name.
// If a required column has no match in the file header, the loader exits with an error
// naming the file and the expected column.

const FARM_COLUMNS = {
  required: ['id', 'name'],
  optional: ['credit_hold', 'state'],
  aliases: {
    id:           ['id', 'farm_id', 'farm id', 'farm-id', 'fid'],
    name:         ['name', 'farm_name', 'farm name', 'farm-name', 'business_name', 'business name'],
    credit_hold:  ['credit_hold', 'credit hold', 'credit-hold', 'hold', 'on_hold'],
    state:        ['state', 'farm_state', 'farm state', 'st'],
  },
};

const PRODUCT_COLUMNS = {
  required: ['code', 'description'],
  optional: ['active', 'price', 'labelled_for', 'stock_available', 'stock_reserved'],
  aliases: {
    code:            ['code', 'product_code', 'product code', 'product-code', 'sku', 'item_code', 'item code'],
    description:     ['description', 'desc', 'product_name', 'product name', 'name', 'item_name'],
    active:          ['active', 'is_active', 'is active', 'status', 'product_status', 'active_ingredient'],
    price:           ['price', 'unit_price', 'unit price', 'cost', 'list_price', 'list price'],
    labelled_for:    ['labelled_for', 'labelled for', 'labeled_for', 'labeled for', 'label', 'crops', 'registration'],
    stock_available: ['stock_available', 'stock available', 'available', 'qty_on_hand', 'qty on hand', 'on_hand'],
    stock_reserved:  ['stock_reserved', 'stock reserved', 'reserved', 'allocated', 'qty_allocated'],
  },
};

const ORDER_COLUMNS = {
  required: ['order_id', 'farm_id', 'field_crop', 'field_state', 'field_growth_stage', 'status'],
  optional: ['created_at', 'updated_at', 'idempotency_key'],
  aliases: {
    order_id:           ['order_id', 'order id', 'order-id', 'oid', 'id'],
    farm_id:            ['farm_id', 'farm id', 'farm-id', 'fid'],
    field_crop:         ['field_crop', 'field crop', 'crop', 'crop_name', 'crop name'],
    field_state:        ['field_state', 'field state', 'state', 'field_state_code', 'field state code', 'st'],
    field_growth_stage: ['field_growth_stage', 'field growth stage', 'growth_stage', 'growth stage', 'stage', 'gs'],
    status:             ['status', 'order_status', 'order status', 'state'],
    created_at:         ['created_at', 'created at', 'created', 'date_created', 'date created'],
    updated_at:         ['updated_at', 'updated at', 'updated', 'last_modified', 'modified', 'date_updated'],
    idempotency_key:    ['idempotency_key', 'idempotency key', 'idempotency', 'id_key', 'unique_key', 'idk'],
  },
};

const LINE_COLUMNS = {
  required: ['line_id', 'order_id', 'product_code', 'qty'],
  optional: ['unit_price_snapshot'],
  aliases: {
    line_id:              ['line_id', 'line id', 'line-id', 'lid', 'order_line_id'],
    order_id:             ['order_id', 'order id', 'order-id', 'oid'],
    product_code:         ['product_code', 'product code', 'product-code', 'code', 'sku', 'item_code'],
    qty:                  ['qty', 'quantity', 'qty_ordered', 'qty ordered', 'order_qty'],
    unit_price_snapshot:  ['unit_price_snapshot', 'unit price snapshot', 'price_snapshot', 'price snapshot',
                           'unit_price', 'unit price', 'price', 'snapshot_price', 'line_price'],
  },
};

const NOTE_COLUMNS = {
  required: ['note_id', 'order_id', 'author', 'text', 'created_at'],
  optional: [],
  aliases: {
    note_id:    ['note_id', 'note id', 'note-id', 'nid'],
    order_id:   ['order_id', 'order id', 'order-id', 'oid'],
    author:     ['author', 'created_by', 'created by', 'source', 'note_author', 'note author'],
    text:       ['text', 'body', 'note_text', 'note text', 'message', 'content', 'comment'],
    created_at: ['created_at', 'created at', 'created', 'timestamp', 'date', 'note_date'],
  },
};

// Helper to resolve a header name against aliases (case/space/underscore insensitive)
function resolveColumn(header, entityAliases) {
  const normalised = header.trim().toLowerCase().replace(/[\s_-]+/g, '_');
  for (const [canonical, aliases] of Object.entries(entityAliases)) {
    if (aliases.some(a => a.toLowerCase().replace(/[\s_-]+/g, '_') === normalised)) {
      return canonical;
    }
  }
  return null;
}

// Resolve all headers for a given column config. Returns {canonical -> fileHeader} map
function resolveHeaders(fileHeaders, columnConfig) {
  const { aliases } = columnConfig;
  const map = {};
  for (const h of fileHeaders) {
    const canonical = resolveColumn(h, aliases);
    if (canonical) map[canonical] = h;
  }
  return map;
}

// Check required columns are present; throw if not
function assertRequired(map, columnConfig, fileName) {
  for (const req of columnConfig.required) {
    if (!(req in map)) {
      throw new Error(
        `Missing required column "${req}" in ${fileName}. ` +
        `Accepted aliases: ${columnConfig.aliases[req].join(', ')}`
      );
    }
  }
}

module.exports = {
  FARM_COLUMNS, PRODUCT_COLUMNS, ORDER_COLUMNS, LINE_COLUMNS, NOTE_COLUMNS,
  resolveColumn, resolveHeaders, assertRequired,
};