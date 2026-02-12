/**
 * Shared validation logic for FoxNose LangChain integration.
 *
 * Centralises all config validation so that both the retriever and loader
 * share the same rules and error messages, following the DRY principle.
 *
 * @module
 */

import type { SearchMode } from './search.js';
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
}

/** Loader-specific fields for validation. */
export interface LoaderValidationConfig extends ContentMappingConfig {
  batchSize?: number;
}

const VALID_SEARCH_MODES = new Set<string>(['text', 'vector', 'hybrid', 'vector_boosted']);

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
  if (topK < 1) {
    throw new Error(`topK must be >= 1, got ${topK}.`);
  }

  if (config.textThreshold !== undefined && (config.textThreshold < 0 || config.textThreshold > 1)) {
    throw new Error(
      `textThreshold must be between 0 and 1, got ${config.textThreshold}.`,
    );
  }

  if (
    config.similarityThreshold !== undefined &&
    (config.similarityThreshold < 0 || config.similarityThreshold > 1)
  ) {
    throw new Error(
      `similarityThreshold must be between 0 and 1, got ${config.similarityThreshold}.`,
    );
  }

  if (config.searchKwargs && 'search_mode' in config.searchKwargs) {
    throw new Error(
      "Do not override 'search_mode' via 'searchKwargs'. Set 'searchMode' directly instead.",
    );
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
