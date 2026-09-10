import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { createImageUploads } from '../src/components/tiptap-editor/image-upload';
import { BlockImage, InlineImage } from '../src/components/tiptap-editor/media-node';
import { getDocumentSnapshot, parseTiptapDocument } from '../src/components/tiptap-editor/content';
import type { FileItem, FileUploadOptions } from '../src/services/types';

const ready = (id = 'one'): FileItem => ({ id, name: 'image.png', url: `/images/${id}.png`, type: 'image', groupId: null });
const flush = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};
const cleanup: (() => void)[] = [];
function mount(upload: (options: FileUploadOptions) => Promise<FileItem>) {
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, { createObjectURL: () => 'blob:preview', revokeObjectURL: vi.fn() })
  );
  let editor: Editor | undefined;
  let enabled = true;
  const error = vi.fn();
  const queue = createImageUploads({
    editor: () => editor,
    enabled: () => enabled,
    service: () => ({ list: vi.fn(), upload }),
    display: () => 'block',
    t: (key) => key,
    state: vi.fn(),
    error,
  });
  editor = new Editor({
    extensions: [StarterKit, BlockImage, InlineImage, queue.extension],
    content: '<p>Before</p>',
    onTransaction: () => queue.sync(),
  });
  cleanup.push(() => {
    queue.dispose();
    editor?.destroy();
  });
  return {
    editor,
    queue,
    error,
    disable: () => {
      enabled = false;
      queue.pause();
    },
  };
}
const file = () => new File(['image'], 'image.png', { type: 'image/png' });
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});

describe('editor-local image uploads', () => {
  it('preserves focused action buttons when another image reports progress', async () => {
    let progress: FileUploadOptions['onProgress'];
    let calls = 0;
    const { editor, queue } = mount((options) => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('failed'));
      progress = options.onProgress;
      return new Promise(() => {
        /* Keep the second upload active while testing the first task's focus. */
      });
    });
    document.body.append(editor.view.dom);
    queue.insert([file(), file()], 'paste', 7);
    await flush();
    const retry = [...editor.view.dom.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'retryUpload'
    );
    if (!retry) throw new Error('Retry button did not mount');
    retry.focus();
    expect(document.activeElement).toBe(retry);
    progress?.(20);
    await flush();
    expect(retry.isConnected).toBe(true);
    expect(document.activeElement).toBe(retry);
  });
  it('undoes and redoes a completed insertion without uploading again', async () => {
    const upload = vi.fn(async () => ready());
    const { editor, queue } = mount(upload);
    queue.insert([file()], 'paste', 7);
    await flush();
    expect(editor.getHTML()).toContain('/images/one.png');
    editor.commands.undo();
    await flush();
    expect(editor.getHTML()).not.toContain('<img');
    editor.commands.redo();
    await flush();
    expect(editor.getHTML()).toContain('/images/one.png');
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it('keeps placeholders private and replaces them with editable media in place', async () => {
    let complete!: (item: FileItem) => void;
    const { editor, queue } = mount(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    );
    queue.insert([file()], 'paste', 7);
    await flush();
    expect(queue.state().canSave).toBe(false);
    expect(JSON.stringify(getDocumentSnapshot(editor.state.doc))).not.toContain('a9ImageUpload');
    editor.commands.insertContentAt(1, 'Added ');
    complete(ready());
    await flush();
    expect(queue.state().canSave).toBe(true);
    expect(editor.getHTML()).toContain('data-display="block"');
    expect(editor.getHTML()).toContain('/images/one.png');
    expect(editor.getHTML()).not.toContain('data-a9-upload');
    expect(editor.state.doc.textContent).toContain('Added Before');
    expect(parseTiptapDocument(getDocumentSnapshot(editor.state.doc), editor).eq(editor.state.doc)).toBe(true);
  });

  it('cancels deleted placeholders and ignores late upload responses', async () => {
    let complete!: (item: FileItem) => void;
    let signal: AbortSignal | undefined;
    const { editor, queue } = mount((options) => {
      signal = options.signal;
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    queue.insert([file()], 'paste', 7);
    await flush();
    let position = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'a9ImageUpload') position = pos;
    });
    editor.commands.deleteRange({ from: position, to: position + 1 });
    expect(signal?.aborted).toBe(true);
    complete(ready());
    await flush();
    expect(editor.getHTML()).not.toContain('<img');
    expect(queue.state().canSave).toBe(true);
  });

  it('limits concurrency to three and keeps input order when responses arrive out of order', async () => {
    const completions: ((item: FileItem) => void)[] = [];
    const { editor, queue } = mount(
      () =>
        new Promise((resolve) => {
          completions.push(resolve);
        })
    );
    queue.insert([file(), file(), file(), file()], 'drop', 7);
    await flush();
    expect(completions).toHaveLength(3);
    completions[1](ready('second'));
    await flush();
    expect(completions).toHaveLength(4);
    completions[0](ready('first'));
    completions[2](ready('third'));
    completions[3](ready('fourth'));
    await flush();
    const html = editor.getHTML();
    expect(html.indexOf('first.png')).toBeLessThan(html.indexOf('second.png'));
    expect(html.indexOf('second.png')).toBeLessThan(html.indexOf('third.png'));
    expect(queue.state().canSave).toBe(true);
  });

  it('rejects temporary result URLs and supports failure feedback', async () => {
    const { queue, error } = mount(async () => ({ ...ready(), url: 'blob:temporary' }));
    queue.insert([file()], 'paste', 7);
    await flush();
    expect(queue.state()).toEqual({ pending: 0, uploading: 0, failed: 1, canSave: false });
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ reason: 'invalid-result' }));
  });

  it('does not serialize or accept internal placeholder nodes in JSON', () => {
    const { editor, queue } = mount(async () => ready());
    queue.insert([file()], 'paste', 7);
    expect(() => parseTiptapDocument(editor.getJSON(), editor)).toThrow('private');
    expect(() => parseTiptapDocument(getDocumentSnapshot(editor.state.doc), editor)).not.toThrow();
  });
});
