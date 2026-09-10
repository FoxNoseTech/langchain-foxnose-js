/**
 * Tests for the search-mode helpers.
 */

import { describe, it, expect } from 'vitest';
import { needsTextSearch, needsVectorSearch } from '../src/search.js';

describe('needsTextSearch', () => {
  it('returns true for text mode', () => {
    expect(needsTextSearch('text')).toBe(true);
  });

  it('returns true for hybrid mode', () => {
    expect(needsTextSearch('hybrid')).toBe(true);
  });

  it('returns true for vector_boosted mode', () => {
    expect(needsTextSearch('vector_boosted')).toBe(true);
  });

  it('returns false for vector mode', () => {
    expect(needsTextSearch('vector')).toBe(false);
  });
});

describe('needsVectorSearch', () => {
  it('returns true for vector mode', () => {
    expect(needsVectorSearch('vector')).toBe(true);
  });

  it('returns true for hybrid mode', () => {
    expect(needsVectorSearch('hybrid')).toBe(true);
  });

  it('returns true for vector_boosted mode', () => {
    expect(needsVectorSearch('vector_boosted')).toBe(true);
  });

  it('returns false for text mode', () => {
    expect(needsVectorSearch('text')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Deprecation warning
// ---------------------------------------------------------------------------

