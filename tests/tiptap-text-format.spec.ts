import { afterEach, describe, expect, it } from 'vitest';
import { Editor, Extension } from '@tiptap/core';
import { createApp, nextTick, type App } from 'vue';
import ArcoVue from '@arco-design/web-vue';
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
  app.use(ArcoVue);
  apps.push(app);
  app.mount(root);
  return root;
}
async function settle() {
  await nextTick();
  await nextTick();
  await nextTick();
}
async function openMenu(root: HTMLElement, name: string) {
  const trigger = root.querySelector<HTMLButtonElement>(`[data-format-control="${name}"]`);
  if (!trigger) throw new Error(`Missing control: ${name}`);
  trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  await settle();
  const menu = document.querySelector<HTMLElement>(`[role="menu"][aria-label="${trigger.getAttribute('aria-label')}"]`);
  if (!menu) throw new Error(`Missing menu: ${name}`);
  return menu;
}
async function menuState(root: HTMLElement, name: string) {
  const menu = await openMenu(root, name);
  const result = {
    heading: menu.querySelector('.a9-text-format-menu__heading')?.textContent,
    checked: Array.from(menu.querySelectorAll('[role="menuitemradio"][aria-checked="true"]')).map((option) =>
      option.getAttribute('data-format-option')
    ),
  };
  menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await settle();
  return result;
}
async function choose(root: HTMLElement, name: string, value: string) {
  const menu = await openMenu(root, name);
  const option = menu.querySelector<HTMLButtonElement>(`[data-format-option="${name}:${value}"]`);
  if (!option) throw new Error(`Missing option: ${name}:${value}`);
  option.click();
  await settle();
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
  it('reads and applies only rectangular selected cells, including null versus explicit zero', async () => {
    const editor = mount(
      '<table><tr><td><p style="text-indent:0em;line-height:1.5"><span style="letter-spacing:0px;font-size:36px;color:red">A</span></p></td><td><p>B</p></td></tr><tr><td><p style="text-indent:0em;line-height:1.5"><span style="letter-spacing:0px;font-size:36px;color:red">C</span></p></td><td><p>D</p></td></tr></table>'
    );
    selectCells(editor, 0, 2);
    const root = mountToolbar(editor);
    await settle();
    expect((await menuState(root, 'firstLineIndent')).checked).toEqual(['firstLineIndent:0em']);
    expect((await menuState(root, 'lineHeight')).checked).toEqual(['lineHeight:1.5']);
    expect((await menuState(root, 'letterSpacing')).checked).toEqual(['letterSpacing:0px']);
    expect(root.querySelector('[data-format-control="fontSize"]')?.textContent).toContain('36px');
    expect((await menuState(root, 'color')).heading).not.toContain(messages['en-US'].admin9Ui.tiptapEditor.mixedFormat);
    await choose(root, 'firstLineIndent', '2em');
    await choose(root, 'lineHeight', '2');
    await choose(root, 'letterSpacing', '2px');
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(editor.state.selection.ranges).toHaveLength(2);
    expect((await menuState(root, 'firstLineIndent')).checked).toEqual(['firstLineIndent:2em']);
    expect((await menuState(root, 'lineHeight')).checked).toEqual(['lineHeight:2']);
    expect((await menuState(root, 'letterSpacing')).checked).toEqual(['letterSpacing:2px']);
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
    await choose(root, 'letterSpacing', 'default');
    const colors: unknown[] = [];
    editor.state.doc.descendants((node) => {
      if (node.isText) colors.push(node.marks.find((mark) => mark.type.name === 'textStyle')?.attrs.color ?? null);
    });
    expect(colors[0]).toBeTruthy();
    expect(colors).toEqual([colors[0], null, colors[0], null]);
    await choose(root, 'firstLineIndent', 'default');
    await choose(root, 'letterSpacing', '0px');
    selectCells(editor, 0, 1);
    await settle();
    expect((await menuState(root, 'firstLineIndent')).checked).toEqual(['firstLineIndent:default']);
    const spacing = await menuState(root, 'letterSpacing');
    expect(spacing.heading).toContain(messages['en-US'].admin9Ui.tiptapEditor.mixedFormat);
    expect(spacing.checked).toEqual([]);
    selectCells(editor, 0, 2);
    await choose(root, 'firstLineIndent', '0em');
    selectCells(editor, 0, 1);
    await settle();
    const indent = await menuState(root, 'firstLineIndent');
    expect(indent.heading).toContain(messages['en-US'].admin9Ui.tiptapEditor.mixedFormat);
    expect(indent.checked).toEqual([]);
  });

  it('excludes a trailing unselected paragraph at a text selection boundary', async () => {
    const editor = mount('<p>A</p><p style="line-height:2;text-indent:2em">B</p>');
    editor.commands.setTextSelection({ from: 1, to: 4 });
    const root = mountToolbar(editor);
    await settle();
    expect((await menuState(root, 'lineHeight')).checked).toEqual(['lineHeight:default']);
    await choose(root, 'lineHeight', '1');
    await choose(root, 'firstLineIndent', '0em');
    expect(editor.state.doc.child(0).attrs).toMatchObject({ lineHeight: '1', firstLineIndent: '0em' });
    expect(editor.state.doc.child(1).attrs).toMatchObject({ lineHeight: '2', firstLineIndent: '2em' });
  });

  it('localizes controls, filters highlight and applies/resets each spacing attribute', async () => {
    const editor = mount('<p>Text</p>');
    editor.commands.selectAll();
    const root = mountToolbar(editor, false);
    await settle();
    expect(root.querySelector('[data-format-control="highlight"]')).toBeNull();
    expect(root.querySelector('[data-format-control="letterSpacing"]')?.textContent).toContain(
      messages['en-US'].admin9Ui.tiptapEditor.textLayout
    );
    expect(root.querySelector('[data-format-control="firstLineIndent"]')?.getAttribute('aria-label')).toBe(
      messages['en-US'].admin9Ui.tiptapEditor.firstLineIndent
    );
    const exercise = async (attribute: string, value: string) => {
      await choose(root, attribute, value);
      const attrs = () =>
        attribute === 'letterSpacing'
          ? editor.state.doc.firstChild?.firstChild?.marks.find((mark) => mark.type.name === 'textStyle')?.attrs
          : editor.state.doc.firstChild?.attrs;
      expect(attrs()?.[attribute]).toBe(value);
      expect((await menuState(root, attribute)).checked).toEqual([`${attribute}:${value}`]);
      await choose(root, attribute, 'default');
      expect(attrs()?.[attribute] ?? null).toBeNull();
      expect((await menuState(root, attribute)).checked).toEqual([`${attribute}:default`]);
    };
    await exercise('firstLineIndent', '2em');
    await exercise('lineHeight', '1.5');
    await exercise('letterSpacing', '2px');
  });
});
