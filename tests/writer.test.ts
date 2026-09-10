/**
 * Tests for FoxNoseWriter.
 */

import { describe, it, expect, vi } from 'vitest';
import { Document } from '@langchain/core/documents';
import { FoxNoseWriter, FoxNoseBatchWriteError } from '../src/writer.js';
import { createMockFluxClient } from './fixtures.js';

const doc = (content: string, metadata: Record<string, unknown> = {}) =>
  new Document({ pageContent: content, metadata });

const writer = (client: unknown, extra: Record<string, unknown> = {}) =>
  new FoxNoseWriter({
    client: client as never,
    collectionPath: 'kb',
    pageContentField: 'body',
    ...extra,
  });

describe('FoxNoseWriter — construction', () => {
  it('requires a client', () => {
    expect(
      () =>
        new FoxNoseWriter({
          client: undefined as never,
          collectionPath: 'kb',
          pageContentField: 'body',
        }),
    ).toThrow(/'client'/);
  });

  it('requires exactly one content strategy', () => {
    const client = createMockFluxClient();
    expect(() => new FoxNoseWriter({ client: client as never, collectionPath: 'kb' })).toThrow(
      /Exactly one content mapping strategy/,
    );
    expect(() =>
      writer(client, { documentMapper: () => ({ body: 'x' }) }),
    ).toThrow(/Only one content mapping strategy/);
  });

  it('rejects both metadata whitelist and blacklist', () => {
    expect(() =>
      writer(createMockFluxClient(), { metadataFields: ['a'], excludeMetadataFields: ['b'] }),
    ).toThrow(/mutually exclusive/);
  });

  it.each(['', '   '])('rejects %p as an externalIdKey', (key) => {
    // Neither absent nor usable: allowing it would let two code paths read the
    // same field differently.
    expect(() => writer(createMockFluxClient(), { externalIdKey: key })).toThrow(/non-empty/);
  });
});

describe('FoxNoseWriter — addDocuments', () => {
  it('writes each document sequentially and returns its key', async () => {
    const client = createMockFluxClient({
      createResource: vi
        .fn()
        .mockResolvedValueOnce({ resource_key: 'k1' })
        .mockResolvedValueOnce({ resource_key: 'k2' }),
    });

    const keys = await writer(client).addDocuments([doc('one'), doc('two')]);

    expect(keys).toEqual(['k1', 'k2']);
    expect(client.createResource).toHaveBeenCalledTimes(2);
    expect(client.createResource.mock.calls[0][0]).toBe('kb');
    expect(client.createResource.mock.calls[0][1]).toEqual({ body: 'one' });
  });

  it('sends the external id as the resource key, not inside data', async () => {
    const client = createMockFluxClient();
    await writer(client, { externalIdKey: 'source_id' }).addDocuments([
      doc('one', { source_id: 'docs/a', title: 'A' }),
    ]);

    const [, data, options] = client.createResource.mock.calls[0];
    expect(data).toEqual({ body: 'one', title: 'A' });
    expect(options).toEqual({ key: 'docs/a' });
  });

  it('writes without a key when the document lacks the external id', async () => {
    const client = createMockFluxClient();
    await writer(client, { externalIdKey: 'source_id' }).addDocuments([doc('one')]);
    expect(client.createResource.mock.calls[0][2]).toBeUndefined();
  });

  it.each([[true], [{ a: 1 }], [['x']]])(
    'rejects %p as an external id before writing anything',
    async (value) => {
      const client = createMockFluxClient();
      await expect(
        writer(client, { externalIdKey: 'source_id' }).addDocuments([
          doc('one', { source_id: value }),
        ]),
      ).rejects.toThrow(TypeError);
      expect(client.createResource).not.toHaveBeenCalled();
    },
  );

  it('writes nothing at all when a later document cannot be mapped', async () => {
    // The whole batch is mapped up front on purpose: a local error halfway
    // through would leave earlier writes with no record of them.
    const client = createMockFluxClient();
    await expect(
      writer(client, { externalIdKey: 'source_id' }).addDocuments([
        doc('fine', { source_id: 'ok' }),
        doc('bad', { source_id: { nope: true } }),
      ]),
    ).rejects.toThrow(TypeError);
    expect(client.createResource).not.toHaveBeenCalled();
  });
});

describe('FoxNoseWriter — partial failure', () => {
  it('reports written, unknown and unattempted ranges', async () => {
    const boom = new Error('upstream exploded');
    const client = createMockFluxClient({
      createResource: vi
        .fn()
        .mockResolvedValueOnce({ resource_key: 'k0' })
        .mockRejectedValueOnce(boom),
    });

    let caught: FoxNoseBatchWriteError | undefined;
    try {
      await writer(client).addDocuments([doc('a'), doc('b'), doc('c'), doc('d')]);
    } catch (error) {
      caught = error as FoxNoseBatchWriteError;
    }

    expect(caught).toBeInstanceOf(FoxNoseBatchWriteError);
    expect(caught!.writtenKeys).toEqual(['k0']);
    expect(caught!.failedIndex).toBe(1);
    expect(caught!.pendingIndexes).toEqual([2, 3]);
    expect(caught!.total).toBe(4);
    expect(caught!.cause).toBe(boom);
    // Documents after the failure must not be attempted.
    expect(client.createResource).toHaveBeenCalledTimes(2);
  });

  it('wraps a malformed success response rather than leaking it', async () => {
    // The resource may well have been created, so this must arrive as a batch
    // error with the index, not as a bare undefined-property failure.
    const client = createMockFluxClient({
      createResource: vi.fn().mockResolvedValue({ unexpected: true }),
    });

    await expect(writer(client).addDocuments([doc('a')])).rejects.toBeInstanceOf(
      FoxNoseBatchWriteError,
    );
  });
});

describe('FoxNoseWriter — updateDocument', () => {
  it('replaces by internal resource key and returns the revision', async () => {
    const client = createMockFluxClient({
      updateResource: vi.fn().mockResolvedValue({ revision: 'rev_9' }),
    });

    const revision = await writer(client).updateDocument('k1', doc('updated', { title: 'T' }));

    expect(revision).toBe('rev_9');
    expect(client.updateResource).toHaveBeenCalledWith('kb', 'k1', {
      body: 'updated',
      title: 'T',
    });
  });

  it('returns undefined when the API reports no revision', async () => {
    const client = createMockFluxClient({ updateResource: vi.fn().mockResolvedValue({}) });
    expect(await writer(client).updateDocument('k1', doc('x'))).toBeUndefined();
  });
});
