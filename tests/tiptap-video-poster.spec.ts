/* eslint-disable no-script-url -- Unsafe URL fixtures verify poster sanitization. */
import { afterEach, describe, expect, it } from 'vitest';
import { Editor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { createApp, h, nextTick, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { Video, Audio } from '../src/components/tiptap-editor/media-node';
import { parseTiptapDocument } from '../src/components/tiptap-editor/content';
import { messages } from '../src/locale';

const editors: Editor[] = [];
const apps: App[] = [];
function mount(content = '<p></p>') {
  const editor = new Editor({ extensions: [StarterKit, Video, Audio], content });
  editors.push(editor);
  return editor;
}
const videoDocument = (poster: unknown) => ({
  type: 'doc',
  content: [{ type: 'video', attrs: { src: '/video.mp4', poster } }],
});
function renderedVideo(editor: Editor) {
  const template = document.createElement('template');
  template.innerHTML = editor.getHTML();
  return template.content.querySelector('video');
}
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.innerHTML = '';
});

describe('video poster preservation', () => {
  it.each(['/covers/frame.jpg', './frame.jpg', 'http://example.com/frame.jpg', 'https://example.com/frame.jpg'])(
    'round trips safe HTML and JSON poster %s',
    (poster) => {
      const editor = mount(`<video src="/video.mp4" poster="${poster}"></video>`);
      expect(editor.state.doc.firstChild?.attrs.poster).toBe(poster);
      expect(renderedVideo(editor)?.getAttribute('poster')).toBe(poster);
      expect(mount(editor.getHTML()).state.doc.firstChild?.attrs.poster).toBe(poster);
      const normalized = parseTiptapDocument(videoDocument(poster), editor);
      expect(normalized.firstChild?.attrs.poster).toBe(poster);
      editor.commands.setContent(normalized.toJSON());
      expect(renderedVideo(editor)?.getAttribute('poster')).toBe(poster);
      expect(parseTiptapDocument(editor.getJSON(), editor).toJSON()).toEqual(editor.getJSON());
    }
  );

  it.each([
    '',
    '   ',
    'javascript:alert(1)',
    'java\nscript:alert(1)',
    'data:image/png;base64,AAAA',
    'blob:missing',
    'file:///tmp/frame.jpg',
    'vbscript:alert(1)',
  ])('omits empty or unsafe poster %j without dropping the video', (poster) => {
    const editor = mount(`<video src="/video.mp4" poster="${poster}"></video>`);
    expect(editor.state.doc.firstChild?.type.name).toBe('video');
    expect(editor.state.doc.firstChild?.attrs.poster).toBeNull();
    expect(renderedVideo(editor)?.hasAttribute('poster')).toBe(false);
    const normalized = parseTiptapDocument(videoDocument(poster), editor);
    expect(normalized.firstChild?.attrs.poster).toBeNull();
    // Rendering also guards callers that set raw generic node attributes directly.
    editor.commands.setContent(videoDocument(poster));
    expect(renderedVideo(editor)?.hasAttribute('poster')).toBe(false);
  });

  it.each([null, undefined, 42, {}])('normalizes missing or non-string JSON poster %j to null', (poster) => {
    const editor = mount();
    expect(parseTiptapDocument(videoDocument(poster), editor).firstChild?.attrs.poster).toBeNull();
  });

  it('keeps poster exclusive to video and leaves audio attributes unchanged', () => {
    const editor = mount('<audio src="/audio.mp3" poster="/cover.jpg"></audio>');
    expect(editor.schema.nodes.audio.spec.attrs).not.toHaveProperty('poster');
    expect(editor.state.doc.firstChild?.attrs).not.toHaveProperty('poster');
    expect(editor.getHTML()).not.toContain('poster=');
    const normalized = parseTiptapDocument(
      { type: 'doc', content: [{ type: 'audio', attrs: { src: '/audio.mp3', poster: '/cover.jpg' } }] },
      editor
    );
    expect(normalized.firstChild?.attrs).not.toHaveProperty('poster');
  });

  it('binds and updates safe poster in the Vue NodeView and omits unsafe values', async () => {
    const editor = mount('<video src="/video.mp4" poster="/cover.jpg"></video>');
    const root = document.createElement('div');
    document.body.append(root);
    const app = createApp({ render: () => h(EditorContent, { editor }) });
    app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
    apps.push(app);
    app.mount(root);
    await nextTick();
    expect(root.querySelector('[data-media-node="video"] video')?.getAttribute('poster')).toBe('/cover.jpg');
    editor.commands.setNodeSelection(0);
    editor.commands.updateAttributes('video', { poster: 'https://example.com/new.jpg' });
    await nextTick();
    expect(root.querySelector('video')?.getAttribute('poster')).toBe('https://example.com/new.jpg');
    editor.commands.updateAttributes('video', { poster: 'javascript:alert(1)' });
    await nextTick();
    expect(root.querySelector('video')?.hasAttribute('poster')).toBe(false);
    editor.commands.updateAttributes('video', { poster: '' });
    await nextTick();
    expect(root.querySelector('video')?.hasAttribute('poster')).toBe(false);
  });
});
