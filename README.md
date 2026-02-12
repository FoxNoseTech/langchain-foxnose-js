# @foxnose/langchain

Official [LangChain.js](https://js.langchain.com/) integration for [FoxNose](https://foxnose.net/?utm_source=github&utm_medium=repository&utm_campaign=foxnose-langchain-js) — the knowledge layer for RAG and AI agents.

[![npm version](https://img.shields.io/npm/v/@foxnose/langchain.svg)](https://www.npmjs.com/package/@foxnose/langchain)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org/)
[![Test Coverage](https://img.shields.io/badge/coverage-%3E90%25-brightgreen.svg)]()

---

## Features

- **FoxNoseRetriever** — a LangChain `BaseRetriever` with 4 search modes: text, vector, hybrid, and vector-boosted
- **FoxNoseLoader** — a LangChain `BaseDocumentLoader` with automatic cursor-based pagination
- **createFoxNoseTool** — factory to wrap retrieval into a LangChain agent tool
- **Content mapping** — single field, multiple fields, or a custom mapper function
- **Metadata control** — whitelist, blacklist, or toggle system metadata
- **Structured filtering** — pass a `where` parameter for server-side filtering
- **Type-safe** — full TypeScript types with strict mode

## Installation

```bash
npm install @foxnose/langchain @foxnose/sdk @langchain/core
# or
pnpm add @foxnose/langchain @foxnose/sdk @langchain/core
```

## Quick Start

### Retriever

```typescript
import { FluxClient, SimpleKeyAuth } from '@foxnose/sdk';
import { FoxNoseRetriever } from '@foxnose/langchain';

const client = new FluxClient({
  baseUrl: 'https://<env_key>.fxns.io',
  apiPrefix: 'content',
  auth: new SimpleKeyAuth('YOUR_PUBLIC_KEY', 'YOUR_SECRET_KEY'),
});

const retriever = new FoxNoseRetriever({
  client,
  folderPath: 'articles',
  pageContentField: 'body',
  searchMode: 'hybrid',
  topK: 5,
});

const docs = await retriever.invoke('How do I reset my password?');
for (const doc of docs) {
  console.log(doc.pageContent.slice(0, 200));
}
```

### Document Loader

```typescript
import { FoxNoseLoader } from '@foxnose/langchain';

const loader = new FoxNoseLoader({
  client,
  folderPath: 'articles',
  pageContentField: 'body',
  batchSize: 50,
});

const docs = await loader.load();
console.log(`Loaded ${docs.length} documents`);
```

### Agent Tool

```typescript
import { createFoxNoseTool } from '@foxnose/langchain';

const tool = createFoxNoseTool({
  client,
  folderPath: 'articles',
  pageContentField: 'body',
  name: 'search_knowledge_base',
  description: 'Search the knowledge base for relevant articles.',
});

// Use with any LangChain agent
const result = await tool.invoke({ query: 'vector search best practices' });
```

## Search Modes

| Mode | Description |
|------|-------------|
| `"text"` | Full-text keyword search only |
| `"vector"` | Pure semantic (vector) search only |
| `"hybrid"` | Combines text and vector search with configurable weights |
| `"vector_boosted"` | Text search with vector-based re-ranking boost |

### Vector Search

```typescript
const retriever = new FoxNoseRetriever({
  client,
  folderPath: 'articles',
  pageContentField: 'body',
  searchMode: 'vector',
  topK: 10,
  similarityThreshold: 0.7,
});
```

### Hybrid Search with Custom Weights

```typescript
const retriever = new FoxNoseRetriever({
  client,
  folderPath: 'articles',
  pageContentField: 'body',
  searchMode: 'hybrid',
  hybridConfig: {
    vectorWeight: 0.7,
    textWeight: 0.3,
    rerankResults: true,
  },
});
```

### Filtered Retrieval

```typescript
const retriever = new FoxNoseRetriever({
  client,
  folderPath: 'articles',
  pageContentField: 'body',
  searchMode: 'hybrid',
  where: {
    $: {
      all_of: [
        { status__eq: 'published' },
        { category__in: ['tech', 'science'] },
      ],
    },
  },
});
```

## Content Mapping

### Single Field

```typescript
new FoxNoseRetriever({
  client,
  folderPath: 'articles',
  pageContentField: 'body',
});
```

### Multiple Fields

```typescript
new FoxNoseRetriever({
  client,
  folderPath: 'articles',
  pageContentFields: ['title', 'body'],
  pageContentSeparator: '\n\n',  // default
});
```

### Custom Mapper

```typescript
new FoxNoseRetriever({
  client,
  folderPath: 'articles',
  pageContentMapper: (result) =>
    `# ${result.data?.title}\n\n${result.data?.body}`,
});
```

## Metadata Control

```typescript
// Whitelist specific fields
new FoxNoseRetriever({
  client,
  folderPath: 'articles',
  pageContentField: 'body',
  metadataFields: ['title', 'category'],
});

// Blacklist specific fields
new FoxNoseRetriever({
  client,
  folderPath: 'articles',
  pageContentField: 'body',
  excludeMetadataFields: ['internal_notes'],
});

// Disable system metadata (_sys fields)
new FoxNoseRetriever({
  client,
  folderPath: 'articles',
  pageContentField: 'body',
  includeSysMetadata: false,
});
```

## API Reference

### FoxNoseRetriever

Extends `BaseRetriever` from `@langchain/core`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `client` | `FluxClient` | *required* | FoxNose Flux client instance |
| `folderPath` | `string` | *required* | Folder path in FoxNose |
| `pageContentField` | `string` | — | Single data field for `pageContent` |
| `pageContentFields` | `string[]` | — | Multiple fields concatenated |
| `pageContentSeparator` | `string` | `"\n\n"` | Separator for multi-field content |
| `pageContentMapper` | `(result) => string` | — | Custom content extractor |
| `searchMode` | `SearchMode` | `"hybrid"` | Search mode |
| `topK` | `number` | `5` | Max results |
| `searchFields` | `string[]` | — | Text search fields |
| `textThreshold` | `number` | — | Text search typo tolerance (0–1) |
| `vectorFields` | `string[]` | — | Vector search fields |
| `similarityThreshold` | `number` | — | Min cosine similarity (0–1) |
| `where` | `object` | — | Structured filter |
| `hybridConfig` | `HybridConfig` | — | Hybrid mode weights |
| `vectorBoostConfig` | `VectorBoostConfig` | — | Vector-boosted config |
| `sort` | `string[]` | — | Sort fields |
| `searchKwargs` | `object` | — | Extra search body params |
| `metadataFields` | `string[]` | — | Metadata whitelist |
| `excludeMetadataFields` | `string[]` | — | Metadata blacklist |
| `includeSysMetadata` | `boolean` | `true` | Include `_sys` metadata |

### FoxNoseLoader

Extends `BaseDocumentLoader` from `@langchain/core`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `client` | `FluxClient` | *required* | FoxNose Flux client instance |
| `folderPath` | `string` | *required* | Folder path in FoxNose |
| `batchSize` | `number` | `100` | Page size for pagination |
| `params` | `object` | — | Query params for `listResources` |
| *(content mapping)* | | | Same as FoxNoseRetriever |
| *(metadata control)* | | | Same as FoxNoseRetriever |

### createFoxNoseTool

Factory function that returns a `DynamicStructuredTool`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `retriever` | `FoxNoseRetriever` | — | Pre-built retriever (or provide client config) |
| `name` | `string` | `"foxnose_search"` | Tool name for agents |
| `description` | `string` | *(auto)* | Tool description |
| `documentSeparator` | `string` | `"\n\n"` | Separator between docs |
| *(retriever options)* | | | Same as FoxNoseRetriever |

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Type check
pnpm typecheck

# Build
pnpm build

# Lint
pnpm lint

# Format
pnpm format
```

## License

Apache 2.0 — see [LICENSE](LICENSE).
