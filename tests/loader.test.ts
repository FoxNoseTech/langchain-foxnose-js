/**
 * Tests for FoxNoseLoader.
 */

import { describe, it, expect, vi } from 'vitest';
import { FoxNoseLoader, extractCursor } from '../src/loader.js';
import {
  createMockFluxClient,
  SAMPLE_RESULTS,
  makeListResponse,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('FoxNoseLoader — validation', () => {
  it('throws when no content mapping is provided', () => {
    expect(
      () =>
        new FoxNoseLoader({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
        }),
    ).toThrow(/content mapping strategy/i);
  });

  it('throws when multiple content strategies are set', () => {
    expect(
      () =>
        new FoxNoseLoader({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          pageContentFields: ['title', 'body'],
        }),
    ).toThrow(/only one/i);
  });

  it('throws for empty pageContentFields', () => {
    expect(
      () =>
        new FoxNoseLoader({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentFields: [],
        }),
    ).toThrow(/must not be empty/i);
  });

  it('throws for both metadata options', () => {
    expect(
      () =>
        new FoxNoseLoader({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          metadataFields: ['title'],
          excludeMetadataFields: ['status'],
        }),
    ).toThrow(/mutually exclusive/i);
  });

  it('throws for batchSize = 0', () => {
    expect(
      () =>
        new FoxNoseLoader({
          client: createMockFluxClient() as any,
          folderPath: 'kb',
          pageContentField: 'body',
          batchSize: 0,
        }),
    ).toThrow(/batchSize must be/i);
  });

  it('accepts valid config', () => {
    const loader = new FoxNoseLoader({
      client: createMockFluxClient() as any,
      folderPath: 'kb',
      pageContentField: 'body',
    });
    expect(loader).toBeInstanceOf(FoxNoseLoader);
  });
});

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

describe('FoxNoseLoader — load', () => {
  it('returns documents from listResources', async () => {
    const client = createMockFluxClient();
    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
    });

    const docs = await loader.load();
    expect(docs).toHaveLength(3);
    expect(docs[0].pageContent).toBe('FoxNose is a serverless knowledge platform...');
    expect(docs[0].metadata.key).toBe('abc123');
  });

  it('calls listResources with correct arguments', async () => {
    const client = createMockFluxClient();
    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      batchSize: 50,
    });

    await loader.load();
    expect(client.listResources).toHaveBeenCalledOnce();
    const [folder, params] = client.listResources.mock.calls[0];
    expect(folder).toBe('articles');
    expect(params.limit).toBe(50);
  });

  it('forwards custom params', async () => {
    const client = createMockFluxClient();
    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      params: { where: { status__eq: 'published' }, sort: '-created_at' },
    });

    await loader.load();
    const params = client.listResources.mock.calls[0][1];
    expect(params.where).toEqual({ status__eq: 'published' });
    expect(params.sort).toBe('-created_at');
  });

  it('handles cursor-based pagination', async () => {
    const page1 = SAMPLE_RESULTS.slice(0, 2);
    const page2 = SAMPLE_RESULTS.slice(2);

    const client = createMockFluxClient({
      listResources: vi
        .fn()
        .mockResolvedValueOnce(makeListResponse(page1, { count: 3, nextCursor: 'cursor_abc' }))
        .mockResolvedValueOnce(makeListResponse(page2, { count: 3, nextCursor: null })),
    });

    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      batchSize: 2,
    });

    const docs = await loader.load();
    expect(docs).toHaveLength(3);

    // First call should not have "next"
    const firstParams = client.listResources.mock.calls[0][1];
    expect(firstParams).not.toHaveProperty('next');
    expect(firstParams.limit).toBe(2);

    // Second call should include cursor
    const secondParams = client.listResources.mock.calls[1][1];
    expect(secondParams.next).toBe('cursor_abc');
  });

  describe('URL-shaped cursors', () => {
    // FoxNose returns `next` as a FULL URL, not the opaque token the parameter
    // accepts. Feeding the URL straight back made the backend answer with page
    // one and the same `next`, so load() re-fetched the first page forever.
    // The mocks elsewhere in this file model an opaque token, which is exactly
    // why the suite missed it.
    const url = (token: string, limit = 2) =>
      `https://example.invalid/api/articles?limit=${limit}&next=${token}`;

    it('reduces a URL-shaped cursor to its token', () => {
      expect(extractCursor(url('abc123'))).toBe('abc123');
    });

    it('passes a plain token through unchanged', () => {
      expect(extractCursor('abc123')).toBe('abc123');
    });

    it.each([null, undefined, '', 'https://host/api/articles?limit=2', 42, { a: 1 }])(
      'treats %p as the end of pagination',
      (value) => {
        expect(extractCursor(value)).toBeNull();
      },
    );

    it('sends the extracted token, not the whole URL', async () => {
      const client = createMockFluxClient({
        listResources: vi
          .fn()
          .mockResolvedValueOnce(
            makeListResponse(SAMPLE_RESULTS.slice(0, 2), { count: 3, nextCursor: url('page2') }),
          )
          .mockResolvedValueOnce(
            makeListResponse(SAMPLE_RESULTS.slice(2), { count: 3, nextCursor: null }),
          ),
      });

      const docs = await new FoxNoseLoader({
        client: client as any,
        collectionPath: 'articles',
        pageContentField: 'body',
        batchSize: 2,
      }).load();

      expect(docs).toHaveLength(3);
      expect(client.listResources.mock.calls[1][1].next).toBe('page2');
    });

    it('stops when the cursor does not advance', async () => {
      // The live failure mode: same page, same `next`, forever.
      const stuck = makeListResponse(SAMPLE_RESULTS.slice(0, 2), {
        count: 3,
        nextCursor: url('stuck'),
      });
      const listResources = vi.fn().mockResolvedValue(stuck);
      const client = createMockFluxClient({ listResources });

      const docs = await new FoxNoseLoader({
        client: client as any,
        collectionPath: 'articles',
        pageContentField: 'body',
        batchSize: 2,
      }).load();

      expect(listResources).toHaveBeenCalledTimes(2);
      expect(docs).toHaveLength(4);
    });

    it('stops on a cursor cycle', async () => {
      // A -> B -> A: no cursor repeats the PREVIOUS one, yet it never ends.
      // Detection lands one fetch after the cycle closes -- the earliest it
      // can, since a cursor is only known to be part of one when it comes back
      // a second time -- so the re-served page is yielded twice.
      const pageA = makeListResponse(SAMPLE_RESULTS.slice(0, 2), { nextCursor: url('b') });
      const pageB = makeListResponse(SAMPLE_RESULTS.slice(2), { nextCursor: url('a') });
      const listResources = vi
        .fn()
        .mockResolvedValueOnce(pageA)
        .mockResolvedValueOnce(pageB)
        .mockResolvedValue(pageA);
      const client = createMockFluxClient({ listResources });

      const docs = await new FoxNoseLoader({
        client: client as any,
        collectionPath: 'articles',
        pageContentField: 'body',
        batchSize: 2,
      }).load();

      expect(listResources).toHaveBeenCalledTimes(3);
      expect(docs).toHaveLength(SAMPLE_RESULTS.length + 2);
    });
  });

  it('returns empty array for empty results', async () => {
    const client = createMockFluxClient({
      listResources: vi.fn().mockResolvedValue(makeListResponse([], { count: 0 })),
    });
    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
    });

    const docs = await loader.load();
    expect(docs).toEqual([]);
  });

  it('propagates API errors', async () => {
    const client = createMockFluxClient({
      listResources: vi.fn().mockRejectedValue(new Error('API error')),
    });
    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
    });

    await expect(loader.load()).rejects.toThrow('API error');
  });
});

// ---------------------------------------------------------------------------
// Lazy loading
// ---------------------------------------------------------------------------

describe('FoxNoseLoader — loadLazy', () => {
  it('yields documents batch by batch', async () => {
    const page1 = SAMPLE_RESULTS.slice(0, 2);
    const page2 = SAMPLE_RESULTS.slice(2);

    const client = createMockFluxClient({
      listResources: vi
        .fn()
        .mockResolvedValueOnce(makeListResponse(page1, { count: 3, nextCursor: 'cursor_abc' }))
        .mockResolvedValueOnce(makeListResponse(page2, { count: 3, nextCursor: null })),
    });

    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      batchSize: 2,
    });

    const batches: any[][] = [];
    for await (const batch of loader.loadLazy()) {
      batches.push(batch);
    }

    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(2);
    expect(batches[1]).toHaveLength(1);
  });

  it('does not yield empty pages', async () => {
    const client = createMockFluxClient({
      listResources: vi.fn().mockResolvedValue(makeListResponse([], { count: 0 })),
    });

    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
    });

    const batches: any[][] = [];
    for await (const batch of loader.loadLazy()) {
      batches.push(batch);
    }

    expect(batches).toHaveLength(0);
  });

  it('handles 5-page pagination', async () => {
    const singleResult = [SAMPLE_RESULTS[0]];
    const client = createMockFluxClient({
      listResources: vi
        .fn()
        .mockResolvedValueOnce(makeListResponse(singleResult, { count: 5, nextCursor: 'c1' }))
        .mockResolvedValueOnce(makeListResponse(singleResult, { count: 5, nextCursor: 'c2' }))
        .mockResolvedValueOnce(makeListResponse(singleResult, { count: 5, nextCursor: 'c3' }))
        .mockResolvedValueOnce(makeListResponse(singleResult, { count: 5, nextCursor: 'c4' }))
        .mockResolvedValueOnce(makeListResponse(singleResult, { count: 5, nextCursor: null })),
    });

    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      batchSize: 1,
    });

    const batches: any[][] = [];
    for await (const batch of loader.loadLazy()) {
      batches.push(batch);
    }

    expect(batches).toHaveLength(5);
    expect(client.listResources).toHaveBeenCalledTimes(5);

    // Verify cursors were passed correctly
    expect(client.listResources.mock.calls[0][1]).not.toHaveProperty('next');
    expect(client.listResources.mock.calls[1][1].next).toBe('c1');
    expect(client.listResources.mock.calls[2][1].next).toBe('c2');
    expect(client.listResources.mock.calls[3][1].next).toBe('c3');
    expect(client.listResources.mock.calls[4][1].next).toBe('c4');
  });

  it('load() returns same results as collecting loadLazy()', async () => {
    const page1 = SAMPLE_RESULTS.slice(0, 2);
    const page2 = SAMPLE_RESULTS.slice(2);

    const makeMock = () =>
      vi
        .fn()
        .mockResolvedValueOnce(makeListResponse(page1, { count: 3, nextCursor: 'cursor_abc' }))
        .mockResolvedValueOnce(makeListResponse(page2, { count: 3, nextCursor: null }));

    const client1 = createMockFluxClient({ listResources: makeMock() });
    const client2 = createMockFluxClient({ listResources: makeMock() });

    const loaderLoad = new FoxNoseLoader({
      client: client1 as any,
      folderPath: 'articles',
      pageContentField: 'body',
      batchSize: 2,
    });

    const loaderLazy = new FoxNoseLoader({
      client: client2 as any,
      folderPath: 'articles',
      pageContentField: 'body',
      batchSize: 2,
    });

    const docsFromLoad = await loaderLoad.load();
    const docsFromLazy: any[] = [];
    for await (const batch of loaderLazy.loadLazy()) {
      docsFromLazy.push(...batch);
    }

    expect(docsFromLoad).toHaveLength(docsFromLazy.length);
    for (let i = 0; i < docsFromLoad.length; i++) {
      expect(docsFromLoad[i].pageContent).toBe(docsFromLazy[i].pageContent);
    }
  });

  it('propagates API errors from loadLazy', async () => {
    const client = createMockFluxClient({
      listResources: vi.fn().mockRejectedValue(new Error('API error')),
    });
    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
    });

    const iterate = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _batch of loader.loadLazy()) {
        // consume
      }
    };

    await expect(iterate()).rejects.toThrow('API error');
  });
});

// ---------------------------------------------------------------------------
// Content mapping
// ---------------------------------------------------------------------------

describe('FoxNoseLoader — content mapping', () => {
  it('maps single field', async () => {
    const client = createMockFluxClient();
    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
    });

    const docs = await loader.load();
    expect(docs[0].pageContent).toBe('FoxNose is a serverless knowledge platform...');
  });

  it('maps multiple fields', async () => {
    const client = createMockFluxClient();
    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentFields: ['title', 'body'],
      pageContentSeparator: ' | ',
    });

    const docs = await loader.load();
    expect(docs[0].pageContent).toContain(' | ');
    expect(docs[0].pageContent).toContain('Getting Started with FoxNose');
    expect(docs[0].pageContent).toContain('FoxNose is a serverless knowledge platform...');
  });

  it('uses custom mapper', async () => {
    const client = createMockFluxClient();
    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentMapper: (r) => `# ${(r.data as any).title}`,
    });

    const docs = await loader.load();
    expect(docs[0].pageContent).toBe('# Getting Started with FoxNose');
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe('FoxNoseLoader — metadata', () => {
  it('includes sys metadata by default', async () => {
    const client = createMockFluxClient();
    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
    });

    const docs = await loader.load();
    expect(docs[0].metadata).toHaveProperty('key');
    expect(docs[0].metadata).toHaveProperty('folder');
  });

  it('excludes sys metadata when disabled', async () => {
    const client = createMockFluxClient();
    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      includeSysMetadata: false,
    });

    const docs = await loader.load();
    expect(docs[0].metadata).not.toHaveProperty('key');
    expect(docs[0].metadata).not.toHaveProperty('folder');
  });

  it('respects metadata whitelist', async () => {
    const client = createMockFluxClient();
    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      metadataFields: ['title'],
    });

    const docs = await loader.load();
    expect(docs[0].metadata).toHaveProperty('title');
    expect(docs[0].metadata).not.toHaveProperty('category');
  });

  it('respects metadata blacklist', async () => {
    const client = createMockFluxClient();
    const loader = new FoxNoseLoader({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      excludeMetadataFields: ['status'],
    });

    const docs = await loader.load();
    expect(docs[0].metadata).not.toHaveProperty('status');
    expect(docs[0].metadata).toHaveProperty('title');
  });
});

describe('FoxNoseLoader — truncateText', () => {
  it('sends truncate_text as a query parameter', async () => {
    const client = createMockFluxClient();
    await new FoxNoseLoader({
      client: client as any,
      collectionPath: 'articles',
      pageContentField: 'body',
      truncateText: 120,
    }).load();
    expect(client.listResources.mock.calls[0][1].truncate_text).toBe(120);
  });

  it('overrides the same key given through params', async () => {
    const client = createMockFluxClient();
    await new FoxNoseLoader({
      client: client as any,
      collectionPath: 'articles',
      pageContentField: 'body',
      params: { truncate_text: 10 },
      truncateText: 120,
    }).load();
    expect(client.listResources.mock.calls[0][1].truncate_text).toBe(120);
  });

  it('is absent when not configured', async () => {
    const client = createMockFluxClient();
    await new FoxNoseLoader({
      client: client as any,
      collectionPath: 'articles',
      pageContentField: 'body',
    }).load();
    expect(client.listResources.mock.calls[0][1]).not.toHaveProperty('truncate_text');
  });
});
