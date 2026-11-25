import { Editor } from '@tiptap/core';
import CharacterCount from '@tiptap/extension-character-count';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { CellSelection } from '@tiptap/pm/tables';
import { afterEach, describe, expect, it, vi } from 'vitest';
import createCharacterLimit from '../src/components/tiptap-editor/character-limit';

const editors: Editor[] = [];
function mount(content: string, limit: number) {
  const notify = vi.fn();
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ trailingNode: false }),
      TableKit,
      CharacterCount,
      createCharacterLimit(() => limit, notify),
    ],
    content,
  });
  editors.push(editor);
  return { editor, notify };
}
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

function selectTableCells(editor: Editor) {
  const cells: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'tableCell') cells.push(pos);
  });
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[0], cells[1])));
}

describe('paste character limit integrity', () => {
  it('truncates only pasted text and restores the exact document and selection in one undo', () => {
    const { editor, notify } = mount('<p><strong>BEGIN</strong>END</p>', 15);
    editor.commands.setTextSelection(6);
    const before = editor.getJSON();
    const selection = editor.state.selection.toJSON();
    editor.view.pasteHTML(`<p><em>${'甲'.repeat(50)}</em></p>`);
    expect(editor.state.doc.textContent).toBe(`BEGIN${'甲'.repeat(7)}END`);
    expect(editor.getHTML()).toContain('<em>');
    expect(notify).toHaveBeenCalledWith({ kind: 'partial', limit: 15 });
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(before);
    expect(editor.state.selection.toJSON()).toEqual(selection);
    editor.commands.redo();
    expect(editor.state.doc.textContent).toBe(`BEGIN${'甲'.repeat(7)}END`);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('accounts for replaced selection without deleting its surrounding text', () => {
    const { editor } = mount('<p>BEFOREreplaceAFTER</p>', 20);
    editor.commands.setTextSelection({ from: 7, to: 14 });
    editor.view.pasteText('X'.repeat(30));
    expect(editor.state.doc.textContent).toBe(`BEFORE${'X'.repeat(9)}AFTER`);
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe('BEFOREreplaceAFTER');
  });

  it('preserves all old content while truncating a flat multi-paragraph paste', () => {
    const { editor } = mount('<p>STARTEND</p>', 15);
    editor.commands.setTextSelection(6);
    editor.view.pasteHTML('<p>123</p><p><strong>456789012</strong></p><p>ignored</p>');
    expect(editor.state.doc.textContent).toBe('START1234567END');
    expect(editor.getHTML()).toContain('<strong>4567</strong>');
    editor.state.doc.check();
  });

  it('rejects an over-limit table without replacing the selection or creating an undo step', () => {
    const { editor, notify } = mount('<p>ORIGINAL</p>', 10);
    editor.commands.setTextSelection({ from: 2, to: 5 });
    const before = editor.getJSON();
    const selection = editor.state.selection.toJSON();
    editor.view.pasteHTML('<table><tr><td><p>12345678901234567890</p></td></tr></table>');
    expect(editor.getJSON()).toEqual(before);
    expect(editor.state.selection.toJSON()).toEqual(selection);
    expect(editor.can().undo()).toBe(false);
    expect(notify).toHaveBeenCalledWith({ kind: 'rejected', limit: 10 });
  });

  it('refuses a paste at the limit, retaining selected text and subsequent chronological undo', () => {
    const { editor, notify } = mount('<p>BEFORE</p>', 6);
    editor.commands.setTextSelection(4);
    editor.view.pasteText('more');
    expect(editor.state.doc.textContent).toBe('BEFORE');
    expect(editor.can().undo()).toBe(false);
    expect(notify).toHaveBeenCalledWith({ kind: 'rejected', limit: 6 });
    editor.commands.setTextSelection({ from: 1, to: 2 });
    editor.commands.insertContent('X');
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe('BEFORE');
  });

  it('does not split a surrogate pair or damage the suffix', () => {
    const { editor } = mount('<p>AB</p>', 5);
    editor.commands.setTextSelection(2);
    editor.view.pasteText('😀😀😀');
    expect(editor.state.doc.textContent).toBe('A😀B');
  });

  it('keeps later typing after a paste in chronological undo order', () => {
    const { editor } = mount('<p>BEFORE</p>', 30);
    editor.commands.setTextSelection(7);
    editor.view.pasteText('PASTE');
    editor.commands.insertContent('TYPED');
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe('BEFOREPASTE');
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe('BEFORE');
    editor.commands.redo();
    expect(editor.state.doc.textContent).toBe('BEFOREPASTE');
    editor.commands.redo();
    expect(editor.state.doc.textContent).toBe('BEFOREPASTETYPED');
  });

  it('does not silently truncate a loaded document that already exceeds the limit', () => {
    const { editor } = mount('<p>Keep this full draft</p>', 5);
    editor.commands.setTextSelection(3);
    expect(editor.state.doc.textContent).toBe('Keep this full draft');
    editor.commands.insertContent('X');
    expect(editor.state.doc.textContent).toBe('Keep this full draft');
    editor.commands.deleteRange({ from: 1, to: 5 });
    expect(editor.state.doc.textContent).toBe(' this full draft');
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe('Keep this full draft');
  });

  it.each([4, 25])('rejects a %i-character cell fill using the actual repeated cell content size', (length) => {
    const { editor, notify } = mount('<table><tr><td>A</td><td>B</td></tr></table><p>TAIL</p>', 10);
    selectTableCells(editor);
    const before = editor.getJSON();
    const selection = editor.state.selection.toJSON();
    editor.view.pasteText('X'.repeat(length));
    expect(editor.getJSON()).toEqual(before);
    expect(editor.state.selection.toJSON()).toEqual(selection);
    expect(editor.can().undo()).toBe(false);
    expect(notify).toHaveBeenCalledWith({ kind: 'rejected', limit: 10 });
  });

  it('keeps table paste independent from previous typing and redoes the accepted cell fill', () => {
    const { editor } = mount('<table><tr><td>A</td><td>B</td></tr></table><p>TAIL</p>', 20);
    editor.commands.setTextSelection(4);
    editor.commands.insertContent('Z');
    selectTableCells(editor);
    const before = editor.getJSON();
    const selection = editor.state.selection.toJSON();
    editor.view.pasteText('X');
    expect(editor.state.doc.textContent).toBe('XXTAIL');
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(before);
    expect(editor.state.selection.toJSON()).toEqual(selection);
    editor.commands.redo();
    expect(editor.state.doc.textContent).toBe('XXTAIL');
  });
});
