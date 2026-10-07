import { describe, it, expect } from 'vitest';
import {
  normaliseProductCode, normaliseFarmId, normaliseOrderId, normaliseLineId, normaliseNoteId,
  normaliseBoolean, normaliseStatus, normaliseCrop, normaliseState, normaliseGrowthStage,
  normalisePrice, normaliseQty, normaliseTimestamp, isBlank,
} from '../src/loader/normalise.js';

describe('isBlank', () => {
  it.each([
    [null, true], [undefined, true], ['', true], ['  ', true],
    ['a', false], ['0', false],
  ])('%s -> %s', (input, expected) => {
    expect(isBlank(input)).toBe(expected);
  });
});

describe('normaliseProductCode', () => {
  it.each([
    ['fng-1112', 'FNG-1112'],
    ['FNG-2134', 'FNG-2134'],
    ['FNG  2951', 'FNG-2951'],
    ['FNG_3115', 'FNG-3115'],
    ['fng4413', 'FNG-4413'],
    ['FN-2404', 'FN-2404'],
    ['fn2404', 'FN-2404'],
    ['FNG-9112', 'FNG-9112'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseProductCode(input).value).toBe(expected);
  });
  it.each([
    ['', 'blank product code'],
    ['12345', 'is not a canonical'],
    ['ABCDE', 'is not a canonical'],
    ['  ', 'blank product code'],
  ])('%s -> error', (input, msg) => {
    expect(normaliseProductCode(input).error).toContain(msg);
  });
});

describe('normaliseFarmId', () => {
  it.each([
    ['F-020', 'F-020'], ['F020', 'F-020'], ['f-20', 'F-020'], ['f20', 'F-020'],
    ['F 040', 'F-040'], ['F050', 'F-050'], ['f-60', 'F-060'], ['F-110', 'F-110'],
    ['F100', 'F-100'], ['F-010', 'F-010'], ['f-030', 'F-030'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseFarmId(input).value).toBe(expected);
  });
  it.each([
    ['', 'blank farm id'],
    ['FARM', 'not a valid'],
    ['G-001', 'not a valid'],
  ])('%s -> error', (input, msg) => {
    expect(normaliseFarmId(input).error).toContain(msg);
  });
});

describe('normaliseOrderId', () => {
  it.each([
    ['ORD-6001', 'ORD-6001'], ['ord-6001', 'ORD-6001'], ['ORD6005', 'ORD-6005'],
    ['ord 6003', 'ORD-6003'], ['ORD_6004', 'ORD-6004'], ['order-6010', 'ORD-6010'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseOrderId(input).value).toBe(expected);
  });
  it.each([
    ['', 'blank order id'],
    ['20260619-F020-X99', 'is not a canonical'],
  ])('%s -> error', (input, msg) => {
    expect(normaliseOrderId(input).error).toContain(msg);
  });
});

describe('normaliseLineId', () => {
  it.each([
    ['L-7001', 'L-7001'], ['L 7003', 'L-7003'], ['l7014', 'L-7014'],
    ['L_7005', 'L-7005'], ['l7007', 'L-7007'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseLineId(input).value).toBe(expected);
  });
  it.each([['', 'blank line id'], ['X-7001', 'is not a canonical']])(
    '%s -> error', (input, msg) => {
      expect(normaliseLineId(input).error).toContain(msg);
    });
});

describe('normaliseNoteId', () => {
  it.each([
    ['N-7001', 'N-7001'], ['N 7006', 'N-7006'], ['n7007', 'N-7007'],
    ['N_7005', 'N-7005'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseNoteId(input).value).toBe(expected);
  });
  it.each([['', 'blank note id'], ['X-7001', 'is not a canonical']])(
    '%s -> error', (input, msg) => {
      expect(normaliseNoteId(input).error).toContain(msg);
    });
});

describe('normaliseBoolean', () => {
  it.each([
    ['Y', true], ['yes', true], ['1', true], ['TRUE', true], ['true', true], ['T', true],
    ['N', false], ['no', false], ['0', false], ['FALSE', false], ['false', false], ['F', false],
    ['', false], [null, false], ['  ', false],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseBoolean(input).value).toBe(expected);
  });
  it.each([['Z', 'is not a boolean'], ['maybe', 'is not a boolean']])(
    '%s -> error', (input, msg) => {
      expect(normaliseBoolean(input).error).toContain(msg);
    });
});

describe('normaliseStatus', () => {
  it.each([
    ['DRAFT', 'DRAFT'], ['draft', 'DRAFT'], ['NEW', 'DRAFT'], ['OPEN', 'DRAFT'],
    ['SUBMITTED', 'SUBMITTED'], ['PENDING', 'SUBMITTED'],
    ['CONFIRMED', 'CONFIRMED'], ['READY', 'CONFIRMED'],
    ['BACKORDERED', 'BACKORDERED'], ['BACKORDER', 'BACKORDERED'], ['BO', 'BACKORDERED'],
    ['SHIPPED', 'SHIPPED'],
    ['DELIVERED', 'DELIVERED'], ['CLOSED', 'DELIVERED'],
    ['CANCELLED', 'CANCELLED'], ['CANCELED', 'CANCELLED'], ['VOID', 'CANCELLED'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseStatus(input).value).toBe(expected);
  });
  it.each([['', 'blank status'], ['UNKNOWN', 'not a valid order status']])(
    '%s -> error', (input, msg) => {
      expect(normaliseStatus(input).error).toContain(msg);
    });
});

describe('normaliseCrop', () => {
  it.each([
    ['SOYBEAN', 'SOYBEAN'], ['soybeans', 'SOYBEAN'], ['Soy', 'SOYBEAN'],
    ['CORN', 'CORN'], ['maize', 'CORN'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseCrop(input).value).toBe(expected);
  });
  it.each([['', 'blank crop']])('%s -> error', (input, msg) => {
    expect(normaliseCrop(input).error).toContain(msg);
  });
});

describe('normaliseState', () => {
  it.each([
    ['IA', 'IA'], ['ia', 'IA'], ['Iowa', 'IA'], ['MN', 'MN'], ['Minnesota', 'MN'],
    ['ND', 'ND'], ['North Dakota', 'ND'], ['WI', 'WI'], ['ILLINOIS', 'IL'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseState(input).value).toBe(expected);
  });
  it.each([['', 'blank state'], ['XX', 'not a US state'], ['Atlantis', 'not a US state']])(
    '%s -> error', (input, msg) => {
      expect(normaliseState(input).error).toContain(msg);
    });
});

describe('normaliseGrowthStage', () => {
  it.each([
    ['2', 2], ['1', 1], ['5', 5], ['Stage 2', 2], ['V2', 2], ['R1', 1], ['V6', 5],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseGrowthStage(input).value).toBe(expected);
  });
  it.each([['', 'blank growth stage'], ['ABC', 'not a valid growth stage']])(
    '%s -> error', (input, msg) => {
      expect(normaliseGrowthStage(input).error).toContain(msg);
    });
});

describe('normalisePrice', () => {
  it.each([
    ['54.20', '54.20'], ['$54.20', '54.20'], ['1,054.20', '1054.20'],
    [' 54.2 ', '54.20'], ['0', '0.00'], ['', '0.00'], ['n/a', '0.00'],
  ])('%s -> %s', (input, expected) => {
    expect(normalisePrice(input).value).toBe(expected);
  });
  it.each([['abc', 'not a valid price'], ['-1', 'not a valid price']])(
    '%s -> error', (input, msg) => {
      expect(normalisePrice(input).error).toContain(msg);
    });
});

describe('normaliseQty', () => {
  it.each([
    ['1', 1], ['2', 2], [' 50 ', 50], ['1000', 1000],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseQty(input).value).toBe(expected);
  });
  it.each([['', 'blank quantity'], ['0', 'must be a positive integer'], ['-1', 'not a quantity']])(
    '%s -> error', (input, msg) => {
      expect(normaliseQty(input).error).toContain(msg);
    });
});

describe('normaliseTimestamp', () => {
  it.each([
    ['2026-06-20T10:05:00Z', '2026-06-20T10:05:00.000Z'],
    ['2026-06-20 10:05:00', '2026-06-20T10:05:00.000Z'],
    ['06/20/2026 10:05', '2026-06-20T10:05:00.000Z'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseTimestamp(input).value).toBe(expected);
  });
  it.each([['', 'blank timestamp'], ['not-a-date', 'not a parseable']])(
    '%s -> error', (input, msg) => {
      expect(normaliseTimestamp(input).error).toContain(msg);
    });
});