/**
 * FoxNose document loader for LangChain.js.
 *
 * Provides {@link FoxNoseLoader}, a LangChain `BaseDocumentLoader` that
 * iterates over all resources in a FoxNose folder with automatic
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
  /** Folder path in FoxNose (e.g. `"knowledge-base"`). */
  readonly folderPath: string;
  /**
   * Query parameters forwarded to `listResources`.
   * Useful for server-side filtering and sorting.
   */
  readonly params?: Record<string, unknown>;
  /**
   * Page size for `listResources` calls.
   * @default 100
   */
  readonly batchSize?: number;
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
 * Iterates over all resources in a FoxNose folder with automatic
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
 *   folderPath: 'knowledge-base',
 *   pageContentField: 'body',
 * });
 *
 * const docs = await loader.load();
 * ```
 */
export class FoxNoseLoader extends BaseDocumentLoader {
  private readonly client: FluxClient;
  private readonly folderPath: string;
  private readonly params: Record<string, unknown>;
  private readonly batchSize: number;
  private readonly mapperOptions: DocumentMapperOptions;

  constructor(fields: FoxNoseLoaderInput) {
    super();

    // Validate configuration
    validateLoaderConfig(fields);

    this.client = fields.client;
    this.folderPath = fields.folderPath;
    this.params = fields.params ?? {};
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
   * Load all documents from the configured FoxNose folder.
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
   * Useful for large folders where you want to process documents in batches
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

    do {
      const requestParams: Record<string, unknown> = {
        ...this.params,
        limit: this.batchSize,
      };
      if (cursor !== null) {
        requestParams.next = cursor;
      }

      const response = await this.client.listResources<ListResourcesResponse>(
        this.folderPath,
        requestParams,
      );

      const results = response?.results ?? [];
      const mapped = mapResultsToDocuments(results, this.mapperOptions);

      if (mapped.length > 0) {
        yield mapped;
      }

      cursor = response?.next ?? null;
    } while (cursor !== null);
  }
}
