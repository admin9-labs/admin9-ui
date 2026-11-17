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
  const onPhase = vi.fn();
  const onRetryChange = vi.fn();
  const openCrop = vi.fn();
  let cropResult = crop.promise;
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
    crop: (input) => {
      openCrop(input);
      return cropResult;
    },
    onPhase,
    onRetryChange,
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
    onPhase,
    onRetryChange,
    openCrop,
    setCropResult: (result: Promise<File | null>) => {
      cropResult = result;
    },
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

describe('crop phases and recovery', () => {
  it('reports read synchronously, ignores duplicate starts and keeps preview outside save busy', async () => {
    const { controller, pos, read, crop, upload, readSource, onPhase, onState } = mount();
    const result = controller.start(pos);
    expect(onPhase.mock.calls).toEqual([['read']]);
    await controller.start(pos);
    expect(readSource).toHaveBeenCalledTimes(1);
    expect(readSource.mock.calls[0][0].signal.aborted).toBe(false);
    expect(onState).not.toHaveBeenCalled();
    read.resolve(file);
    await flush();
    expect(onPhase).toHaveBeenLastCalledWith('preview');
    expect(onState).not.toHaveBeenCalled();
    controller.setCommitPending(true);
    expect(onPhase).toHaveBeenLastCalledWith('commit');
    crop.resolve(file);
    controller.setCommitPending(false);
    await flush();
    await controller.start(pos);
    controller.retry();
    expect(readSource).toHaveBeenCalledTimes(1);
    expect(onState.mock.calls).toEqual([[true]]);
    upload.resolve(item);
    await result;
    expect(onPhase.mock.calls).toEqual([['read'], ['preview'], ['commit'], ['idle']]);
    expect(onState.mock.calls).toEqual([[true], [false]]);
  });

  it('returns to preview after encoding fails without ending the session', async () => {
    const { controller, pos, read, crop, onPhase, readSource } = mount();
    const result = controller.start(pos);
    read.resolve(file);
    await flush();
    controller.setCommitPending(true);
    controller.setCommitPending(false);
    await flush();
    expect(onPhase).toHaveBeenLastCalledWith('preview');
    await controller.start(pos);
    expect(readSource).toHaveBeenCalledTimes(1);
    crop.resolve(null);
    await result;
    expect(onPhase).toHaveBeenLastCalledWith('idle');
  });

  it.each(['read', 'upload'] as const)(
    'retries a %s failure at its mapped target by reading and cropping again',
    async (phase) => {
      const {
        controller,
        editor,
        pos,
        read,
        crop,
        upload,
        readSource,
        openCrop,
        uploadFile,
        onPhase,
        onState,
        setCropResult,
        onRetryChange,
      } = mount();
      const result = controller.start(pos);
      if (phase === 'read') read.reject(new Error('read failed'));
      else {
        read.resolve(file);
        await flush();
        crop.resolve(file);
        await flush();
        upload.reject(new Error('upload failed'));
      }
      await result;
      expect(onPhase).toHaveBeenLastCalledWith('idle');
      expect(editor.getHTML()).toContain('/original.png');
      expect(onRetryChange.mock.calls).toEqual([[true]]);
      editor.commands.insertContentAt(1, 'shift ');
      expect(onRetryChange.mock.calls).toEqual([[true]]);
      readSource.mockImplementationOnce(async () => file);
      const retriedFile = new File(['new crop'], 'retry.png', { type: 'image/png' });
      setCropResult(Promise.resolve(retriedFile));
      uploadFile.mockImplementationOnce(async () => item);
      controller.retry();
      expect(onRetryChange.mock.calls).toEqual([[true], [false]]);
      expect(onPhase).toHaveBeenLastCalledWith('read');
      await flush();
      expect(readSource).toHaveBeenCalledTimes(2);
      expect(openCrop).toHaveBeenCalledTimes(phase === 'read' ? 1 : 2);
      expect(uploadFile.mock.calls.at(-1)?.[0].file).toBe(retriedFile);
      expect(editor.state.doc.nodeAt(pos + 6)?.attrs.src).toBe('/crop.png');
      expect(onPhase).toHaveBeenLastCalledWith('idle');
      expect(onState).toHaveBeenLastCalledWith(false);
      controller.retry();
      expect(readSource).toHaveBeenCalledTimes(2);
    }
  );

  it.each(['delete', 'replace', 'reinsert', 'external', 'cancel', 'disabled'] as const)(
    'invalidates a failed recovery target after %s',
    async (action) => {
      const { controller, editor, pos, read, readSource, disable, onRetryChange, onPhase } = mount();
      const result = controller.start(pos);
      read.reject(new Error('read failed'));
      await result;
      expect(onRetryChange.mock.calls).toEqual([[true]]);
      const phaseCalls = onPhase.mock.calls.length;
      const original = editor.state.doc.nodeAt(pos);
      if (!original) throw new Error('missing image');
      if (action === 'delete') editor.commands.deleteRange({ from: pos, to: pos + 1 });
      if (action === 'replace')
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...original.attrs, alt: 'changed' }));
      if (action === 'reinsert') editor.view.dispatch(editor.state.tr.replaceWith(pos, pos + original.nodeSize, original));
      if (action === 'external') editor.commands.setContent(editor.getJSON());
      if (action === 'cancel') controller.cancel();
      if (action === 'disabled') disable();
      else expect(onRetryChange.mock.calls).toEqual([[true], [false]]);
      controller.retry();
      expect(readSource).toHaveBeenCalledTimes(1);
      expect(readSource.mock.calls[0][0].signal.aborted).toBe(true);
      expect(onRetryChange.mock.calls).toEqual([[true], [false]]);
      expect(onPhase.mock.calls).toHaveLength(phaseCalls);
      controller.cancel();
      expect(onRetryChange.mock.calls).toEqual([[true], [false]]);
    }
  );

  it('notifies each retry availability transition without redundant initial or cancel events', async () => {
    const { controller, pos, read, onRetryChange } = mount();
    controller.cancel();
    expect(onRetryChange).not.toHaveBeenCalled();
    const result = controller.start(pos);
    expect(onRetryChange).not.toHaveBeenCalled();
    read.reject(new Error('read failed'));
    await result;
    expect(onRetryChange.mock.calls).toEqual([[true]]);
    controller.retry();
    expect(onRetryChange.mock.calls).toEqual([[true], [false]]);
    await flush();
    expect(onRetryChange.mock.calls).toEqual([[true], [false], [true]]);
    controller.cancel();
    controller.cancel();
    expect(onRetryChange.mock.calls).toEqual([[true], [false], [true], [false]]);
  });
});
