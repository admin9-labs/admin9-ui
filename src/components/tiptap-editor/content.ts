import type { Editor, JSONContent } from '@tiptap/core';
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  isSafeMediaUrl,
  normalizeAudioWidth,
  normalizeBlockWidth,
  normalizeInlineSize,
  normalizeMediaAlign,
} from './media-attributes';
import type { TiptapDocument } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function checkShape(value: unknown, ancestors = new Set<unknown>()): asserts value is JSONContent {
  if (!isRecord(value) || typeof value.type !== 'string' || ancestors.has(value)) {
    throw new Error('Expected an acyclic Tiptap node.');
  }
  if (value.attrs !== undefined && !isRecord(value.attrs)) throw new Error('Invalid node attributes.');
  if (value.text !== undefined && typeof value.text !== 'string') throw new Error('Invalid node text.');
  if ((value.type === 'text' && value.content !== undefined) || (value.type !== 'text' && value.text !== undefined)) {
    throw new Error('Text and child content cannot be interchanged.');
  }
  if (value.marks !== undefined) {
    if (!Array.isArray(value.marks)) throw new Error('Invalid node marks.');
    value.marks.forEach((mark) => {
      if (!isRecord(mark) || typeof mark.type !== 'string' || (mark.attrs !== undefined && !isRecord(mark.attrs))) {
        throw new Error('Invalid mark.');
      }
    });
  }
  if (value.content !== undefined) {
    if (!Array.isArray(value.content)) throw new Error('Invalid node content.');
    ancestors.add(value);
    value.content.forEach((child) => checkShape(child, ancestors));
    ancestors.delete(value);
  }
}

const positiveInteger = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;

/** JSON bypasses parseHTML; normalize before either a NodeView or serializer sees its attributes. */
export function parseTiptapDocument(value: unknown, editor: Editor): ProseMirrorNode {
  checkShape(value);
  if (value.type !== 'doc' || !Array.isArray(value.content)) throw new Error('Expected a complete doc document.');
  const source = editor.schema.nodeFromJSON(value);
  // Accept an empty root as an empty editor, while still checking the root attributes and marks.
  const document = source.childCount ? source : editor.schema.topNodeType.createAndFill(source.attrs, undefined, source.marks);
  if (!document) throw new Error('Invalid empty document.');
  document.check();
  const link = editor.extensionManager.extensions.find((extension) => extension.name === 'link');

  const normalizeNode = (node: ProseMirrorNode): ProseMirrorNode | null => {
    const { name } = node.type;
    const attrs = { ...node.attrs };
    if (['blockImage', 'inlineImage', 'video', 'audio'].includes(name)) {
      if (!isSafeMediaUrl(attrs.src)) return null;
      attrs.title = typeof attrs.title === 'string' ? attrs.title : null;
      if (name === 'blockImage' || name === 'inlineImage') attrs.alt = typeof attrs.alt === 'string' ? attrs.alt : '';
      if (name === 'inlineImage') attrs.size = normalizeInlineSize(attrs.size);
      else {
        attrs.align = normalizeMediaAlign(attrs.align);
        attrs.width =
          name === 'audio'
            ? normalizeAudioWidth(attrs.width)
            : normalizeBlockWidth(attrs.width, name === 'video' ? '100%' : 'natural');
      }
    }
    if (name === 'paragraph' || name === 'heading') {
      attrs.textAlign = ['left', 'center', 'right'].includes(attrs.textAlign) ? attrs.textAlign : null;
    }
    if (name === 'heading') attrs.level = [1, 2, 3, 4, 5, 6].includes(attrs.level) ? attrs.level : 1;
    if (name === 'orderedList') {
      attrs.start = typeof attrs.start === 'number' && Number.isSafeInteger(attrs.start) ? attrs.start : 1;
      attrs.type = ['1', 'a', 'A', 'i', 'I'].includes(attrs.type) ? attrs.type : null;
    }
    if (name === 'codeBlock') attrs.language = typeof attrs.language === 'string' ? attrs.language : null;
    if (name === 'tableCell' || name === 'tableHeader') {
      attrs.colspan = positiveInteger(attrs.colspan, 1);
      attrs.rowspan = positiveInteger(attrs.rowspan, 1);
      attrs.colwidth =
        Array.isArray(attrs.colwidth) &&
        attrs.colwidth.length === attrs.colspan &&
        attrs.colwidth.every((width: unknown) => typeof width === 'number' && Number.isSafeInteger(width) && width >= 0)
          ? [...attrs.colwidth]
          : null;
      attrs.align = ['left', 'center', 'right'].includes(attrs.align) ? attrs.align : null;
    }
    const marks = node.marks.flatMap((mark) => {
      if (mark.type.name !== 'link') return [mark];
      const { href } = mark.attrs;
      // The component configures Tiptap's default isAllowedUri validator, also used by HTML parsing.
      if (typeof href !== 'string' || !href || !link?.options.isAllowedUri(href, { protocols: link.options.protocols }))
        return [];
      const linkAttrs = { ...mark.attrs };
      const defaults = mark.type.create().attrs;
      ['target', 'rel', 'class', 'title'].forEach((key) => {
        if (linkAttrs[key] !== null && typeof linkAttrs[key] !== 'string') linkAttrs[key] = defaults[key];
      });
      return [mark.type.create(linkAttrs)];
    });
    if (node.isText) return node.mark(marks);
    const children: ProseMirrorNode[] = [];
    node.forEach((child) => {
      const normalized = normalizeNode(child);
      if (normalized) children.push(normalized);
    });
    // Removing unsafe media can leave an otherwise valid block empty.
    const normalized = node.type.createAndFill(attrs, Fragment.fromArray(children), marks);
    if (!normalized) throw new Error('Content could not be normalized.');
    return normalized;
  };

  const normalized = normalizeNode(document);
  if (!normalized) throw new Error('Invalid document.');
  normalized.check();
  return normalized;
}

export function getDocumentSnapshot(document: ProseMirrorNode): TiptapDocument {
  return JSON.parse(JSON.stringify(document.toJSON())) as TiptapDocument;
}
