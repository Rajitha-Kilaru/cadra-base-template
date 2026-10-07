import { describe, it, expect } from 'vitest';
import { shortfalls } from '../src/domain/stock.js';

describe('shortfalls', () => {
  const stock = {
    'A-0001': { available: 10, reserved: 0 },
    'A-0002': { available: 0, reserved: 0 },
  };

  it('sufficient when quantities fit', () => {
    const r = shortfalls([{ product_code: 'A-0001', qty: 10 }], stock);
    expect(r.sufficient).toBe(true);
  });

  it('sums across duplicate lines of the same product', () => {
    const r = shortfalls([
      { product_code: 'A-0001', qty: 6 },
      { product_code: 'A-0001', qty: 5 },
    ], stock);
    expect(r.sufficient).toBe(false);
    expect(r.shortfalls[0].requested).toBe(11);
  });

  it('flags zero available', () => {
    const r = shortfalls([{ product_code: 'A-0002', qty: 1 }], stock);
    expect(r.sufficient).toBe(false);
  });

  it('returns sorted by product code', () => {
    const r = shortfalls([
      { product_code: 'A-0002', qty: 1 },
      { product_code: 'A-0001', qty: 99 },
    ], stock);
    expect(r.shortfalls[0].product_code).toBe('A-0001');
    expect(r.shortfalls[1].product_code).toBe('A-0002');
  });

  it('handles empty lines', () => {
    expect(shortfalls([], stock).sufficient).toBe(true);
  });

  it('handles missing stock entry as zero available', () => {
    expect(shortfalls([{ product_code: 'X-9999', qty: 1 }], {}).sufficient).toBe(false);
  });
});