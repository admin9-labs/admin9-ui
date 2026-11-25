import { afterEach, describe, expect, it } from 'vitest';
import { Editor, Extension, Node, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { AllSelection, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import {
  canConvertTextBlock,
  convertSelectedTextBlocks,
  selectedTextBlocks,
} from '../src/components/tiptap-editor/text-blocks';

// Exercise conversion against a minimal schema with independently specified block attributes.
const BlockAttributes = Extension.create({
  name: 'testBlockAttributes',
  addGlobalAttributes: () => [
    {
      types: ['paragraph', 'heading'],
      attributes: {
        firstLineIndent: { default: null },
        lineHeight: { default: null },
        textAlign: { default: null },
      },
    },
  ],
});
const InlineImage = Node.create({
  name: 'inlineImage',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  renderHTML: () => ['img'],
});
const BlockImage = Node.create({
  name: 'blockImage',
  group: 'block',
  atom: true,
  renderHTML: () => ['img'],
});
const editors: Editor[] = [];
function mount(content: string | JSONContent) {
  const editor = new Editor({
    extensions: [StarterKit.configure({ trailingNode: false }), BlockAttributes, InlineImage, BlockImage, TableKit],
    content,
  });
  editors.push(editor);
  return editor;
}
function positions(editor: Editor, type: string) {
  const result: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === type) result.push(pos);
  });
  return result;
}
function convert(editor: Editor, type = 'heading', attrs: { level?: number } = { level: 2 }) {
  const { tr } = editor.state;
  const changed = convertSelectedTextBlocks(tr, editor.schema.nodes[type], attrs);
  if (changed) editor.view.dispatch(tr);
  editor.state.doc.check();
  return changed;
}
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

describe('selected text blocks', () => {
  it.each([false, true])('excludes the trailing block at its content start (reverse: %s)', (reverse) => {
    const editor = mount('<p>A</p><h3>B</h3>');
    editor.commands.setTextSelection(reverse ? { from: 4, to: 1 } : { from: 1, to: 4 });
    const before = editor.state.selection.toJSON();
    expect(selectedTextBlocks(editor.state).map(({ pos }) => pos)).toEqual([0]);
    expect(convert(editor)).toBe(true);
    expect(editor.state.doc.child(0).attrs.level).toBe(2);
    expect(editor.state.doc.child(1).type.name).toBe('heading');
    expect(editor.state.doc.child(1).attrs.level).toBe(3);
    expect(editor.state.selection.toJSON()).toEqual(before);
  });

  it('leaves an unselected following paragraph unchanged during conversion', () => {
    const editor = mount('<p>A</p><p>B</p>');
    editor.commands.setTextSelection({ from: 1, to: 4 });
    convert(editor);
    expect(editor.state.doc.toString()).toBe('doc(heading("A"), paragraph("B"))');
  });

  it('supports an empty paragraph cursor and a complete document selection', () => {
    const editor = mount('<p></p><p>B</p>');
    editor.commands.setTextSelection(1);
    expect(selectedTextBlocks(editor.state).map(({ pos }) => pos)).toEqual([0]);
    convert(editor);
    expect(editor.state.doc.firstChild?.type.name).toBe('heading');
    editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));
    expect(selectedTextBlocks(editor.state)).toHaveLength(2);
    convert(editor, 'paragraph', {});
    expect(editor.state.selection).toBeInstanceOf(AllSelection);
    expect(editor.state.doc.toString()).toBe('doc(paragraph, paragraph("B"))');
  });

  it('collects supported descendants of lists and quotes while excluding code and block media', () => {
    const editor = mount({
      type: 'doc',
      content: [
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
        { type: 'blockquote', content: [{ type: 'heading', attrs: { level: 3 } }] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'code' }] },
        { type: 'blockImage' },
        { type: 'horizontalRule' },
      ],
    });
    editor.commands.selectAll();
    expect(selectedTextBlocks(editor.state).map(({ node }) => node.type.name)).toEqual(['paragraph', 'heading']);
    convert(editor);
    expect(editor.state.doc.child(0).firstChild?.firstChild?.type.name).toBe('paragraph');
    expect(editor.state.doc.child(1).firstChild?.attrs.level).toBe(2);
    expect(editor.state.doc.child(2).type.name).toBe('heading');
    expect(editor.state.doc.child(3).type.name).toBe('blockImage');
    expect(editor.state.doc.child(4).type.name).toBe('horizontalRule');
  });

  it.each(['blockImage', 'horizontalRule'])('does nothing for an unsupported %s selection', (type) => {
    const editor = mount({ type: 'doc', content: [{ type }] });
    editor.commands.setNodeSelection(0);
    const { tr } = editor.state;
    expect(selectedTextBlocks(tr)).toEqual([]);
    expect(convertSelectedTextBlocks(tr, editor.schema.nodes.heading, { level: 2 })).toBe(false);
    expect(tr.steps).toHaveLength(0);
  });

  it.each(['paragraph', 'heading'])('preserves the inline image NodeSelection in an image-only %s', (type) => {
    const editor = mount({
      type: 'doc',
      content: [{ type, attrs: { firstLineIndent: '2em', level: 3 }, content: [{ type: 'inlineImage' }] }],
    });
    editor.commands.setNodeSelection(1);
    const before = editor.state.selection.toJSON();
    expect(selectedTextBlocks(editor.state).map(({ pos }) => pos)).toEqual([0]);
    convert(editor, type === 'paragraph' ? 'heading' : 'paragraph');
    expect(editor.state.doc.firstChild?.attrs.firstLineIndent).toBe('2em');
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.toJSON()).toEqual(before);
    expect((editor.state.selection as NodeSelection).node.type.name).toBe('inlineImage');
  });

  it('deduplicates overlapping selection ranges', () => {
    const editor = mount('<p>AB</p>');
    const selection = TextSelection.create(editor.state.doc, 1, 3);
    selection.ranges.push(selection.ranges[0]);
    expect(selectedTextBlocks({ doc: editor.state.doc, selection }).map(({ pos }) => pos)).toEqual([0]);
  });
});

describe('block conversion', () => {
  it.each(['paragraph', 'heading'])('converts a selected code block to %s and preserves undo/redo', (target) => {
    const editor = mount('<pre><code>first\nsecond</code></pre><p>untouched</p>');
    editor.commands.setNodeSelection(0);
    const original = editor.getJSON();
    expect(selectedTextBlocks(editor.state)).toEqual([]);
    expect(convert(editor, target, target === 'heading' ? { level: 2 } : {})).toBe(true);
    expect(editor.state.doc.firstChild?.type.name).toBe(target);
    expect(editor.state.doc.lastChild?.textContent).toBe('untouched');
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    const converted = editor.getJSON();
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(original);
    editor.commands.redo();
    expect(editor.getJSON()).toEqual(converted);
  });

  it('preserves each block formatting, inline content, and reverse selection through undo and redo', () => {
    const editor = mount({
      type: 'doc',
      content: [null, '0em', '2em'].map((firstLineIndent, index) => ({
        type: 'paragraph',
        attrs: { firstLineIndent, lineHeight: ['1', '1.5', '2'][index], textAlign: ['left', 'center', 'right'][index] },
        content: [{ type: 'text', text: String(index), marks: [{ type: 'bold' }] }, { type: 'inlineImage' }],
      })),
    });
    editor.commands.setTextSelection({ from: editor.state.doc.content.size - 1, to: 1 });
    const original = editor.getJSON();
    const selection = editor.state.selection.toJSON();
    convert(editor);
    editor.state.doc.forEach((node, _, index) => {
      expect(node.type.name).toBe('heading');
      expect(node.attrs).toEqual({ ...original.content?.[index].attrs, level: 2 });
      expect(node.toJSON().content).toEqual(original.content?.[index].content);
    });
    const converted = editor.getJSON();
    expect(editor.state.selection.toJSON()).toEqual(selection);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    expect(editor.state.selection.toJSON()).toEqual(selection);
    expect(editor.commands.redo()).toBe(true);
    expect(editor.getJSON()).toEqual(converted);
    convert(editor, 'paragraph', {});
    expect(editor.getJSON()).toEqual(original);
  });

  it('protects required list paragraphs, but converts allowed sibling blocks without lifting containers', () => {
    const editor = mount('<ul><li><p>A</p><p>B</p><blockquote><p>C</p></blockquote></li></ul><p>D</p>');
    editor.commands.setTextSelection(3);
    const [first] = selectedTextBlocks(editor.state);
    expect(canConvertTextBlock(editor.state.doc, first, editor.schema.nodes.heading)).toBe(false);
    expect(convert(editor)).toBe(false);
    editor.commands.selectAll();
    convert(editor);
    expect(editor.state.doc.toString()).toBe(
      'doc(bulletList(listItem(paragraph("A"), heading("B"), blockquote(heading("C")))), heading("D"))'
    );
  });

  it.each([false, true])('converts only rectangular cells, including empty paragraphs (reverse: %s)', (reverse) => {
    const editor = mount(
      '<table><tr><td><p></p></td><td><p>B</p></td></tr><tr><td><p>C</p></td><td><p>D</p></td></tr></table>'
    );
    const cells = positions(editor, 'tableCell');
    editor.view.dispatch(
      editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[reverse ? 2 : 0], cells[reverse ? 0 : 2]))
    );
    const before = editor.state.selection.toJSON();
    expect(selectedTextBlocks(editor.state)).toHaveLength(2);
    convert(editor);
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(editor.state.selection.toJSON()).toEqual(before);
    expect(positions(editor, 'heading')).toEqual([cells[0] + 1, cells[2] + 1]);
    expect(positions(editor, 'paragraph')).toEqual([cells[1] + 1, cells[3] + 1]);
  });

  it('preserves a NodeSelection of the converted block itself', () => {
    const editor = mount('<p>A</p>');
    editor.commands.setNodeSelection(0);
    convert(editor);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(0);
    expect((editor.state.selection as NodeSelection).node.type.name).toBe('heading');
  });

  it('uses the current transaction positions after earlier chained edits', () => {
    const editor = mount('<p>A</p><p>B</p>');
    editor.commands.setTextSelection(4);
    const tr = editor.state.tr.insertText('prefix', 1);
    const before = tr.selection.toJSON();
    expect(convertSelectedTextBlocks(tr, editor.schema.nodes.heading, { level: 3 })).toBe(true);
    expect(tr.doc.toString()).toBe('doc(paragraph("prefixA"), heading("B"))');
    expect(tr.selection.toJSON()).toEqual(before);
    expect(editor.state.doc.toString()).toBe('doc(paragraph("A"), paragraph("B"))');
  });

  it('rejects unsupported target types and adds no steps for an unchanged block', () => {
    const editor = mount('<h2>A</h2>');
    expect(convert(editor, 'codeBlock')).toBe(false);
    expect(convert(editor)).toBe(false);
  });
});
