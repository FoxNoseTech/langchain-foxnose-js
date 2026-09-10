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

