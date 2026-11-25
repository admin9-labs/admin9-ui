import { afterEach, describe, expect, it } from 'vitest';
import { Editor, Extension } from '@tiptap/core';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import { CellSelection } from '@tiptap/pm/tables';
import { messages } from '../src/locale';
import TextFormatToolbar from '../src/components/tiptap-editor/text-format-toolbar.vue';
import {
  TextFormat,
  TextStyle,
  SafeColor,
  SafeFontSize,
  SafeHighlight,
  normalizeTextColor,
  normalizeFirstLineIndent,
} from '../src/components/tiptap-editor/text-format';
import { parseTiptapDocument } from '../src/components/tiptap-editor/content';
import { cleanPastedHTML } from '../src/components/tiptap-editor/paste';
import { paintTextFormat, readFormatSource } from '../src/components/tiptap-editor/format-painter';

const editors: Editor[] = [];
const apps: App[] = [];
function mount(content: string) {
  const editor = new Editor({
    extensions: [
      StarterKit,
      TextStyle,
      SafeColor,
      SafeFontSize,
      SafeHighlight,
      TextFormat,
      TableKit,
      TextAlign.configure({ types: ['paragraph', 'heading'], alignments: ['left', 'center', 'right', 'justify'] }),
    ],
    content,
  });
  editors.push(editor);
  return editor;
}
function mountToolbar(editor: Editor, showHighlight = true) {
  const root = document.createElement('div');
  document.body.append(root);
  const props = { editor, disabled: false, showHighlight };
  const app = createApp(TextFormatToolbar, props);
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  const passthrough = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', [slots.default?.(), slots.content?.()]),
  });
  app.component(
    'ADropdown',
    defineComponent({
      emits: ['select'],
      setup:
        (_, { slots, emit }) =>
        () =>
          h(
            'div',
            {
              class: 'test-dropdown',
              onChoose: (event: Event) => emit('select', (event as CustomEvent).detail),
            },
            [slots.default?.(), slots.content?.()]
          ),
    })
  );
  ['a-button', 'a-doption', 'a-tooltip', 'a-popover'].forEach((name) => app.component(name, passthrough));
  apps.push(app);
  app.mount(root);
  return root;
}
function choose(root: HTMLElement, label: string, value: string) {
  const control = root.querySelector(`[aria-label="${label}"]`)?.closest('.test-dropdown');
  if (control) {
    control.dispatchEvent(new CustomEvent('choose', { detail: value }));
    return;
  }
  const menu = root.querySelector(`[role="menu"][aria-label="${label}"]`);
  const options = menu?.querySelectorAll<HTMLElement>('[role="menuitemradio"]');
  const values =
    {
      'First line indent': ['default', '0em', '2em'],
      'Line height': ['default', '1', '1.5', '2'],
      'Letter spacing': ['default', '0px', '1px', '2px'],
    }[label] ?? [];
  const option = options?.[values.indexOf(value)];
  if (!option) throw new Error(`Missing control: ${label}`);
  option.click();
}
function selectCells(editor: Editor, anchor: number, head: number) {
  const cells: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'tableCell') cells.push(pos);
  });
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[anchor], cells[head])));
}
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.innerHTML = '';
});

describe('text format attributes', () => {
  it.each(['0', '0px', '0em'])('canonicalizes explicit zero indent %s in HTML and JSON', (zero) => {
    expect(normalizeFirstLineIndent(zero)).toBe('0em');
    expect(normalizeFirstLineIndent(null)).toBeNull();
    const editor = mount(`<p style="text-indent:${zero}">A</p><p>B</p>`);
    expect(editor.state.doc.child(0).attrs.firstLineIndent).toBe('0em');
    expect(editor.state.doc.child(1).attrs.firstLineIndent).toBeNull();
    const json = editor.getJSON();
    if (!json.content?.[0].attrs) throw new Error('Missing paragraph attributes');
    json.content[0].attrs.firstLineIndent = zero;
    const normalized = parseTiptapDocument(json, editor);
    expect(normalized.child(0).attrs.firstLineIndent).toBe('0em');
    expect(normalized.child(1).attrs.firstLineIndent).toBeNull();
  });

  it('inherits explicit block formatting and standalone letter spacing on Enter', () => {
    const editor = mount('<p style="text-indent:2em;line-height:1.5"><span style="letter-spacing:2px">AB</span></p>');
    editor.commands.setTextSelection(2);
    editor.view.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    editor.commands.insertContent('C');
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).textContent).toBe('A');
    expect(editor.state.doc.child(1).textContent).toBe('CB');
    [0, 1].forEach((index) => {
      const paragraph = editor.state.doc.child(index);
      expect(paragraph.attrs).toMatchObject({ firstLineIndent: '2em', lineHeight: '1.5' });
      expect(paragraph.firstChild?.marks[0].attrs).toMatchObject({ letterSpacing: '2px', color: null, fontSize: null });
    });
  });

  it('inherits zero indent, explicit line height and letter spacing when Enter starts an empty paragraph', () => {
    const editor = mount('<p style="text-indent:0em;line-height:1"><span style="letter-spacing:0px">A</span></p>');
    editor.commands.setTextSelection(2);
    editor.view.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(editor.state.doc.child(1).attrs).toMatchObject({ firstLineIndent: '0em', lineHeight: '1' });
    editor.commands.insertContent('B');
    expect(editor.state.doc.child(1).firstChild?.marks[0].attrs.letterSpacing).toBe('0px');
  });

  it('round trips standalone letter spacing and distinguishes absent spacing from explicit zero', () => {
    const editor = mount('<p>A<span style="letter-spacing:0px">B</span><span style="letter-spacing:2px">C</span></p>');
    const normalized = parseTiptapDocument(editor.getJSON(), editor);
    expect(normalized.firstChild?.child(0).marks).toEqual([]);
    expect(normalized.firstChild?.child(1).marks[0].attrs).toMatchObject({ letterSpacing: '0px', color: null, fontSize: null });
    expect(normalized.firstChild?.child(2).marks[0].attrs.letterSpacing).toBe('2px');
    expect(mount(editor.getHTML()).getJSON()).toEqual(editor.getJSON());
  });

  it('keeps ShiftEnter in the same paragraph with inherited letter spacing', () => {
    const editor = mount('<p style="text-indent:0em;line-height:2"><span style="letter-spacing:1px">AB</span></p>');
    editor.commands.setTextSelection(2);
    editor.view.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    editor.commands.insertContent('C');
    expect(editor.state.doc.childCount).toBe(1);
    const paragraph = editor.state.doc.child(0);
    expect(paragraph.attrs).toMatchObject({ firstLineIndent: '0em', lineHeight: '2' });
    expect(paragraph.child(1).type.name).toBe('hardBreak');
    expect(paragraph.child(2).text).toBe('CB');
    expect(paragraph.child(2).marks[0].attrs.letterSpacing).toBe('1px');
  });

  it('rejects unknown and invalid root attributes before schema JSON parsing drops them', () => {
    const editor = mount('<p>A</p>');
    expect(() => parseTiptapDocument({ ...editor.getJSON(), attrs: { unknown: true } }, editor)).toThrow(
      'Unknown doc attribute'
    );
    const withRoot = new Editor({
      extensions: [
        StarterKit,
        Extension.create({
          name: 'testRoot',
          addGlobalAttributes: () => [
            {
              types: ['doc'],
              attributes: {
                label: { default: null, validate: 'string|null' },
              },
            },
          ],
        }),
      ],
    });
    editors.push(withRoot);
    expect(() => parseTiptapDocument({ type: 'doc', attrs: { label: 42 }, content: [] }, withRoot)).toThrow();
    expect(parseTiptapDocument({ type: 'doc', attrs: { label: 'valid' }, content: [] }, withRoot).attrs.label).toBe('valid');
  });

  it('round trips paste and JSON with explicit zeros, white, large fonts and justify', () => {
    const editor = mount(
      cleanPastedHTML(
        '<p style="text-indent:2em;line-height:1.5;text-align:justify"><span style="letter-spacing:2px;color:#ffffff;font-size:48px">A</span></p><h2 style="line-height:2">B</h2>'
      ).html
    );
    expect(editor.state.doc.firstChild?.attrs).toMatchObject({
      firstLineIndent: '2em',
      lineHeight: '1.5',
      textAlign: 'justify',
    });
    expect(editor.state.doc.firstChild?.firstChild?.marks[0].attrs).toMatchObject({ letterSpacing: '2px', fontSize: '48px' });
    expect(parseTiptapDocument(editor.getJSON(), editor).toJSON()).toEqual(editor.getJSON());
    const restored = mount(editor.getHTML());
    expect(restored.getJSON()).toEqual(editor.getJSON());
    editor.commands.setContent(
      '<p style="text-indent:0em;line-height:1"><span style="letter-spacing:0px;font-size:36px">C</span></p>'
    );
    expect(editor.state.doc.firstChild?.attrs).toMatchObject({ firstLineIndent: '0em', lineHeight: '1' });
    expect(editor.getHTML()).toContain('letter-spacing: 0px');
    expect(editor.getHTML()).toContain('font-size: 36px');
  });

  it('rejects unsupported HTML and JSON attributes while retaining spacing-only marks', () => {
    const editor = mount('<p style="text-indent:9em;line-height:9"><span style="letter-spacing:2px">A</span></p>');
    expect(editor.state.doc.firstChild?.attrs).toMatchObject({ firstLineIndent: null, lineHeight: null });
    expect(parseTiptapDocument(editor.getJSON(), editor).firstChild?.firstChild?.marks[0].attrs.letterSpacing).toBe('2px');
    const json = editor.getJSON();
    json.content![0].attrs = { firstLineIndent: '9em', lineHeight: '2px', textAlign: 'unsafe' };
    json.content![0].content![0].marks![0].attrs = { letterSpacing: 'var(--bad)', fontSize: '49px', color: 'transparent' };
    const result = parseTiptapDocument(json, editor);
    expect(result.firstChild?.attrs).toMatchObject({ firstLineIndent: null, lineHeight: null, textAlign: null });
    expect(result.firstChild?.firstChild?.marks).toEqual([]);
  });

  it('paints only the selected rectangular cells and copies letter spacing', () => {
    const editor = mount(
      '<p><span style="letter-spacing:1px">Source</span></p><table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>'
    );
    editor.commands.setTextSelection({ from: 1, to: 7 });
    const source = readFormatSource(editor.state);
    if ('error' in source) throw new Error(source.error);
    const cells: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell') cells.push(pos);
    });
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[0], cells[2])));
    const result = paintTextFormat(editor.state, source.marks);
    if ('error' in result) throw new Error(result.error);
    editor.view.dispatch(result.transaction);
    const spacings: unknown[] = [];
    editor.state.doc.descendants((node) => {
      if (node.isText && node.text !== 'Source') spacings.push(node.marks[0]?.attrs.letterSpacing ?? null);
    });
    expect(spacings).toEqual(['1px', null, '1px', null]);
    expect(readFormatSource(editor.state)).toHaveProperty('marks');
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[0], cells[1])));
    expect(readFormatSource(editor.state)).toEqual({ error: 'mixed' });
  });
});

describe('text format toolbar', () => {
  it.each([
    ['Text color', 'textStyle', 'color'],
    ['Highlight', 'highlight', 'color'],
  ])('keeps %s custom color as a draft until applied and supports undo and default', async (label, mark, attribute) => {
    const editor = mount('<p>ABC DEF</p>');
    editor.commands.setTextSelection({ from: 1, to: 4 });
    const root = mountToolbar(editor);
    const panel = root.querySelector<HTMLElement>(`.a9-text-palette[aria-label="${label}"]`);
    if (!panel) throw new Error('Missing color panel');
    expect(panel.querySelectorAll('.arco-color-picker-color-block')).toHaveLength(33);
    const input = panel.querySelector<HTMLInputElement>('.arco-color-picker-input-hex input');
    if (!input) throw new Error('Missing hex input');
    input.focus();
    input.value = 'C0A5A5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    input.blur();
    await nextTick();
    expect(editor.getHTML()).toBe('<p>ABC DEF</p>');
    const buttons = panel.querySelectorAll<HTMLElement>('.a9-text-palette__actions > div');
    Array.from(buttons)
      .find((button) => button.textContent?.trim() === 'Apply')
      ?.click();
    await nextTick();
    expect(editor.state.doc.firstChild?.firstChild?.marks.find((item) => item.type.name === mark)?.attrs[attribute]).toBe(
      normalizeTextColor('#c0a5a5')
    );
    expect(editor.state.doc.firstChild?.lastChild?.marks).toHaveLength(0);
    editor.commands.undo();
    expect(editor.getHTML()).toBe('<p>ABC DEF</p>');
    editor.commands.redo();
    buttons[0].click();
    expect(editor.getHTML()).toBe('<p>ABC DEF</p>');
  });

  it('reads and applies only rectangular selected cells, including null versus explicit zero', async () => {
    const editor = mount(
      '<table><tr><td><p style="text-indent:0em;line-height:1.5"><span style="letter-spacing:0px;font-size:36px;color:red">A</span></p></td><td><p>B</p></td></tr><tr><td><p style="text-indent:0em;line-height:1.5"><span style="letter-spacing:0px;font-size:36px;color:red">C</span></p></td><td><p>D</p></td></tr></table>'
    );
    selectCells(editor, 0, 2);
    const root = mountToolbar(editor);
    await nextTick();
    const label = (name: string) => {
      const control = root.querySelector(`[aria-label="${name}"]`);
      return control?.getAttribute('aria-description') ?? control?.textContent;
    };
    expect(label('First line indent')).toBe('No indent');
    expect(label('Line height')).toContain('1.5');
    expect(label('Letter spacing')).toContain('0px');
    expect(label('Font size')).toContain('36px');
    expect(root.querySelector('.a9-text-palette > span')?.textContent).not.toBe('Mixed');
    choose(root, 'First line indent', '2em');
    choose(root, 'Line height', '2');
    choose(root, 'Letter spacing', '2px');
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(editor.state.selection.ranges).toHaveLength(2);
    await nextTick();
    expect(label('First line indent')).toBe('Indent 2 characters');
    expect(label('Line height')).toBe('Double');
    expect(label('Letter spacing')).toContain('2px');
    const values: unknown[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph' && node.textContent)
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
    choose(root, 'Letter spacing', 'default');
    const colors: unknown[] = [];
    editor.state.doc.descendants((node) => {
      if (node.isText) colors.push(node.marks.find((mark) => mark.type.name === 'textStyle')?.attrs.color ?? null);
    });
    expect(colors[0]).toBeTruthy();
    expect(colors).toEqual([colors[0], null, colors[0], null]);
    choose(root, 'First line indent', 'default');
    choose(root, 'Letter spacing', '0px');
    selectCells(editor, 0, 1);
    await nextTick();
    expect(label('First line indent')).toBe(messages['en-US'].admin9Ui.tiptapEditor.formatDefault);
    expect(label('Letter spacing')).toContain(messages['en-US'].admin9Ui.tiptapEditor.mixedFormat);
    selectCells(editor, 0, 2);
    choose(root, 'First line indent', '0em');
    selectCells(editor, 0, 1);
    await nextTick();
    expect(label('First line indent')).toContain(messages['en-US'].admin9Ui.tiptapEditor.mixedFormat);
  });

  it('applies indent to headings and paragraphs, distinguishes mixed and excludes code blocks', async () => {
    const editor = mount('<h2 style="text-indent:0em">Title</h2><p>Body</p><pre><code>Code</code></pre>');
    editor.commands.selectAll();
    const root = mountToolbar(editor);
    await nextTick();
    const trigger = () => root.querySelector('[aria-label="First line indent"]');
    expect(trigger()?.getAttribute('aria-description')).toBe('Mixed formatting');
    const menu = () => root.querySelector('[role="menu"][aria-label="First line indent"]');
    expect(menu()?.querySelector('[aria-checked="true"]')).toBeNull();
    choose(root, 'First line indent', '2em');
    expect(editor.state.doc.child(0).attrs.firstLineIndent).toBe('2em');
    expect(editor.state.doc.child(1).attrs.firstLineIndent).toBe('2em');
    expect(editor.state.doc.child(2).attrs.firstLineIndent).toBeUndefined();
    editor.commands.undo();
    expect(editor.state.doc.child(0).attrs.firstLineIndent).toBe('0em');
    expect(editor.state.doc.child(1).attrs.firstLineIndent).toBeNull();
    editor.commands.redo();
    let codePos = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'codeBlock') codePos = pos + 1;
    });
    editor.commands.setTextSelection(codePos);
    await nextTick();
    expect(trigger()?.getAttribute('aria-disabled')).toBe('true');
    expect(trigger()?.getAttribute('aria-description')).toBe('Available for paragraphs and headings');
    expect(menu()?.querySelector('[aria-checked="true"]')).toBeNull();
    const before = editor.getJSON();
    choose(root, 'First line indent', '0em');
    expect(editor.getJSON()).toEqual(before);
  });

  it('excludes a trailing unselected paragraph at a text selection boundary', async () => {
    const editor = mount('<p>A</p><p style="line-height:2;text-indent:2em">B</p>');
    editor.commands.setTextSelection({ from: 1, to: 4 });
    const root = mountToolbar(editor);
    await nextTick();
    expect(root.querySelector('[aria-label="Line height"]')?.getAttribute('aria-description')).toContain(
      messages['en-US'].admin9Ui.tiptapEditor.formatDefault
    );
    choose(root, 'Line height', '1');
    choose(root, 'First line indent', '0em');
    expect(editor.state.doc.child(0).attrs).toMatchObject({ lineHeight: '1', firstLineIndent: '0em' });
    expect(editor.state.doc.child(1).attrs).toMatchObject({ lineHeight: '2', firstLineIndent: '2em' });
  });

  it('localizes controls, filters highlight and applies/resets each spacing attribute', async () => {
    const editor = mount('<p>Text</p>');
    editor.commands.selectAll();
    const root = mountToolbar(editor, false);
    await nextTick();
    expect(root.querySelector('[aria-label="Highlight"]')).toBeNull();
    [
      ['First line indent', '2em', 'firstLineIndent'],
      ['Line height', '1.5', 'lineHeight'],
      ['Letter spacing', '2px', 'letterSpacing'],
    ].forEach(([label, value, attribute]) => {
      choose(root, label, value);
      const attrs = () =>
        attribute === 'letterSpacing'
          ? editor.state.doc.firstChild?.firstChild?.marks.find((mark) => mark.type.name === 'textStyle')?.attrs
          : editor.state.doc.firstChild?.attrs;
      expect(attrs()?.[attribute]).toBe(value);
      choose(root, label, 'default');
      expect(attrs()?.[attribute] ?? null).toBeNull();
    });
  });
});
