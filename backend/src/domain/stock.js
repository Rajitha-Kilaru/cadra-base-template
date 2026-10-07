// stock.js — pure stock shortfall check.
// lines: [{ product_code, qty }]; stockByProduct: { code: { available, reserved } }.
// Returns { shortfalls: [{ product_code, requested, available }], sufficient: boolean }.

function shortfalls(lines, stockByProduct) {
  if (!lines || !lines.length) {
    return { shortfalls: [], sufficient: true };
  }
  const demanded = {};
  for (const l of lines) {
    demanded[l.product_code] = (demanded[l.product_code] || 0) + l.qty;
  }

  const shortfallsList = [];
  for (const [code, qty] of Object.entries(demanded)) {
    const stock = stockByProduct[code] || { available: 0, reserved: 0 };
    if (qty > stock.available) {
      shortfallsList.push({
        product_code: code,
        requested: qty,
        available: stock.available,
      });
    }
  }
  shortfallsList.sort((a, b) => a.product_code.localeCompare(b.product_code));
  return { shortfalls: shortfallsList, sufficient: shortfallsList.length === 0 };
}

module.exports = { shortfalls };