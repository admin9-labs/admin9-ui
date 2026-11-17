import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import ArcoVue from '@arco-design/web-vue';
import { createI18n } from 'vue-i18n';
import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { CellSelection } from '@tiptap/pm/tables';
import Toolbar from '../src/components/tiptap-editor/text-format-toolbar.vue';
import { TextStyle, TextFormat, SafeColor, SafeFontSize, SafeHighlight } from '../src/components/tiptap-editor/text-format';
import { messages } from '../src/locale';

const editors: Editor[] = [];
const apps: App[] = [];
async function settle() {
  await nextTick();
  await nextTick();
  await nextTick();
}
function fixture(
  content = '<p>ABC</p>',
  props: { section?: 'text' | 'paragraph'; disabled?: boolean; showHighlight?: boolean } = {}
) {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ trailingNode: false }),
      TextStyle,
      TextFormat,
      SafeColor,
      SafeFontSize,
      SafeHighlight,
      TableKit,
      Extension.create({
        name: 'toolbarRootMetadata',
        addGlobalAttributes: () => [{ types: ['doc'], attributes: { label: { default: null } } }],
      }),
    ],
    content,
  });
  editors.push(editor);
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(Toolbar, { editor, disabled: false, ...props });
  app.use(ArcoVue);
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  apps.push(app);
  app.mount(root);
  const control = (name: string) => {
    const button = root.querySelector<HTMLButtonElement>(`[data-format-control="${name}"]`);
    if (!button) throw new Error(`Missing control ${name}`);
    return button;
  };
  const open = async (name: string, keyboard = false) => {
    const button = control(name);
    if (keyboard) button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    else button.click();
    await settle();
    return button;
  };
  const option = (name: string, value: string) => {
    const button = document.querySelector<HTMLButtonElement>(`[data-format-option="${name}:${value}"]`);
    if (!button) throw new Error(`Missing option ${name}:${value}`);
    return button;
  };
  const choose = async (name: string, value: string) => {
    await open(name);
    option(name, value).click();
    await settle();
  };
  return { editor, root, control, open, option, choose };
}
function key(name: string) {
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
}
function selectCells(editor: Editor, anchor: number, head: number) {
  const positions: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'tableCell') positions.push(pos);
  });
  editor.view.dispatch(
    editor.state.tr.setSelection(CellSelection.create(editor.state.doc, positions[anchor], positions[head]))
  );
}
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.innerHTML = '';
});

describe('format toolbar grouping and presentation', () => {
  it.each([
    ['text', ['color', 'highlight', 'fontSize', 'letterSpacing']],
    ['paragraph', ['firstLineIndent', 'lineHeight']],
    [undefined, ['color', 'highlight', 'fontSize', 'letterSpacing', 'firstLineIndent', 'lineHeight']],
  ] as const)('renders section %s without duplicating controls', (section, expected) => {
    const { root } = fixture(undefined, { section });
    expect(
      Array.from(root.querySelectorAll('[data-format-control]')).map((item) => item.getAttribute('data-format-control'))
    ).toEqual(expected);
  });

  it('uses distinct official icons, a numeric font value and a single-level text layout panel', async () => {
    const { control, editor, open, option } = fixture('<p><span style="font-size:36px">ABC</span></p>', {
      showHighlight: false,
    });
    editor.commands.setTextSelection(2);
    await settle();
    expect(control('color').querySelector('.arco-icon-font-colors')).toBeTruthy();
    expect(document.querySelector('[data-format-control="highlight"]')).toBeNull();
    expect(control('fontSize').textContent).toContain('36px');
    expect(control('fontSize').querySelector('.arco-icon-down')).toBeTruthy();
    expect(control('lineHeight').querySelector('.arco-icon-line-height')).toBeTruthy();
    expect(control('letterSpacing').textContent).toContain('Text layout');
    await open('letterSpacing');
    expect(option('letterSpacing', '0px').textContent).toContain('Standard (0px)');
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
  });

  it('marks default, explicit zero and mixed without conflating their values', async () => {
    const { editor, open, option, choose } = fixture('<p>A</p><p style="text-indent:0em">B</p>');
    editor.commands.setTextSelection(1);
    await open('firstLineIndent');
    expect(option('firstLineIndent', 'default').getAttribute('aria-checked')).toBe('true');
    expect(option('firstLineIndent', '0em').getAttribute('aria-checked')).toBe('false');
    key('Escape');
    editor.commands.setTextSelection(4);
    await open('firstLineIndent');
    expect(option('firstLineIndent', '0em').getAttribute('aria-checked')).toBe('true');
    expect(option('firstLineIndent', '0em').querySelector('.arco-icon-check')).toBeTruthy();
    key('Escape');
    editor.commands.selectAll();
    await open('firstLineIndent');
    expect(document.querySelector('[role="menu"]')?.textContent).toContain('Mixed formatting');
    expect(document.querySelectorAll('[role="menuitemradio"][aria-checked="true"]')).toHaveLength(0);
    option('firstLineIndent', '2em').click();
    await settle();
    expect(editor.state.doc.child(0).attrs.firstLineIndent).toBe('2em');
    expect(editor.state.doc.child(1).attrs.firstLineIndent).toBe('2em');
    await choose('firstLineIndent', 'default');
    expect(editor.state.doc.child(0).attrs.firstLineIndent).toBeNull();
  });

  it('disables heading-only indent but leaves heading line height available', async () => {
    const { editor, control, choose } = fixture('<h2>ABC</h2>');
    editor.commands.setTextSelection({ from: 1, to: 4 });
    await settle();
    expect(control('firstLineIndent').disabled).toBe(true);
    expect(control('lineHeight').disabled).toBe(false);
    await choose('lineHeight', '1.5');
    expect(editor.state.doc.firstChild?.attrs.lineHeight).toBe('1.5');
    expect(editor.state.doc.firstChild?.attrs).not.toHaveProperty('firstLineIndent');
  });

  it('reports not applicable for media and code instead of selecting the default option', async () => {
    const { editor, control } = fixture('<hr><pre><code>Code</code></pre>');
    editor.commands.setNodeSelection(0);
    await settle();
    ['fontSize', 'firstLineIndent', 'lineHeight', 'letterSpacing', 'color', 'highlight'].forEach((name) => {
      expect(control(name).disabled).toBe(true);
    });
    expect(control('fontSize').textContent).toContain('Not applicable');
    editor.commands.setTextSelection(3);
    await settle();
    expect(control('fontSize').disabled).toBe(true);
    expect(control('letterSpacing').disabled).toBe(true);
  });

  it('explains heading indentation and applies mixed heading/paragraph formatting only where supported', async () => {
    const { editor, control, choose } = fixture('<h2>Title</h2><p>Body</p>');
    editor.commands.setTextSelection(2);
    await settle();
    expect(control('firstLineIndent').getAttribute('aria-description')).toBe(
      messages['en-US'].admin9Ui.tiptapEditor.indentParagraphOnly
    );
    editor.commands.selectAll();
    await settle();
    expect(control('firstLineIndent').disabled).toBe(false);
    await choose('firstLineIndent', '2em');
    await choose('lineHeight', '2');
    expect(editor.state.doc.child(0).attrs).not.toHaveProperty('firstLineIndent');
    expect(editor.state.doc.child(0).attrs.lineHeight).toBe('2');
    expect(editor.state.doc.child(1).attrs).toMatchObject({ firstLineIndent: '2em', lineHeight: '2' });
  });

  it('leaves disabled controls inert', async () => {
    const { control, editor, root } = fixture(undefined, { disabled: true });
    expect(Array.from(root.querySelectorAll('button')).every((button) => button.disabled)).toBe(true);
    control('firstLineIndent').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(editor.state.doc.firstChild?.attrs.firstLineIndent).toBeNull();
  });
});

describe('format toolbar keyboard and selected content', () => {
  it('focuses the selected option, navigates in both directions and returns focus on Escape', async () => {
    const { editor, control, open, option } = fixture('<p style="line-height:1.5">ABC</p>');
    editor.commands.setTextSelection(2);
    const before = editor.state.selection.toJSON();
    await open('lineHeight', true);
    expect(document.activeElement).toBe(option('lineHeight', '1.5'));
    key('ArrowDown');
    expect(document.activeElement).toBe(option('lineHeight', '2'));
    key('ArrowDown');
    expect(document.activeElement).toBe(option('lineHeight', 'default'));
    key('ArrowUp');
    expect(document.activeElement).toBe(option('lineHeight', '2'));
    key('Home');
    expect(document.activeElement).toBe(option('lineHeight', 'default'));
    key('End');
    expect(document.activeElement).toBe(option('lineHeight', '2'));
    key('Escape');
    await settle();
    expect(control('lineHeight').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(control('lineHeight'));
    expect(editor.state.selection.toJSON()).toEqual(before);
  });

  it.each(['Enter', ' '])('applies keyboard choice with %j to the original reversed text selection', async (activation) => {
    const { editor, open, option } = fixture('<p>ABC</p><p>DEF</p>');
    editor.commands.setTextSelection({ from: 3, to: 1 });
    const before = editor.state.selection.toJSON();
    await open('fontSize', true);
    option('fontSize', '48px').focus();
    key(activation);
    await settle();
    expect(editor.state.doc.child(0).firstChild?.text).toBe('AB');
    expect(editor.state.doc.child(0).firstChild?.marks[0].attrs.fontSize).toBe('48px');
    expect(editor.state.doc.child(0).lastChild?.marks).toEqual([]);
    expect(editor.state.doc.child(1).firstChild?.marks).toEqual([]);
    expect(editor.state.selection.toJSON()).toEqual(before);
  });

  it('preserves the bookmarked paragraph selection if UI interaction changes editor selection', async () => {
    const { editor, open, option } = fixture('<p>ABC</p><p>DEF</p>');
    editor.commands.setTextSelection({ from: 3, to: 1 });
    const original = editor.state.selection.toJSON();
    await open('firstLineIndent');
    editor.commands.setTextSelection(6);
    option('firstLineIndent', '2em').click();
    await settle();
    expect(editor.state.doc.child(0).attrs.firstLineIndent).toBe('2em');
    expect(editor.state.doc.child(1).attrs.firstLineIndent).toBeNull();
    expect(editor.state.selection.toJSON()).toEqual(original);
  });

  it('applies and resets color, highlight and font size while preserving links and unrelated formats', async () => {
    const { editor, open, choose } = fixture(
      '<p><a href="/target"><strong><span style="letter-spacing:1px">ABC</span></strong></a></p>'
    );
    editor.commands.setTextSelection({ from: 1, to: 4 });
    await open('color', true);
    const white = document.querySelector<HTMLButtonElement>('[aria-label="Text color #ffffff"]');
    if (!white) throw new Error('Missing white swatch');
    white.focus();
    key('Enter');
    await settle();
    expect(
      editor.state.doc.firstChild?.firstChild?.marks.find((mark) => mark.type.name === 'textStyle')?.attrs.color
    ).toBeTruthy();
    await open('highlight', true);
    const highlight = document.querySelector<HTMLButtonElement>('[aria-label="Highlight #fff7cc"]');
    if (!highlight) throw new Error('Missing highlight swatch');
    highlight.click();
    await settle();
    await choose('fontSize', '48px');
    let marks = editor.state.doc.firstChild?.firstChild?.marks ?? [];
    expect(marks.find((mark) => mark.type.name === 'highlight')?.attrs.color).toBeTruthy();
    expect(marks.find((mark) => mark.type.name === 'textStyle')?.attrs).toMatchObject({
      fontSize: '48px',
      letterSpacing: '1px',
    });
    await open('color');
    (document.querySelector('[role="menu"] button') as HTMLButtonElement).click();
    await settle();
    await open('highlight');
    (document.querySelector('[role="menu"][aria-label="Highlight"] button') as HTMLButtonElement).click();
    await settle();
    await choose('fontSize', 'default');
    marks = editor.state.doc.firstChild?.firstChild?.marks ?? [];
    expect(marks.map((mark) => mark.type.name).sort()).toEqual(['bold', 'link', 'textStyle']);
    expect(marks.find((mark) => mark.type.name === 'textStyle')?.attrs).toMatchObject({
      color: null,
      fontSize: null,
      letterSpacing: '1px',
    });
    expect(marks.find((mark) => mark.type.name === 'link')?.attrs.href).toBe('/target');
  });

  it('retains stored marks at a caret when applying standalone letter spacing and resets only spacing', async () => {
    const { editor, choose } = fixture();
    editor.commands.setTextSelection(2);
    editor.commands.setBold();
    await choose('letterSpacing', '0px');
    editor.commands.insertContent('X');
    const marks = editor.state.doc.firstChild?.child(1).marks;
    expect(marks?.some((mark) => mark.type.name === 'bold')).toBe(true);
    expect(marks?.find((mark) => mark.type.name === 'textStyle')?.attrs.letterSpacing).toBe('0px');
    await choose('letterSpacing', 'default');
    editor.commands.insertContent('Y');
    expect(editor.state.doc.firstChild?.child(2).marks.map((mark) => mark.type.name)).toEqual(['bold']);
  });

  it('reads and edits only selected rectangular cells for paragraph and inline formats', async () => {
    const { editor, choose, open, option } = fixture(
      '<table><tr><td><p style="line-height:1.5;text-indent:0em"><span style="letter-spacing:0px;color:red">A</span></p></td><td><p>B</p></td></tr><tr><td><p style="line-height:1.5;text-indent:0em"><span style="letter-spacing:0px;color:red">C</span></p></td><td><p>D</p></td></tr></table>'
    );
    selectCells(editor, 0, 2);
    const selection = editor.state.selection.toJSON();
    await open('firstLineIndent');
    expect(option('firstLineIndent', '0em').getAttribute('aria-checked')).toBe('true');
    option('firstLineIndent', '2em').click();
    await settle();
    await choose('lineHeight', '2');
    await choose('letterSpacing', '2px');
    const values: unknown[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph')
        values.push([
          node.attrs.firstLineIndent,
          node.attrs.lineHeight,
          node.firstChild?.marks[0]?.attrs.letterSpacing ?? null,
        ]);
    });
    expect(values).toEqual([
      ['2em', '2', '2px'],
      [null, null, null],
      ['2em', '2', '2px'],
      [null, null, null],
    ]);
    expect(editor.state.selection.toJSON()).toEqual(selection);
    await choose('letterSpacing', 'default');
    expect(editor.state.doc.textContent).toBe('ABCD');
    const colors: unknown[] = [];
    editor.state.doc.descendants((node) => {
      if (node.isText) colors.push(node.marks[0]?.attrs.color ?? null);
    });
    expect(colors).toEqual(['red', null, 'red', null]);
  });

  it('does not format the unselected paragraph at the end boundary', async () => {
    const { editor, choose } = fixture('<p>A</p><p style="line-height:2;text-indent:2em">B</p>');
    editor.commands.setTextSelection({ from: 1, to: 4 });
    await choose('firstLineIndent', '0em');
    await choose('lineHeight', '1');
    expect(editor.state.doc.child(0).attrs).toMatchObject({ firstLineIndent: '0em', lineHeight: '1' });
    expect(editor.state.doc.child(1).attrs).toMatchObject({ firstLineIndent: '2em', lineHeight: '2' });
  });
});

describe('format toolbar pending target lifecycle', () => {
  it('cancels an explicit document replacement and ignores an old option during closing animation', async () => {
    const { editor, open, option, control } = fixture('<p>Original</p>');
    editor.commands.setTextSelection({ from: 1, to: 9 });
    editor.commands.setBold();
    await open('fontSize');
    const staleOption = option('fontSize', '48px');
    const replacement = editor.schema.nodeFromJSON({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'New body' }] }],
    });
    editor.view.dispatch(
      editor.state.tr.replaceWith(0, editor.state.doc.content.size, replacement.content).setMeta('a9ReplaceDocument', true)
    );
    const before = editor.getJSON();
    // Fire synchronously, while the old popover DOM still exists.
    staleOption.click();
    expect(editor.getJSON()).toEqual(before);
    await settle();
    expect(control('fontSize').getAttribute('aria-expanded')).toBe('false');
    editor.commands.setTextSelection(2);
    editor.commands.insertContent('X');
    expect(editor.state.doc.firstChild?.firstChild?.marks).toEqual([]);
  });

  it('maps the original reversed selection through ordinary insertion before its target', async () => {
    const { editor, open, option, control } = fixture('<p>ABC</p><p>DEF</p>');
    editor.commands.setTextSelection({ from: 8, to: 6 });
    await open('fontSize');
    const choice = option('fontSize', '36px');
    editor.view.dispatch(editor.state.tr.insertText('XX', 1));
    await settle();
    expect(control('fontSize').getAttribute('aria-expanded')).toBe('true');
    choice.click();
    expect(editor.state.doc.child(0).textContent).toBe('XXABC');
    expect(editor.state.doc.child(0).firstChild?.marks).toEqual([]);
    expect(editor.state.doc.child(1).firstChild?.text).toBe('DE');
    expect(editor.state.doc.child(1).firstChild?.marks[0].attrs.fontSize).toBe('36px');
    expect(editor.state.doc.child(1).lastChild?.marks).toEqual([]);
    expect(editor.state.selection.toJSON()).toMatchObject({ type: 'text', anchor: 10, head: 8 });
  });

  it('keeps the menu and bookmark through root-attribute-only updates', async () => {
    const { editor, open, option, control } = fixture();
    editor.commands.setTextSelection({ from: 3, to: 1 });
    const selection = editor.state.selection.toJSON();
    await open('firstLineIndent');
    editor.view.dispatch(editor.state.tr.setDocAttribute('label', 'updated metadata'));
    await settle();
    expect(control('firstLineIndent').getAttribute('aria-expanded')).toBe('true');
    option('firstLineIndent', '2em').click();
    expect(editor.state.doc.attrs.label).toBe('updated metadata');
    expect(editor.state.doc.firstChild?.attrs.firstLineIndent).toBe('2em');
    expect(editor.state.selection.toJSON()).toEqual(selection);
  });

  it('keeps all-selection through an ordinary paragraph attribute update', async () => {
    const { editor, open, option, control } = fixture();
    editor.commands.selectAll();
    await open('fontSize');
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(0, undefined, { ...editor.state.doc.firstChild?.attrs, lineHeight: '2' })
    );
    await settle();
    expect(control('fontSize').getAttribute('aria-expanded')).toBe('true');
    option('fontSize', '24px').click();
    expect(editor.state.doc.firstChild?.attrs.lineHeight).toBe('2');
    expect(editor.state.doc.firstChild?.firstChild?.marks[0].attrs.fontSize).toBe('24px');
  });

  it.each(['delete', 'replace', 'cross-boundary'])('cancels when the original text target is lost by %s', async (operation) => {
    const { editor, open, option, control } = fixture('<p>ABCDE</p><p>Untouched</p>');
    editor.commands.setTextSelection({ from: 2, to: 5 });
    await open('letterSpacing');
    const staleOption = option('letterSpacing', '2px');
    const { tr } = editor.state;
    if (operation === 'delete') tr.delete(2, 5);
    else if (operation === 'replace') tr.insertText('XYZ', 2, 5);
    else tr.delete(1, 3);
    editor.view.dispatch(tr);
    const before = editor.getJSON();
    staleOption.click();
    expect(editor.getJSON()).toEqual(before);
    await settle();
    expect(control('letterSpacing').getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps a partially deleted target when both original boundaries survive', async () => {
    const { editor, open, option, control } = fixture('<p>ABCDE</p>');
    editor.commands.setTextSelection({ from: 1, to: 6 });
    await open('fontSize');
    editor.view.dispatch(editor.state.tr.delete(2, 4));
    await settle();
    expect(control('fontSize').getAttribute('aria-expanded')).toBe('true');
    option('fontSize', '24px').click();
    expect(editor.state.doc.textContent).toBe('ADE');
    expect(editor.state.doc.firstChild?.firstChild?.marks[0].attrs.fontSize).toBe('24px');
  });

  it('cancels a deleted caret target instead of carrying stored marks into its replacement', async () => {
    const { editor, open, option, control } = fixture('<p>ABC</p><p>Other</p>');
    editor.commands.setTextSelection(2);
    editor.commands.setBold();
    await open('letterSpacing');
    const staleOption = option('letterSpacing', '2px');
    editor.view.dispatch(editor.state.tr.delete(0, 5));
    const before = editor.getJSON();
    staleOption.click();
    expect(editor.getJSON()).toEqual(before);
    await settle();
    expect(control('letterSpacing').getAttribute('aria-expanded')).toBe('false');
    editor.commands.insertContent('X');
    expect(editor.state.doc.firstChild?.firstChild?.marks).toEqual([]);
  });

  it('cancels a deleted table selection instead of resolving it to unrelated text', async () => {
    const { editor, open, option, control } = fixture('<table><tr><td>A</td><td>B</td></tr></table><p>Other</p>');
    selectCells(editor, 0, 1);
    await open('firstLineIndent');
    const staleOption = option('firstLineIndent', '2em');
    editor.view.dispatch(editor.state.tr.delete(0, editor.state.doc.child(0).nodeSize));
    const before = editor.getJSON();
    staleOption.click();
    expect(editor.getJSON()).toEqual(before);
    await settle();
    expect(control('firstLineIndent').getAttribute('aria-expanded')).toBe('false');
  });

  it('rejects an old menu option after Escape or switching to another menu', async () => {
    const { editor, open, option, control } = fixture();
    editor.commands.selectAll();
    await open('fontSize');
    const staleOption = option('fontSize', '48px');
    key('Escape');
    const before = editor.getJSON();
    staleOption.click();
    expect(editor.getJSON()).toEqual(before);
    await open('firstLineIndent');
    staleOption.click();
    expect(editor.getJSON()).toEqual(before);
    expect(control('firstLineIndent').getAttribute('aria-expanded')).toBe('true');
    option('firstLineIndent', '2em').click();
    expect(editor.state.doc.firstChild?.attrs.firstLineIndent).toBe('2em');
  });
});
