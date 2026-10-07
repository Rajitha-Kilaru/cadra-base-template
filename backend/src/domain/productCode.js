// productCode.js — pure product-code normaliser.
// Canonical: AAA-9999 (2-3 letter prefix + 4 digits).
// Accepts: lower/upper case, missing hyphen, space/underscore separator, hyphen.

const CODE_RE = /^([A-Z]{2,3})(\d{4})$/;

function normaliseProductCode(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toUpperCase();
  if (s === '') return null;
  const clean = s.replace(/[\s_-]+/g, '');
  const m = clean.match(CODE_RE);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

module.exports = { normaliseProductCode };