/**
 * Tests for the search body builder.
 */

import { describe, it, expect } from 'vitest';
import { buildSearchBody, needsTextSearch, needsVectorSearch } from '../src/search.js';

// ---------------------------------------------------------------------------
// Text mode
// ---------------------------------------------------------------------------

describe('buildSearchBody — text mode', () => {
  it('builds a basic text search body', () => {
    const body = buildSearchBody({ query: 'hello', searchMode: 'text', topK: 10 });
    expect(body).toEqual({
      search_mode: 'text',
      limit: 10,
      find_text: { query: 'hello' },
    });
  });

  it('includes fields and threshold in find_text', () => {
    const body = buildSearchBody({
      query: 'machine learning',
      searchMode: 'text',
      topK: 5,
      searchFields: ['title', 'summary'],
      textThreshold: 0.85,
    });
    expect(body.find_text).toEqual({
      query: 'machine learning',
      fields: ['title', 'summary'],
      threshold: 0.85,
    });
  });

  it('does not include vector_search in text mode', () => {
    const body = buildSearchBody({ query: 'query', searchMode: 'text' });
    expect(body).not.toHaveProperty('vector_search');
  });
});

// ---------------------------------------------------------------------------
// Vector mode
// ---------------------------------------------------------------------------

describe('buildSearchBody — vector mode', () => {
  it('builds a basic vector search body', () => {
    const body = buildSearchBody({ query: 'semantic query', searchMode: 'vector', topK: 20 });
    expect(body).toEqual({
      search_mode: 'vector',
      limit: 20,
      vector_search: { query: 'semantic query', top_k: 20 },
    });
  });

  it('does not include find_text in vector mode', () => {
    const body = buildSearchBody({ query: 'query', searchMode: 'vector' });
    expect(body).not.toHaveProperty('find_text');
  });

  it('includes fields and similarity_threshold in vector_search', () => {
    const body = buildSearchBody({
      query: 'cozy room',
      searchMode: 'vector',
      topK: 30,
      vectorFields: ['description'],
      similarityThreshold: 0.65,
    });
    expect(body.vector_search).toEqual({
      query: 'cozy room',
      top_k: 30,
      fields: ['description'],
      similarity_threshold: 0.65,
    });
  });
});

// ---------------------------------------------------------------------------
// Hybrid mode
// ---------------------------------------------------------------------------

describe('buildSearchBody — hybrid mode', () => {
  it('includes both find_text and vector_search', () => {
    const body = buildSearchBody({ query: 'hybrid query', searchMode: 'hybrid', topK: 10 });
    expect(body).toHaveProperty('find_text');
    expect(body).toHaveProperty('vector_search');
    expect((body.find_text as Record<string, unknown>).query).toBe('hybrid query');
    expect((body.vector_search as Record<string, unknown>).query).toBe('hybrid query');
  });

  it('includes hybrid_config', () => {
    const config = { vectorWeight: 0.6, textWeight: 0.4, rerankResults: true };
    const body = buildSearchBody({ query: 'query', searchMode: 'hybrid', hybridConfig: config });
    expect(body.hybrid_config).toEqual(config);
  });

  it('ignores hybrid_config for non-hybrid modes', () => {
    const config = { vectorWeight: 0.6, textWeight: 0.4 };
    const body = buildSearchBody({ query: 'query', searchMode: 'text', hybridConfig: config });
    expect(body).not.toHaveProperty('hybrid_config');
  });
});

// ---------------------------------------------------------------------------
// Vector-boosted mode
// ---------------------------------------------------------------------------

describe('buildSearchBody — vector_boosted mode', () => {
  it('includes both find_text and vector_search', () => {
    const body = buildSearchBody({ query: 'boosted query', searchMode: 'vector_boosted', topK: 10 });
    expect(body).toHaveProperty('find_text');
    expect(body).toHaveProperty('vector_search');
  });

  it('includes vector_boost_config', () => {
    const config = { boostFactor: 1.3, similarityThreshold: 0.75 };
    const body = buildSearchBody({
      query: 'query',
      searchMode: 'vector_boosted',
      vectorBoostConfig: config,
    });
    expect(body.vector_boost_config).toEqual(config);
  });

  it('ignores vector_boost_config for non-boosted modes', () => {
    const config = { boostFactor: 1.3 };
    const body = buildSearchBody({ query: 'query', searchMode: 'hybrid', vectorBoostConfig: config });
    expect(body).not.toHaveProperty('vector_boost_config');
  });
});

// ---------------------------------------------------------------------------
// Filters, sorting, extras
// ---------------------------------------------------------------------------

describe('buildSearchBody — filters and sorting', () => {
  it('includes where filter', () => {
    const where = { $: { all_of: [{ status__eq: 'published' }] } };
    const body = buildSearchBody({ query: 'query', where });
    expect(body.where).toEqual(where);
  });

  it('includes sort', () => {
    const body = buildSearchBody({ query: 'query', sort: ['-_sys.created_at', 'title'] });
    expect(body.sort).toEqual(['-_sys.created_at', 'title']);
  });

  it('searchKwargs override existing keys', () => {
    const body = buildSearchBody({
      query: 'query',
      searchMode: 'hybrid',
      topK: 5,
      searchKwargs: { limit: 50, ignore_unknown_fields: true },
    });
    expect(body.limit).toBe(50);
    expect(body.ignore_unknown_fields).toBe(true);
  });

  it('searchKwargs limit does not update vector_search.top_k', () => {
    const body = buildSearchBody({
      query: 'query',
      searchMode: 'hybrid',
      topK: 5,
      searchKwargs: { limit: 50 },
    });
    expect(body.limit).toBe(50);
    expect((body.vector_search as Record<string, unknown>).top_k).toBe(5);
  });

  it('omits optional params when not provided', () => {
    const body = buildSearchBody({ query: 'query', searchMode: 'text', topK: 5 });
    expect(body).not.toHaveProperty('where');
    expect(body).not.toHaveProperty('sort');
    expect(body).not.toHaveProperty('hybrid_config');
    expect(body).not.toHaveProperty('vector_boost_config');
  });

  it('uses correct defaults', () => {
    const body = buildSearchBody({ query: 'query' });
    expect(body.search_mode).toBe('hybrid');
    expect(body.limit).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Search mode helpers
// ---------------------------------------------------------------------------

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
