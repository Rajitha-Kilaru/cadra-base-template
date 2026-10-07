import { describe, it, expect } from 'vitest';
import { TRANSITIONS, STATUSES, LINE_EDITABLE, canTransition } from '../src/domain/lifecycle.js';

describe('lifecycle', () => {
  it('has the 7 contract statuses', () => {
    expect(STATUSES).toEqual([
      'DRAFT', 'SUBMITTED', 'CONFIRMED', 'BACKORDERED', 'SHIPPED', 'DELIVERED', 'CANCELLED',
    ]);
  });

  it('exposes the exact transition table', () => {
    expect(TRANSITIONS).toEqual({
      DRAFT: ['SUBMITTED'],
      SUBMITTED: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['SHIPPED', 'CANCELLED', 'BACKORDERED'],
      BACKORDERED: ['CONFIRMED'],
      SHIPPED: ['DELIVERED'],
      DELIVERED: [],
      CANCELLED: [],
    });
  });

  it('LINE_EDITABLE is DRAFT and SUBMITTED', () => {
    expect(LINE_EDITABLE).toEqual(['DRAFT', 'SUBMITTED']);
  });

  // Table-driven: every (from,to) pair across all 7 statuses
  it('exactly allows the valid moves for all 49 (from,to) pairs', () => {
    const allowed = new Set();
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      for (const to of tos) allowed.add(`${from}->${to}`);
    }

    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const expected = allowed.has(`${from}->${to}`);
        expect(canTransition(from, to), `${from}->${to}`).toBe(expected);
        // Same-status moves must always be invalid
        if (from === to) expect(expected, `${from}->${from} same-status`).toBe(false);
      }
    }
  });

  it('rejects unknown statuses', () => {
    expect(canTransition('NOPE', 'DRAFT')).toBe(false);
    expect(canTransition('DRAFT', 'NOPE')).toBe(false);
  });
});