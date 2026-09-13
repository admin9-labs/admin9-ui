import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { AllSelection, NodeSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { createFormatPainter, paintTextFormat, readFormatSource } from '../src/components/tiptap-editor/format-painter';
import { SafeColor, SafeFontSize, SafeHighlight, TextStyle } from '../src/components/tiptap-editor/text-format';
import { InlineImage } from '../src/components/tiptap-editor/media-node';

const editors: Editor[] = [];
const disposers: (() => void)[] = [];
function mount(content: string) {
  const root = document.createElement('div');
  const element = document.createElement('div');
  root.append(element);
  document.body.append(root);
  const editor = new Editor({
    element,
    extensions: [
      StarterKit,
      TextStyle,
      SafeColor,
      SafeFontSize,
      SafeHighlight,
      TableKit,
      InlineImage,
      TextAlign.configure({ types: ['paragraph', 'heading'] }),
    ],
    content,
  });
  editors.push(editor);
  const painter = createFormatPainter(
    () => editor,
    () => editor.isEditable
  );
  painter.bind(root);
  editor.on('transaction', ({ transaction }) => {
    if (transaction.docChanged) painter.cancel();
  });
  disposers.push(painter.dispose);
  return { editor, painter, root };
}
function select(editor: Editor, text: string, reverse = false) {
  let from = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text?.includes(text) && from < 0) from = pos + node.text.indexOf(text);
  });
  if (from < 0) throw new Error(`Missing text: ${text}`);
  editor.commands.setTextSelection(reverse ? { from: from + text.length, to: from } : { from, to: from + text.length });
}
function arm(editor: Editor, painter: ReturnType<typeof createFormatPainter>, text = 'Source') {
  select(editor, text);
  painter.toggle();
  expect(painter.active.value).toBe(true);
}
async function frame() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.innerHTML = '';
});

describe('format painter document contract', () => {
  it('replaces every supported format and preserves target links and block attributes', () => {
    const { editor, painter } = mount(
      '<p><span style="color:red;font-size:20px">Source</span></p><h2 style="text-align:center"><a href="/target"><strong><u><s><em><mark>Target</mark></em></s></u></strong></a></h2>'
    );
    arm(editor, painter);
    select(editor, 'Target', true);
    const selection = editor.state.selection.toJSON();
    painter.apply();
    const heading = editor.state.doc.child(1);
    expect(heading.type.name).toBe('heading');
    expect(heading.attrs).toMatchObject({ level: 2, textAlign: 'center' });
    expect(heading.firstChild?.marks.map((mark) => mark.type.name)).toEqual(['link', 'textStyle']);
    expect(heading.firstChild?.marks.find((mark) => mark.type.name === 'link')?.attrs.href).toBe('/target');
    expect(editor.state.selection.toJSON()).toEqual(selection);
    expect(editor.getHTML()).toContain('font-size: 20px');
    expect(painter.active.value).toBe(false);
  });

  it('copies all positive styles and preserves default colorless highlight', () => {
    const { editor, painter } = mount('<p><strong><em><u><s><mark>Source</mark></s></u></em></strong></p><p>Target</p>');
    arm(editor, painter);
    select(editor, 'Target');
    painter.apply();
    expect(editor.state.doc.child(1).firstChild?.marks).toEqual(editor.state.doc.firstChild?.firstChild?.marks);
    expect(editor.state.doc.child(1).firstChild?.marks.find((mark) => mark.type.name === 'highlight')?.attrs.color).toBeNull();
  });

  it('uses plain heading text to clear explicit target formats without copying heading styles', () => {
    const { editor, painter } = mount(
      '<h1>Source</h1><p><a href="/a"><strong><span style="color:blue;font-size:24px"><mark>Target</mark></span></strong></a></p>'
    );
    arm(editor, painter);
    select(editor, 'Target');
    painter.apply();
    expect(editor.state.doc.child(1).type.name).toBe('paragraph');
    expect(editor.state.doc.child(1).firstChild?.marks.map((mark) => mark.type.name)).toEqual(['link']);
  });

  it('rejects mixed sources but ignores link and block differences, including all selection', () => {
    const { editor, painter } = mount('<p><strong>A</strong>B</p>');
    editor.commands.selectAll();
    painter.toggle();
    expect(painter.failure.value).toBe('mixed');
    expect(painter.active.value).toBe(false);
    editor.commands.setContent('<h1><strong><a href="/a">A</a></strong></h1><p><strong><a href="/b">B</a></strong></p>');
    editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));
    expect(readFormatSource(editor.state)).toHaveProperty('marks');
  });

  it('reads cursor stored marks, rejects empty paragraphs, node selections and cell selections', () => {
    const { editor } = mount('<p>Source</p><p></p><table><tr><td>Cell</td></tr></table>');
    editor.commands.setTextSelection(2);
    editor.commands.setBold();
    const source = readFormatSource(editor.state);
    expect('marks' in source && source.marks.map((mark) => mark.type.name)).toEqual(['bold']);
    editor.commands.setTextSelection(9);
    expect(readFormatSource(editor.state)).toEqual({ error: 'source' });
    let tablePos = 0;
    let cellPos = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'table') tablePos = pos;
      if (node.type.name === 'tableCell') cellPos = pos;
    });
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, tablePos)));
    expect(readFormatSource(editor.state)).toEqual({ error: 'source' });
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cellPos)));
    expect(paintTextFormat(editor.state, [])).toEqual({ error: 'target' });
  });

  it.each(['<code>Code</code>', '</p><pre><code>Code</code></pre><p>'])(
    'rejects code atomically in sources and targets: %s',
    (code) => {
      const { editor, painter } = mount(`<p><strong>Source</strong></p><p>Target${code}</p>`);
      arm(editor, painter);
      editor.commands.selectAll();
      const before = editor.getJSON();
      painter.apply();
      expect(editor.getJSON()).toEqual(before);
      expect(painter.failure.value).toBe('code');
      expect(painter.active.value).toBe(true);
      painter.cancel();
      painter.toggle();
      expect(painter.failure.value).toBe('code');
      expect(painter.active.value).toBe(false);
    }
  );

  it('formats only text through lists, cells and inline media', () => {
    const { editor, painter } = mount(
      '<p><strong>Source</strong></p><ul><li><p>A<img src="/icon.png" data-display="inline">B</p></li></ul><table><tr><td>C</td></tr></table>'
    );
    arm(editor, painter);
    editor.commands.selectAll();
    const before = editor.state.doc;
    painter.apply();
    let imageCount = 0;
    editor.state.doc.descendants((node) => {
      if (node.isText) expect(node.marks.some((mark) => mark.type.name === 'bold')).toBe(true);
      if (node.type.name === 'inlineImage') {
        imageCount += 1;
        expect(node.marks).toEqual([]);
      }
    });
    expect(imageCount).toBe(1);
    expect(editor.state.doc.child(1).type).toBe(before.child(1).type);
    expect(editor.state.doc.child(2).attrs).toEqual(before.child(2).attrs);
  });

  it('does not emit updates or create history entries for activation and identical formatting', () => {
    const { editor, painter } = mount('<p>Source</p><p>Target</p>');
    let updates = 0;
    editor.on('update', () => {
      updates += 1;
    });
    arm(editor, painter);
    select(editor, 'Target');
    painter.apply();
    expect(updates).toBe(0);
    expect(editor.can().undo()).toBe(false);
    expect(painter.active.value).toBe(false);
  });

  it('isolates formatting from surrounding edits and undo never rearms the painter', () => {
    const { editor, painter } = mount('<p><strong>Source</strong></p><p>Target</p>');
    select(editor, 'Target');
    editor.commands.insertContent('Target!');
    const beforePaint = editor.getJSON();
    arm(editor, painter);
    select(editor, 'Target');
    painter.apply();
    const painted = editor.getJSON();
    editor.commands.setTextSelection(editor.state.selection.to);
    editor.commands.insertContent('x');
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(painted);
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(beforePaint);
    expect(painter.active.value).toBe(false);
    editor.commands.redo();
    expect(editor.getJSON()).toEqual(painted);
  });
});

describe('format painter interaction lifecycle', () => {
  it('waits for mouse release, keeps caret moves idle and applies once', async () => {
    const { editor, painter } = mount('<p><strong>Source</strong></p><p>Target</p>');
    arm(editor, painter);
    editor.view.dom.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', pointerId: 1 }));
    select(editor, 'Target');
    expect(editor.state.doc.child(1).firstChild?.marks).toEqual([]);
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    await frame();
    expect(editor.state.doc.child(1).firstChild?.marks[0].type.name).toBe('bold');
    expect(painter.active.value).toBe(false);
    arm(editor, painter);
    editor.commands.setTextSelection(2);
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    await frame();
    expect(painter.active.value).toBe(true);
  });

  it('does not auto-apply touch selections or cancelled pointers; Enter applies keyboard selections', async () => {
    const { editor, painter } = mount('<p><strong>Source</strong></p><p>Target</p>');
    arm(editor, painter);
    editor.view.dom.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 2 }));
    select(editor, 'Target');
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2 }));
    await frame();
    expect(painter.active.value).toBe(true);
    editor.view.dom.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', pointerId: 1 }));
    document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }));
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    await frame();
    expect(painter.active.value).toBe(true);
    editor.view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }));
    expect(painter.active.value).toBe(false);
    expect(editor.state.doc.child(1).firstChild?.marks).toEqual([]);
    editor.view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    arm(editor, painter);
    select(editor, 'Target');
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(painter.active.value).toBe(false);
    expect(editor.state.doc.child(1).firstChild?.marks[0].type.name).toBe('bold');
  });

  it.each(['beforeinput', 'paste', 'cut', 'drop', 'compositionstart'])('cancels before %s', (name) => {
    const { editor, painter } = mount('<p>Source</p>');
    arm(editor, painter);
    editor.view.dom.dispatchEvent(new Event(name, { bubbles: true }));
    expect(painter.active.value).toBe(false);
  });

  it('cancels keyboard format and history commands even when the document does not change', () => {
    const { editor, painter } = mount('<p>Source</p>');
    arm(editor, painter);
    editor.commands.setTextSelection(2);
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
    expect(painter.active.value).toBe(false);
    arm(editor, painter);
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    expect(painter.active.value).toBe(false);
  });

  it.each(['pointer', 'keyboard'])('discards a pending mouse completion when a new %s selection starts', async (gesture) => {
    const { editor, painter } = mount('<p><strong>Source</strong></p><p>Target</p>');
    arm(editor, painter);
    editor.view.dom.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', pointerId: 1 }));
    select(editor, 'Target');
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    if (gesture === 'pointer')
      editor.view.dom.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', pointerId: 1 }));
    else editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
    await frame();
    expect(painter.active.value).toBe(true);
    expect(editor.state.doc.child(1).firstChild?.marks).toEqual([]);
  });

  it('preserves internal focus, cancels external focus and prevents late application after disposal', async () => {
    const { editor, painter, root } = mount('<p><strong>Source</strong></p><p>Target</p>');
    const button = document.createElement('button');
    button.dataset.formatPainter = '';
    root.append(button);
    arm(editor, painter);
    button.focus();
    expect(painter.active.value).toBe(true);
    button.click();
    expect(painter.active.value).toBe(true);
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    expect(painter.active.value).toBe(false);
    arm(editor, painter);
    editor.view.dom.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', pointerId: 1 }));
    select(editor, 'Target');
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    painter.dispose();
    await frame();
    expect(editor.state.doc.child(1).firstChild?.marks).toEqual([]);
  });

  it('cancels on other tools, Escape, document mutation and window blur; instances stay independent', () => {
    const first = mount('<p><strong>Source</strong></p>');
    const second = mount('<p>Source</p>');
    arm(first.editor, first.painter);
    arm(second.editor, second.painter);
    expect(first.painter.active.value).toBe(false);
    expect(second.painter.active.value).toBe(true);
    second.editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(second.painter.active.value).toBe(false);
    arm(second.editor, second.painter);
    const tool = document.createElement('button');
    second.root.append(tool);
    tool.click();
    expect(second.painter.active.value).toBe(false);
    arm(second.editor, second.painter);
    second.editor.commands.insertContent('changed');
    expect(second.painter.active.value).toBe(false);
    arm(first.editor, first.painter);
    window.dispatchEvent(new Event('blur'));
    expect(first.painter.active.value).toBe(false);
  });
});
