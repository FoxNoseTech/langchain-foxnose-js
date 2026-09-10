/**
 * Pure function mapping LangChain Documents to a FoxNose resource `data` object.
 *
 * The inverse of {@link module:document-mapper}.
 *
 * @module
 */

import type { Document } from '@langchain/core/documents';

/**
 * Metadata keys the read path injects from a result's `_sys` block.
 *
 * These are not schema fields, so they are stripped before a write unless the
 * caller opts in via `includeSysMetadata`.
 */
export const SYS_METADATA_KEYS: ReadonlySet<string> = new Set([
  'key',
  'folder',
  'created_at',
  'updated_at',
]);

/** Custom mapper: full control over the written `data`. */
export type DocumentMapper = (document: Document) => Record<string, unknown>;

/** Options for {@link mapDocumentToData}. */
export interface DocumentWriterOptions {
  /**
   * `data` field that receives `pageContent`.
   * Required unless `documentMapper` is given.
   */
  pageContentField?: string;
  /**
   * Custom callable for full control. When set, EVERY other option is
   * ignored, including `reservedMetadataKeys`: the mapper owns its output,
   * and silently deleting keys from it would make a mapper that deliberately
   * writes an identifier into `data` impossible to express.
   */
  documentMapper?: DocumentMapper;
  /** Whitelist of metadata keys to write. Mutually exclusive with the blacklist. */
  metadataFields?: string[];
  /** Blacklist of metadata keys to skip. Mutually exclusive with the whitelist. */
  excludeMetadataFields?: string[];
  /** Whether to write the keys in {@link SYS_METADATA_KEYS}. @default false */
  includeSysMetadata?: boolean;
  /**
   * Metadata keys the caller consumes itself (e.g. an external-id key).
   * Dropped from the mapping this function builds; not applied when
   * `documentMapper` is given.
   */
  reservedMetadataKeys?: readonly string[];
}

/**
 * Convert a LangChain Document into a FoxNose resource `data` mapping.
 *
 * Pure: no side effects, no requests.
 *
 * @throws If options conflict, `pageContentField` is missing, or a metadata
 *   key collides with `pageContentField`.
 */
export function mapDocumentToData(
  document: Document,
  options: DocumentWriterOptions = {},
): Record<string, unknown> {
  const {
    pageContentField,
    documentMapper,
    metadataFields,
    excludeMetadataFields,
    includeSysMetadata = false,
    reservedMetadataKeys = [],
  } = options;

  if (documentMapper !== undefined) {
    // No filtering of any kind on this path -- see `documentMapper` above.
    return { ...documentMapper(document) };
  }

  if (pageContentField === undefined) {
    throw new Error("'pageContentField' is required unless 'documentMapper' is provided.");
  }

  if (metadataFields !== undefined && excludeMetadataFields !== undefined) {
    throw new Error(
      "'metadataFields' and 'excludeMetadataFields' are mutually exclusive. Set only one.",
    );
  }

  const dropped = new Set<string>(reservedMetadataKeys);
  if (!includeSysMetadata) {
    for (const key of SYS_METADATA_KEYS) {
      dropped.add(key);
    }
  }

  const metadata = document.metadata ?? {};
  // Own properties only, throughout. `in` walks the prototype chain, so it
  // would copy inherited metadata into the whitelist result and reject a
  // perfectly valid schema field named `constructor`, `toString` or
  // `__proto__` even when the metadata is empty. Python's dicts have no such
  // chain, so this is also what keeps the two packages behaving alike.
  const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;

  if (metadataFields !== undefined) {
    for (const field of metadataFields) {
      if (Object.hasOwn(metadata, field) && !dropped.has(field)) {
        selected[field] = metadata[field];
      }
    }
  } else {
    const exclude = new Set(dropped);
    for (const field of excludeMetadataFields ?? []) {
      exclude.add(field);
    }
    for (const [field, value] of Object.entries(metadata)) {
      if (!exclude.has(field)) {
        selected[field] = value;
      }
    }
  }

  if (Object.hasOwn(selected, pageContentField)) {
    throw new Error(
      `Metadata key '${pageContentField}' collides with pageContentField. ` +
        `Exclude it via 'excludeMetadataFields' or use a custom 'documentMapper'.`,
    );
  }

  return { ...selected, [pageContentField]: document.pageContent };
}
