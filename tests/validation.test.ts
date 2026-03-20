/**
 * Tests for validation logic.
 */

import { describe, it, expect } from 'vitest';
import {
  validateContentMapping,
  validateMetadataFields,
  validateRetrieverConfig,
  validateLoaderConfig,
  validateSearchKwargs,
  splitSearchKwargs,
  validateHybridConfig,
  validateVectorBoostConfig,
  validateEmbeddingConfig,
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

  it('throws for NaN topK', () => {
    expect(() => validateRetrieverConfig({ ...base, topK: NaN })).toThrow(/topK must be/i);
  });

  it('throws for non-integer topK', () => {
    expect(() => validateRetrieverConfig({ ...base, topK: 1.5 })).toThrow(/integer/i);
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

  it('throws for NaN textThreshold', () => {
    expect(() => validateRetrieverConfig({ ...base, textThreshold: NaN })).toThrow(
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
    ).toThrow(/conflicting keys.*search_mode/i);
  });

  it('throws for vectorFields in vector_boosted mode', () => {
    expect(() =>
      validateRetrieverConfig({ ...base, searchMode: 'vector_boosted', vectorFields: ['emb'] }),
    ).toThrow(/vectorFields.*not supported.*vector_boosted/i);
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
// searchKwargs validation
// ---------------------------------------------------------------------------

describe('validateSearchKwargs', () => {
  it('throws for conflicting key search_mode', () => {
    expect(() => validateSearchKwargs({ search_mode: 'text' })).toThrow(
      /conflicting keys.*search_mode/i,
    );
  });

  it('throws for conflicting key vector_search', () => {
    expect(() => validateSearchKwargs({ vector_search: {} })).toThrow(/conflicting keys/i);
  });

  it('throws for conflicting key find_phrase', () => {
    expect(() => validateSearchKwargs({ find_phrase: {} })).toThrow(/conflicting keys/i);
  });

  it('throws for SDK param key query', () => {
    expect(() => validateSearchKwargs({ query: 'test' })).toThrow(/conflicting keys/i);
  });

  it('throws for SDK param key top_k', () => {
    expect(() => validateSearchKwargs({ top_k: 10 })).toThrow(/conflicting keys/i);
  });

  it('throws for NaN limit', () => {
    expect(() => validateSearchKwargs({ limit: NaN })).toThrow(/limit must be/i);
  });

  it('throws for non-integer limit', () => {
    expect(() => validateSearchKwargs({ limit: 1.5 })).toThrow(/limit must be/i);
  });

  it('throws for limit < 1', () => {
    expect(() => validateSearchKwargs({ limit: 0 })).toThrow(/limit must be/i);
  });

  it('throws for negative offset', () => {
    expect(() => validateSearchKwargs({ offset: -1 })).toThrow(/offset must be/i);
  });

  it('throws for NaN offset', () => {
    expect(() => validateSearchKwargs({ offset: NaN })).toThrow(/offset must be/i);
  });

  it('throws for non-integer offset', () => {
    expect(() => validateSearchKwargs({ offset: 1.5 })).toThrow(/offset must be/i);
  });

  it('accepts valid limit and offset', () => {
    expect(() => validateSearchKwargs({ limit: 10, offset: 0 })).not.toThrow();
  });

  it('accepts non-conflicting keys', () => {
    expect(() => validateSearchKwargs({ limit: 10, custom: true })).not.toThrow();
  });

  it('accepts undefined', () => {
    expect(() => validateSearchKwargs(undefined)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// splitSearchKwargs
// ---------------------------------------------------------------------------

describe('splitSearchKwargs', () => {
  it('splits named and extra params', () => {
    const result = splitSearchKwargs({ limit: 50, offset: 10, custom: 'value' });
    expect(result.named).toEqual({ limit: 50, offset: 10 });
    expect(result.extra).toEqual({ custom: 'value' });
  });

  it('handles empty kwargs', () => {
    const result = splitSearchKwargs({});
    expect(result.named).toEqual({});
    expect(result.extra).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// hybridConfig validation
// ---------------------------------------------------------------------------

describe('validateHybridConfig', () => {
  it('throws for unknown keys', () => {
    expect(() => validateHybridConfig({ vectorWeight: 0.6, textWeight: 0.4, typo: true } as any)).toThrow(
      /unknown keys.*typo/i,
    );
  });

  it('throws for weights not summing to 1', () => {
    expect(() => validateHybridConfig({ vectorWeight: 0.3, textWeight: 0.3 })).toThrow(
      /sum to 1\.0/i,
    );
  });

  it('throws for vectorWeight out of range', () => {
    expect(() => validateHybridConfig({ vectorWeight: 1.5, textWeight: -0.5 })).toThrow(
      /vectorWeight must be/i,
    );
  });

  it('throws for textWeight out of range', () => {
    expect(() => validateHybridConfig({ vectorWeight: 0.5, textWeight: -0.5 })).toThrow(
      /textWeight must be/i,
    );
  });

  it('accepts valid config', () => {
    expect(() => validateHybridConfig({ vectorWeight: 0.7, textWeight: 0.3 })).not.toThrow();
  });

  it('accepts empty config (uses defaults)', () => {
    expect(() => validateHybridConfig({})).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// vectorBoostConfig validation
// ---------------------------------------------------------------------------

describe('validateVectorBoostConfig', () => {
  it('throws for unknown keys', () => {
    expect(() => validateVectorBoostConfig({ boostFactor: 1.5, unknownKey: true } as any)).toThrow(
      /unknown keys.*unknownKey/i,
    );
  });

  it('throws for boostFactor <= 0', () => {
    expect(() => validateVectorBoostConfig({ boostFactor: 0 })).toThrow(/boostFactor must be/i);
  });

  it('throws for boostFactor = NaN', () => {
    expect(() => validateVectorBoostConfig({ boostFactor: NaN })).toThrow(/boostFactor must be/i);
  });

  it('throws for non-integer maxBoostResults', () => {
    expect(() => validateVectorBoostConfig({ maxBoostResults: 1.5 })).toThrow(/integer/i);
  });

  it('throws for similarityThreshold out of range', () => {
    expect(() => validateVectorBoostConfig({ similarityThreshold: 1.5 })).toThrow(
      /similarityThreshold must be/i,
    );
  });

  it('throws for maxBoostResults < 1', () => {
    expect(() => validateVectorBoostConfig({ maxBoostResults: 0 })).toThrow(
      /maxBoostResults must be/i,
    );
  });

  it('accepts valid config', () => {
    expect(() =>
      validateVectorBoostConfig({ boostFactor: 2.0, similarityThreshold: 0.7, maxBoostResults: 10 }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Embedding config validation
// ---------------------------------------------------------------------------

describe('validateEmbeddingConfig', () => {
  const mockEmb = { embedQuery: async () => [0.1], embedDocuments: async () => [[0.1]] };

  it('throws for embeddings + queryVector', () => {
    expect(() =>
      validateEmbeddingConfig({
        pageContentField: 'body',
        searchMode: 'vector',
        embeddings: mockEmb as any,
        queryVector: [0.1],
        vectorField: 'emb',
      }),
    ).toThrow(/mutually exclusive/i);
  });

  it('throws for embeddings without vectorField', () => {
    expect(() =>
      validateEmbeddingConfig({
        pageContentField: 'body',
        searchMode: 'vector',
        embeddings: mockEmb as any,
      }),
    ).toThrow(/vectorField.*required/i);
  });

  it('throws for vectorField without source', () => {
    expect(() =>
      validateEmbeddingConfig({
        pageContentField: 'body',
        searchMode: 'vector',
        vectorField: 'emb',
      }),
    ).toThrow(/requires either/i);
  });

  it('throws for embeddings in text mode', () => {
    expect(() =>
      validateEmbeddingConfig({
        pageContentField: 'body',
        searchMode: 'text',
        embeddings: mockEmb as any,
        vectorField: 'emb',
      }),
    ).toThrow(/only supported/i);
  });

  it('throws for vectorField + vectorFields', () => {
    expect(() =>
      validateEmbeddingConfig({
        pageContentField: 'body',
        searchMode: 'vector',
        embeddings: mockEmb as any,
        vectorField: 'emb',
        vectorFields: ['emb'],
      }),
    ).toThrow(/mutually exclusive/i);
  });

  it('throws for empty queryVector', () => {
    expect(() =>
      validateEmbeddingConfig({
        pageContentField: 'body',
        searchMode: 'vector',
        queryVector: [],
        vectorField: 'emb',
      }),
    ).toThrow(/must not be empty/i);
  });

  it('throws for NaN in queryVector', () => {
    expect(() =>
      validateEmbeddingConfig({
        pageContentField: 'body',
        searchMode: 'vector',
        queryVector: [0.1, NaN],
        vectorField: 'emb',
      }),
    ).toThrow(/finite/i);
  });

  it('accepts valid embeddings config', () => {
    expect(() =>
      validateEmbeddingConfig({
        pageContentField: 'body',
        searchMode: 'vector',
        embeddings: mockEmb as any,
        vectorField: 'emb',
      }),
    ).not.toThrow();
  });

  it('accepts no embeddings config', () => {
    expect(() => validateEmbeddingConfig({ pageContentField: 'body' })).not.toThrow();
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
