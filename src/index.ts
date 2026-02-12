/**
 * LangChain.js integration for FoxNose — the knowledge layer for RAG and AI agents.
 *
 * @packageDocumentation
 */

export { FoxNoseRetriever } from './retriever.js';
export type { FoxNoseRetrieverInput } from './retriever.js';

export { FoxNoseLoader } from './loader.js';
export type { FoxNoseLoaderInput } from './loader.js';

export { createFoxNoseTool } from './tool.js';
export type {
  CreateFoxNoseToolOptions,
  CreateFoxNoseToolFromRetriever,
  CreateFoxNoseToolFromConfig,
} from './tool.js';

// Re-export utility types for advanced users
export type { SearchMode, HybridConfig, VectorBoostConfig, BuildSearchBodyParams } from './search.js';
export { buildSearchBody, needsTextSearch, needsVectorSearch } from './search.js';
export type { FoxNoseResult, PageContentMapper, DocumentMapperOptions } from './document-mapper.js';
export { mapResultsToDocuments } from './document-mapper.js';
