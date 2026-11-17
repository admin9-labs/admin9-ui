import {
  createNodeFromContent,
  flattenExtensions,
  getAttributesFromExtensions,
  getExtensionField,
  splitExtensions,
  type Editor,
  type ExtensionConfig,
  type Extensions,
} from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';

export function validateAdditionalExtensions(additional: Extensions, builtins: Extensions): Extensions {
  const base = flattenExtensions(builtins);
  const extras = flattenExtensions(additional);
  const names = new Set(base.map((extension) => extension.name));
  const rootAttributes = new Set(
    getAttributesFromExtensions(base)
      .filter((attribute) => attribute.type === 'doc')
      .map((attribute) => attribute.name)
  );
  const { nodeExtensions, markExtensions } = splitExtensions([...base, ...extras]);
  const extensions = [...nodeExtensions, ...markExtensions];

  extras.forEach((extension) => {
    if (names.has(extension.name)) throw new Error(`Duplicate extension name: ${extension.name}`);
    names.add(extension.name);
    if (extension.type !== 'extension') throw new Error(`Additional nodes and marks are not allowed: ${extension.name}`);
    const addGlobalAttributes = getExtensionField<ExtensionConfig['addGlobalAttributes']>(extension, 'addGlobalAttributes', {
      name: extension.name,
      options: extension.options,
      storage: extension.storage,
      extensions,
    });
    (addGlobalAttributes?.() ?? []).forEach((group) => {
      if (!Array.isArray(group.types) || group.types.length !== 1 || group.types[0] !== 'doc') {
        throw new Error(`Additional attributes may only target doc: ${extension.name}`);
      }
      Object.entries(group.attributes).forEach(([name, attribute]) => {
        if (rootAttributes.has(name)) throw new Error(`Duplicate doc attribute: ${name}`);
        if (typeof attribute?.validate !== 'function') throw new Error(`Doc attribute requires a validate function: ${name}`);
        rootAttributes.add(name);
      });
    });
  });
  return additional;
}

export function validatedDocumentAttributes(editor: Editor, input: unknown): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  ) {
    throw new Error('Document attributes must be a record');
  }
  const type = editor.schema.nodes.doc;
  const specs = type.spec.attrs ?? {};
  Reflect.ownKeys(input).forEach((name) => {
    if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(specs, name))
      throw new Error(`Unknown doc attribute: ${String(name)}`);
  });
  // Document metadata follows the same JSON snapshot boundary as modelValue.
  const attrs = JSON.parse(JSON.stringify(type.create(input as Record<string, unknown>).attrs)) as Record<string, unknown>;
  Object.entries(specs).forEach(([name, spec]) => {
    const value = attrs[name];
    if (typeof spec.validate === 'function') spec.validate(value);
    else if (typeof spec.validate === 'string') {
      const actual = value === null ? 'null' : typeof value;
      if (!spec.validate.split('|').includes(actual)) throw new Error(`Invalid doc attribute: ${name}`);
    }
  });
  return { ...attrs };
}

export function parseHTMLDocument(editor: Editor, html: string, attrs: unknown): ProseMirrorNode {
  const attributes = validatedDocumentAttributes(editor, attrs);
  const parsed = createNodeFromContent(html, editor.schema, {
    slice: false,
    parseOptions: editor.options.parseOptions,
  });
  if (!(parsed instanceof ProseMirrorNode)) throw new Error('Expected an HTML document');
  const doc = editor.schema.nodes.doc.create(attributes, parsed.content);
  doc.check();
  return doc;
}
