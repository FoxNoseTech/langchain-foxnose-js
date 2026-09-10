# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-09-10

Brings the package to parity with `langchain-foxnose` 0.4.0 on the Python side.
0.3.0 was never published, so its changes ship here too.

### Breaking

- **Requires `@foxnose/sdk` >= 0.6.1**, up from `^0.4.0`. A caret range does not
  cross a `0.x` minor, so this is breaking for consumers even though the SDK
  changes are additive. 0.6.x supplies the query-string parameters the retriever
  now forwards, and 0.6.1 maps a Flux write's `data_validation_error` onto
  `ContentValidationFailedError`, which the writer's error handling relies on.
- **`buildSearchBody()` removed**, deprecated since 0.2.0. The retriever has used
  the SDK convenience methods since then and nothing inside the package called
  it. `needsTextSearch()` and `needsVectorSearch()` are unaffected.

### Added

- **`FoxNoseWriter`** — writes LangChain `Document` objects into a collection
  through Flux, with `addDocuments()` and `updateDocument()`. Supports
  `externalIdKey` deduplication, a custom `documentMapper`, and metadata
  whitelisting/blacklisting. Deliberately **not** a LangChain `VectorStore`:
  Flux has no delete endpoint, so `delete()` could not be honoured.
- **`FoxNoseBatchWriteError`** — raised when a batch fails part-way through.
  Because the writes cannot be rolled back, it reports three ranges precisely:
  `writtenKeys` (written, not rolled back), `failedIndex` (outcome **unknown** —
  a validation or conflict error wrote nothing, but an upstream error or a
  timeout may have written it), and `pendingIndexes` (guaranteed not attempted),
  plus `total` and `cause`. A local mapping error is raised before any request,
  so it writes nothing at all.
- **`mapDocumentToData()`** — the pure `Document` -> `data` mapper, the inverse
  of `mapResultsToDocuments()`.
- **`truncateText` and `queryParams`** on `FoxNoseRetriever`, and `truncateText`
  on `FoxNoseLoader` — forward query-string parameters to cap the length of
  `text`-typed fields server-side. They could not be reached through
  `searchKwargs`, which goes into the request body, and passing them there is
  now rejected at construction with a message naming the right option. Setting
  `truncate_text` through both a dedicated option and `queryParams`/`params` is
  rejected too, rather than silently resolved.
- `collectionPath` accepted alongside the now-deprecated `folderPath` on the
  retriever, loader and tool, following the SDK's Folder -> Collection rename.
  `folderPath` still works and emits a one-shot warning; it goes away in 1.0.
  (From the unpublished 0.3.0.)

### Fixed

- **`FoxNoseLoader` could paginate forever.** FoxNose returns the `next` field as
  a full URL, not the opaque token the `next` query parameter accepts. Sending
  the URL back meant the backend could not parse it, silently answered with page
  one again and returned the same `next` — `load()` re-fetched the first page
  indefinitely. Cursors are now reduced to their token, and each is followed at
  most once, so a backend that cycles (`A -> B -> A`) terminates instead of
  spinning.

## [0.2.0] - 2026-03-20

- Vector field search with custom embeddings.

## [0.1.1] - 2026-03-18

- Bump the FoxNose SDK version.
