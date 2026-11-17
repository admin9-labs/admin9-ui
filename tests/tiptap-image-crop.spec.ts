import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { closeHistory } from '@tiptap/pm/history';
import { createEditorImageCrop, type EditorImageCropConfig } from '../src/components/tiptap-editor/image-crop';
import { BlockImage, InlineImage } from '../src/components/tiptap-editor/media-node';
import type { FileItem, FileUploadOptions } from '../src/services/types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const file = new File(['image'], 'crop.png', { type: 'image/png' });
const item: FileItem = { id: 'crop', name: file.name, type: 'image', groupId: null, url: '/crop.png' };
const flush = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));
function mount() {
  const editor = new Editor({
    extensions: [StarterKit, BlockImage, InlineImage],
    content: '<p>before</p><img src="/original.png" alt="original" data-display="block"><p>after</p>',
  });
  const read = deferred<File>();
  const crop = deferred<File | null>();
  const upload = deferred<FileItem>();
  const readSource = vi.fn((options: { src: string; signal: AbortSignal }) => {
    expect(options.src).toBe('/original.png');
    return read.promise;
  });
  const uploadFile = vi.fn((options: FileUploadOptions) => {
    expect(options.fileTypes).toEqual(['image']);
    return upload.promise;
  });
  const onState = vi.fn();
  const onError = vi.fn();
  let editable = true;
  const config: EditorImageCropConfig = {
    source: { maxBytes: 1000, maxPixels: 1000 },
    output: { format: 'image/png', maxBytes: 1000, resize: { mode: 'max', longEdge: 100 } },
    readSource,
  };
  const controller = createEditorImageCrop({
    getEditor: () => editor,
    editable: () => editable,
    config: () => config,
    service: () => ({ list: vi.fn(), upload: uploadFile }),
    crop: () => crop.promise,
    onState,
    onError,
  });
  cleanup.push(() => {
    controller.cancel();
    editor.destroy();
  });
  let pos = -1;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === 'blockImage') pos = position;
  });
  expect(pos).toBeGreaterThanOrEqual(0);
  return {
    editor,
    controller,
    read,
    crop,
    upload,
    readSource,
    uploadFile,
    onState,
    onError,
    pos,
    disable: () => {
      editable = false;
    },
  };
}

describe('editor image crop controller', () => {
  it('maps the target across transactions, preserves attributes, and isolates undo/redo', async () => {
    const { editor, controller, read, crop, upload, pos, onState, onError } = mount();
    const updates: boolean[] = [];
    editor.on('update', () => updates.push(onState.mock.calls.at(-1)?.[0] === true));
    const result = controller.start(pos);
    editor.commands.insertContentAt(1, 'added ');
    editor.view.dispatch(closeHistory(editor.state.tr));
    read.resolve(file);
    await flush();
    controller.setCommitPending(true);
    crop.resolve(file);
    controller.setCommitPending(false);
    await flush();
    expect(onState.mock.calls).toEqual([[true]]);
    upload.resolve(item);
    await result;
    expect(editor.state.doc.nodeAt(pos + 6)?.attrs).toMatchObject({ src: '/crop.png', alt: 'original' });
    expect(updates.at(-1)).toBe(true);
    expect(onState.mock.calls).toEqual([[true], [false]]);
    editor.commands.insertContentAt(1, 'next ');
    editor.commands.undo();
    expect(editor.getHTML()).toContain('/crop.png');
    editor.commands.undo();
    expect(editor.getHTML()).toContain('/original.png');
    expect(editor.state.doc.textContent).toContain('added before');
    editor.commands.redo();
    expect(editor.getHTML()).toContain('/crop.png');
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(['delete', 'replace', 'type', 'disabled', 'cancel'] as const)('ignores late upload after %s', async (action) => {
    const { editor, controller, read, crop, upload, uploadFile, onState, onError, pos, disable } = mount();
    const result = controller.start(pos);
    read.resolve(file);
    await flush();
    crop.resolve(file);
    await flush();
    const { signal } = uploadFile.mock.calls[0][0];
    if (action === 'delete') editor.commands.deleteRange({ from: pos, to: pos + 1 });
    if (action === 'replace') editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { src: '/external.png' }));
    if (action === 'type') editor.commands.insertContentAt({ from: pos, to: pos + 1 }, '<p>replacement</p>');
    if (action === 'disabled') disable();
    if (action === 'cancel') controller.cancel();
    if (action !== 'disabled') {
      expect(signal?.aborted).toBe(true);
      expect(onState).toHaveBeenLastCalledWith(false);
    }
    upload.resolve(item);
    await result;
    expect(signal?.aborted).toBe(true);
    expect(editor.getHTML()).not.toContain('/crop.png');
    expect(onError).not.toHaveBeenCalled();
  });

  it('aborts reads synchronously and ignores an earlier generation', async () => {
    const { controller, readSource, read, crop, uploadFile, pos } = mount();
    const first = controller.start(pos);
    const signal = readSource.mock.calls[0]?.[0]?.signal;
    controller.cancel();
    expect(signal?.aborted).toBe(true);
    const second = controller.start(pos);
    read.resolve(file);
    await flush();
    crop.resolve(null);
    await Promise.all([first, second]);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('releases an encode error false event while the crop dialog stays open', async () => {
    const { controller, read, crop, onState, uploadFile, pos } = mount();
    const result = controller.start(pos);
    read.resolve(file);
    await flush();
    controller.setCommitPending(true);
    controller.setCommitPending(false);
    await flush();
    expect(onState.mock.calls).toEqual([[true], [false]]);
    controller.setCommitPending(true);
    crop.resolve(null);
    await result;
    expect(onState.mock.calls).toEqual([[true], [false], [true], [false]]);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it.each(['read', 'crop', 'upload'] as const)('reports %s failures before releasing pending', async (phase) => {
    const { controller, read, crop, upload, pos, onError, onState } = mount();
    const cause = new Error(phase);
    const result = controller.start(pos);
    if (phase === 'read') read.reject(cause);
    else {
      read.resolve(file);
      await flush();
      controller.setCommitPending(true);
      if (phase === 'crop') crop.reject(cause);
      else {
        crop.resolve(file);
        await flush();
        upload.reject(cause);
      }
    }
    await result;
    expect(onError).toHaveBeenCalledWith({ phase, cause });
    if (phase !== 'read') expect(onError.mock.invocationCallOrder[0]).toBeLessThan(onState.mock.invocationCallOrder[1]);
  });

  it('preserves inline image marks and layout on commit', async () => {
    const { controller, editor, read, crop, upload } = mount();
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'inlineImage', attrs: { src: '/original.png', alt: 'inline', size: '2em' }, marks: [{ type: 'bold' }] },
          ],
        },
      ],
    });
    const result = controller.start(1);
    read.resolve(file);
    await flush();
    crop.resolve(file);
    await flush();
    upload.resolve(item);
    await result;
    const node = editor.state.doc.nodeAt(1);
    expect(node?.attrs).toMatchObject({ src: '/crop.png', alt: 'inline', size: '2em' });
    expect(node?.marks.map((mark) => mark.type.name)).toEqual(['bold']);
  });

  it('invalidates a delete/reinsert even when the replacement has the same source', async () => {
    const { controller, editor, read, crop, uploadFile, readSource, pos } = mount();
    const result = controller.start(pos);
    const original = editor.state.doc.nodeAt(pos);
    if (!original) throw new Error('missing image');
    editor.view.dispatch(editor.state.tr.replaceWith(pos, pos + original.nodeSize, original));
    expect(readSource.mock.calls[0][0].signal.aborted).toBe(true);
    read.resolve(file);
    crop.resolve(file);
    await result;
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('reports commit errors and releases pending after the error callback', async () => {
    const { controller, editor, read, crop, upload, onError, onState, pos } = mount();
    const result = controller.start(pos);
    read.resolve(file);
    await flush();
    crop.resolve(file);
    await flush();
    const cause = new Error('dispatch failed');
    const dispatch = vi.spyOn(editor.view, 'dispatch').mockImplementation(() => {
      throw cause;
    });
    upload.resolve(item);
    await result;
    dispatch.mockRestore();
    expect(onError).toHaveBeenCalledWith({ phase: 'commit', cause });
    expect(onError.mock.invocationCallOrder[0]).toBeLessThan(onState.mock.invocationCallOrder[1]);
    expect(editor.getHTML()).toContain('/original.png');
  });

  it.each(['data:text/plain,invalid', 'blob:https://example.com/temporary'])(
    'rejects nonpersistent crop URL %s before unlocking saving',
    async (url) => {
      const { controller, editor, read, crop, upload, onError, onState, pos } = mount();
      const result = controller.start(pos);
      read.resolve(file);
      await flush();
      crop.resolve(file);
      await flush();
      controller.setCommitPending(true);
      const before = editor.state.doc;
      upload.resolve({ ...item, url });
      await result;
      expect(onError).toHaveBeenCalledWith({ phase: 'upload', cause: expect.any(Error) });
      expect(editor.getHTML()).toContain('/original.png');
      expect(editor.state.doc).toBe(before);
      expect(onState.mock.calls).toEqual([[true], [false]]);
      expect(onError.mock.invocationCallOrder[0]).toBeLessThan(onState.mock.invocationCallOrder[1]);
    }
  );
});
