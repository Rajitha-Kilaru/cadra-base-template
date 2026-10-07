// normalise.js — pure functions for value normalisation. No I/O, no DB access.
// Every normaliser returns { value } on success or { error: 'RULE_ID|human message' }.
// Rows that return an error are quarantined by the loader, never dropped silently.

const { US_STATES } = require('./us_states');

// ---------- helpers ----------
const isBlank = v => v === null || v === undefined || String(v).trim() === '';

const CODE_2_3_RE = /^[A-Z]{2,3}$/;
const CODE_4_DIGIT_RE = /^\d{4}$/;

// ---------- product code ----------
// Accept: AAA-9999, AAA9999, AAA 9999, AAA_9999, aa-9999, aa9999, etc. (2-3 letter prefix)
function normaliseProductCode(raw) {
  if (isBlank(raw)) return { error: 'INV_CODE|blank product code' };
  let s = String(raw).trim().toUpperCase();
  s = s.replace(/[\s_-]+/g, '-');          // collapse any separator to '-'
  s = s.replace(/-+/g, '-');
  const clean = s.replace(/-/g, '');
  if (!/^[A-Z]{2,3}\d{4}$/.test(clean)) {
    return { error: `INV_CODE|"${String(raw).trim()}" is not a canonical product code` };
  }
  const [alpha, digits] = clean.match(/^([A-Z]{2,3})(\d{4})$/).slice(1);
  return { value: `${alpha}-${digits}` };
}

// ---------- farm id ----------
// Canonical: F- + 3 zero-padded digits (F-020). Accept f20, F 020, f-020, F020, f00020 ...
function normaliseFarmId(raw) {
  if (isBlank(raw)) return { error: 'INV_FARM_ID|blank farm id' };
  let s = String(raw).trim().toUpperCase().replace(/[\s_-]+/g, '');
  const m = s.match(/^(?:F|FARM)(\d{1,5})$/);
  if (!m) return { error: `INV_FARM_ID|"${String(raw).trim()}" is not a valid farm id` };
  const n = parseInt(m[1], 10);
  if (!Number.isInteger(n) || n < 0) {
    return { error: `INV_FARM_ID|"${String(raw).trim()}" farm id out of range` };
  }
  return { value: `F-${String(n).padStart(3, '0')}` };
}

// ---------- order id ----------
// Canonical: ORD- + 4+ digits (ORD-6001). Accept ord-6001, ORD6001, ord 6001, ord_6001.
// Non-numeric legacy ids (e.g. 20260619-F020-X99) are handled by loader-level remap.
function normaliseOrderId(raw) {
  if (isBlank(raw)) return { error: 'INV_ORDER_ID|blank order id' };
  let s = String(raw).trim().toUpperCase().replace(/[\s_-]+/g, '');
  const m = s.match(/^(?:ORD|ORDER)(\d{3,8})$/);
  if (!m) return { error: `INV_ORDER_ID|"${String(raw).trim()}" is not a canonical order id` };
  const digits = m[1];
  return { value: `ORD-${digits}` };
}

// ---------- line id ----------
// Canonical: L- + 4 digits (L-7001).
function normaliseLineId(raw) {
  if (isBlank(raw)) return { error: 'INV_LINE_ID|blank line id' };
  let s = String(raw).trim().toUpperCase().replace(/[\s_-]+/g, '');
  const m = s.match(/^(?:L|LINE)(\d{3,8})$/);
  if (!m) return { error: `INV_LINE_ID|"${String(raw).trim()}" is not a canonical line id` };
  return { value: `L-${m[1]}` };
}

// ---------- note id ----------
// Canonical: N- + 4 digits (N-7001).
function normaliseNoteId(raw) {
  if (isBlank(raw)) return { error: 'INV_NOTE_ID|blank note id' };
  let s = String(raw).trim().toUpperCase().replace(/[\s_-]+/g, '');
  const m = s.match(/^(?:N|NOTE)(\d{3,8})$/);
  if (!m) return { error: `INV_NOTE_ID|"${String(raw).trim()}" is not a canonical note id` };
  return { value: `N-${m[1]}` };
}

// ---------- booleans ----------
// Accept: Y/N, yes/no, 1/0, true/false, T/F, any case, blank.
function normaliseBoolean(raw) {
  if (isBlank(raw)) return { value: false };
  const s = String(raw).trim().toLowerCase();
  if (['y', 'yes', '1', 'true', 't'].includes(s)) return { value: true };
  if (['n', 'no', '0', 'false', 'f'].includes(s)) return { value: false };
  return { error: `INV_BOOL|"${String(raw).trim()}" is not a boolean value` };
}

// ---------- status ----------
// Contract enum. Plausible legacy synonyms -> canonical:
//   NEW -> DRAFT, OPEN -> DRAFT, PLANNED -> DRAFT, INPROGRESS -> SUBMITTED,
//   READY -> CONFIRMED, CLOSED -> DELIVERED, VOID -> CANCELLED, BACKORDER -> BACKORDERED
function normaliseStatus(raw) {
  if (isBlank(raw)) return { error: 'INV_STATUS|blank status' };
  const s = String(raw).trim().toUpperCase().replace(/[\s_-]+/g, '').replace(/\s+/g, '');
  const MAP = {
    DRAFT: 'DRAFT', NEW: 'DRAFT', OPEN: 'DRAFT', PLANNED: 'DRAFT',
    SUBMITTED: 'SUBMITTED', INPROGRESS: 'SUBMITTED', INPROGRESSING: 'SUBMITTED', PENDING: 'SUBMITTED',
    CONFIRMED: 'CONFIRMED', READY: 'CONFIRMED',
    BACKORDERED: 'BACKORDERED', BACKORDER: 'BACKORDERED', BO: 'BACKORDERED',
    SHIPPED: 'SHIPPED', SHIPPING: 'SHIPPED',
    DELIVERED: 'DELIVERED', CLOSED: 'DELIVERED', COMPLETED: 'DELIVERED',
    CANCELLED: 'CANCELLED', CANCELED: 'CANCELLED', VOID: 'CANCELLED', CANCELLATION: 'CANCELLED',
  };
  const out = MAP[s];
  if (!out) return { error: `INV_STATUS|"${String(raw).trim()}" is not a valid order status` };
  return { value: out };
}

// ---------- crops ----------
// Uppercase, trim, collapse internal whitespace.
const CROP_SYNONYMS = {
  SOYBEANS: 'SOYBEAN', SOY: 'SOYBEAN', CORN: 'CORN', MAIZE: 'CORN',
  WHEAT: 'WHEAT', CANOLA: 'CANOLA', ALFALFA: 'ALFALFA', 'CORN/GRAIN': 'CORN',
  SORGHUM: 'SORGHUM', OATS: 'OATS', BARLEY: 'BARLEY', SUGARBEETS: 'SUGARBEET',
};
function normaliseCrop(raw) {
  if (isBlank(raw)) return { error: 'INV_CROP|blank crop' };
  let s = String(raw).trim().toUpperCase().replace(/\s+/g, ' ');
  s = CROP_SYNONYMS[s] || s;
  if (!/^[A-Z][A-Z /-]*$/.test(s)) {
    return { error: `INV_CROP|"${String(raw).trim()}" is not a valid crop name` };
  }
  return { value: s };
}

// ---------- states ----------
// Accept USPS code (any case) or full name -> code. Only MN/IA/ND/SD/WI expected but
// accept any valid US state. Also accept "X" variants for the mock data.
function normaliseState(raw) {
  if (isBlank(raw)) return { error: 'INV_STATE|blank state' };
  const s = String(raw).trim().toUpperCase().replace(/\./g, '');
  const code = US_STATES[s] || US_STATES[s.replace(/\s+/g, '')] || null;
  if (!code) {
    return { error: `INV_STATE|"${String(raw).trim()}" is not a US state` };
  }
  return { value: code };
}

// ---------- growth stage ----------
// Accept integers (1-5), "Stage 2"/"stage 2", and phenological "V2"/"R1" strings.
// Rule: V{2-6} -> {2-6}; R{1-8} -> {1-8}; standalone integer N -> N (clamped 1-5).
function normaliseGrowthStage(raw) {
  if (isBlank(raw)) return { error: 'INV_STAGE|blank growth stage' };
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  const stageRe = s.match(/^(?:STAGE|S)(\d{1,2})$/);
  if (stageRe) return { value: clampStage(parseInt(stageRe[1], 10)) };
  const vRe = s.match(/^V(\d{1,2})$/);
  if (vRe) return { value: clampStage(parseInt(vRe[1], 10)) };
  const rRe = s.match(/^R(\d{1,2})$/);
  if (rRe) return { value: clampStage(parseInt(rRe[1], 10)) };
  const intRe = s.match(/^(\d{1,2})$/);
  if (intRe) return { value: clampStage(parseInt(intRe[1], 10)) };
  return { error: `INV_STAGE|"${String(raw).trim()}" is not a valid growth stage` };
}
function clampStage(n) {
  if (!Number.isInteger(n)) throw new Error('stage must be integer');
  return Math.max(1, Math.min(5, n));
}

// ---------- prices ----------
// Accept "$54.20", "1,054.20", "54.20", " 54.2 ", blank. Output NUMERIC decimal string.
function normalisePrice(raw) {
  if (isBlank(raw)) return { value: '0.00' };
  const s = String(raw).trim().replace(/[$,\s]/g, '');
  if (s.toLowerCase() === 'n/a' || s === '' || s === '-') return { value: '0.00' };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) {
    return { error: `INV_PRICE|"${String(raw).trim()}" is not a valid price` };
  }
  return { value: n.toFixed(2) };
}

// ---------- quantities ----------
// Positive integers only.
function normaliseQty(raw) {
  if (isBlank(raw)) return { error: 'INV_QTY|blank quantity' };
  const s = String(raw).trim().replace(/[\s,]/g, '');
  if (!/^\d+$/.test(s)) return { error: `INV_QTY|"${String(raw).trim()}" is not a quantity` };
  const n = parseInt(s, 10);
  if (n <= 0) return { error: `INV_QTY|"${String(raw).trim()}" must be a positive integer` };
  return { value: n };
}

// ---------- timestamps ----------
// Accept ISO 8601 (with/without Z), "YYYY-MM-DD HH:MM:SS", "MM/DD/YYYY HH:mm",
// "YYYY-MM-DD", epoch seconds. Output UTC ISO 8601 with 'Z' suffix.
// Decision: all times normalised to UTC (legacy desk stored local time; no tz info);
// the business operates in one time zone so UTC is stable and comparable.
function normaliseTimestamp(raw) {
  if (isBlank(raw)) return { error: 'INV_DATE|blank timestamp' };
  const s = String(raw).trim();
  let date;
  if (/^\d{10}$/.test(s) || /^\d{13}$/.test(s)) {
    date = new Date(s.length === 10 ? Number(s) * 1000 : Number(s));
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    date = new Date(s);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    date = new Date(`${s}T00:00:00Z`);
  } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
    date = new Date(`${s.replace(' ', 'T')}Z`);
  } else if (/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(:\d{2})?$/.test(s)) {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(:\d{2})?$/);
    const iso = `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}T${m[4].padStart(2,'0')}:${m[5].padStart(2,'0')}:${(m[6]||':00').replace(':','')}Z`;
    date = new Date(iso);
  } else {
    date = new Date(s);
  }
  if (Number.isNaN(date.getTime())) {
    return { error: `INV_DATE|"${String(raw).trim()}" is not a parseable timestamp` };
  }
  return { value: date.toISOString() };
}

// ---------- labelled_for parsing ----------
// Entries separated by ';' or '|'. Each entry: CROP:STATE:STAGE or CROP:STATE:STAGEMIN-STAGEMAX.
// '*' or 'ALL' for state means "all states". Returns array of {crop, state, stage_min, stage_max}.
function parseLabelledFor(raw) {
  if (isBlank(raw)) return { value: [] };
  const s = String(raw).trim();
  if (!s) return { value: [] };
  const entries = s.split(/[;|]/).map(e => e.trim()).filter(Boolean);
  const out = [];
  const errors = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const parts = entry.split(':').map(p => p.trim());
    if (parts.length < 2) {
      errors.push(`entry "${entry}" is malformed`);
      continue;
    }
    const cropRes = normaliseCrop(parts[0]);
    if (cropRes.error) { errors.push(`crop "${parts[0]}"`); continue; }
    const statePart = parts[1];
    let states;
    if (statePart === '*' || statePart.toUpperCase() === 'ALL') {
      states = ['*'];
    } else {
      const st = normaliseState(statePart);
      if (st.error) { errors.push(`state "${statePart}"`); continue; }
      states = [st.value];
    }
    let stageSpec = parts[2] || '1-5';
    const stageRes = parseStageRange(stageSpec);
    if (stageRes.error) { errors.push(`stage "${stageSpec}"`); continue; }
    for (const st of states) {
      out.push({
        crop: cropRes.value,
        state: st, // '*' = all states
        stage_min: stageRes.value.min,
        stage_max: stageRes.value.max,
      });
    }
  }
  if (errors.length) {
    return { error: `INV_LABEL|${errors.join('; ')}` };
  }
  return { value: out };
}

function parseStageRange(spec) {
  if (isBlank(spec)) return { value: { min: 1, max: 5 } };
  const s = String(spec).trim().toUpperCase().replace(/\s+/g, '');
  const single = s.match(/^(?:STAGE)?(\d{1,2})$/);
  if (single) {
    const n = clampStage(parseInt(single[1], 10));
    return { value: { min: n, max: n } };
  }
  const range = s.match(/^(\d{1,2})-(\d{1,2})$/);
  if (range) {
    const lo = clampStage(parseInt(range[1], 10));
    const hi = clampStage(parseInt(range[2], 10));
    return { value: { min: Math.min(lo, hi), max: Math.max(lo, hi) } };
  }
  return { error: `"${spec}" is not a stage or stage range` };
}

module.exports = {
  normaliseProductCode, normaliseFarmId, normaliseOrderId, normaliseLineId, normaliseNoteId,
  normaliseBoolean, normaliseStatus, normaliseCrop, normaliseState, normaliseGrowthStage,
  normalisePrice, normaliseQty, normaliseTimestamp, parseLabelledFor, parseStageRange,
  isBlank,
};