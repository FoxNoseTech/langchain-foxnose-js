/**
 * Tests for createFoxNoseTool.
 */

import { describe, it, expect, vi } from 'vitest';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createFoxNoseTool } from '../src/tool.js';
import { FoxNoseRetriever } from '../src/retriever.js';
import { createMockFluxClient, createMockEmbeddings } from './fixtures.js';

// ---------------------------------------------------------------------------
// Tool creation
// ---------------------------------------------------------------------------

describe('createFoxNoseTool — creation', () => {
  it('creates tool from retriever', () => {
    const retriever = new FoxNoseRetriever({
      client: createMockFluxClient() as any,
      folderPath: 'kb',
      pageContentField: 'body',
    });

    const tool = createFoxNoseTool({ retriever });
    expect(tool).toBeInstanceOf(DynamicStructuredTool);
  });

  it('creates tool from client config', () => {
    const tool = createFoxNoseTool({
      client: createMockFluxClient() as any,
      folderPath: 'kb',
      pageContentField: 'body',
    });
    expect(tool).toBeInstanceOf(DynamicStructuredTool);
  });

  it('uses custom name', () => {
    const tool = createFoxNoseTool({
      client: createMockFluxClient() as any,
      folderPath: 'kb',
      pageContentField: 'body',
      name: 'my_search',
    });
    expect(tool.name).toBe('my_search');
  });

  it('uses custom description', () => {
    const tool = createFoxNoseTool({
      client: createMockFluxClient() as any,
      folderPath: 'kb',
      pageContentField: 'body',
      description: 'Search my docs.',
    });
    expect(tool.description).toBe('Search my docs.');
  });

  it('uses default name and description', () => {
    const tool = createFoxNoseTool({
      client: createMockFluxClient() as any,
      folderPath: 'kb',
      pageContentField: 'body',
    });
    expect(tool.name).toBe('foxnose_search');
    expect(tool.description).toContain('FoxNose');
  });
});

// ---------------------------------------------------------------------------
// Tool invocation
// ---------------------------------------------------------------------------

describe('createFoxNoseTool — invocation', () => {
  it('returns string result from invoke', async () => {
    const tool = createFoxNoseTool({
      client: createMockFluxClient() as any,
      folderPath: 'articles',
      pageContentField: 'body',
    });

    const result = await tool.invoke({ query: 'test query' });
    expect(typeof result).toBe('string');
    expect(result).toContain('FoxNose is a serverless knowledge platform...');
  });

  it('forwards retriever kwargs', async () => {
    const client = createMockFluxClient();
    const tool = createFoxNoseTool({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'text',
      topK: 3,
    });

    await tool.invoke({ query: 'test query' });
    const body = client.search.mock.calls[0][1];
    expect(body.search_mode).toBe('text');
  });

  it('returns empty string for empty results', async () => {
    const client = createMockFluxClient({
      hybridSearch: vi.fn().mockResolvedValue({ results: [], limit: 5 }),
    });
    const tool = createFoxNoseTool({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
    });

    const result = await tool.invoke({ query: 'test query' });
    expect(typeof result).toBe('string');
    expect(result).toBe('');
  });

  it('uses custom document separator', async () => {
    const tool = createFoxNoseTool({
      client: createMockFluxClient() as any,
      folderPath: 'articles',
      pageContentField: 'body',
      documentSeparator: '\n---\n',
    });

    const result = await tool.invoke({ query: 'test query' });
    expect(result).toContain('\n---\n');
  });

  it('forwards embeddings and vectorField via inline config', async () => {
    const client = createMockFluxClient();
    const embeddings = createMockEmbeddings([0.1, 0.2, 0.3]);
    const tool = createFoxNoseTool({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'vector',
      embeddings: embeddings as any,
      vectorField: 'embedding',
    });

    await tool.invoke({ query: 'embed query' });
    expect(client.vectorFieldSearch).toHaveBeenCalledOnce();
    expect(embeddings.embedQuery).toHaveBeenCalledWith('embed query');
    const opts = client.vectorFieldSearch.mock.calls[0][1];
    expect(opts.field).toBe('embedding');
    expect(opts.query_vector).toEqual([0.1, 0.2, 0.3]);
  });

  it('forwards queryVector via inline config', async () => {
    const client = createMockFluxClient();
    const tool = createFoxNoseTool({
      client: client as any,
      folderPath: 'articles',
      pageContentField: 'body',
      searchMode: 'vector',
      queryVector: [0.5, 0.6],
      vectorField: 'embedding',
    });

    await tool.invoke({ query: 'test' });
    expect(client.vectorFieldSearch).toHaveBeenCalledOnce();
    const opts = client.vectorFieldSearch.mock.calls[0][1];
    expect(opts.query_vector).toEqual([0.5, 0.6]);
  });
});
