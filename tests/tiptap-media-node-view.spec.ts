import { createApp, h, nextTick, type App } from 'vue';
import { Editor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { NodeSelection } from '@tiptap/pm/state';
import { undoDepth, redoDepth } from '@tiptap/pm/history';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it } from 'vitest';
import { messages } from '../src/locale';
import { BlockImage, InlineImage } from '../src/components/tiptap-editor/media-node';

let app: App;
let editor: Editor;
const source = 'https://example.com/image.png';
const tick = async () => {
  await nextTick();
  await nextTick();
};
const image = () => {
  const element = document.querySelector<HTMLImageElement>('[data-media-node] img');
  if (!element) throw new Error('Image node did not render');
  return element;
};
const failure = () => document.querySelector('.a9-media-image-failure');
const button = (label: string) => {
  const element = [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === label);
  if (!element) throw new Error(`Missing button: ${label}`);
  return element;
};
async function mount(inline = false, editable = true) {
  document.body.innerHTML = '<div id="app"></div>';
  const node = { type: inline ? 'inlineImage' : 'blockImage', attrs: { src: source, alt: 'Existing image' } };
  editor = new Editor({
    extensions: [StarterKit.configure({ trailingNode: false }), BlockImage, InlineImage],
    editable,
    content: { type: 'doc', content: inline ? [{ type: 'paragraph', content: [node] }] : [node] },
  });
  app = createApp({ render: () => h(EditorContent, { editor }) });
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  app.mount('#app');
  await tick();
}
afterEach(() => {
  app?.unmount();
  editor?.destroy();
});

describe('media image load recovery', () => {
  it.each([false, true])(
    'only reports actual errors and reloads without document/history changes (inline %s)',
    async (inline) => {
      await mount(inline);
      const originalJSON = editor.getJSON();
      const originalHTML = editor.getHTML();
      const before = image();
      expect(failure()).toBeNull();
      expect(before.getAttribute('loading')).toBe(inline ? null : 'lazy');
      before.dispatchEvent(new Event('error'));
      await tick();
      expect(failure()?.textContent).toContain('Image could not be loaded');
      const retry = button('Reload');
      retry.focus();
      retry.click();
      await tick();
      const retryImage = image();
      expect(retryImage).not.toBe(before);
      expect(retryImage.getAttribute('src')).toBe(source);
      expect(retryImage.getAttribute('loading')).toBe('eager');
      expect(failure()?.textContent).toContain('Reloading image');
      expect(retry.getAttribute('aria-disabled')).toBe('true');
      retry.click();
      await tick();
      expect(image()).toBe(retryImage);
      retryImage.dispatchEvent(new Event('load'));
      await tick();
      expect(failure()).toBeNull();
      expect(document.activeElement).toBe(retryImage);
      expect(editor.getJSON()).toEqual(originalJSON);
      expect(editor.getHTML()).toBe(originalHTML);
      expect(undoDepth(editor.state)).toBe(0);
      expect(redoDepth(editor.state)).toBe(0);
    }
  );

  it('offers another retry after failure and ignores a stale request after replacement', async () => {
    await mount();
    image().dispatchEvent(new Event('error'));
    await tick();
    button('Reload').click();
    await tick();
    const oldImage = image();
    oldImage.dispatchEvent(new Event('error'));
    await tick();
    expect(button('Reload').getAttribute('aria-disabled')).toBe('false');
    expect(failure()?.textContent).toContain('Image could not be loaded');
    editor.commands.setNodeSelection(0);
    editor.commands.updateAttributes('blockImage', { src: 'https://example.com/replacement.png' });
    await tick();
    expect(image()).not.toBe(oldImage);
    expect(failure()).toBeNull();
    expect(image().getAttribute('src')).toBe('https://example.com/replacement.png');
    oldImage.dispatchEvent(new Event('error'));
    oldImage.dispatchEvent(new Event('load'));
    await tick();
    expect(failure()).toBeNull();
    image().dispatchEvent(new Event('error'));
    await tick();
    expect(failure()?.textContent).toContain('Image could not be loaded');
    oldImage.dispatchEvent(new Event('load'));
    await tick();
    expect(failure()).not.toBeNull();
  });

  it.each([false, true])('selects the failed image for existing toolbar actions (inline %s)', async (inline) => {
    await mount(inline);
    const original = editor.getJSON();
    image().dispatchEvent(new Event('error'));
    await tick();
    button('Image actions').click();
    await tick();
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).node.type.name).toBe(inline ? 'inlineImage' : 'blockImage');
    expect(editor.getJSON()).toEqual(original);
    expect(undoDepth(editor.state)).toBe(0);
  });

  it('allows read-only reload without offering editing actions', async () => {
    await mount(false, false);
    image().dispatchEvent(new Event('error'));
    await tick();
    expect(failure()?.textContent).not.toContain('Image actions');
    button('Reload').click();
    await tick();
    image().dispatchEvent(new Event('load'));
    await tick();
    expect(failure()).toBeNull();
    expect(undoDepth(editor.state)).toBe(0);
  });

  it('updates failure actions across disabled and readonly transitions without a document transaction', async () => {
    await mount();
    image().dispatchEvent(new Event('error'));
    await tick();
    expect(button('Image actions')).toBeDefined();
    const original = editor.getJSON();
    editor.setOptions({ editorProps: { attributes: { 'aria-disabled': 'true', 'aria-readonly': 'false' } } });
    editor.setEditable(false, false);
    await tick();
    expect(failure()?.textContent).not.toContain('Image actions');
    const failedImage = image();
    expect(button('Reload').disabled).toBe(true);
    button('Reload').click();
    await tick();
    expect(image()).toBe(failedImage);
    editor.setOptions({ editorProps: { attributes: { 'aria-disabled': 'false', 'aria-readonly': 'true' } } });
    await tick();
    expect(button('Reload').disabled).toBe(false);
    expect(failure()?.textContent).not.toContain('Image actions');
    button('Reload').click();
    await tick();
    expect(image()).not.toBe(failedImage);
    image().dispatchEvent(new Event('error'));
    await tick();
    editor.setOptions({ editorProps: { attributes: { 'aria-disabled': 'false', 'aria-readonly': 'false' } } });
    editor.setEditable(true, false);
    await tick();
    expect(button('Image actions')).toBeDefined();
    expect(editor.getJSON()).toEqual(original);
    expect(undoDepth(editor.state)).toBe(0);
  });
});
