/**
 * Pure functions to map FoxNose search/list results to LangChain Document objects.
 *
 * Each FoxNose result has the shape:
 * ```json
 * { "_sys": { "key": "...", "folder": "...", ... }, "data": { "title": "...", ... } }
 * ```
 *
 * This module converts those results into `Document` instances with configurable
 * content extraction and metadata control.
 *
 * @module
 */

import { Document } from '@langchain/core/documents';

/**
 * A raw FoxNose result object as returned by the Flux API.
 *
 * The `_sys` block contains system metadata (key, folder, timestamps),
 * while `data` contains the user-defined fields.
 */
export interface FoxNoseResult {
  _sys?: {
    key?: string;
    folder?: string;
    created_at?: string;
    updated_at?: string;
    [key: string]: unknown;
  };
  data?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/**
 * Custom mapper function signature.
 *
 * Receives the full result object and returns the string to use as
 * `Document.pageContent`.
 */
export type PageContentMapper = (result: FoxNoseResult) => string;

/** Options controlling how results are mapped to documents. */
export interface DocumentMapperOptions {
  /** Single `data` field whose value becomes `pageContent`. */
  readonly pageContentField?: string;
  /** Multiple `data` fields concatenated into `pageContent`. */
  readonly pageContentFields?: string[];
  /** Separator used when concatenating `pageContentFields`. @default "\n\n" */
  readonly pageContentSeparator?: string;
  /** Custom callable for full control over `pageContent` extraction. */
  readonly pageContentMapper?: PageContentMapper;
  /** Whitelist of `data` fields to include in document metadata. */
  readonly metadataFields?: string[];
  /** Blacklist of `data` fields to exclude from document metadata. */
  readonly excludeMetadataFields?: string[];
  /**
   * Whether to include `_sys` fields (key, folder, created_at, updated_at)
   * in document metadata.
   * @default true
   */
  readonly includeSysMetadata?: boolean;
}

/**
 * Convert an array of FoxNose results into LangChain `Document` objects.
 *
 * This is a **pure function** with no side effects.
 *
 * @param results - Raw result objects from the FoxNose API.
 * @param options - Mapping configuration.
 * @returns An array of `Document` instances.
 *
 * @throws {TypeError} If a custom `pageContentMapper` throws.
 *
 * @example
 * ```ts
 * const docs = mapResultsToDocuments(results, { pageContentField: 'body' });
 * ```
 */
export function mapResultsToDocuments(
  results: FoxNoseResult[],
  options: DocumentMapperOptions,
): Document[] {
  return results.map((result) => {
    const pageContent = extractPageContent(result, options);
    const metadata = extractMetadata(result, options);
    return new Document({ pageContent, metadata });
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract `pageContent` from a single result based on the configured strategy.
 */
function extractPageContent(result: FoxNoseResult, options: DocumentMapperOptions): string {
  const { pageContentMapper, pageContentField, pageContentFields, pageContentSeparator = '\n\n' } =
    options;

  // Strategy 1: custom mapper
  if (pageContentMapper !== undefined) {
    return pageContentMapper(result);
  }

  const data = result.data ?? {};

  // Strategy 2: single field
  if (pageContentField !== undefined) {
    const value = data[pageContentField];
    if (value === null || value === undefined) return '';
    return typeof value === 'string' ? value : String(value);
  }

  // Strategy 3: multiple fields concatenated
  if (pageContentFields !== undefined) {
    const parts: string[] = [];
    for (const field of pageContentFields) {
      const value = data[field];
      if (value !== null && value !== undefined) {
        parts.push(typeof value === 'string' ? value : String(value));
      }
    }
    return parts.join(pageContentSeparator);
  }

  return '';
}

/**
 * Extract metadata from a single result.
 */
function extractMetadata(
  result: FoxNoseResult,
  options: DocumentMapperOptions,
): Record<string, unknown> {
  const {
    pageContentField,
    pageContentFields,
    pageContentMapper,
    metadataFields,
    excludeMetadataFields,
    includeSysMetadata = true,
  } = options;

  const metadata: Record<string, unknown> = {};

  // System metadata
  if (includeSysMetadata) {
    const sys = result._sys ?? {};
    for (const key of ['key', 'folder', 'created_at', 'updated_at'] as const) {
      if (key in sys && sys[key] != null) {
        metadata[key] = sys[key];
      }
    }
  }

  // Data fields for metadata
  const data = result.data ?? {};
  const contentFieldSet = getContentFields(pageContentField, pageContentFields, pageContentMapper);

  if (metadataFields !== undefined) {
    // Whitelist mode: only include specified fields
    for (const field of metadataFields) {
      if (field in data) {
        metadata[field] = data[field];
      }
    }
  } else {
    // Include all data fields except content fields and excluded fields
    const excludeSet = new Set(excludeMetadataFields ?? []);
    for (const [field, value] of Object.entries(data)) {
      if (contentFieldSet.has(field)) continue;
      if (excludeSet.has(field)) continue;
      metadata[field] = value;
    }
  }

  return metadata;
}

/**
 * Determine which data fields are used for `pageContent` so they can be
 * excluded from metadata by default.
 */
function getContentFields(
  pageContentField: string | undefined,
  pageContentFields: string[] | undefined,
  pageContentMapper: PageContentMapper | undefined,
): Set<string> {
  // With a custom mapper, we don't know which fields are used
  if (pageContentMapper !== undefined) return new Set();
  if (pageContentField !== undefined) return new Set([pageContentField]);
  if (pageContentFields !== undefined) return new Set(pageContentFields);
  return new Set();
}
