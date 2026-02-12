/**
 * Pure function to build search request bodies for the FoxNose Flux `_search` endpoint.
 *
 * Extracted as a standalone module to keep retriever logic focused on LangChain
 * integration while keeping the search body construction testable in isolation.
 *
 * @module
 */

/** Configuration for hybrid search mode. */
export interface HybridConfig {
  /** Weight applied to vector search results (0–1). */
  vectorWeight?: number;
  /** Weight applied to text search results (0–1). */
  textWeight?: number;
  /** Whether to rerank merged results. */
  rerankResults?: boolean;
  [key: string]: unknown;
}

/** Configuration for vector-boosted search mode. */
export interface VectorBoostConfig {
  /** Multiplier applied to the vector similarity score. */
  boostFactor?: number;
  /** Minimum cosine similarity for boosted results. */
  similarityThreshold?: number;
  /** Maximum number of results eligible for boosting. */
  maxBoostResults?: number;
  [key: string]: unknown;
}

/**
 * Supported search modes for the FoxNose Flux `_search` endpoint.
 *
 * - `"text"` — Full-text keyword search only.
 * - `"vector"` — Pure semantic (vector) search only.
 * - `"hybrid"` — Combines text and vector search with configurable weights.
 * - `"vector_boosted"` — Text search with vector-based re-ranking boost.
 */
export type SearchMode = 'text' | 'vector' | 'hybrid' | 'vector_boosted';

/** Parameters accepted by {@link buildSearchBody}. */
export interface BuildSearchBodyParams {
  /** The user's search query text. */
  query: string;
  /** Search mode. @default "hybrid" */
  searchMode?: SearchMode;
  /** Maximum number of results to return. @default 5 */
  topK?: number;
  /** Fields for full-text search (`find_text.fields`). */
  searchFields?: string[];
  /** Typo-tolerance threshold for text search (0–1). */
  textThreshold?: number;
  /** Fields for vector search (`vector_search.fields`). */
  vectorFields?: string[];
  /** Minimum cosine similarity for vector results (0–1). */
  similarityThreshold?: number;
  /** Structured filter applied to the search. */
  where?: Record<string, unknown>;
  /** Hybrid mode weight/rerank configuration. */
  hybridConfig?: HybridConfig;
  /** Vector-boosted mode configuration. */
  vectorBoostConfig?: VectorBoostConfig;
  /** Sort fields (prefix with `-` for descending). */
  sort?: string[];
  /** Extra parameters merged last (can override anything). */
  searchKwargs?: Record<string, unknown>;
}

// -----------------------------------------------------------------------
// Search mode helpers
// -----------------------------------------------------------------------

/** Returns `true` if the search mode includes a full-text search component. */
export function needsTextSearch(mode: SearchMode): boolean {
  return mode === 'text' || mode === 'hybrid' || mode === 'vector_boosted';
}

/** Returns `true` if the search mode includes a vector search component. */
export function needsVectorSearch(mode: SearchMode): boolean {
  return mode === 'vector' || mode === 'hybrid' || mode === 'vector_boosted';
}

// -----------------------------------------------------------------------
// Builder
// -----------------------------------------------------------------------

/**
 * Build a search request body for the FoxNose Flux `_search` endpoint.
 *
 * This is a **pure function** with no side effects, making it easy to test
 * independently of any client or retriever logic.
 *
 * @param params - Search body parameters.
 * @returns A plain object suitable for passing as the `body` argument to
 *   `FluxClient.search()`.
 *
 * @example
 * ```ts
 * const body = buildSearchBody({
 *   query: 'machine learning',
 *   searchMode: 'hybrid',
 *   topK: 10,
 *   where: { '$': { all_of: [{ status__eq: 'published' }] } },
 * });
 * ```
 */
export function buildSearchBody(params: BuildSearchBodyParams): Record<string, unknown> {
  const {
    query,
    searchMode = 'hybrid',
    topK = 5,
    searchFields,
    textThreshold,
    vectorFields,
    similarityThreshold,
    where,
    hybridConfig,
    vectorBoostConfig,
    sort,
    searchKwargs,
  } = params;

  const body: Record<string, unknown> = {
    search_mode: searchMode,
    limit: topK,
  };

  // Text search component
  if (needsTextSearch(searchMode)) {
    const findText: Record<string, unknown> = { query };
    if (searchFields !== undefined) {
      findText.fields = searchFields;
    }
    if (textThreshold !== undefined) {
      findText.threshold = textThreshold;
    }
    body.find_text = findText;
  }

  // Vector search component
  if (needsVectorSearch(searchMode)) {
    const vectorSearch: Record<string, unknown> = {
      query,
      top_k: topK,
    };
    if (vectorFields !== undefined) {
      vectorSearch.fields = vectorFields;
    }
    if (similarityThreshold !== undefined) {
      vectorSearch.similarity_threshold = similarityThreshold;
    }
    body.vector_search = vectorSearch;
  }

  // Mode-specific configs
  if (hybridConfig !== undefined && searchMode === 'hybrid') {
    body.hybrid_config = hybridConfig;
  }
  if (vectorBoostConfig !== undefined && searchMode === 'vector_boosted') {
    body.vector_boost_config = vectorBoostConfig;
  }

  // Filtering & sorting
  if (where !== undefined) {
    body.where = where;
  }
  if (sort !== undefined) {
    body.sort = sort;
  }

  // Extra kwargs merged last (can override anything)
  if (searchKwargs) {
    Object.assign(body, searchKwargs);
  }

  return body;
}
