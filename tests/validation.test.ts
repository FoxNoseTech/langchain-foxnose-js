/**
 * Tests for validation logic.
 */

import { describe, it, expect } from 'vitest';
import {
  validateContentMapping,
  validateMetadataFields,
  validateRetrieverConfig,
  validateLoaderConfig,
} from '../src/validation.js';

// ---------------------------------------------------------------------------
// Content mapping validation
// ---------------------------------------------------------------------------

describe('validateContentMapping', () => {
  it('throws when no strategy is provided', () => {
    expect(() => validateContentMapping({})).toThrow(/content mapping strategy/i);
  });

  it('throws when multiple strategies are provided', () => {
    expect(() =>
      validateContentMapping({
        pageContentField: 'body',
        pageContentFields: ['title', 'body'],
      }),
    ).toThrow(/only one/i);
  });

  it('throws when pageContentField + pageContentMapper are both set', () => {
    expect(() =>
      validateContentMapping({
        pageContentField: 'body',
        pageContentMapper: () => '',
      }),
    ).toThrow(/only one/i);
  });

  it('throws when all three strategies are set', () => {
    expect(() =>
      validateContentMapping({
        pageContentField: 'body',
        pageContentFields: ['title'],
        pageContentMapper: () => '',
      }),
    ).toThrow(/only one/i);
  });

  it('throws when pageContentFields is empty array', () => {
    expect(() => validateContentMapping({ pageContentFields: [] })).toThrow(/must not be empty/i);
  });

  it('accepts single pageContentField', () => {
    expect(() => validateContentMapping({ pageContentField: 'body' })).not.toThrow();
  });

  it('accepts pageContentFields', () => {
    expect(() => validateContentMapping({ pageContentFields: ['title', 'body'] })).not.toThrow();
  });

  it('accepts pageContentMapper', () => {
    expect(() => validateContentMapping({ pageContentMapper: () => '' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Metadata validation
// ---------------------------------------------------------------------------

describe('validateMetadataFields', () => {
  it('throws when both metadata options are set', () => {
    expect(() =>
      validateMetadataFields({
        metadataFields: ['title'],
        excludeMetadataFields: ['status'],
      }),
    ).toThrow(/mutually exclusive/i);
  });

  it('accepts only metadataFields', () => {
    expect(() => validateMetadataFields({ metadataFields: ['title'] })).not.toThrow();
  });

  it('accepts only excludeMetadataFields', () => {
    expect(() => validateMetadataFields({ excludeMetadataFields: ['status'] })).not.toThrow();
  });

  it('accepts neither', () => {
    expect(() => validateMetadataFields({})).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Retriever validation
// ---------------------------------------------------------------------------

describe('validateRetrieverConfig', () => {
  const base = { pageContentField: 'body' };

  it('throws for invalid searchMode', () => {
    expect(() => validateRetrieverConfig({ ...base, searchMode: 'invalid' as any })).toThrow(
      /invalid searchMode/i,
    );
  });

  it('throws for topK = 0', () => {
    expect(() => validateRetrieverConfig({ ...base, topK: 0 })).toThrow(/topK must be/i);
  });

  it('throws for negative topK', () => {
    expect(() => validateRetrieverConfig({ ...base, topK: -5 })).toThrow(/topK must be/i);
  });

  it('throws for textThreshold > 1', () => {
    expect(() => validateRetrieverConfig({ ...base, textThreshold: 1.5 })).toThrow(
      /textThreshold must be/i,
    );
  });

  it('throws for negative textThreshold', () => {
    expect(() => validateRetrieverConfig({ ...base, textThreshold: -0.1 })).toThrow(
      /textThreshold must be/i,
    );
  });

  it('throws for similarityThreshold > 1', () => {
    expect(() => validateRetrieverConfig({ ...base, similarityThreshold: 2.0 })).toThrow(
      /similarityThreshold must be/i,
    );
  });

  it('throws when search_mode in searchKwargs', () => {
    expect(() =>
      validateRetrieverConfig({ ...base, searchKwargs: { search_mode: 'text' } }),
    ).toThrow(/do not override.*search_mode/i);
  });

  it('accepts valid config with defaults', () => {
    expect(() => validateRetrieverConfig(base)).not.toThrow();
  });

  it('accepts valid config with all options', () => {
    expect(() =>
      validateRetrieverConfig({
        ...base,
        searchMode: 'hybrid',
        topK: 10,
        textThreshold: 0.8,
        similarityThreshold: 0.7,
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Loader validation
// ---------------------------------------------------------------------------

describe('validateLoaderConfig', () => {
  const base = { pageContentField: 'body' };

  it('throws for batchSize = 0', () => {
    expect(() => validateLoaderConfig({ ...base, batchSize: 0 })).toThrow(/batchSize must be/i);
  });

  it('throws for negative batchSize', () => {
    expect(() => validateLoaderConfig({ ...base, batchSize: -10 })).toThrow(/batchSize must be/i);
  });

  it('accepts valid config', () => {
    expect(() => validateLoaderConfig(base)).not.toThrow();
  });

  it('accepts custom batchSize', () => {
    expect(() => validateLoaderConfig({ ...base, batchSize: 50 })).not.toThrow();
  });
});
