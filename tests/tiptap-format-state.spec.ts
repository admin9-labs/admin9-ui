import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { CellSelection } from '@tiptap/pm/tables';
import { undoDepth } from '@tiptap/pm/history';
import ArcoVue from '@arco-design/web-vue';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { messages } from '../src/locale';
import Toolbar from '../src/components/tiptap-editor/text-format-toolbar.vue';
import {
  readBlockFormat,
  readInlineFormat,
  setBlockFormat,
  setInlineFormat,
} from '../src/components/tiptap-editor/format-state';
import { SafeColor, SafeFontSize, SafeHighlight, TextFormat, TextStyle } from '../src/components/tiptap-editor/text-format';

const editors: Editor[] = [];
const apps: App[] = [];
function makeEditor(content: string) {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({
    element,
    content,
    extensions: [StarterKit, TextStyle, SafeColor, SafeFontSize, SafeHighlight, TextFormat, TableKit],
  });
  editors.push(editor);
  return editor;
}
async function flush() {
  await nextTick();
  await new Promise((resolve) => {
    setTimeout(resolve, 30);
  });
  await nextTick();
}
function mount(editor: Editor, section: 'all' | 'size' | 'colors' | 'spacing' = 'all', embedded = false) {
  const root = document.createElement('div');
  document.body.append(root);
  const props = reactive({ disabled: false, section, embedded });
  let applied = 0;
  const app = createApp({
    render: () =>
      h(Toolbar, {
        editor,
        ...props,
        onApply: () => {
          applied += 1;
        },
      }),
  });
  app.use(ArcoVue);
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  app.mount(root);
  apps.push(app);
  return { root, props, applied: () => applied };
}
function button(label: string, root: ParentNode = document) {
  const found = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
    (item) => item.getAttribute('aria-label') === label || item.textContent?.trim() === label
  );
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
async function openColor(root: HTMLElement, label = 'Text color') {
  const trigger = button(label, root);
  trigger.click();
  await flush();
  return trigger;
}
async function chooseColor(value = 'C0A5A5') {
  const input = document.querySelector<HTMLInputElement>('.arco-color-picker-input-hex input');
  if (!input) throw new Error('Missing real Arco color input');
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  input.blur();
  await flush();
}
// Happy DOM preserves authored CSS color strings. Emulate the browser's computed-color
// serialization only; selection, marks, transactions and document preservation remain real.
function resolveComputedColors() {
  const original = window.getComputedStyle.bind(window);
  const resolved: Record<string, string> = {
    'red': 'rgb(255, 0, 0)',
    '#f00': 'rgb(255, 0, 0)',
    '#ff0000': 'rgb(255, 0, 0)',
    'hsl(0, 100%, 50%)': 'rgb(255, 0, 0)',
    'yellow': 'rgb(255, 255, 0)',
    '#ffff00': 'rgb(255, 255, 0)',
  };
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const style = original(element);
    return new Proxy(style, {
      get: (target, key) =>
        key === 'color' && element.isConnected ? resolved[target.color] ?? target.color : Reflect.get(target, key),
    });
  });
}
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.innerHTML = '';
});

describe('format selection state and surgical commands', () => {
  it('distinguishes inherited color, explicit color, default highlight, no highlight and mixed highlight', () => {
    const editor = makeEditor('<p>A<mark>B</mark><span style="color:red">C</span></p>');
    editor.commands.setTextSelection({ from: 1, to: 2 });
    expect(readInlineFormat(editor.state, 'color').value).toBe('');
    expect(readInlineFormat(editor.state, 'highlight').value).toBe('');
    editor.commands.setTextSelection({ from: 2, to: 3 });
    expect(readInlineFormat(editor.state, 'highlight').value).toBe('default-highlight');
    editor.commands.setTextSelection({ from: 3, to: 4 });
    expect(readInlineFormat(editor.state, 'color').value).toBe('red');
    editor.commands.selectAll();
    expect(readInlineFormat(editor.state, 'highlight').value).toBe('mixed');
    expect(readInlineFormat(editor.state, 'color').value).toBe('mixed');
  });

  it.each(['color', 'highlight'] as const)(
    'compares equivalent explicit %s without rewriting old HTML or adding steps',
    (key) => {
      resolveComputedColors();
      const wrap = (color: string, value: string) =>
        key === 'color' ? `<span style="color:${color}">${value}</span>` : `<mark data-color="${color}">${value}</mark>`;
      const editor = makeEditor(`<p>${wrap('red', 'A')}${wrap('#ff0000', 'B')}${wrap('hsl(0, 100%, 50%)', 'C')}</p>`);
      editor.commands.selectAll();
      const before = editor.getHTML();
      const bodyChildren = document.documentElement.childElementCount;
      expect(readInlineFormat(editor.state, key).value).toBe('red');
      expect(setInlineFormat(editor.state, key, 'rgb(255, 0, 0)').steps).toHaveLength(0);
      expect(editor.getHTML()).toBe(before);
      expect(document.documentElement.childElementCount).toBe(bodyChildren);
      editor.commands.setTextSelection(2);
      const cursor = setInlineFormat(editor.state, key, '#f00');
      expect(cursor.storedMarksSet).toBe(false);
    }
  );

  it('keeps default color, no highlight and default highlight distinct from explicit colors', () => {
    resolveComputedColors();
    const editor = makeEditor('<p>A<span style="color:red">B</span><mark>C</mark><mark data-color="yellow">D</mark></p>');
    editor.commands.setTextSelection({ from: 1, to: 3 });
    expect(readInlineFormat(editor.state, 'color').value).toBe('mixed');
    const color = setInlineFormat(editor.state, 'color', '#ff0000');
    expect(color.steps.length).toBeGreaterThan(0);
    editor.commands.setTextSelection({ from: 3, to: 5 });
    expect(readInlineFormat(editor.state, 'highlight').value).toBe('mixed');
    expect(setInlineFormat(editor.state, 'highlight', '#ffff00').steps.length).toBeGreaterThan(0);
    editor.commands.setTextSelection({ from: 1, to: 2 });
    expect(setInlineFormat(editor.state, 'highlight', '#ffff00').steps.length).toBeGreaterThan(0);
  });

  it('flags selected empty text blocks, but excludes an unselected trailing empty block', () => {
    const editor = makeEditor('<p>A</p><p></p>');
    editor.commands.setTextSelection({ from: 1, to: 4 });
    expect(readInlineFormat(editor.state, 'fontSize')).toEqual({ value: '', partial: false });
    editor.commands.selectAll();
    expect(readInlineFormat(editor.state, 'fontSize')).toEqual({ value: '', partial: true, hasEmpty: true });
    expect(readBlockFormat(editor.state, 'firstLineIndent')).toEqual({ value: '', partial: false });
  });

  it('explains an all-empty cell selection without pretending it has an applicable inline format', () => {
    const editor = makeEditor('<table><tr><td><p></p></td><td><p></p></td></tr></table>');
    const cells: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell') cells.push(pos);
    });
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[0], cells[1])));
    expect(readInlineFormat(editor.state, 'fontSize')).toEqual({ value: 'unavailable', partial: true, hasEmpty: true });
    expect(setInlineFormat(editor.state, 'fontSize', '36px').steps).toHaveLength(0);
    expect(readBlockFormat(editor.state, 'firstLineIndent').partial).toBe(false);
  });

  it('reports partial application to populated and empty cells without assigning a format to future text', () => {
    const editor = makeEditor('<table><tr><td><p><span style="font-size:24px">A</span></p></td><td><p></p></td></tr></table>');
    const cells: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell') cells.push(pos);
    });
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[0], cells[1])));
    expect(readInlineFormat(editor.state, 'fontSize')).toEqual({ value: '24px', partial: true, hasEmpty: true });
    editor.view.dispatch(setInlineFormat(editor.state, 'fontSize', '36px'));
    editor.commands.setTextSelection(cells[1] + 2);
    editor.commands.insertContent('B');
    expect(editor.getHTML()).toContain('font-size: 36px');
    expect(editor.getHTML()).toContain('<p>B</p>');
    editor.commands.undo();
  });

  it('resets only the font size while preserving heading level, color, spacing, highlight and links', () => {
    const editor = makeEditor(
      '<h2 style="text-indent:2em"><a href="/a"><mark><span style="font-size:24px;color:red;letter-spacing:2px">Title</span></mark></a></h2>'
    );
    editor.commands.selectAll();
    editor.view.dispatch(setInlineFormat(editor.state, 'fontSize', null));
    expect(editor.getHTML()).not.toContain('font-size');
    expect(editor.getHTML()).toContain('<h2');
    expect(editor.getHTML()).toContain('text-indent: 2em');
    expect(editor.getHTML()).toContain('color: red');
    expect(editor.getHTML()).toContain('letter-spacing: 2px');
    expect(editor.getHTML()).toContain('<mark>');
    expect(editor.getHTML()).toContain('href="/a"');
  });

  it('reports partial applicability and never formats inline code or code blocks', () => {
    const editor = makeEditor('<p>A<code>B</code></p><pre><code>C</code></pre>');
    editor.commands.selectAll();
    expect(readInlineFormat(editor.state, 'fontSize')).toEqual({ value: '', partial: true, hasEmpty: true });
    expect(readBlockFormat(editor.state, 'firstLineIndent')).toEqual({ value: '', partial: true });
    editor.view.dispatch(setInlineFormat(editor.state, 'fontSize', '24px'));
    expect(editor.getHTML()).toContain('<span style="font-size: 24px;">A</span><code>B</code>');
    expect(editor.getHTML()).toContain('<pre><code>C</code></pre>');
    let codePosition = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'codeBlock') codePosition = pos + 1;
    });
    editor.commands.setTextSelection(codePosition);
    expect(readInlineFormat(editor.state, 'fontSize').value).toBe('unavailable');
  });

  it('keeps null and zero separate and does not create steps for unchanged paragraph or inline formats', () => {
    const editor = makeEditor('<p style="text-indent:0em"><span style="font-size:24px">A</span></p><p>B</p>');
    editor.commands.setTextSelection({ from: 1, to: 2 });
    expect(setInlineFormat(editor.state, 'fontSize', '24px').steps).toHaveLength(0);
    expect(setBlockFormat(editor.state, 'firstLineIndent', '0em').steps).toHaveLength(0);
    editor.commands.selectAll();
    expect(readBlockFormat(editor.state, 'firstLineIndent').value).toBe('mixed');
    editor.view.dispatch(setBlockFormat(editor.state, 'firstLineIndent', '2em'));
    expect(editor.getJSON().content?.map((node) => node.attrs?.firstLineIndent)).toEqual(['2em', '2em']);
  });

  it('changes only selected rectangular cells', () => {
    const editor = makeEditor('<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>');
    const cells: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell') cells.push(pos);
    });
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[0], cells[2])));
    editor.view.dispatch(setInlineFormat(editor.state, 'fontSize', '24px'));
    const sizes: unknown[] = [];
    editor.state.doc.descendants((node) => {
      if (node.isText) sizes.push(node.marks.find((mark) => mark.type.name === 'textStyle')?.attrs.fontSize ?? null);
    });
    expect(sizes).toEqual(['24px', null, '24px', null]);
  });
});

describe('real Arco toolbar integration', () => {
  it('opens the size menu on its current option and supports keyboard selection and Escape', async () => {
    const editor = makeEditor('<p>Text</p>');
    editor.commands.selectAll();
    const { root } = mount(editor, 'size');
    const trigger = button('Font size', root);
    trigger.click();
    await flush();
    expect(document.activeElement?.getAttribute('aria-checked')).toBe('true');
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement?.textContent?.trim()).toBe('12px');
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(editor.getAttributes('textStyle').fontSize).toBe('12px');
    trigger.click();
    await flush();
    expect(document.activeElement?.textContent?.trim()).toBe('12px');
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('focuses the editable color value and closes even when a nested control handles Escape', async () => {
    const editor = makeEditor('<p>Text</p>');
    const { root } = mount(editor, 'colors');
    const trigger = await openColor(root);
    const input = document.querySelector<HTMLInputElement>('.arco-color-picker-input-hex input');
    expect(document.activeElement).toBe(input);
    const nested = document.querySelector<HTMLInputElement>('.arco-color-picker-select input');
    nested?.focus();
    nested?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await flush();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    expect(undoDepth(editor.state)).toBe(0);
  });

  it.each(['Text color', 'Highlight', 'Font size'])(
    'shows %s explanations on keyboard focus through real nested Arco triggers',
    async (label) => {
      const editor = makeEditor('<p>Text</p>');
      const { root } = mount(editor);
      const history = undoDepth(editor.state);
      const trigger = button(label, root);
      trigger.focus();
      await flush();
      expect(document.querySelector('[role="tooltip"]')?.textContent).toContain(label);
      trigger.blur();
      await flush();
      expect(undoDepth(editor.state)).toBe(history);
    }
  );

  it('does not offer a mixed color as current or enable applying an untouched draft; retains 33 presets', async () => {
    const editor = makeEditor('<p>A<span style="color:red">B</span></p>');
    editor.commands.selectAll();
    const { root } = mount(editor, 'colors');
    const before = editor.getHTML();
    const history = undoDepth(editor.state);
    const trigger = await openColor(root);
    expect(trigger.getAttribute('aria-description')).toBe('Mixed formatting');
    expect(trigger.querySelector<HTMLElement>('.a9-text-color-swatch')?.style.backgroundColor).toBe('');
    expect(document.querySelector('.a9-text-format-summary')?.textContent).toContain('Mixed formatting');
    expect(button('Apply').disabled).toBe(true);
    expect(document.querySelectorAll('.arco-color-picker-color-block')).toHaveLength(33);
    expect(editor.getHTML()).toBe(before);
    expect(undoDepth(editor.state)).toBe(history);
  });

  it('keeps a mapped selection when the editor selection moves and another edit shifts its positions', async () => {
    const editor = makeEditor('<p>ABC</p>');
    editor.commands.setTextSelection({ from: 2, to: 3 });
    const { root, applied } = mount(editor, 'colors');
    await openColor(root);
    await chooseColor();
    editor.commands.insertContentAt(1, 'X');
    editor.commands.setTextSelection(1);
    await flush();
    expect(button('Apply').disabled).toBe(false);
    button('Apply').click();
    await flush();
    expect(editor.getHTML()).toMatch(/XA<span style="color: [^"]+;">B<\/span>C/);
    expect(applied()).toBe(1);
    expect(document.activeElement).toBe(editor.view.dom);
    editor.commands.undo();
    expect(editor.getHTML()).toBe('<p>XABC</p>');
  });

  it.each(['Cancel', 'Escape'])('discards draft and returns focus to trigger on %s', async (action) => {
    const editor = makeEditor('<p>Text</p>');
    editor.commands.selectAll();
    const { root } = mount(editor, 'colors');
    const before = editor.getHTML();
    const trigger = await openColor(root);
    await chooseColor();
    if (action === 'Cancel') button('Cancel').click();
    else
      document.querySelector('.a9-text-palette')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
    expect(editor.getHTML()).toBe(before);
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await openColor(root);
    expect(button('Apply').disabled).toBe(true);
  });

  it('discards an outside-click draft without stealing the clicked input focus', async () => {
    const editor = makeEditor('<p>Text</p>');
    const { root } = mount(editor, 'colors');
    const trigger = await openColor(root);
    await chooseColor();
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    input.focus();
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(document.activeElement).toBe(input);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await openColor(root);
    expect(button('Apply').disabled).toBe(true);
  });

  it.each(['replace', 'disabled'])('invalidates an open draft on %s', async (operation) => {
    const editor = makeEditor('<p>Old</p>');
    const { root, props } = mount(editor, 'colors');
    const trigger = await openColor(root);
    await chooseColor();
    if (operation === 'replace') editor.commands.setContent('<p>New</p>');
    else props.disabled = true;
    await flush();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    props.disabled = false;
    await flush();
    await openColor(root);
    expect(button('Apply').disabled).toBe(true);
    expect(editor.getHTML()).not.toContain('color:');
  });

  it('coordinates different section instances and parent overlays by editor owner events', async () => {
    const editor = makeEditor('<p>Text</p>');
    const colors = mount(editor, 'colors');
    const size = mount(editor, 'size');
    const trigger = await openColor(colors.root);
    button('Font size', size.root).click();
    await flush();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(button('Font size', size.root).getAttribute('aria-expanded')).toBe('true');
    editor.view.dom.dispatchEvent(new CustomEvent('a9-editor-overlay-open', { detail: { owner: 'parent' } }));
    await flush();
    expect(button('Font size', size.root).getAttribute('aria-expanded')).toBe('false');
  });

  it('allows an intentional black preset and keeps an untouched explicit color unconfirmed', async () => {
    const editor = makeEditor('<p>Text</p>');
    editor.commands.selectAll();
    const { root } = mount(editor, 'colors');
    await openColor(root);
    const presets = document.querySelectorAll<HTMLElement>('.arco-color-picker-color-block');
    presets[presets.length - 1].click();
    await flush();
    expect(button('Apply').disabled).toBe(false);
    button('Apply').click();
    await flush();
    expect(readInlineFormat(editor.state, 'color').value).not.toBe('');
    await openColor(root);
    expect(button('Apply').disabled).toBe(true);
    button('Restore default text color').click();
    await flush();
    expect(readInlineFormat(editor.state, 'color').value).toBe('');
  });

  it('does not expand partial hex input while typing and disables invalid custom colors', async () => {
    const editor = makeEditor('<p>Text</p>');
    editor.commands.selectAll();
    const { root } = mount(editor, 'colors');
    await openColor(root);
    const input = document.querySelector<HTMLInputElement>('.arco-color-picker-input-hex input');
    if (!input) throw new Error('Missing color input');
    await ['C', 'C0', 'C0A', 'C0A5', 'C0A5A', 'C0A5A5'].reduce(async (previous, value) => {
      await previous;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await nextTick();
      expect(input.value).toBe(value);
    }, Promise.resolve());
    expect(button('Apply').disabled).toBe(false);
    input.value = 'invalid';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(button('Apply').disabled).toBe(true);
  });

  it('uses a short default size trigger and restores only size through the actual dropdown', async () => {
    const editor = makeEditor('<h2><span style="font-size:24px;color:red">Title</span></h2>');
    editor.commands.selectAll();
    const { root } = mount(editor, 'size');
    button('Font size', root).click();
    await flush();
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')).find(
      (node) => node.textContent?.trim() === 'Default (paragraph style)'
    );
    expect(option).toBeTruthy();
    option?.click();
    await flush();
    expect(editor.getHTML()).toContain('<h2>');
    expect(editor.getHTML()).toContain('color: red');
    expect(editor.getHTML()).not.toContain('font-size');
    expect(button('Font size', root).textContent?.trim()).toBe('Default');
    expect(button('Font size', root).getAttribute('aria-description')).toBe('Default (paragraph style)');
    expect(document.activeElement).toBe(editor.view.dom);
  });

  it('exposes default highlight separately and removes it without changing font size', async () => {
    const editor = makeEditor('<p><mark><span style="font-size:24px">Text</span></mark></p>');
    editor.commands.selectAll();
    const { root } = mount(editor, 'colors');
    await openColor(root, 'Highlight');
    expect(document.querySelector('.a9-text-format-summary')?.textContent).toContain('Default highlight');
    button('Remove highlight').click();
    await flush();
    expect(editor.getHTML()).not.toContain('<mark');
    expect(editor.getHTML()).toContain('font-size: 24px');
  });

  it('preserves pending cursor marks when a saved caret is restored for a size choice', async () => {
    const editor = makeEditor('<p>ABC</p>');
    editor.commands.setTextSelection(2);
    editor.commands.setColor('red');
    const { root } = mount(editor, 'size');
    button('Font size', root).click();
    await flush();
    editor.commands.setTextSelection(4);
    await flush();
    const size = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')).find(
      (node) => node.textContent?.trim() === '24px'
    );
    size?.click();
    await flush();
    editor.commands.insertContent('X');
    expect(editor.getHTML()).toContain('A<span style="color: red; font-size: 24px;">X</span>BC');
  });

  it('opens typography from the keyboard and Escape restores its trigger after closing', async () => {
    const editor = makeEditor('<p>Text</p>');
    const { root } = mount(editor, 'spacing');
    const trigger = button('Typography', root);
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await flush();
    const panel = document.querySelector('.a9-spacing-options');
    expect(panel?.contains(document.activeElement)).toBe(true);
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it.each(['size', 'colors', 'spacing'] as const)('shows the existing-text-only explanation for %s', async (section) => {
    const editor = makeEditor('<p>A</p><p></p>');
    editor.commands.selectAll();
    const { root } = mount(editor, section, section === 'spacing');
    if (section === 'size') button('Font size', root).click();
    if (section === 'colors') button('Text color', root).click();
    await flush();
    expect(document.body.textContent).toContain(messages['en-US'].admin9Ui.tiptapEditor.existingTextOnly);
  });

  it('renders three embedded spacing sections and repeated choices do not add history', async () => {
    const editor = makeEditor('<p style="text-indent:2em">Text</p>');
    editor.commands.selectAll();
    const { root, applied } = mount(editor, 'spacing', true);
    expect(root.querySelectorAll('section')).toHaveLength(3);
    expect(root.querySelector('[aria-label="Typography"]')).toBeNull();
    const history = undoDepth(editor.state);
    button('Indent 2 characters', root).click();
    await flush();
    expect(undoDepth(editor.state)).toBe(history);
    expect(applied()).toBe(1);
    expect(document.activeElement).toBe(editor.view.dom);
  });
});
