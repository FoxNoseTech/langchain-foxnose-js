/**
 * Verify folderPath → collectionPath migration across all three public
 * surfaces (Retriever, Loader, Tool).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetWarned } from '../src/_deprecation.js';
import { FoxNoseLoader } from '../src/loader.js';
import { FoxNoseRetriever } from '../src/retriever.js';
import { createFoxNoseTool } from '../src/tool.js';
import { createMockFluxClient } from './fixtures.js';

describe('collectionPath migration', () => {
  beforeEach(() => {
    _resetWarned();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetWarned();
  });

  // ----- FoxNoseRetriever -----

  it('Retriever accepts collectionPath', () => {
    const r = new FoxNoseRetriever({
      client: createMockFluxClient() as any,
      collectionPath: 'kb',
      pageContentField: 'body',
    });
    expect(r).toBeDefined();
  });

  it('Retriever accepts legacy folderPath and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new FoxNoseRetriever({
      client: createMockFluxClient() as any,
      folderPath: 'kb',
      pageContentField: 'body',
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('folderPath');
    expect(warn.mock.calls[0][0]).toContain('collectionPath');
  });

  it('Retriever rejects both folderPath and collectionPath', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          collectionPath: 'a',
          folderPath: 'b',
          pageContentField: 'body',
        } as any),
    ).toThrow(/not both/i);
  });

  it('Retriever requires one of the two', () => {
    expect(
      () =>
        new FoxNoseRetriever({
          client: createMockFluxClient() as any,
          pageContentField: 'body',
        } as any),
    ).toThrow(/'collectionPath' is required/);
  });

  // ----- FoxNoseLoader -----

  it('Loader accepts collectionPath', () => {
    const loader = new FoxNoseLoader({
      client: createMockFluxClient() as any,
      collectionPath: 'kb',
      pageContentField: 'body',
    });
    expect(loader).toBeDefined();
  });

  it('Loader accepts legacy folderPath and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new FoxNoseLoader({
      client: createMockFluxClient() as any,
      folderPath: 'kb',
      pageContentField: 'body',
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('folderPath');
    expect(warn.mock.calls[0][0]).toContain('collectionPath');
  });

  it('Loader rejects both kwargs', () => {
    expect(
      () =>
        new FoxNoseLoader({
          client: createMockFluxClient() as any,
          collectionPath: 'a',
          folderPath: 'b',
          pageContentField: 'body',
        } as any),
    ).toThrow(/not both/i);
  });

  it('Loader requires one of the two', () => {
    expect(
      () =>
        new FoxNoseLoader({
          client: createMockFluxClient() as any,
          pageContentField: 'body',
        } as any),
    ).toThrow(/'collectionPath' is required/);
  });

  // ----- createFoxNoseTool -----

  it('Tool accepts collectionPath', () => {
    const tool = createFoxNoseTool({
      client: createMockFluxClient() as any,
      collectionPath: 'kb',
      pageContentField: 'body',
    });
    expect(tool).toBeDefined();
  });

  it('Tool accepts legacy folderPath and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createFoxNoseTool({
      client: createMockFluxClient() as any,
      folderPath: 'kb',
      pageContentField: 'body',
    } as any);
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toContain('folderPath');
  });

  it('Tool rejects both kwargs', () => {
    expect(() =>
      createFoxNoseTool({
        client: createMockFluxClient() as any,
        collectionPath: 'a',
        folderPath: 'b',
        pageContentField: 'body',
      } as any),
    ).toThrow(/not both/i);
  });

  // ----- one-shot semantics -----

  it('Deprecation warning fires once per process per old name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new FoxNoseRetriever({
      client: createMockFluxClient() as any,
      folderPath: 'kb',
      pageContentField: 'body',
    });
    new FoxNoseLoader({
      client: createMockFluxClient() as any,
      folderPath: 'kb2',
      pageContentField: 'body',
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
