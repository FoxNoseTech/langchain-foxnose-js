/**
 * FoxNose document writer for LangChain Documents.
 *
 * Deliberately NOT a LangChain `VectorStore`: Flux has no delete endpoint, so
 * `delete()` could not be honoured and the interface would lie.
 *
 * @module
 */

import type { Document } from '@langchain/core/documents';
import type { FluxClient } from '@foxnose/sdk';

import { type DocumentMapper, mapDocumentToData } from './document-writer.js';

/**
 * Raised when a document batch fails part-way through.
 *
 * Flux writes are non-idempotent, are never retried automatically, and cannot
 * be rolled back or deleted, so a failed batch leaves earlier documents in
 * place. Batches are written strictly sequentially and stop at the first
 * failure, which is what makes the three index ranges below meaningful.
 */
export class FoxNoseBatchWriteError extends Error {
  /** Resource keys of documents `0 .. failedIndex - 1`, written and NOT rolled back. */
  readonly writtenKeys: string[];
  /**
   * Index of the document whose write threw. Its outcome is **unknown**, not
   * necessarily failed: a validation or conflict error wrote nothing, but an
   * upstream error or a transport timeout may have written it. Re-read with a
   * GET to find out; do not blindly retry.
   */
  readonly failedIndex: number;
  /** Indexes `failedIndex + 1 .. total - 1`, guaranteed NOT attempted. */
  readonly pendingIndexes: number[];
  /** Number of documents in the batch. */
  readonly total: number;
  /**
   * The underlying SDK error. Branch on this, not on a second `catch`:
   * every error from a batch write arrives wrapped in this class, so a
   * `catch (e) { if (e instanceof ContentValidationFailedError) }` after it
   * would be unreachable.
   */
  readonly cause?: unknown;

  constructor(
    message: string,
    init: { writtenKeys: string[]; failedIndex: number; total: number; cause?: unknown },
  ) {
    super(message);
    this.name = 'FoxNoseBatchWriteError';
    this.writtenKeys = init.writtenKeys;
    this.failedIndex = init.failedIndex;
    this.total = init.total;
    this.cause = init.cause;
    this.pendingIndexes = [];
    for (let i = init.failedIndex + 1; i < init.total; i += 1) {
      this.pendingIndexes.push(i);
    }
  }
}

/** Configuration for {@link FoxNoseWriter}. */
export interface FoxNoseWriterInput {
  /** A FoxNose Flux client with write access. */
  client: FluxClient;
  /** Collection path to write into. */
  collectionPath: string;
  /**
   * `data` field that receives `pageContent`.
   * Exactly one of this or `documentMapper` is required.
   */
  pageContentField?: string;
  /** Custom mapper for full control over the written `data`. */
  documentMapper?: DocumentMapper;
  /** Whitelist of metadata keys to write. */
  metadataFields?: string[];
  /** Blacklist of metadata keys to skip. */
  excludeMetadataFields?: string[];
  /** Whether to write the read path's `_sys`-derived metadata keys. @default false */
  includeSysMetadata?: boolean;
  /**
   * Metadata key holding an external deduplication id. Its value is sent as
   * the resource key. Must be a string or a number; anything else throws. A
   * document without the key is written without one, and reusing a value
   * raises `ExternalIdConflictError`.
   *
   * The key is kept out of `data` when `pageContentField` builds the mapping.
   * With a `documentMapper` the mapper decides: whatever it returns is written
   * as-is, so a mapper that copies all metadata also writes the identifier.
   */
  externalIdKey?: string;
}

/**
 * Writes LangChain Documents into a FoxNose collection.
 *
 * Batches are written strictly sequentially and stop at the first failure --
 * there is deliberately no concurrency option. Flux writes are
 * non-idempotent, are never retried by the SDK, and cannot be deleted, so
 * concurrent scheduling would leave the failure report unable to say which
 * documents were attempted.
 *
 * @example
 * ```ts
 * const writer = new FoxNoseWriter({
 *   client,
 *   collectionPath: 'knowledge-base',
 *   pageContentField: 'body',
 *   externalIdKey: 'source_id',
 * });
 * const keys = await writer.addDocuments(docs);
 * ```
 */
export class FoxNoseWriter {
  private readonly client: FluxClient;
  private readonly collectionPath: string;
  private readonly pageContentField?: string;
  private readonly documentMapper?: DocumentMapper;
  private readonly metadataFields?: string[];
  private readonly excludeMetadataFields?: string[];
  private readonly includeSysMetadata: boolean;
  private readonly externalIdKey?: string;

  constructor(fields: FoxNoseWriterInput) {
    if (!fields.client) {
      throw new Error("'client' (FluxClient) is required.");
    }

    const strategies = [
      fields.pageContentField !== undefined,
      fields.documentMapper !== undefined,
    ].filter(Boolean).length;
    if (strategies === 0) {
      throw new Error(
        "Exactly one content mapping strategy is required: 'pageContentField' or 'documentMapper'.",
      );
    }
    if (strategies > 1) {
      throw new Error(
        "Only one content mapping strategy may be set. Choose 'pageContentField' or 'documentMapper'.",
      );
    }
    if (fields.metadataFields !== undefined && fields.excludeMetadataFields !== undefined) {
      throw new Error(
        "'metadataFields' and 'excludeMetadataFields' are mutually exclusive. Set only one.",
      );
    }
    // "" is not a usable metadata key, and allowing it would split this field
    // into two readings: one testing for undefined, one testing truthiness.
    if (fields.externalIdKey !== undefined && fields.externalIdKey.trim() === '') {
      throw new Error("'externalIdKey' must be a non-empty metadata key name.");
    }

    this.client = fields.client;
    this.collectionPath = fields.collectionPath;
    this.pageContentField = fields.pageContentField;
    this.documentMapper = fields.documentMapper;
    this.metadataFields = fields.metadataFields;
    this.excludeMetadataFields = fields.excludeMetadataFields;
    this.includeSysMetadata = fields.includeSysMetadata ?? false;
    this.externalIdKey = fields.externalIdKey;
  }

  // --- Internal helpers ---

  private mapData(document: Document): Record<string, unknown> {
    return mapDocumentToData(document, {
      pageContentField: this.pageContentField,
      documentMapper: this.documentMapper,
      metadataFields: this.metadataFields,
      excludeMetadataFields: this.excludeMetadataFields,
      includeSysMetadata: this.includeSysMetadata,
      reservedMetadataKeys: this.externalIdKey === undefined ? [] : [this.externalIdKey],
    });
  }

  private externalId(document: Document, index: number): string | undefined {
    if (this.externalIdKey === undefined) {
      return undefined;
    }
    const value = (document.metadata ?? {})[this.externalIdKey];
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new TypeError(
        `Document ${index}: metadata['${this.externalIdKey}'] must be a string or number ` +
          `to be used as an external id, got ${typeof value}.`,
      );
    }
    return String(value);
  }

  /**
   * Map and validate every document BEFORE any request is sent.
   *
   * Local mapping errors -- a bad external id, a metadata/content collision, a
   * throwing custom mapper -- must not be able to happen half way through a
   * batch: they would surface with no record of what had already been written.
   * Doing all of the pure work up front means a local failure guarantees ZERO
   * writes, and {@link FoxNoseBatchWriteError} stays reserved for attempted
   * network writes.
   */
  private prepareBatch(
    documents: Document[],
  ): Array<{ data: Record<string, unknown>; key?: string }> {
    return documents.map((document, index) => ({
      data: this.mapData(document),
      key: this.externalId(document, index),
    }));
  }

  private static batchError(
    writtenKeys: string[],
    failedIndex: number,
    total: number,
    cause: unknown,
  ): FoxNoseBatchWriteError {
    const pending = total - failedIndex - 1;
    return new FoxNoseBatchWriteError(
      `Failed to write document ${failedIndex} of ${total}. ${writtenKeys.length} document(s) ` +
        `were already written and are not rolled back; document ${failedIndex} has an unknown ` +
        `outcome and must be re-read before any retry; ${pending} document(s) were not attempted.`,
      { writtenKeys, failedIndex, total, cause },
    );
  }

  // --- Public API ---

  /**
   * Create one FoxNose resource per document, sequentially.
   *
   * Writes stop at the first failure; documents after it are not attempted.
   * All documents are mapped and validated before the first request, so a
   * mapping error writes nothing at all.
   *
   * @returns The created resource keys, in input order.
   * @throws {FoxNoseBatchWriteError} If any write fails. Inspect
   *   `writtenKeys`, `failedIndex`, `pendingIndexes` and `cause`.
   */
  async addDocuments(documents: Document[]): Promise<string[]> {
    const prepared = this.prepareBatch(documents);
    const written: string[] = [];
    const total = prepared.length;

    for (let index = 0; index < total; index += 1) {
      const { data, key } = prepared[index];
      try {
        const response = await this.client.createResource<{ resource_key?: unknown }>(
          this.collectionPath,
          data,
          key === undefined ? undefined : { key },
        );
        // Read inside the try on purpose: a malformed success response must
        // not escape unwrapped after a resource was actually created.
        const resourceKey = response?.resource_key;
        if (resourceKey === undefined || resourceKey === null) {
          throw new Error("Write succeeded but the response carried no 'resource_key'.");
        }
        written.push(String(resourceKey));
      } catch (error) {
        throw FoxNoseWriter.batchError(written, index, total, error);
      }
    }
    return written;
  }

  /**
   * Replace one document by its INTERNAL resource key.
   *
   * A full-document replace, not a merge: fields absent from `document` are
   * removed from the stored resource.
   *
   * @param resourceKey The key returned by {@link addDocuments}, not the
   *   external id.
   * @returns The new `revision_key`.
   */
  async updateDocument(resourceKey: string, document: Document): Promise<string> {
    const response = await this.client.updateResource<{ revision_key?: unknown }>(
      this.collectionPath,
      resourceKey,
      this.mapData(document),
    );
    // The API field is `revision_key`, not `revision`.
    const revisionKey = response?.revision_key;
    if (revisionKey === undefined || revisionKey === null) {
      throw new Error("Update succeeded but the response carried no 'revision_key'.");
    }
    return String(revisionKey);
  }
}
