/**
 * FoxNose retriever for LangChain.js.
 *
 * Provides {@link FoxNoseRetriever}, a LangChain `BaseRetriever` backed by
 * the FoxNose Flux `_search` endpoint. Supports text, vector, hybrid, and
 * vector-boosted search modes, including custom embedding vectors.
 *
 * @module
 */

import { BaseRetriever, type BaseRetrieverInput } from '@langchain/core/retrievers';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import type { CallbackManagerForRetrieverRun } from '@langchain/core/callbacks/manager';
import { Document } from '@langchain/core/documents';
import type { FluxClient, BoostedSearchOptions } from '@foxnose/sdk';

import {
  type DocumentMapperOptions,
  type FoxNoseResult,
  mapResultsToDocuments,
} from './document-mapper.js';
import type { HybridConfig, SearchMode, VectorBoostConfig } from './search.js';
import {
  splitSearchKwargs,
  validateRetrieverConfig,
} from './validation.js';

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
  /**
   * Fields for vector search with auto-generated embeddings
   * (`vector_search.fields`). Mutually exclusive with `vectorField`.
   * Not supported in `vector_boosted` mode.
   */
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
   * Extra parameters merged into the search request.
   *
   * Known keys like `limit` and `offset` are extracted as named
   * parameters; the rest are passed through to the SDK convenience methods.
   *
   * Keys that conflict with `SearchRequest` fields (e.g. `"search_mode"`,
   * `"vector_search"`) are rejected at validation time.
   */
  readonly searchKwargs?: Record<string, unknown>;

  // --- Custom embeddings (vector_field_search) ---

  /**
   * Optional LangChain Embeddings model. When set together with
   * `vectorField`, the retriever converts the query text into a vector
   * at query time via `embeddings.embedQuery()`.
   *
   * **Warning:** The query text may be sent to a third-party embedding
   * provider (e.g. OpenAI) depending on the Embeddings implementation.
   */
  readonly embeddings?: EmbeddingsInterface;
  /**
   * Pre-computed query vector for `vectorFieldSearch`. When set together
   * with `vectorField`, this static vector is used on every search
   * invocation. Mutually exclusive with `embeddings`.
   */
  readonly queryVector?: number[];
  /**
   * Single field name for custom-embedding vector search
   * (`vectorFieldSearch`). Required when `embeddings` or `queryVector`
   * is provided. Mutually exclusive with `vectorFields`.
   */
  readonly vectorField?: string;
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
  private readonly searchKwargs: Record<string, unknown>;

  // Custom embeddings
  private readonly embeddings?: EmbeddingsInterface;
  private readonly queryVector?: number[];
  private readonly vectorField?: string;

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
    this.searchKwargs = fields.searchKwargs ?? {};

    // Custom embeddings
    this.embeddings = fields.embeddings;
    this.queryVector = fields.queryVector;
    this.vectorField = fields.vectorField;

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

  // --- Internal helpers ---

  /** Build the `find_text` dict for text / hybrid / boosted modes. */
  private buildFindText(query: string): Record<string, unknown> {
    const findText: Record<string, unknown> = { query };
    if (this.searchFields !== undefined) {
      findText.fields = this.searchFields;
    }
    if (this.textThreshold !== undefined) {
      findText.threshold = this.textThreshold;
    }
    return findText;
  }

  /** Build extra body params from where, sort, and searchKwargs. */
  private buildExtraBody(): Record<string, unknown> {
    const { extra } = splitSearchKwargs(this.searchKwargs);
    const result: Record<string, unknown> = {};
    if (this.where !== undefined) {
      result.where = this.where;
    }
    if (this.sort !== undefined) {
      result.sort = this.sort;
    }
    // extra from searchKwargs overrides instance-level where/sort
    Object.assign(result, extra);
    return result;
  }

  /** Extract named parameter overrides from searchKwargs. */
  private getNamedOverrides(): { limit?: number; offset?: number } {
    const { named } = splitSearchKwargs(this.searchKwargs);
    return named as { limit?: number; offset?: number };
  }

  /** Resolve the query vector for vector_field mode. */
  private async resolveQueryVector(query: string): Promise<number[]> {
    if (this.queryVector !== undefined) return this.queryVector;
    if (this.embeddings !== undefined) return this.embeddings.embedQuery(query);
    // istanbul ignore next — guarded by validator
    throw new Error("vectorField mode requires 'embeddings' or 'queryVector'.");
  }

  // --- Per-mode dispatch ---

  private async searchText(query: string, named: { limit?: number; offset?: number }, _extraBody: Record<string, unknown>): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      search_mode: 'text',
      find_text: this.buildFindText(query),
      limit: named.limit ?? this.topK,
    };
    if (named.offset !== undefined) {
      body.offset = named.offset;
    }
    if (this.where !== undefined) {
      body.where = this.where;
    }
    if (this.sort !== undefined) {
      body.sort = this.sort;
    }
    // Extra from searchKwargs may override instance where/sort
    const { extra } = splitSearchKwargs(this.searchKwargs);
    Object.assign(body, extra);
    return this.client.search(this.folderPath, body);
  }

  private async searchVector(query: string, named: { limit?: number; offset?: number }, extraBody: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.vectorField !== undefined) {
      const qv = await this.resolveQueryVector(query);
      return this.client.vectorFieldSearch(this.folderPath, {
        field: this.vectorField,
        query_vector: qv,
        top_k: this.topK,
        similarity_threshold: this.similarityThreshold,
        limit: named.limit ?? this.topK,
        offset: named.offset,
        ...extraBody,
      });
    }
    return this.client.vectorSearch(this.folderPath, {
      query,
      fields: this.vectorFields,
      top_k: this.topK,
      similarity_threshold: this.similarityThreshold,
      limit: named.limit ?? this.topK,
      offset: named.offset,
      ...extraBody,
    });
  }

  private async searchHybrid(query: string, named: { limit?: number; offset?: number }, extraBody: Record<string, unknown>): Promise<Record<string, unknown>> {
    const hc = this.hybridConfig ?? {};
    return this.client.hybridSearch(this.folderPath, {
      query,
      find_text: this.buildFindText(query),
      fields: this.vectorFields,
      top_k: this.topK,
      similarity_threshold: this.similarityThreshold,
      vector_weight: hc.vectorWeight ?? 0.6,
      text_weight: hc.textWeight ?? 0.4,
      rerank_results: hc.rerankResults ?? true,
      limit: named.limit ?? this.topK,
      offset: named.offset,
      ...extraBody,
    });
  }

  private async searchBoosted(query: string, named: { limit?: number; offset?: number }, extraBody: Record<string, unknown>): Promise<Record<string, unknown>> {
    const bc = this.vectorBoostConfig ?? {};
    const base: BoostedSearchOptions = {
      find_text: this.buildFindText(query) as Record<string, any>,
      top_k: this.topK,
      similarity_threshold: this.similarityThreshold,
      boost_factor: bc.boostFactor ?? 1.5,
      boost_similarity_threshold: bc.similarityThreshold,
      max_boost_results: bc.maxBoostResults ?? 20,
      limit: named.limit ?? this.topK,
      offset: named.offset,
    };
    if (this.vectorField !== undefined) {
      const qv = await this.resolveQueryVector(query);
      base.field = this.vectorField;
      base.query_vector = qv;
    } else {
      base.query = query;
    }
    return this.client.boostedSearch(this.folderPath, { ...base, ...extraBody });
  }

  // --- Main retrieval ---

  /**
   * Retrieve relevant documents for the given query.
   *
   * Called internally by `invoke()`. Dispatches to the appropriate SDK
   * convenience method based on the configured `searchMode`, then maps
   * the results to LangChain documents.
   */
  async _getRelevantDocuments(
    query: string,
    _runManager?: CallbackManagerForRetrieverRun,
  ): Promise<Document[]> {
    const extraBody = this.buildExtraBody();
    const named = this.getNamedOverrides();

    let response: Record<string, unknown>;
    switch (this.searchMode) {
      case 'text':
        response = await this.searchText(query, named, extraBody);
        break;
      case 'vector':
        response = await this.searchVector(query, named, extraBody);
        break;
      case 'hybrid':
        response = await this.searchHybrid(query, named, extraBody);
        break;
      case 'vector_boosted':
        response = await this.searchBoosted(query, named, extraBody);
        break;
      default:
        // istanbul ignore next — guarded by validator
        throw new Error(`Unknown searchMode: ${this.searchMode}`);
    }

    const results = (response?.results ?? []) as FoxNoseResult[];
    return mapResultsToDocuments(results, this.mapperOptions);
  }
}
