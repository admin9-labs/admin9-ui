import { afterEach, describe, expect, it } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { parseHTMLDocument } from '../src/components/tiptap-editor/application-extensions';
import { getDocumentSnapshot, parseTiptapDocument } from '../src/components/tiptap-editor/content';
import { Audio, BlockImage, Video } from '../src/components/tiptap-editor/media-node';
import { cleanPastedHTML } from '../src/components/tiptap-editor/paste';
import { TextFormat } from '../src/components/tiptap-editor/text-format';

const editors: Editor[] = [];
function mount(content: string | JSONContent = '') {
  const editor = new Editor({
    extensions: [StarterKit.configure({ trailingNode: false }), TextFormat, TableKit, BlockImage, Video, Audio],
    content,
    editorProps: { transformPastedHTML: (html) => cleanPastedHTML(html).html },
  });
  editors.push(editor);
  return editor;
}
const tags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const block = (tag: string, attrs: Record<string, unknown> = {}): JSONContent => ({
  type: tag === 'p' ? 'paragraph' : 'heading',
  attrs: { ...(tag === 'p' ? {} : { level: Number(tag.slice(1)) }), ...attrs },
  content: [{ type: 'text', text: 'AB' }],
});
function enter(editor: Editor, position: number) {
  editor.commands.setTextSelection(position);
  editor.view.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

describe('first line indent content compatibility', () => {
  it.each(tags)('normalizes and round trips HTML and JSON for %s', (tag) => {
    const editor = mount();
    const cases = [
      ['0', '0em'],
      ['0px', '0em'],
      ['0em', '0em'],
      ['2em', '2em'],
      ['9em', null],
      ['-2em', null],
      ['var(--indent)', null],
    ] as const;
    cases.forEach(([input, expected]) => {
      const html = parseHTMLDocument(editor, `<${tag} style="text-indent:${input}">AB</${tag}>`, {});
      const json = parseTiptapDocument({ type: 'doc', content: [block(tag, { firstLineIndent: input })] }, editor);
      expect(html.firstChild?.attrs.firstLineIndent).toBe(expected);
      expect(html.toJSON()).toEqual(json.toJSON());
      editor.commands.setContent(json.toJSON());
      const output = editor.getHTML();
      if (expected === null) expect(output).not.toContain('text-indent');
      else expect(output).toContain(`text-indent: ${expected}`);
      expect(parseHTMLDocument(editor, output, {}).toJSON()).toEqual(getDocumentSnapshot(editor.state.doc));
    });
    [0, 2, {}, [], true].forEach((input) => {
      const normalized = parseTiptapDocument({ type: 'doc', content: [block(tag, { firstLineIndent: input })] }, editor);
      expect(normalized.firstChild?.attrs.firstLineIndent).toBeNull();
    });
  });

  it('accepts old missing/null attributes without changing content and preserves explicit zero separately', () => {
    const editor = mount();
    const content = tags.flatMap((tag) => [
      block(tag),
      block(tag, { firstLineIndent: null }),
      block(tag, { firstLineIndent: '0em' }),
    ]);
    const input = { type: 'doc', content };
    const before = JSON.stringify(input);
    const normalized = parseTiptapDocument(input, editor);
    expect(JSON.stringify(input)).toBe(before);
    normalized.forEach((node, _offset, index) => {
      expect(node.attrs.firstLineIndent).toBe(index % 3 === 2 ? '0em' : null);
      expect(node.textContent).toBe('AB');
    });
    expect(parseTiptapDocument(getDocumentSnapshot(normalized), editor).eq(normalized)).toBe(true);
  });

  it('serializes zero aliases canonically even when a trusted transaction bypasses import normalization', () => {
    const editor = mount('<h6>AB</h6><p>CD</p>');
    editor.view.dispatch(editor.state.tr.setNodeMarkup(0, undefined, { level: 6, firstLineIndent: '0px' }));
    expect(editor.getHTML()).toContain('text-indent: 0em');
    expect(editor.getHTML()).not.toContain('text-indent: 0px');
  });

  it('retains nested text block indents without adding attributes to containers or excluded blocks', () => {
    const editor = mount(
      '<ul><li><p style="text-indent:0em">List</p><h4 style="text-indent:2em">Heading</h4></li></ul>' +
        '<blockquote><h5 style="text-indent:2em">Quote</h5></blockquote>' +
        '<table><tr><th><p style="text-indent:0em">Header</p></th><td><h6 style="text-indent:2em">Cell</h6></td></tr></table>' +
        '<pre style="text-indent:2em"><code>Code</code></pre><hr style="text-indent:2em">' +
        '<img src="/image.png" data-display="block" style="text-indent:2em">' +
        '<video src="/video.mp4" style="text-indent:2em"></video><audio src="/audio.mp3" style="text-indent:2em"></audio>'
    );
    const values: unknown[] = [];
    editor.state.doc.descendants((node) => {
      if (['paragraph', 'heading'].includes(node.type.name)) values.push(node.attrs.firstLineIndent);
      else expect(node.attrs).not.toHaveProperty('firstLineIndent');
    });
    expect(values).toEqual(['0em', '2em', '2em', '0em', '2em']);
    expect(parseTiptapDocument(editor.getJSON(), editor).toJSON()).toEqual(editor.getJSON());
    expect(mount(editor.getHTML()).getJSON()).toEqual(editor.getJSON());
  });

  it('strictly imports all heading levels and nested paragraphs with normalized indent', () => {
    const editor = mount();
    const headings = tags.map((tag) => `<${tag} style="text-indent:2em">${tag}</${tag}>`).join('');
    const html = `${headings}<blockquote><p style="text-indent:0px">Nested</p><p style="text-indent:9em">Invalid indent</p></blockquote>`;
    expect(editor.commands.insertContentAt(0, html, { errorOnInvalidContent: true })).toBe(true);
    tags.forEach((_tag, index) => expect(editor.state.doc.child(index).attrs.firstLineIndent).toBe('2em'));
    const quote = editor.state.doc.child(7);
    expect(quote.child(0).attrs.firstLineIndent).toBe('0em');
    expect(quote.child(1).attrs.firstLineIndent).toBeNull();
  });

  it('uses the real paste parser for headings and nested blocks and matches JSON normalization', () => {
    const editor = mount();
    expect(
      editor.view.pasteHTML(
        '<h4 style="text-indent:2em">Heading</h4><blockquote><p style="text-indent:0px">Nested</p>' +
          '<p style="text-indent:9em">Invalid</p></blockquote>'
      )
    ).toBe(true);
    expect(editor.state.doc.child(0).attrs).toMatchObject({ level: 4, firstLineIndent: '2em' });
    expect(editor.state.doc.child(1).child(0).attrs.firstLineIndent).toBe('0em');
    expect(editor.state.doc.child(1).child(1).attrs.firstLineIndent).toBeNull();
    expect(parseTiptapDocument(editor.getJSON(), editor).toJSON()).toEqual(editor.getJSON());
    expect(mount(editor.getHTML()).getJSON()).toEqual(editor.getJSON());
  });

  it.each(tags)('inherits indent on native Enter splitting %s and at its end', (tag) => {
    [null, '0em', '2em'].forEach((indent) => {
      [2, 3].forEach((position) => {
        const editor = mount({ type: 'doc', content: [block(tag, { firstLineIndent: indent })] });
        enter(editor, position);
        expect(editor.state.doc.childCount).toBe(2);
        expect(editor.state.doc.child(0).attrs.firstLineIndent).toBe(indent);
        expect(editor.state.doc.child(1).attrs.firstLineIndent).toBe(indent);
        expect(editor.state.doc.child(1).type.name).toBe(tag === 'p' || position === 3 ? 'paragraph' : 'heading');
      });
    });
  });

  it.each(['ul', 'blockquote'])('keeps native empty %s exit behavior', (container) => {
    const wrap = (paragraph: string) =>
      container === 'ul' ? `<ul><li>${paragraph}</li></ul>` : `<blockquote>${paragraph}</blockquote>`;
    const baseline = mount(wrap('<p></p>'));
    const indented = mount(wrap('<p style="text-indent:2em"></p>'));
    const cursor = container === 'ul' ? 3 : 2;
    enter(baseline, cursor);
    enter(indented, cursor);
    expect(indented.state.doc.firstChild?.type.name).toBe('paragraph');
    const withoutIndent = (editor: Editor) => {
      const json = getDocumentSnapshot(editor.state.doc);
      json.content?.forEach((node) => {
        if (node.attrs) delete node.attrs.firstLineIndent;
      });
      return json;
    };
    expect(withoutIndent(indented)).toEqual(withoutIndent(baseline));
    // Native lifting retains the existing paragraph's attributes rather than creating a replacement.
    expect(indented.state.doc.firstChild?.attrs.firstLineIndent).toBe('2em');
  });
});
