/**
 * Tests for FoxNoseRetriever.
 */

import { describe, it, expect, vi } from 'vitest';
import { FoxNoseRetriever } from '../src/retriever.js';
import { createMockFluxClient } from './fixtures.js';

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
    ).toThrow(/do not override.*search_mode/i);
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
// Synchronous-like invocation (all async in TS)
// ---------------------------------------------------------------------------

describe('FoxNoseRetriever — invoke', () => {
  it('returns documents from search results', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'hybrid',
      topK: 5,
    });

    const docs = await retriever.invoke('test query');
    expect(docs).toHaveLength(3);
    expect(docs[0].pageContent).toBe('FoxNose is a serverless knowledge platform...');
    expect(docs[0].metadata.key).toBe('abc123');
  });

  it('calls client.search with correct arguments', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'hybrid',
      topK: 5,
    });

    await retriever.invoke('test query');
    expect(client.search).toHaveBeenCalledOnce();
    const [folder, body] = client.search.mock.calls[0];
    expect(folder).toBe('articles');
    expect(body.search_mode).toBe('hybrid');
    expect(body.limit).toBe(5);
    expect(body.find_text.query).toBe('test query');
    expect(body.vector_search.query).toBe('test query');
  });

  it('builds text-only search body', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'text',
      topK: 10,
    });

    await retriever.invoke('keyword search');
    const body = client.search.mock.calls[0][1];
    expect(body.search_mode).toBe('text');
    expect(body).toHaveProperty('find_text');
    expect(body).not.toHaveProperty('vector_search');
  });

  it('builds vector-only search body', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'vector',
      topK: 20,
      similarityThreshold: 0.8,
    });

    await retriever.invoke('semantic search');
    const body = client.search.mock.calls[0][1];
    expect(body.search_mode).toBe('vector');
    expect(body).toHaveProperty('vector_search');
    expect(body).not.toHaveProperty('find_text');
    expect(body.vector_search.similarity_threshold).toBe(0.8);
  });

  it('passes where filter', async () => {
    const client = createMockFluxClient();
    const whereFilter = { $: { all_of: [{ status__eq: 'published' }] } };
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      where: whereFilter,
    });

    await retriever.invoke('query');
    const body = client.search.mock.calls[0][1];
    expect(body.where).toEqual(whereFilter);
  });

  it('merges searchKwargs', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchKwargs: { ignore_unknown_fields: true, limit: 50 },
    });

    await retriever.invoke('query');
    const body = client.search.mock.calls[0][1];
    expect(body.ignore_unknown_fields).toBe(true);
    expect(body.limit).toBe(50);
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
      search: vi.fn().mockResolvedValue({ results: [], limit: 5 }),
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
      search: vi.fn().mockRejectedValue(new Error('API error')),
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
// searchKwargs override behaviour
// ---------------------------------------------------------------------------

describe('FoxNoseRetriever — searchKwargs override', () => {
  it('searchKwargs limit overrides topK in outer body but not vector_search.top_k', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'hybrid',
      topK: 5,
      searchKwargs: { limit: 50 },
    });

    await retriever.invoke('query');
    const body = client.search.mock.calls[0][1];
    expect(body.limit).toBe(50);
    expect(body.vector_search.top_k).toBe(5);
  });

  it('searchKwargs can add custom fields', async () => {
    const client = createMockFluxClient();
    const retriever = new FoxNoseRetriever({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchKwargs: { ignore_unknown_fields: true, custom_param: 'value' },
    });

    await retriever.invoke('query');
    const body = client.search.mock.calls[0][1];
    expect(body.ignore_unknown_fields).toBe(true);
    expect(body.custom_param).toBe('value');
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
