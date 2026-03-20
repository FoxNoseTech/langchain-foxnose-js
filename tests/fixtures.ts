/**
 * Shared test fixtures and helpers for @foxnose/langchain tests.
 */

import type { FoxNoseResult } from '../src/document-mapper.js';

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

export const SAMPLE_RESULTS: FoxNoseResult[] = [
  {
    _sys: {
      key: 'abc123',
      created_at: '2024-06-01T10:00:00Z',
      updated_at: '2024-06-15T12:00:00Z',
      folder: 'articles',
    },
    data: {
      title: 'Getting Started with FoxNose',
      body: 'FoxNose is a serverless knowledge platform...',
      category: 'tech',
      status: 'published',
    },
  },
  {
    _sys: {
      key: 'def456',
      created_at: '2024-07-01T08:00:00Z',
      updated_at: '2024-07-10T09:00:00Z',
      folder: 'articles',
    },
    data: {
      title: 'Vector Search Guide',
      body: 'Learn how to use vector search in FoxNose...',
      category: 'tutorial',
      status: 'published',
    },
  },
  {
    _sys: {
      key: 'ghi789',
      created_at: '2024-08-01T14:00:00Z',
      updated_at: '2024-08-05T16:00:00Z',
      folder: 'articles',
    },
    data: {
      title: 'Hybrid Search Best Practices',
      body: 'Combine text and vector search for best results...',
      category: 'guide',
      status: 'draft',
    },
  },
];

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

export function makeSearchResponse(
  results: FoxNoseResult[] = SAMPLE_RESULTS,
  metadata?: Record<string, unknown>,
): Record<string, unknown> {
  const resp: Record<string, unknown> = {
    limit: results.length,
    next: null,
    previous: null,
    results,
  };
  if (metadata !== undefined) {
    resp.metadata = metadata;
  }
  return resp;
}

export function makeListResponse(
  results: FoxNoseResult[] = SAMPLE_RESULTS,
  options?: { count?: number; nextCursor?: string | null; previousCursor?: string | null },
): Record<string, unknown> {
  return {
    count: options?.count ?? results.length,
    next: options?.nextCursor ?? null,
    previous: options?.previousCursor ?? null,
    results,
  };
}

// ---------------------------------------------------------------------------
// Mock FluxClient factory
// ---------------------------------------------------------------------------

export interface MockFluxClient {
  search: ReturnType<typeof vi.fn>;
  listResources: ReturnType<typeof vi.fn>;
  getResource: ReturnType<typeof vi.fn>;
  vectorSearch: ReturnType<typeof vi.fn>;
  vectorFieldSearch: ReturnType<typeof vi.fn>;
  hybridSearch: ReturnType<typeof vi.fn>;
  boostedSearch: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  apiPrefix: string;
}

export function createMockFluxClient(
  overrides?: Partial<Record<keyof MockFluxClient, unknown>>,
): MockFluxClient {
  const defaultResponse = makeSearchResponse();
  return {
    search: vi.fn().mockResolvedValue(defaultResponse),
    listResources: vi.fn().mockResolvedValue(makeListResponse()),
    getResource: vi.fn().mockResolvedValue({}),
    vectorSearch: vi.fn().mockResolvedValue(defaultResponse),
    vectorFieldSearch: vi.fn().mockResolvedValue(defaultResponse),
    hybridSearch: vi.fn().mockResolvedValue(defaultResponse),
    boostedSearch: vi.fn().mockResolvedValue(defaultResponse),
    close: vi.fn(),
    apiPrefix: 'test-api',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Embeddings
// ---------------------------------------------------------------------------

export function createMockEmbeddings(vector: number[] = [0.1, 0.2, 0.3]) {
  return {
    embedQuery: vi.fn().mockResolvedValue(vector),
    embedDocuments: vi.fn().mockResolvedValue([vector]),
  };
}
