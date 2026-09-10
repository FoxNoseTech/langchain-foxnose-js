/**
 * FoxNose document loader for LangChain.js.
 *
 * Provides {@link FoxNoseLoader}, a LangChain `BaseDocumentLoader` that
 * iterates over all resources in a FoxNose collection with automatic
 * cursor-based pagination.
 *
 * @module
 */

import { BaseDocumentLoader } from '@langchain/core/document_loaders/base';
import { Document } from '@langchain/core/documents';
import type { FluxClient } from '@foxnose/sdk';

import {
  type DocumentMapperOptions,
  type FoxNoseResult,
  mapResultsToDocuments,
} from './document-mapper.js';
import { validateLoaderConfig } from './validation.js';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

/**
 * Configuration fields for {@link FoxNoseLoader}.
 */
export interface FoxNoseLoaderInput extends DocumentMapperOptions {
  /** FoxNose Flux client instance. */
  readonly client: FluxClient;
  /**
   * Collection path in FoxNose (e.g. `"knowledge-base"`).
   * Renamed from `folderPath` in 0.3.0.
   */
  readonly collectionPath?: string;
  /**
   * @deprecated Use {@link collectionPath} instead. Emits a one-shot
   *   `console.warn` and will be removed in 1.0.
   */
  readonly folderPath?: string;
  /**
   * Query parameters forwarded to `listResources`.
   * Useful for server-side filtering and sorting.
   */
  readonly params?: Record<string, unknown>;
  /**
   * Cap the length of `text`-typed fields server-side, in characters.
   *
   * A named shorthand for `params.truncate_text`. Setting both is rejected at
   * construction rather than silently resolved.
   */
  readonly truncateText?: number;
  /**
   * Page size for `listResources` calls.
   * @default 100
   */
  readonly batchSize?: number;
}

/**
 * Reduce a `next` field to the token the `next` query parameter accepts.
 *
 * FoxNose returns `next` as a FULL URL, e.g.
 * `https://host/api/articles?limit=2&next=9avd3azzc0tp`, not as the opaque
 * token the parameter takes. Sending the whole URL back means the backend
 * cannot parse it, silently answers with page one again and returns the same
 * `next` — an infinite loop that re-fetches the first page forever. A plain
 * token is passed through unchanged.
 *
 * @internal
 */
export function extractCursor(nextValue: unknown): string | null {
  if (typeof nextValue !== 'string' || nextValue === '') {
    return null;
  }
  if (!nextValue.includes('://')) {
    return nextValue;
  }
  try {
    // `?next=` parses to an empty string, not null. Following it would send an
    // empty cursor and re-fetch page one; Python's parse_qs drops blank values,
    // so treating it as the end is also what keeps the two packages aligned.
    return new URL(nextValue).searchParams.get('next') || null;
  } catch {
    return null;
  }
}

/** Shape of a paginated `listResources` response from the Flux API. */
interface ListResourcesResponse {
  results?: FoxNoseResult[];
  next?: string | null;
  count?: number;
  [key: string]: unknown;
}

// -----------------------------------------------------------------------
// Loader
// -----------------------------------------------------------------------

/**
 * LangChain document loader backed by FoxNose Flux `listResources`.
 *
 * Iterates over all resources in a FoxNose collection with automatic
 * cursor-based pagination. Each resource is converted to a LangChain
 * `Document` using the configured content mapping strategy.
 *
 * @example
 * ```ts
 * import { FluxClient, SimpleKeyAuth } from '@foxnose/sdk';
 * import { FoxNoseLoader } from '@foxnose/langchain';
 *
 * const client = new FluxClient({
 *   baseUrl: 'https://<env_key>.fxns.io',
 *   apiPrefix: 'my_api',
 *   auth: new SimpleKeyAuth('pk', 'sk'),
 * });
 *
 * const loader = new FoxNoseLoader({
 *   client,
 *   collectionPath: 'knowledge-base',
 *   pageContentField: 'body',
 * });
 *
 * const docs = await loader.load();
 * ```
 */
export class FoxNoseLoader extends BaseDocumentLoader {
  private readonly client: FluxClient;
  /** Renamed from `folderPath` in 0.3.0. */
  private readonly collectionPath: string;
  private readonly params: Record<string, unknown>;
  private readonly truncateText?: number;
  private readonly batchSize: number;
  private readonly mapperOptions: DocumentMapperOptions;

  constructor(fields: FoxNoseLoaderInput) {
    super();

    // Validate configuration (handles folderPath → collectionPath migration
    // and emits the deprecation warning on the legacy kwarg).
    validateLoaderConfig(fields);

    this.client = fields.client;
    this.collectionPath = (fields.collectionPath ?? fields.folderPath) as string;
    this.params = fields.params ?? {};
    this.truncateText = fields.truncateText;
    this.batchSize = fields.batchSize ?? 100;

    this.mapperOptions = {
      pageContentField: fields.pageContentField,
      pageContentFields: fields.pageContentFields,
      pageContentSeparator: fields.pageContentSeparator,
      pageContentMapper: fields.pageContentMapper,
      metadataFields: fields.metadataFields,
      excludeMetadataFields: fields.excludeMetadataFields,
      includeSysMetadata: fields.includeSysMetadata,
    };
  }

  /**
   * Load all documents from the configured FoxNose collection.
   *
   * Performs cursor-based pagination, fetching pages of `batchSize` resources
   * until all resources have been loaded.
   *
   * @returns An array of LangChain `Document` objects.
   * @throws {Error} If the underlying API call fails.
   */
  async load(): Promise<Document[]> {
    const documents: Document[] = [];

    for await (const batch of this.loadLazy()) {
      documents.push(...batch);
    }

    return documents;
  }

  /**
   * Lazily load documents page-by-page using an async generator.
   *
   * Useful for large collections where you want to process documents in batches
   * without holding the entire dataset in memory.
   *
   * @yields An array of LangChain `Document` objects for each page.
   * @throws {Error} If the underlying API call fails.
   *
   * @example
   * ```ts
   * for await (const batch of loader.loadLazy()) {
   *   await vectorStore.addDocuments(batch);
   * }
   * ```
   */
  async *loadLazy(): AsyncGenerator<Document[]> {
    let cursor: string | null = null;
    const seen = new Set<string>();

    for (;;) {
      const requestParams: Record<string, unknown> = {
        ...this.params,
        limit: this.batchSize,
      };
      if (this.truncateText !== undefined) {
        requestParams.truncate_text = this.truncateText;
      }
      if (cursor !== null) {
        requestParams.next = cursor;
      }

      const response = await this.client.listResources<ListResourcesResponse>(
        this.collectionPath,
        requestParams,
      );

      const results = response?.results ?? [];
      const mapped = mapResultsToDocuments(results, this.mapperOptions);

      if (mapped.length > 0) {
        yield mapped;
      }

      const nextCursor = extractCursor(response?.next);
      // Every cursor is followed at most once. Stopping only when the cursor
      // repeats the PREVIOUS one would still spin forever on a cycle
      // (A -> B -> A), and would re-yield the repeated page before noticing.
      if (nextCursor === null || seen.has(nextCursor)) {
        break;
      }
      seen.add(nextCursor);
      cursor = nextCursor;
    }
  }
}
