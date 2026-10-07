import { describe, it, expect } from 'vitest';
import { isLabelledFor } from '../src/domain/labels.js';

describe('isLabelledFor', () => {
  const labels = [
    { crop: 'SOYBEAN', state: 'IA', stage_min: 2, stage_max: 3 },
    { crop: 'SOYBEAN', state: '*', stage_min: 1, stage_max: 5 },
    { crop: 'CORN', state: 'MN', stage_min: 1, stage_max: 1 },
  ];

  it('matches exact crop/state/stage', () => {
    expect(isLabelledFor(labels, { crop: 'SOYBEAN', state: 'IA', growth_stage: 2 })).toBe(true);
  });

  it('matches wildcard state', () => {
    expect(isLabelledFor(labels, { crop: 'SOYBEAN', state: 'MN', growth_stage: 3 })).toBe(true);
  });

  it('matches stage boundary min', () => {
    expect(isLabelledFor(labels, { crop: 'CORN', state: 'MN', growth_stage: 1 })).toBe(true);
  });

  const noWildcard = labels.slice(0, 1); // only SOYBEAN:IA:2-3, no wildcard

  it('rejects stage boundary max (SOYBEAN IA only 2..3)', () => {
    expect(isLabelledFor(noWildcard, { crop: 'SOYBEAN', state: 'IA', growth_stage: 4 })).toBe(false);
  });

  it('rejects below stage min', () => {
    expect(isLabelledFor(noWildcard, { crop: 'SOYBEAN', state: 'IA', growth_stage: 1 })).toBe(false);
  });

  it('rejects mismatched crop', () => {
    expect(isLabelledFor(labels, { crop: 'WHEAT', state: 'IA', growth_stage: 2 })).toBe(false);
  });

  it('rejects mismatched state (no wildcard for that crop)', () => {
    expect(isLabelledFor(labels, { crop: 'CORN', state: 'IA', growth_stage: 1 })).toBe(false);
  });

  it('returns false for empty labels', () => {
    expect(isLabelledFor([], { crop: 'SOYBEAN', state: 'IA', growth_stage: 2 })).toBe(false);
    expect(isLabelledFor(null, { crop: 'SOYBEAN', state: 'IA', growth_stage: 2 })).toBe(false);
    expect(isLabelledFor(labels, null)).toBe(false);
  });

  it('is case-insensitive on crop and state', () => {
    expect(isLabelledFor(labels, { crop: 'soybean', state: 'ia', growth_stage: 2 })).toBe(true);
  });
});