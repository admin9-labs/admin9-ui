import { afterEach, describe, expect, it } from 'vitest';
import { Editor, Extension, Mark, Node, type Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { parseTiptapDocument } from '../src/components/tiptap-editor/content';
import {
  parseHTMLDocument,
  validateAdditionalExtensions,
  validatedDocumentAttributes,
} from '../src/components/tiptap-editor/application-extensions';

const validate = (value: unknown) => {
  if (typeof value !== 'string') throw new Error('Expected string');
};
const root = Extension.create({
  name: 'rootMetadata',
  addGlobalAttributes() {
    return [{ types: ['doc'], attributes: { label: { default: 'default', validate } } }];
  },
});
const editors: Editor[] = [];
const editorWith = (extensions: Extensions = [root]) => {
  const editor = new Editor({ extensions: [StarterKit, ...extensions] });
  editors.push(editor);
  return editor;
};
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

describe('additional application extensions', () => {
  it('preserves decoration extensions and recursively checks names', () => {
    const extra = [Extension.create({ name: 'decorations' }), root];
    expect(validateAdditionalExtensions(extra, [StarterKit])).toBe(extra);
    const nested = Extension.create({ name: 'bundle', addExtensions: () => [Extension.create({ name: 'paragraph' })] });
    expect(() => validateAdditionalExtensions([nested], [StarterKit])).toThrow('Duplicate extension');
    expect(() => validateAdditionalExtensions([root, root], [StarterKit])).toThrow('Duplicate extension');
  });

  it.each([Node.create({ name: 'extraNode' }), Mark.create({ name: 'extraMark' })])('rejects schema additions', (extra) => {
    expect(() => validateAdditionalExtensions([extra], [StarterKit])).toThrow('nodes and marks');
  });

  it('rejects nested nodes and duplicate extra root attributes', () => {
    const nested = Extension.create({ name: 'bundle', addExtensions: () => [Node.create({ name: 'extra' })] });
    expect(() => validateAdditionalExtensions([nested], [StarterKit])).toThrow('nodes and marks');
    expect(() => validateAdditionalExtensions([root, root.extend({ name: 'other' })], [StarterKit])).toThrow(
      'Duplicate doc attribute'
    );
    expect(() => validateAdditionalExtensions([root], [StarterKit, root.extend({ name: 'builtinRoot' })])).toThrow(
      'Duplicate doc attribute'
    );
  });

  it.each([['paragraph'], ['doc', 'paragraph'], '*', 'nodes', 'marks', []])('rejects attribute targets %j', (types) => {
    const extra = Extension.create({
      name: 'badTarget',
      addGlobalAttributes: () => [{ types: types as ['doc'], attributes: { label: { validate } } }],
    });
    expect(() => validateAdditionalExtensions([extra], [StarterKit])).toThrow('only target doc');
  });

  it.each([undefined, 'string'])('requires a runtime validator', (validator) => {
    const extra = Extension.create({
      name: 'badValidator',
      addGlobalAttributes: () => [{ types: ['doc'], attributes: { label: { validate: validator } } }],
    });
    expect(() => validateAdditionalExtensions([extra], [StarterKit])).toThrow('validate function');
  });

  it('resolves inherited fields with options, storage, parent and schema extension context', () => {
    const inherited = root.extend({
      name: 'inherited',
      addOptions: () => ({ target: 'doc' }),
      addStorage: () => ({ fallback: 'stored' }),
      addGlobalAttributes() {
        expect(this.name).toBe('inherited');
        expect(this.extensions.some((extension) => extension.name === 'doc')).toBe(true);
        expect(this.parent?.()).toHaveLength(1);
        return [{ types: [this.options.target], attributes: { context: { default: this.storage.fallback, validate } } }];
      },
    });
    expect(validateAdditionalExtensions([inherited], [StarterKit])).toEqual([inherited]);
  });
});

describe('document attributes and HTML', () => {
  it('returns full defaults and validates supplied and default values without checking empty content', () => {
    const editor = editorWith();
    expect(validatedDocumentAttributes(editor, {})).toEqual({ label: 'default' });
    expect(validatedDocumentAttributes(editor, { label: 'custom' })).toEqual({ label: 'custom' });
    expect(() => validatedDocumentAttributes(editor, { label: 1 })).toThrow('Expected string');
    expect(() => validatedDocumentAttributes(editor, { unknown: 1 })).toThrow('Unknown doc attribute');
    expect(() =>
      validatedDocumentAttributes(
        editorWith([
          root.extend({ addGlobalAttributes: () => [{ types: ['doc'], attributes: { label: { default: 1, validate } } }] }),
        ]),
        {}
      )
    ).toThrow('Expected string');
  });

  it.each([null, undefined, [], 'text', 1, new Date()])('rejects nonrecords %j', (input) => {
    expect(() => validatedDocumentAttributes(editorWith(), input)).toThrow('must be a record');
  });

  it('supports schema string validators and null prototype input', () => {
    const typed = root.extend({
      addGlobalAttributes: () => [{ types: ['doc'], attributes: { label: { default: null, validate: 'string|null' } } }],
    });
    const editor = editorWith([typed]);
    expect(validatedDocumentAttributes(editor, Object.create(null))).toEqual({ label: null });
    expect(() => validatedDocumentAttributes(editor, { label: false })).toThrow('Invalid doc attribute');
  });

  it('parses a complete document with validated root attrs without mutating the editor', () => {
    const editor = editorWith();
    const before = editor.getJSON();
    const doc = parseHTMLDocument(editor, '<h2>Hello</h2><p>World <strong>bold</strong></p>', { label: 'parsed' });
    expect(doc.type.name).toBe('doc');
    expect(doc.attrs).toEqual({ label: 'parsed' });
    expect(doc.childCount).toBe(2);
    expect(doc.firstChild?.type.name).toBe('heading');
    expect(() => doc.check()).not.toThrow();
    expect(editor.getJSON()).toEqual(before);
    expect(parseHTMLDocument(editor, '', {}).attrs).toEqual({ label: 'default' });
    expect(() => parseHTMLDocument(editor, '<p>ok</p>', { label: false })).toThrow('Expected string');
  });
  it('detaches nested input metadata and object-valued schema defaults in HTML and JSON', () => {
    const defaults = { title: 'Default' };
    const extra = Extension.create({
      name: 'nestedMetadata',
      addGlobalAttributes() {
        return [
          {
            types: ['doc'],
            attributes: {
              meta: {
                default: defaults,
                validate: (value: unknown) => {
                  if (!value || typeof value !== 'object' || typeof (value as { title: unknown }).title !== 'string') {
                    throw new Error('Invalid meta');
                  }
                },
              },
            },
          },
        ];
      },
    });
    const editor = editorWith([extra]);
    const input = { meta: { title: 'Old' } };
    const html = parseHTMLDocument(editor, '<p>Body</p>', input);
    const json = parseTiptapDocument({ type: 'doc', attrs: input, content: [{ type: 'paragraph' }] }, editor);
    const initial = parseHTMLDocument(editor, '<p>Body</p>', {});
    input.meta.title = 'Changed';
    defaults.title = 'Changed default';
    expect(html.attrs.meta).toEqual({ title: 'Old' });
    expect(json.attrs.meta).toEqual({ title: 'Old' });
    expect(initial.attrs.meta).toEqual({ title: 'Default' });
    (input.meta as { title: unknown }).title = 42;
    expect(() => parseHTMLDocument(editor, '<p>Body</p>', input)).toThrow('Invalid meta');
    expect(html.attrs.meta).toEqual({ title: 'Old' });
  });
});
