/**
 * FoxNose retriever for LangChain.js.
 *
 * Provides {@link FoxNoseRetriever}, a LangChain `BaseRetriever` backed by
 * the FoxNose Flux `_search` endpoint. Supports text, vector, hybrid, and
 * vector-boosted search modes.
 *
 * @module
 */

import { BaseRetriever, type BaseRetrieverInput } from '@langchain/core/retrievers';
import type { CallbackManagerForRetrieverRun } from '@langchain/core/callbacks/manager';
import { Document } from '@langchain/core/documents';
import type { FluxClient } from '@foxnose/sdk';

import {
  type DocumentMapperOptions,
  type FoxNoseResult,
  mapResultsToDocuments,
} from './document-mapper.js';
import {
  type HybridConfig,
  type SearchMode,
  type VectorBoostConfig,
  buildSearchBody,
} from './search.js';
import { validateRetrieverConfig } from './validation.js';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

/**
 * Configuration fields for {@link FoxNoseRetriever}.
 *
 * Combines LangChain's `BaseRetrieverInput` with FoxNose-specific options
 * for search behaviour and document mapping.
 */
export interface FoxNoseRetrieverInput extends BaseRetrieverInput, DocumentMapperOptions {
  /** FoxNose Flux client instance. */
  readonly client: FluxClient;
  /** Folder path in FoxNose (e.g. `"knowledge-base"`). */
  readonly folderPath: string;

  // --- Search configuration ---

  /**
   * Search mode.
   * @default "hybrid"
   */
  readonly searchMode?: SearchMode;
  /** Fields for full-text search (`find_text.fields`). */
  readonly searchFields?: string[];
  /** Typo-tolerance threshold for text search (0–1). */
  readonly textThreshold?: number;
  /** Fields for vector search (`vector_search.fields`). */
  readonly vectorFields?: string[];
  /** Minimum cosine similarity for vector results (0–1). */
  readonly similarityThreshold?: number;
  /**
   * Maximum number of results to return.
   * @default 5
   */
  readonly topK?: number;
  /** Persistent structured filter applied to every search. */
  readonly where?: Record<string, unknown>;
  /** Hybrid mode weight/rerank configuration. */
  readonly hybridConfig?: HybridConfig;
  /** Vector-boosted mode configuration. */
  readonly vectorBoostConfig?: VectorBoostConfig;
  /** Sort fields (prefix with `-` for descending). */
  readonly sort?: string[];
  /**
   * Extra parameters merged into the search body (overrides other settings).
   *
   * **Note:** Overriding `"limit"` here does **not** update `vector_search.top_k` —
   * only the outer limit changes.
   */
  readonly searchKwargs?: Record<string, unknown>;
}

// -----------------------------------------------------------------------
// Retriever
// -----------------------------------------------------------------------

/**
 * LangChain retriever backed by FoxNose Flux search.
 *
 * Uses the FoxNose `_search` endpoint to retrieve documents with support
 * for text, vector, hybrid, and vector-boosted search modes.
 *
 * @example
 * ```ts
 * import { FluxClient, SimpleKeyAuth } from '@foxnose/sdk';
 * import { FoxNoseRetriever } from '@foxnose/langchain';
 *
 * const client = new FluxClient({
 *   baseUrl: 'https://<env_key>.fxns.io',
 *   apiPrefix: 'my_api',
 *   auth: new SimpleKeyAuth('pk', 'sk'),
 * });
 *
 * const retriever = new FoxNoseRetriever({
 *   client,
 *   folderPath: 'knowledge-base',
 *   pageContentField: 'body',
 *   searchMode: 'hybrid',
 *   topK: 5,
 * });
 *
 * const docs = await retriever.invoke('How do I reset my password?');
 * ```
 */
export class FoxNoseRetriever extends BaseRetriever {
  static lc_name(): string {
    return 'FoxNoseRetriever';
  }

  lc_namespace = ['langchain', 'retrievers', 'foxnose'];

  // --- Internals (readonly after construction) ---

  private readonly client: FluxClient;
  private readonly folderPath: string;

  // Search config
  private readonly searchMode: SearchMode;
  private readonly searchFields?: string[];
  private readonly textThreshold?: number;
  private readonly vectorFields?: string[];
  private readonly similarityThreshold?: number;
  private readonly topK: number;
  private readonly where?: Record<string, unknown>;
  private readonly hybridConfig?: HybridConfig;
  private readonly vectorBoostConfig?: VectorBoostConfig;
  private readonly sort?: string[];
  private readonly searchKwargs?: Record<string, unknown>;

  // Document mapping config
  private readonly mapperOptions: DocumentMapperOptions;

  constructor(fields: FoxNoseRetrieverInput) {
    super(fields);

    // Validate all configuration up-front
    validateRetrieverConfig(fields);

    this.client = fields.client;
    this.folderPath = fields.folderPath;

    // Search config with defaults
    this.searchMode = fields.searchMode ?? 'hybrid';
    this.searchFields = fields.searchFields;
    this.textThreshold = fields.textThreshold;
    this.vectorFields = fields.vectorFields;
    this.similarityThreshold = fields.similarityThreshold;
    this.topK = fields.topK ?? 5;
    this.where = fields.where;
    this.hybridConfig = fields.hybridConfig;
    this.vectorBoostConfig = fields.vectorBoostConfig;
    this.sort = fields.sort;
    this.searchKwargs = fields.searchKwargs;

    // Document mapping config
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
   * Retrieve relevant documents for the given query.
   *
   * Called internally by `invoke()`. Builds a search body, sends it to
   * the FoxNose Flux API, and maps the results to LangChain documents.
   *
   * @param query - The user's search query text.
   * @param _runManager - Optional LangChain callback manager.
   * @returns An array of relevant LangChain `Document` objects.
   * @throws {Error} If the underlying API call fails.
   */
  async _getRelevantDocuments(
    query: string,
    _runManager?: CallbackManagerForRetrieverRun,
  ): Promise<Document[]> {
    const body = buildSearchBody({
      query,
      searchMode: this.searchMode,
      topK: this.topK,
      searchFields: this.searchFields,
      textThreshold: this.textThreshold,
      vectorFields: this.vectorFields,
      similarityThreshold: this.similarityThreshold,
      where: this.where,
      hybridConfig: this.hybridConfig,
      vectorBoostConfig: this.vectorBoostConfig,
      sort: this.sort,
      searchKwargs: this.searchKwargs,
    });

    const response = await this.client.search<{ results?: FoxNoseResult[] }>(
      this.folderPath,
      body,
    );

    const results = response?.results ?? [];
    return mapResultsToDocuments(results, this.mapperOptions);
  }
}
