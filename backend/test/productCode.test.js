import { describe, it, expect } from 'vitest';
import { normaliseProductCode } from '../src/domain/productCode.js';

describe('normaliseProductCode', () => {
  it.each([
    ['FNG-1112', 'FNG-1112'],
    ['fng-1112', 'FNG-1112'],
    ['FNG1112', 'FNG-1112'],
    ['fng1112', 'FNG-1112'],
    ['FNG 1112', 'FNG-1112'],
    ['FNG_1112', 'FNG-1112'],
    ['  FNG-1112  ', 'FNG-1112'],
    ['FN-2404', 'FN-2404'],
    ['fn2404', 'FN-2404'],
    ['FN 2404', 'FN-2404'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseProductCode(input)).toBe(expected);
  });

  it.each([
    ['12345', null],            // digits first
    ['ABCDE', null],            // no digits
    ['FNG-111', null],          // 3 digits
    ['FNG-11122', null],        // 5 digits
    ['F-1112', null],           // 1-letter prefix
    ['FONG-1112', null],        // 4-letter prefix
    ['F-1112', null],           // 1-letter prefix/out of order
    ['', null],
    ['   ', null],
    [null, null],
    [undefined, null],
    [12345, null],              // number
    [true, null],               // boolean
  ])('%s -> null', (input) => {
    expect(normaliseProductCode(input)).toBeNull();
  });
});