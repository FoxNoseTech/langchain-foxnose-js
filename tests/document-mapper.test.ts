/**
 * Tests for the document mapper.
 */

import { describe, it, expect } from 'vitest';
import { mapResultsToDocuments } from '../src/document-mapper.js';
import { SAMPLE_RESULTS } from './fixtures.js';

// ---------------------------------------------------------------------------
// Single field content
// ---------------------------------------------------------------------------

describe('mapResultsToDocuments — single field content', () => {
  it('maps body field to pageContent', () => {
    const docs = mapResultsToDocuments(SAMPLE_RESULTS, { pageContentField: 'body' });
    expect(docs).toHaveLength(3);
    expect(docs[0].pageContent).toBe('FoxNose is a serverless knowledge platform...');
    expect(docs[1].pageContent).toBe('Learn how to use vector search in FoxNose...');
  });

  it('returns empty string for missing field', () => {
    const results = [{ _sys: { key: 'a' }, data: { title: 'Hello' } }];
    const docs = mapResultsToDocuments(results, { pageContentField: 'body' });
    expect(docs[0].pageContent).toBe('');
  });

  it('converts non-string field to string', () => {
    const results = [{ _sys: { key: 'a' }, data: { count: 42 } }];
    const docs = mapResultsToDocuments(results, { pageContentField: 'count' });
    expect(docs[0].pageContent).toBe('42');
  });

  it('returns empty string for null field', () => {
    const results = [{ _sys: { key: 'a' }, data: { body: null } }];
    const docs = mapResultsToDocuments(results, { pageContentField: 'body' });
    expect(docs[0].pageContent).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Multi-field content
// ---------------------------------------------------------------------------

describe('mapResultsToDocuments — multi-field content', () => {
  it('concatenates two fields with default separator', () => {
    const docs = mapResultsToDocuments(SAMPLE_RESULTS, {
      pageContentFields: ['title', 'body'],
    });
    const expected = 'Getting Started with FoxNose\n\nFoxNose is a serverless knowledge platform...';
    expect(docs[0].pageContent).toBe(expected);
  });

  it('uses custom separator', () => {
    const docs = mapResultsToDocuments(SAMPLE_RESULTS, {
      pageContentFields: ['title', 'body'],
      pageContentSeparator: ' | ',
    });
    expect(docs[0].pageContent).toContain(' | ');
  });

  it('skips missing fields', () => {
    const results = [{ _sys: { key: 'a' }, data: { title: 'Hello' } }];
    const docs = mapResultsToDocuments(results, {
      pageContentFields: ['title', 'missing'],
    });
    expect(docs[0].pageContent).toBe('Hello');
  });

  it('returns empty string when all fields are missing', () => {
    const results = [{ _sys: { key: 'a' }, data: {} }];
    const docs = mapResultsToDocuments(results, {
      pageContentFields: ['title', 'body'],
    });
    expect(docs[0].pageContent).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Custom mapper
// ---------------------------------------------------------------------------

describe('mapResultsToDocuments — custom mapper', () => {
  it('uses custom mapper function', () => {
    const docs = mapResultsToDocuments(SAMPLE_RESULTS, {
      pageContentMapper: (r) => `# ${(r.data as any).title}\n${(r.data as any).body}`,
    });
    expect(docs[0].pageContent).toMatch(/^# Getting Started with FoxNose/);
  });

  it('mapper receives full result including _sys', () => {
    const docs = mapResultsToDocuments(SAMPLE_RESULTS, {
      pageContentMapper: (r) => `[${r._sys?.key}] ${(r.data as any).title}`,
    });
    expect(docs[0].pageContent).toBe('[abc123] Getting Started with FoxNose');
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe('mapResultsToDocuments — metadata', () => {
  it('includes _sys metadata by default', () => {
    const docs = mapResultsToDocuments(SAMPLE_RESULTS, { pageContentField: 'body' });
    const meta = docs[0].metadata;
    expect(meta.key).toBe('abc123');
    expect(meta.folder).toBe('articles');
    expect(meta.created_at).toBe('2024-06-01T10:00:00Z');
    expect(meta.updated_at).toBe('2024-06-15T12:00:00Z');
  });

  it('excludes _sys metadata when disabled', () => {
    const docs = mapResultsToDocuments(SAMPLE_RESULTS, {
      pageContentField: 'body',
      includeSysMetadata: false,
    });
    const meta = docs[0].metadata;
    expect(meta).not.toHaveProperty('key');
    expect(meta).not.toHaveProperty('folder');
  });

  it('excludes content field from metadata', () => {
    const docs = mapResultsToDocuments(SAMPLE_RESULTS, { pageContentField: 'body' });
    const meta = docs[0].metadata;
    expect(meta).not.toHaveProperty('body');
    expect(meta.title).toBe('Getting Started with FoxNose');
    expect(meta.category).toBe('tech');
    expect(meta.status).toBe('published');
  });

  it('respects metadata whitelist', () => {
    const docs = mapResultsToDocuments(SAMPLE_RESULTS, {
      pageContentField: 'body',
      metadataFields: ['title'],
    });
    const meta = docs[0].metadata;
    expect(meta).toHaveProperty('title');
    expect(meta).not.toHaveProperty('category');
    expect(meta).not.toHaveProperty('status');
    // sys metadata still included
    expect(meta).toHaveProperty('key');
  });

  it('respects metadata blacklist', () => {
    const docs = mapResultsToDocuments(SAMPLE_RESULTS, {
      pageContentField: 'body',
      excludeMetadataFields: ['status'],
    });
    const meta = docs[0].metadata;
    expect(meta).toHaveProperty('title');
    expect(meta).toHaveProperty('category');
    expect(meta).not.toHaveProperty('status');
  });

  it('includes all data fields in metadata when using custom mapper', () => {
    const docs = mapResultsToDocuments(SAMPLE_RESULTS, {
      pageContentMapper: (r) => (r.data as any).body,
    });
    const meta = docs[0].metadata;
    expect(meta).toHaveProperty('body');
    expect(meta).toHaveProperty('title');
    expect(meta).toHaveProperty('category');
  });

  it('excludes multi-field content from metadata', () => {
    const docs = mapResultsToDocuments(SAMPLE_RESULTS, {
      pageContentFields: ['title', 'body'],
    });
    const meta = docs[0].metadata;
    expect(meta).not.toHaveProperty('title');
    expect(meta).not.toHaveProperty('body');
    expect(meta).toHaveProperty('category');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('mapResultsToDocuments — edge cases', () => {
  it('returns empty array for empty results', () => {
    const docs = mapResultsToDocuments([], { pageContentField: 'body' });
    expect(docs).toEqual([]);
  });

  it('handles result with empty data', () => {
    const results = [{ _sys: { key: 'a' }, data: {} }];
    const docs = mapResultsToDocuments(results, { pageContentField: 'body' });
    expect(docs).toHaveLength(1);
    expect(docs[0].pageContent).toBe('');
  });

  it('handles result with no _sys', () => {
    const results = [{ data: { body: 'content' } }];
    const docs = mapResultsToDocuments(results, { pageContentField: 'body' });
    expect(docs[0].pageContent).toBe('content');
    expect(docs[0].metadata).toEqual({});
  });

  it('handles result with null data', () => {
    const results = [{ _sys: { key: 'a' }, data: null }];
    const docs = mapResultsToDocuments(results, { pageContentField: 'body' });
    expect(docs).toHaveLength(1);
    expect(docs[0].pageContent).toBe('');
    expect(docs[0].metadata).toEqual({ key: 'a' });
  });

  it('skips null _sys field values', () => {
    const results = [{ _sys: { key: 'a', folder: null as any, created_at: undefined as any }, data: { body: 'text' } }];
    const docs = mapResultsToDocuments(results, { pageContentField: 'body' });
    expect(docs[0].metadata).toHaveProperty('key', 'a');
    expect(docs[0].metadata).not.toHaveProperty('folder');
    expect(docs[0].metadata).not.toHaveProperty('created_at');
  });
});
