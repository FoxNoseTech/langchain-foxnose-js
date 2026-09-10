/**
 * Tests for mapDocumentToData — the Document -> FoxNose `data` mapper.
 */

import { describe, it, expect } from 'vitest';
import { Document } from '@langchain/core/documents';
import { mapDocumentToData, SYS_METADATA_KEYS } from '../src/document-writer.js';

const doc = (content: string, metadata: Record<string, unknown> = {}) =>
  new Document({ pageContent: content, metadata });

describe('mapDocumentToData', () => {
  it('puts pageContent in the named field and copies metadata', () => {
    expect(mapDocumentToData(doc('hello', { title: 'T' }), { pageContentField: 'body' })).toEqual({
      body: 'hello',
      title: 'T',
    });
  });

  it('requires a content strategy', () => {
    expect(() => mapDocumentToData(doc('x'), {})).toThrow(/pageContentField/);
  });

  it('rejects both whitelist and blacklist', () => {
    expect(() =>
      mapDocumentToData(doc('x'), {
        pageContentField: 'body',
        metadataFields: ['a'],
        excludeMetadataFields: ['b'],
      }),
    ).toThrow(/mutually exclusive/);
  });

  it('strips the read path’s _sys keys by default', () => {
    const metadata = Object.fromEntries([...SYS_METADATA_KEYS].map((k) => [k, 'v']));
    expect(mapDocumentToData(doc('x', { ...metadata, title: 'T' }), { pageContentField: 'body' }))
      .toEqual({ body: 'x', title: 'T' });
  });

  it('writes the _sys keys when asked', () => {
    const data = mapDocumentToData(doc('x', { key: 'k', title: 'T' }), {
      pageContentField: 'body',
      includeSysMetadata: true,
    });
    expect(data).toEqual({ body: 'x', key: 'k', title: 'T' });
  });

  it('honours the whitelist', () => {
    const data = mapDocumentToData(doc('x', { a: 1, b: 2 }), {
      pageContentField: 'body',
      metadataFields: ['a'],
    });
    expect(data).toEqual({ body: 'x', a: 1 });
  });

  it('honours the blacklist', () => {
    const data = mapDocumentToData(doc('x', { a: 1, b: 2 }), {
      pageContentField: 'body',
      excludeMetadataFields: ['a'],
    });
    expect(data).toEqual({ body: 'x', b: 2 });
  });

  it('refuses a metadata key that would overwrite the content field', () => {
    expect(() =>
      mapDocumentToData(doc('x', { body: 'clash' }), { pageContentField: 'body' }),
    ).toThrow(/collides/);
  });

  describe('reserved keys and custom mappers', () => {
    // The two modes deliberately differ, so both are pinned here: a change to
    // either one should have to state itself.
    it('keeps a reserved key out of the mapping it builds', () => {
      const data = mapDocumentToData(doc('x', { source_id: 's1', title: 'T' }), {
        pageContentField: 'body',
        reservedMetadataKeys: ['source_id'],
      });
      expect(data).toEqual({ body: 'x', title: 'T' });
    });

    it('lets a custom mapper own its output', () => {
      // Silently deleting keys from a mapper's return value would make a
      // schema with its own identifier field impossible to write.
      const data = mapDocumentToData(doc('x', { source_id: 's1' }), {
        documentMapper: (d) => ({ body: d.pageContent, ...d.metadata }),
        reservedMetadataKeys: ['source_id'],
      });
      expect(data).toEqual({ body: 'x', source_id: 's1' });
    });

    it('writes nothing extra when the mapper omits the id', () => {
      const data = mapDocumentToData(doc('x', { source_id: 's1' }), {
        documentMapper: (d) => ({ body: d.pageContent }),
        reservedMetadataKeys: ['source_id'],
      });
      expect(data).toEqual({ body: 'x' });
    });
  });
});
