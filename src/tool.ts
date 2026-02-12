/**
 * FoxNose search tool for LangChain.js agents.
 *
 * Provides {@link createFoxNoseTool}, a factory that wraps a
 * {@link FoxNoseRetriever} into a LangChain `DynamicStructuredTool`
 * suitable for use with LangChain agents.
 *
 * @module
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import type { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import { z } from 'zod';

import { FoxNoseRetriever, type FoxNoseRetrieverInput } from './retriever.js';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

/** Options for {@link createFoxNoseTool} when providing a pre-built retriever. */
export interface CreateFoxNoseToolFromRetriever {
  /** An existing {@link FoxNoseRetriever} to wrap. */
  retriever: FoxNoseRetriever;
  /** Tool name exposed to the LLM agent. @default "foxnose_search" */
  name?: string;
  /** Tool description exposed to the LLM agent. */
  description?: string;
  /** Separator between documents in the response string. @default "\n\n" */
  documentSeparator?: string;
}

/** Options for {@link createFoxNoseTool} when building a retriever inline. */
export interface CreateFoxNoseToolFromConfig extends Omit<FoxNoseRetrieverInput, 'callbacks' | 'tags' | 'metadata' | 'verbose'> {
  /** Tool name exposed to the LLM agent. @default "foxnose_search" */
  name?: string;
  /** Tool description exposed to the LLM agent. */
  description?: string;
  /** Separator between documents in the response string. @default "\n\n" */
  documentSeparator?: string;
  /** @hidden */
  retriever?: never;
}

/** Union type for {@link createFoxNoseTool} options. */
export type CreateFoxNoseToolOptions = CreateFoxNoseToolFromRetriever | CreateFoxNoseToolFromConfig;

// -----------------------------------------------------------------------
// Default values
// -----------------------------------------------------------------------

const DEFAULT_TOOL_NAME = 'foxnose_search';
const DEFAULT_TOOL_DESCRIPTION =
  'Search the FoxNose knowledge base. ' +
  'Use this tool to find relevant information for answering questions.';
const DEFAULT_DOCUMENT_SEPARATOR = '\n\n';

// -----------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------

/**
 * Create a LangChain tool for FoxNose search.
 *
 * Either pass an existing `retriever` or provide `client` + config to create
 * one internally. The resulting tool accepts a query string and returns the
 * retrieved document contents as a single concatenated string.
 *
 * @example Using an existing retriever:
 * ```ts
 * const tool = createFoxNoseTool({ retriever: myRetriever });
 * ```
 *
 * @example Building a retriever inline:
 * ```ts
 * const tool = createFoxNoseTool({
 *   client,
 *   folderPath: 'knowledge-base',
 *   pageContentField: 'body',
 * });
 * ```
 *
 * @param options - Tool configuration.
 * @returns A `DynamicStructuredTool` that performs FoxNose search.
 */
export function createFoxNoseTool(options: CreateFoxNoseToolOptions): DynamicStructuredTool {
  const {
    name = DEFAULT_TOOL_NAME,
    description = DEFAULT_TOOL_DESCRIPTION,
    documentSeparator = DEFAULT_DOCUMENT_SEPARATOR,
  } = options;

  let retriever: FoxNoseRetriever;

  if ('retriever' in options && options.retriever !== undefined) {
    retriever = options.retriever;
  } else {
    // Build retriever from provided config
    const config = options as CreateFoxNoseToolFromConfig;
    retriever = new FoxNoseRetriever({
      client: config.client,
      folderPath: config.folderPath,
      pageContentField: config.pageContentField,
      pageContentFields: config.pageContentFields,
      pageContentSeparator: config.pageContentSeparator,
      pageContentMapper: config.pageContentMapper,
      metadataFields: config.metadataFields,
      excludeMetadataFields: config.excludeMetadataFields,
      includeSysMetadata: config.includeSysMetadata,
      searchMode: config.searchMode,
      searchFields: config.searchFields,
      textThreshold: config.textThreshold,
      vectorFields: config.vectorFields,
      similarityThreshold: config.similarityThreshold,
      topK: config.topK,
      where: config.where,
      hybridConfig: config.hybridConfig,
      vectorBoostConfig: config.vectorBoostConfig,
      sort: config.sort,
      searchKwargs: config.searchKwargs,
    });
  }

  const schema = z.object({
    query: z.string().describe('Query to search the FoxNose knowledge base'),
  });

  return new DynamicStructuredTool({
    name,
    description,
    schema,
    func: async (
      { query }: { query: string },
      _runManager?: CallbackManagerForToolRun,
    ): Promise<string> => {
      const docs = await retriever.invoke(query);
      return docs.map((doc) => doc.pageContent).join(documentSeparator);
    },
  });
}
