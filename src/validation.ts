/**
 * Shared validation logic for FoxNose LangChain integration.
 *
 * Centralises all config validation so that both the retriever and loader
 * share the same rules and error messages, following the DRY principle.
 *
 * @module
 */

import type { EmbeddingsInterface } from '@langchain/core/embeddings';

import type { HybridConfig, SearchMode, VectorBoostConfig } from './search.js';
import type { FoxNoseResult } from './document-mapper.js';

/** Subset of fields that both retriever and loader validate. */
export interface ContentMappingConfig {
  pageContentField?: string;
  pageContentFields?: string[];
  pageContentMapper?: (result: FoxNoseResult) => string;
  metadataFields?: string[];
  excludeMetadataFields?: string[];
}

/** Retriever-specific fields for validation. */
export interface RetrieverValidationConfig extends ContentMappingConfig {
  searchMode?: SearchMode;
  topK?: number;
  textThreshold?: number;
  similarityThreshold?: number;
  searchKwargs?: Record<string, unknown>;
  vectorFields?: string[];
  embeddings?: EmbeddingsInterface;
  queryVector?: number[];
  vectorField?: string;
  hybridConfig?: HybridConfig;
  vectorBoostConfig?: VectorBoostConfig;
}

/** Loader-specific fields for validation. */
export interface LoaderValidationConfig extends ContentMappingConfig {
  batchSize?: number;
}

const VALID_SEARCH_MODES = new Set<string>(['text', 'vector', 'hybrid', 'vector_boosted']);

/** Keys that conflict with SDK SearchRequest fields or convenience method params. */
const CONFLICTING_SEARCH_KWARGS = new Set([
  'search_mode',
  'vector_search',
  'vector_field_search',
  'hybrid_config',
  'vector_boost_config',
  'find_text',
  'find_phrase',
  // SDK convenience method params — must not be overridden via extra_body
  'query',
  'field',
  'query_vector',
  'top_k',
  'similarity_threshold',
  'boost_factor',
  'boost_similarity_threshold',
  'max_boost_results',
  'vector_weight',
  'text_weight',
  'rerank_results',
  'fields',
]);

/** Named keys extracted from searchKwargs into SDK method parameters. */
const NAMED_SEARCH_KWARGS = new Set(['limit', 'offset']);

/** Allowed keys for hybridConfig. */
const HYBRID_CONFIG_KEYS = new Set(['vectorWeight', 'textWeight', 'rerankResults']);

/** Allowed keys for vectorBoostConfig. */
const VECTOR_BOOST_CONFIG_KEYS = new Set([
  'boostFactor',
  'similarityThreshold',
  'maxBoostResults',
]);

/**
 * Validate content mapping strategy — exactly one of the three strategies
 * must be provided.
 *
 * @throws {Error} If zero or more than one strategy is set.
 */
export function validateContentMapping(config: ContentMappingConfig): void {
  const strategies = [
    config.pageContentField !== undefined,
    config.pageContentFields !== undefined,
    config.pageContentMapper !== undefined,
  ];
  const count = strategies.filter(Boolean).length;

  if (count === 0) {
    throw new Error(
      "Exactly one content mapping strategy is required: " +
        "'pageContentField', 'pageContentFields', or 'pageContentMapper'.",
    );
  }
  if (count > 1) {
    throw new Error(
      "Only one content mapping strategy may be set. " +
        "Choose one of: 'pageContentField', 'pageContentFields', or 'pageContentMapper'.",
    );
  }

  // pageContentFields must be non-empty when provided
  if (config.pageContentFields !== undefined && config.pageContentFields.length === 0) {
    throw new Error("'pageContentFields' must not be empty.");
  }
}

/**
 * Validate metadata field options are not mutually exclusive.
 *
 * @throws {Error} If both `metadataFields` and `excludeMetadataFields` are set.
 */
export function validateMetadataFields(config: ContentMappingConfig): void {
  if (config.metadataFields !== undefined && config.excludeMetadataFields !== undefined) {
    throw new Error(
      "'metadataFields' and 'excludeMetadataFields' are mutually exclusive. Set only one.",
    );
  }
}

/**
 * Validate `searchKwargs` for conflicting keys.
 *
 * @throws {Error} If any key conflicts with SDK SearchRequest fields.
 */
export function validateSearchKwargs(kwargs: Record<string, unknown> | undefined): void {
  if (!kwargs) return;
  const conflicts: string[] = [];
  for (const key of Object.keys(kwargs)) {
    if (CONFLICTING_SEARCH_KWARGS.has(key)) {
      conflicts.push(key);
    }
  }
  if (conflicts.length > 0) {
    throw new Error(
      `searchKwargs contains conflicting keys: ${conflicts.sort().join(', ')}. ` +
        'Use the explicit parameters instead.',
    );
  }

  // Validate named params
  if ('limit' in kwargs) {
    const limit = kwargs.limit;
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
      throw new Error(`searchKwargs.limit must be an integer >= 1, got ${limit}.`);
    }
  }
  if ('offset' in kwargs) {
    const offset = kwargs.offset;
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
      throw new Error(`searchKwargs.offset must be a non-negative integer, got ${offset}.`);
    }
  }
}

/**
 * Split `searchKwargs` into named SDK parameters and extra body params.
 *
 * Named params (`limit`, `offset`) are extracted as direct arguments to
 * SDK convenience methods. Everything else goes through `**extra_body`.
 */
export function splitSearchKwargs(
  kwargs: Record<string, unknown>,
): { named: Record<string, unknown>; extra: Record<string, unknown> } {
  const named: Record<string, unknown> = {};
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(kwargs)) {
    if (NAMED_SEARCH_KWARGS.has(key)) {
      named[key] = value;
    } else {
      extra[key] = value;
    }
  }
  return { named, extra };
}

/**
 * Validate `hybridConfig` for unknown keys and numeric constraints.
 *
 * @throws {Error} On unknown keys or invalid values.
 */
export function validateHybridConfig(config: HybridConfig): void {
  // Check for unknown keys
  const unknownKeys = Object.keys(config).filter((k) => !HYBRID_CONFIG_KEYS.has(k));
  if (unknownKeys.length > 0) {
    throw new Error(
      `hybridConfig contains unknown keys: ${unknownKeys.sort().join(', ')}. ` +
        `Allowed keys: ${[...HYBRID_CONFIG_KEYS].sort().join(', ')}.`,
    );
  }

  // Weight range checks
  if (config.vectorWeight !== undefined) {
    if (!Number.isFinite(config.vectorWeight) || config.vectorWeight < 0 || config.vectorWeight > 1) {
      throw new Error(
        `hybridConfig.vectorWeight must be a finite number between 0 and 1, got ${config.vectorWeight}.`,
      );
    }
  }
  if (config.textWeight !== undefined) {
    if (!Number.isFinite(config.textWeight) || config.textWeight < 0 || config.textWeight > 1) {
      throw new Error(
        `hybridConfig.textWeight must be a finite number between 0 and 1, got ${config.textWeight}.`,
      );
    }
  }

  // Weight sum check (only when both provided)
  const vw = config.vectorWeight ?? 0.6;
  const tw = config.textWeight ?? 0.4;
  if (Math.abs(vw + tw - 1.0) > 1e-6) {
    throw new Error(
      `hybridConfig weights must sum to 1.0, got vectorWeight=${vw} + textWeight=${tw} = ${vw + tw}.`,
    );
  }
}

/**
 * Validate `vectorBoostConfig` for unknown keys and numeric constraints.
 *
 * @throws {Error} On unknown keys or invalid values.
 */
export function validateVectorBoostConfig(config: VectorBoostConfig): void {
  // Check for unknown keys
  const unknownKeys = Object.keys(config).filter((k) => !VECTOR_BOOST_CONFIG_KEYS.has(k));
  if (unknownKeys.length > 0) {
    throw new Error(
      `vectorBoostConfig contains unknown keys: ${unknownKeys.sort().join(', ')}. ` +
        `Allowed keys: ${[...VECTOR_BOOST_CONFIG_KEYS].sort().join(', ')}.`,
    );
  }

  if (config.boostFactor !== undefined) {
    if (!Number.isFinite(config.boostFactor) || config.boostFactor <= 0) {
      throw new Error(
        `vectorBoostConfig.boostFactor must be > 0 and finite, got ${config.boostFactor}.`,
      );
    }
  }
  if (config.similarityThreshold !== undefined) {
    if (!Number.isFinite(config.similarityThreshold) || config.similarityThreshold < 0 || config.similarityThreshold > 1) {
      throw new Error(
        `vectorBoostConfig.similarityThreshold must be a finite number between 0 and 1, got ${config.similarityThreshold}.`,
      );
    }
  }
  if (config.maxBoostResults !== undefined) {
    if (!Number.isInteger(config.maxBoostResults) || config.maxBoostResults < 1) {
      throw new Error(
        `vectorBoostConfig.maxBoostResults must be an integer >= 1, got ${config.maxBoostResults}.`,
      );
    }
  }
}

/**
 * Validate custom embedding fields.
 *
 * @throws {Error} On invalid embedding configuration.
 */
export function validateEmbeddingConfig(config: RetrieverValidationConfig): void {
  const hasEmbeddings = config.embeddings !== undefined;
  const hasQueryVector = config.queryVector !== undefined;
  const hasVectorField = config.vectorField !== undefined;
  const searchMode = config.searchMode ?? 'hybrid';

  // Mutually exclusive
  if (hasEmbeddings && hasQueryVector) {
    throw new Error("'embeddings' and 'queryVector' are mutually exclusive. Provide only one.");
  }

  // vectorField requires a source
  if (hasVectorField && !hasEmbeddings && !hasQueryVector) {
    throw new Error("'vectorField' requires either 'embeddings' or 'queryVector'.");
  }

  // Source requires vectorField
  if ((hasEmbeddings || hasQueryVector) && !hasVectorField) {
    throw new Error("'vectorField' is required when 'embeddings' or 'queryVector' is set.");
  }

  // Only valid in vector / vector_boosted modes
  if ((hasEmbeddings || hasQueryVector || hasVectorField) && searchMode !== 'vector' && searchMode !== 'vector_boosted') {
    throw new Error(
      `'embeddings', 'queryVector', and 'vectorField' are only supported in 'vector' and ` +
        `'vector_boosted' search modes, got '${searchMode}'.`,
    );
  }

  // vectorField and vectorFields are mutually exclusive
  if (hasVectorField && config.vectorFields !== undefined) {
    throw new Error(
      "'vectorField' and 'vectorFields' are mutually exclusive. " +
        "'vectorField' is for custom-embedding search, " +
        "'vectorFields' is for auto-generated embedding search.",
    );
  }

  // queryVector must be non-empty with finite values
  if (hasQueryVector) {
    const qv = config.queryVector!;
    if (qv.length === 0) {
      throw new Error("'queryVector' must not be empty.");
    }
    if (!qv.every(Number.isFinite)) {
      throw new Error("All values in 'queryVector' must be finite (no NaN/Inf).");
    }
  }
}

/**
 * Validate all retriever configuration fields.
 *
 * @throws {Error} On any invalid configuration.
 */
export function validateRetrieverConfig(config: RetrieverValidationConfig): void {
  validateContentMapping(config);
  validateMetadataFields(config);

  const searchMode = config.searchMode ?? 'hybrid';
  if (!VALID_SEARCH_MODES.has(searchMode)) {
    throw new Error(
      `Invalid searchMode '${searchMode}'. ` +
        `Must be one of: ${[...VALID_SEARCH_MODES].sort().join(', ')}.`,
    );
  }

  const topK = config.topK ?? 5;
  if (!Number.isInteger(topK) || topK < 1) {
    throw new Error(`topK must be an integer >= 1, got ${topK}.`);
  }

  if (config.textThreshold !== undefined && (!Number.isFinite(config.textThreshold) || config.textThreshold < 0 || config.textThreshold > 1)) {
    throw new Error(
      `textThreshold must be a finite number between 0 and 1, got ${config.textThreshold}.`,
    );
  }

  if (
    config.similarityThreshold !== undefined &&
    (!Number.isFinite(config.similarityThreshold) || config.similarityThreshold < 0 || config.similarityThreshold > 1)
  ) {
    throw new Error(
      `similarityThreshold must be a finite number between 0 and 1, got ${config.similarityThreshold}.`,
    );
  }

  // vectorFields not supported in vector_boosted mode (SDK boostedSearch doesn't accept fields)
  if (searchMode === 'vector_boosted' && config.vectorFields !== undefined) {
    throw new Error(
      "'vectorFields' is not supported in 'vector_boosted' mode. " +
        "The SDK boostedSearch() method does not accept a 'fields' parameter.",
    );
  }

  validateSearchKwargs(config.searchKwargs);
  validateEmbeddingConfig(config);

  if (config.hybridConfig !== undefined) {
    validateHybridConfig(config.hybridConfig);
  }
  if (config.vectorBoostConfig !== undefined) {
    validateVectorBoostConfig(config.vectorBoostConfig);
  }
}

/**
 * Validate all loader configuration fields.
 *
 * @throws {Error} On any invalid configuration.
 */
export function validateLoaderConfig(config: LoaderValidationConfig): void {
  validateContentMapping(config);
  validateMetadataFields(config);

  const batchSize = config.batchSize ?? 100;
  if (batchSize < 1) {
    throw new Error(`batchSize must be >= 1, got ${batchSize}.`);
  }
}
