/**
 * Tests for FoxNoseRetriever.
 */

import { describe, it, expect, vi } from 'vitest';
import { FoxNoseRetriever } from '../src/retriever.js';
import { createMockFluxClient, createMockEmbeddings } from './fixtures.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('FoxNoseRetriever — validation', () => {
  it('throws when no content mapping is provided', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
        }),
    ).toThrow(/content mapping strategy/i);
  });

  it('throws when multiple content strategies are set', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          pageContentFields: ['title', 'body'],
        }),
    ).toThrow(/only one/i);
  });

  it('throws for invalid search mode', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          searchMode: 'invalid' as any,
        }),
    ).toThrow(/invalid searchMode/i);
  });

  it('throws for topK = 0', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          topK: 0,
        }),
    ).toThrow(/topK must be/i);
  });

  it('throws for both metadata options', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          metadataFields: ['title'],
          excludeMetadataFields: ['status'],
        }),
    ).toThrow(/mutually exclusive/i);
  });

  it('throws for empty pageContentFields', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentFields: [],
        }),
    ).toThrow(/must not be empty/i);
  });

  it('throws for textThreshold out of range', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          textThreshold: 1.5,
        }),
    ).toThrow(/textThreshold must be/i);
  });

  it('throws for similarityThreshold out of range', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          similarityThreshold: 2.0,
        }),
    ).toThrow(/similarityThreshold must be/i);
  });

  it('throws when search_mode is in searchKwargs', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          searchKwargs: { search_mode: 'text' },
        }),
    ).toThrow(/conflicting keys.*search_mode/i);
  });

  it('throws when searchKwargs has vector_search key', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          searchKwargs: { vector_search: {} },
        }),
    ).toThrow(/conflicting keys/i);
  });

  it('throws for embeddings without vectorField', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          searchMode: 'vector',
          embeddings: createMockEmbeddings() as any,
        }),
    ).toThrow(/vectorField.*required/i);
  });

  it('throws for embeddings + queryVector', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          searchMode: 'vector',
          embeddings: createMockEmbeddings() as any,
          queryVector: [0.1, 0.2],
          vectorField: 'embedding',
        }),
    ).toThrow(/mutually exclusive/i);
  });

  it('throws for vectorField + vectorFields', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          searchMode: 'vector',
          embeddings: createMockEmbeddings() as any,
          vectorField: 'embedding',
          vectorFields: ['embedding'],
        }),
    ).toThrow(/mutually exclusive/i);
  });

  it('throws for embeddings in text mode', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          searchMode: 'text',
          embeddings: createMockEmbeddings() as any,
          vectorField: 'embedding',
        }),
    ).toThrow(/only supported in.*vector/i);
  });

  it('throws for vectorField without source', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          searchMode: 'vector',
          vectorField: 'embedding',
        }),
    ).toThrow(/requires either/i);
  });

  it('throws for empty queryVector', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          searchMode: 'vector',
          queryVector: [],
          vectorField: 'embedding',
        }),
    ).toThrow(/must not be empty/i);
  });

  it('throws for NaN in queryVector', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          searchMode: 'vector',
          queryVector: [0.1, NaN, 0.3],
          vectorField: 'embedding',
        }),
    ).toThrow(/finite/i);
  });

  it('throws for hybridConfig with unknown keys', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          searchMode: 'hybrid',
          hybridConfig: { vectorWeight: 0.6, textWeight: 0.4, typo: true } as any,
        }),
    ).toThrow(/unknown keys.*typo/i);
  });

  it('throws for hybridConfig weights not summing to 1', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          searchMode: 'hybrid',
          hybridConfig: { vectorWeight: 0.3, textWeight: 0.3 },
        }),
    ).toThrow(/sum to 1\.0/i);
  });

  it('throws for vectorBoostConfig with unknown keys', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          searchMode: 'vector_boosted',
          vectorBoostConfig: { boostFactor: 1.5, unknownKey: true } as any,
        }),
    ).toThrow(/unknown keys.*unknownKey/i);
  });

  it('throws for vectorFields in vector_boosted mode', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          searchMode: 'vector_boosted',
          vectorFields: ['embedding'],
        }),
    ).toThrow(/vectorFields.*not supported.*vector_boosted/i);
  });

  it('accepts valid config', () => {
    const retriever = new FoxNoseRetriever({
      client: createMockFluxClient() as any,
      folderPath: 'kb',
      pageContentField: 'body',
      searchMode: 'hybrid',
    });
    expect(retriever).toBeInstanceOf(FoxNoseRetriever);
  });

  it('accepts valid config with embeddings', () => {
    const retriever = new FoxNoseRetriever({
      client: createMockFluxClient() as any,
      folderPath: 'kb',
      pageContentField: 'body',
      searchMode: 'vector',
      embeddings: createMockEmbeddings() as any,
      vectorField: 'embedding',
    });
    expect(retriever).toBeInstanceOf(FoxNoseRetriever);
  });

  it('accepts pageContentMapper', () => {
    const retriever = new FoxNoseRetriever({
      client: createMockFluxClient() as any,
      folderPath: 'kb',
      pageContentMapper: (r) => (r.data as any).body,
    });
    expect(retriever).toBeInstanceOf(FoxNoseRetriever);
  });
});

// ---------------------------------------------------------------------------
// SDK method dispatch
// ---------------------------------------------------------------------------

describe('FoxNoseRetriever — SDK dispatch', () => {
  it('text mode calls client.search', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'text',
      topK: 10,
    });

    await retriever.invoke('keyword search');
    expect(client.search).toHaveBeenCalledOnce();
    expect(client.vectorSearch).not.toHaveBeenCalled();
    const body = client.search.mock.calls[0][1];
    expect(body.search_mode).toBe('text');
    expect(body.find_text.query).toBe('keyword search');
    expect(body.limit).toBe(10);
  });

  it('text mode passes searchFields and textThreshold', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'text',
      searchFields: ['title', 'body'],
      textThreshold: 0.85,
    });

    await retriever.invoke('query');
    const body = client.search.mock.calls[0][1];
    expect(body.find_text.fields).toEqual(['title', 'body']);
    expect(body.find_text.threshold).toBe(0.85);
  });

  it('text mode passes where and sort', async () => {
    const client = createMockFluxClient();
    const whereFilter = { $: { all_of: [{ status__eq: 'published' }] } };
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'text',
      where: whereFilter,
      sort: ['-created_at'],
    });

    await retriever.invoke('query');
    const body = client.search.mock.calls[0][1];
    expect(body.where).toEqual(whereFilter);
    expect(body.sort).toEqual(['-created_at']);
  });

  it('text mode passes offset from searchKwargs', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'text',
      searchKwargs: { offset: 20 },
    });

    await retriever.invoke('query');
    const body = client.search.mock.calls[0][1];
    expect(body.offset).toBe(20);
  });

  it('vector mode calls client.vectorSearch', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'vector',
      topK: 20,
      similarityThreshold: 0.8,
      vectorFields: ['embedding'],
    });

    await retriever.invoke('semantic search');
    expect(client.vectorSearch).toHaveBeenCalledOnce();
    expect(client.search).not.toHaveBeenCalled();
    const opts = client.vectorSearch.mock.calls[0][1];
    expect(opts.query).toBe('semantic search');
    expect(opts.top_k).toBe(20);
    expect(opts.similarity_threshold).toBe(0.8);
    expect(opts.fields).toEqual(['embedding']);
  });

  it('vector mode with embeddings calls client.vectorFieldSearch', async () => {
    const client = createMockFluxClient();
    const embeddings = createMockEmbeddings([0.5, 0.6, 0.7]);
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'vector',
      embeddings: embeddings as any,
      vectorField: 'embedding',
      topK: 10,
    });

    await retriever.invoke('semantic search');
    expect(client.vectorFieldSearch).toHaveBeenCalledOnce();
    expect(client.vectorSearch).not.toHaveBeenCalled();
    expect(embeddings.embedQuery).toHaveBeenCalledWith('semantic search');
    const opts = client.vectorFieldSearch.mock.calls[0][1];
    expect(opts.field).toBe('embedding');
    expect(opts.query_vector).toEqual([0.5, 0.6, 0.7]);
    expect(opts.top_k).toBe(10);
  });

  it('vector mode with queryVector calls client.vectorFieldSearch', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'vector',
      queryVector: [0.1, 0.2, 0.3],
      vectorField: 'embedding',
    });

    await retriever.invoke('any query');
    expect(client.vectorFieldSearch).toHaveBeenCalledOnce();
    const opts = client.vectorFieldSearch.mock.calls[0][1];
    expect(opts.field).toBe('embedding');
    expect(opts.query_vector).toEqual([0.1, 0.2, 0.3]);
  });

  it('hybrid mode calls client.hybridSearch', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'hybrid',
      topK: 5,
      hybridConfig: { vectorWeight: 0.7, textWeight: 0.3 },
    });

    await retriever.invoke('hybrid query');
    expect(client.hybridSearch).toHaveBeenCalledOnce();
    expect(client.search).not.toHaveBeenCalled();
    const opts = client.hybridSearch.mock.calls[0][1];
    expect(opts.query).toBe('hybrid query');
    expect(opts.find_text.query).toBe('hybrid query');
    expect(opts.vector_weight).toBe(0.7);
    expect(opts.text_weight).toBe(0.3);
    expect(opts.rerank_results).toBe(true);
    expect(opts.top_k).toBe(5);
  });

  it('hybrid mode uses default config when omitted', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'hybrid',
    });

    await retriever.invoke('query');
    const opts = client.hybridSearch.mock.calls[0][1];
    expect(opts.vector_weight).toBe(0.6);
    expect(opts.text_weight).toBe(0.4);
  });

  it('vector_boosted mode calls client.boostedSearch', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'vector_boosted',
      vectorBoostConfig: { boostFactor: 2.0, maxBoostResults: 10 },
    });

    await retriever.invoke('boosted query');
    expect(client.boostedSearch).toHaveBeenCalledOnce();
    const opts = client.boostedSearch.mock.calls[0][1];
    expect(opts.find_text.query).toBe('boosted query');
    expect(opts.query).toBe('boosted query');
    expect(opts.boost_factor).toBe(2.0);
    expect(opts.max_boost_results).toBe(10);
  });

  it('vector_boosted mode with embeddings uses vectorFieldSearch params', async () => {
    const client = createMockFluxClient();
    const embeddings = createMockEmbeddings([0.9, 0.8]);
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'vector_boosted',
      embeddings: embeddings as any,
      vectorField: 'embedding',
    });

    await retriever.invoke('boosted query');
    expect(client.boostedSearch).toHaveBeenCalledOnce();
    const opts = client.boostedSearch.mock.calls[0][1];
    expect(opts.field).toBe('embedding');
    expect(opts.query_vector).toEqual([0.9, 0.8]);
    expect(opts.query).toBeUndefined();
  });

  it('passes where and sort as extra body for non-text modes', async () => {
    const client = createMockFluxClient();
    const whereFilter = { $: { all_of: [{ status__eq: 'published' }] } };
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'vector',
      where: whereFilter,
      sort: ['-score'],
    });

    await retriever.invoke('query');
    const opts = client.vectorSearch.mock.calls[0][1];
    expect(opts.where).toEqual(whereFilter);
    expect(opts.sort).toEqual(['-score']);
  });

  it('searchKwargs limit/offset are passed as named params', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'vector',
      searchKwargs: { limit: 50, offset: 10 },
    });

    await retriever.invoke('query');
    const opts = client.vectorSearch.mock.calls[0][1];
    expect(opts.limit).toBe(50);
    expect(opts.offset).toBe(10);
  });

  it('searchKwargs custom fields passed as extra body', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'vector',
      searchKwargs: { custom_param: 'value' },
    });

    await retriever.invoke('query');
    const opts = client.vectorSearch.mock.calls[0][1];
    expect(opts.custom_param).toBe('value');
  });

  it('searchKwargs extras override instance where/sort', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'vector',
      where: { original: true },
      sort: ['-original'],
      searchKwargs: { where: { override: true }, sort: ['-override'] },
    });

    await retriever.invoke('query');
    const opts = client.vectorSearch.mock.calls[0][1];
    expect(opts.where).toEqual({ override: true });
    expect(opts.sort).toEqual(['-override']);
  });
});

// ---------------------------------------------------------------------------
// Document mapping
// ---------------------------------------------------------------------------

describe('FoxNoseRetriever — document mapping', () => {
  it('returns documents from search results', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
    });

    const docs = await retriever.invoke('test query');
    expect(docs).toHaveLength(3);
    expect(docs[0].pageContent).toBe('FoxNose is a serverless knowledge platform...');
    expect(docs[0].metadata.key).toBe('abc123');
  });

  it('concatenates multi-field content', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentFields: ['title', 'body'],
      pageContentSeparator: ' | ',
    });

    const docs = await retriever.invoke('query');
    expect(docs[0].pageContent).toContain(' | ');
    expect(docs[0].pageContent).toContain('Getting Started with FoxNose');
  });

  it('uses custom mapper', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentMapper: (r) => `# ${(r.data as any).title}`,
    });

    const docs = await retriever.invoke('query');
    expect(docs[0].pageContent).toBe('# Getting Started with FoxNose');
  });

  it('respects metadata whitelist', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      metadataFields: ['title'],
    });

    const docs = await retriever.invoke('query');
    expect(docs[0].metadata).toHaveProperty('title');
    expect(docs[0].metadata).not.toHaveProperty('category');
  });

  it('respects metadata blacklist', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      excludeMetadataFields: ['status'],
    });

    const docs = await retriever.invoke('query');
    expect(docs[0].metadata).not.toHaveProperty('status');
    expect(docs[0].metadata).toHaveProperty('title');
  });

  it('returns empty array for empty results', async () => {
    const client = createMockFluxClient({
      hybridSearch: vi.fn().mockResolvedValue({ results: [], limit: 5 }),
    });
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
    });

    const docs = await retriever.invoke('query');
    expect(docs).toEqual([]);
  });

  it('propagates API errors', async () => {
    const client = createMockFluxClient({
      hybridSearch: vi.fn().mockRejectedValue(new Error('API error')),
    });
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
    });

    await expect(retriever.invoke('query')).rejects.toThrow('API error');
  });
});

// ---------------------------------------------------------------------------
// LangChain integration
// ---------------------------------------------------------------------------

describe('FoxNoseRetriever — LangChain integration', () => {
  it('has correct lc_name', () => {
    expect(FoxNoseRetriever.lc_name()).toBe('FoxNoseRetriever');
  });

  it('has correct lc_namespace', () => {
    const retriever = new FoxNoseRetriever({
      client: createMockFluxClient() as any,
      folderPath: 'kb',
      pageContentField: 'body',
    });
    expect(retriever.lc_namespace).toEqual(['langchain', 'retrievers', 'foxnose']);
  });
});
