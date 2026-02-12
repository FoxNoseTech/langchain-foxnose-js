/**
 * Tests for createFoxNoseTool.
 */

import { describe, it, expect, vi } from 'vitest';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createFoxNoseTool } from '../src/tool.js';
import { FoxNoseRetriever } from '../src/retriever.js';
import { createMockFluxClient } from './fixtures.js';

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
      search: vi.fn().mockResolvedValue({ results: [], limit: 5 }),
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
});
