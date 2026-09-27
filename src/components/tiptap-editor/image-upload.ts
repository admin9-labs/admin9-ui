import { Node, type Editor, type JSONContent } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { Fragment, Slice } from '@tiptap/pm/model';
import { ReplaceStep, StepMap } from '@tiptap/pm/transform';
import type { FileItem, FilePickerAdapter } from '../../services/types';
import fileUploadRejection from '../../internal/file-upload-rejection';
import { isSafeMediaUrl } from './media-attributes';
import type { TiptapImageDisplay, TiptapImageUploadError, TiptapImageUploadState } from './types';

export const uploadNodeName = 'a9ImageUpload';
const inlineUploadNodeName = 'a9InlineImageUpload';

// Resolving one leaf atom to another preserves every document position. Keep the
// original insertion in history so undo removes the image and redo restores it.
class ResolveUploadStep extends ReplaceStep {
  getMap() {
    return this.to - this.from === 1 && this.slice.size === 1 ? StepMap.empty : super.getMap();
  }
}
interface UploadTask {
  id: string;
  file: File;
  source: 'paste' | 'drop';
  display: TiptapImageDisplay;
  status: 'pending' | 'uploading' | 'failed' | 'succeeded';
  preview: string;
  progress?: number;
  controller?: AbortController;
  run: number;
  item?: FileItem;
  rejection?: ReturnType<typeof fileUploadRejection>;
}

interface UploadOptions {
  editor: () => Editor | undefined;
  service: () => FilePickerAdapter | undefined;
  enabled: () => boolean;
  display: () => TiptapImageDisplay;
  t: (key: string) => string;
  state: (value: TiptapImageUploadState) => void;
  error: (value: TiptapImageUploadError) => void;
}

/** Editor-local queue: document nodes own positions; files and requests never enter the model. */
export function createImageUploads(options: UploadOptions) {
  const tasks = new Map<string, UploadTask>();
  const views = new Set<() => void>();
  let sequence = 0;
  let disposed = false;
  let scheduled = false;
  let lastState = '';
  const positions = () => {
    const result = new Map<string, number>();
    options.editor()?.state.doc.descendants((node, pos) => {
      if ([uploadNodeName, inlineUploadNodeName].includes(node.type.name)) result.set(node.attrs.id, pos);
    });
    return result;
  };
  const state = (): TiptapImageUploadState => {
    const result = { pending: 0, uploading: 0, failed: 0, canSave: true };
    positions().forEach((_pos, id) => {
      const task = tasks.get(id);
      if (!task || task.status === 'failed') result.failed += 1;
      else if (task.status === 'pending') result.pending += 1;
      else if (task.status === 'uploading') result.uploading += 1;
    });
    result.canSave = result.pending + result.uploading + result.failed === 0;
    return result;
  };
  const notify = () => {
    views.forEach((render) => render());
    const value = state();
    const key = JSON.stringify(value);
    if (key !== lastState) {
      lastState = key;
      options.state(value);
    }
  };
  const stop = (task: UploadTask) => {
    task.run += 1;
    task.controller?.abort();
    task.controller = undefined;
    if (task.status !== 'succeeded') task.status = 'failed';
  };
  const releasePreview = (task: UploadTask) => {
    if (task.preview) URL.revokeObjectURL(task.preview);
    task.preview = '';
  };
  const fail = (task: UploadTask, reason: TiptapImageUploadError['reason'], cause?: unknown) => {
    task.status = 'failed';
    task.rejection = fileUploadRejection(cause);
    task.controller = undefined;
    options.error({ file: task.file, source: task.source, reason, cause });
    notify();
  };
  const imageContent = (task: UploadTask): JSONContent => ({
    type: task.display === 'inline' ? 'inlineImage' : 'blockImage',
    attrs: {
      src: task.item?.url,
      alt: task.file.name,
      title: task.file.name,
      ...(task.display === 'inline' ? { size: '1em' } : { width: 'natural', align: 'left' }),
    },
  });
  const resolve = (task: UploadTask) => {
    const editor = options.editor();
    const pos = positions().get(task.id);
    if (!editor || pos === undefined || !task.item) return;
    try {
      const node = editor.schema.nodeFromJSON(imageContent(task));
      editor.view.dispatch(
        editor.state.tr
          .step(new ResolveUploadStep(pos, pos + 1, new Slice(Fragment.from(node), 0, 0)))
          .setMeta('addToHistory', false)
      );
      if (positions().has(task.id)) fail(task, 'insert-failed');
      else releasePreview(task);
    } catch (cause) {
      fail(task, 'insert-failed', cause);
    }
  };
  const pump = () => {
    scheduled = false;
    if (disposed) return;
    const current = positions();
    tasks.forEach((task) => {
      if (!current.has(task.id)) {
        if (task.status === 'pending' || task.status === 'uploading') stop(task);
        releasePreview(task);
      }
    });
    current.forEach((_pos, id) => {
      const task = tasks.get(id);
      if (task?.status === 'succeeded') resolve(task);
    });
    if (options.enabled()) {
      let active = [...tasks.values()].filter((task) => task.status === 'uploading').length;
      current.forEach((_pos, id) => {
        const task = tasks.get(id);
        if (!task || task.status !== 'pending' || active >= 3) return;
        active += 1;
        task.status = 'uploading';
        task.progress = undefined;
        const controller = new AbortController();
        task.controller = controller;
        task.run += 1;
        const { run } = task;
        const valid = () => !disposed && task.run === run && !controller.signal.aborted && positions().has(id);
        Promise.resolve()
          .then(() => {
            if (!valid()) return undefined;
            return options.service()?.upload?.({
              file: task.file,
              fileTypes: ['image'],
              groupId: null,
              signal: controller.signal,
              onProgress: (percent) => {
                if (!valid()) return;
                task.progress = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : undefined;
                notify();
              },
            });
          })
          .then((item) => {
            if (!valid()) return;
            if (
              !item ||
              typeof item.id !== 'string' ||
              !item.id.trim() ||
              item.type !== 'image' ||
              (item.status !== undefined && item.status !== 'ready') ||
              !isSafeMediaUrl(item.url)
            ) {
              fail(task, 'invalid-result');
              return;
            }
            task.item = item;
            task.status = 'succeeded';
            task.controller = undefined;
            resolve(task);
          })
          .catch((cause: unknown) => {
            if (valid()) fail(task, fileUploadRejection(cause) ? 'unsupported-image' : 'upload-failed', cause);
          })
          // The scheduler and pump deliberately call one another.
          // eslint-disable-next-line no-use-before-define
          .finally(() => sync());
      });
    }
    notify();
  };
  function sync() {
    if (disposed) return;
    const current = positions();
    tasks.forEach((task) => {
      if (!current.has(task.id)) {
        if (task.status === 'pending' || task.status === 'uploading') stop(task);
        releasePreview(task);
      }
    });
    notify();
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(pump);
    }
  }
  const remove = (id: string) => {
    if (!options.editor()?.isEditable) return;
    const pos = positions().get(id);
    if (pos !== undefined) options.editor()?.commands.deleteRange({ from: pos, to: pos + 1 });
  };
  const retry = (id: string) => {
    const task = tasks.get(id);
    if (!task || task.rejection || !options.editor()?.isEditable || !options.enabled() || !positions().has(id)) return;
    stop(task);
    task.status = 'pending';
    sync();
  };
  const extension = Node.create({
    name: uploadNodeName,
    group: 'block',
    atom: true,
    selectable: true,
    addAttributes: () => ({ id: { default: null } }),
    parseHTML: () => [],
    renderHTML: () => ['span', { 'data-a9-upload': '' }],
    addNodeView() {
      return ({ node }) => {
        const dom = document.createElement('span');
        dom.className = 'a9-tiptap-editor__upload';
        dom.contentEditable = 'false';
        const image = document.createElement('img');
        const label = document.createElement('span');
        label.setAttribute('role', 'status');
        const button = (action: () => void) => {
          const element = document.createElement('button');
          element.type = 'button';
          element.onmousedown = (event) => event.preventDefault();
          element.onclick = action;
          return element;
        };
        const retryButton = button(() => retry(node.attrs.id));
        const deleteButton = button(() => remove(node.attrs.id));
        dom.append(image, label, retryButton, deleteButton);
        const render = () => {
          const task = tasks.get(node.attrs.id);
          // History may restore a cancelled node after its preview was released.
          if (task && !task.preview && task.status !== 'succeeded') task.preview = URL.createObjectURL(task.file);
          image.hidden = !task?.preview;
          if (task?.preview) {
            if (image.getAttribute('src') !== task.preview) image.src = task.preview;
            image.alt = task.file.name;
          } else {
            image.removeAttribute('src');
          }
          let text = options.t(!task || task.status === 'failed' ? 'uploadFailed' : 'uploadingImage');
          if (task?.rejection) text = options.t('unsupportedImageUpload');
          if (task?.status === 'uploading' && task.progress !== undefined) text += ` ${Math.round(task.progress)}%`;
          if (label.textContent !== text) label.textContent = text;
          retryButton.textContent = options.t('retryUpload');
          deleteButton.textContent = options.t('deleteUpload');
          retryButton.hidden = task?.status !== 'failed' || Boolean(task?.rejection);
          retryButton.disabled = !options.editor()?.isEditable || !options.enabled();
          deleteButton.disabled = !options.editor()?.isEditable;
        };
        views.add(render);
        render();
        return { dom, stopEvent: () => true, ignoreMutation: () => true, destroy: () => views.delete(render) };
      };
    },
  });
  const insert = (files: File[], source: 'paste' | 'drop', position?: number) => {
    const editor = options.editor();
    if (!editor || !files.length) return false;
    editor.view.dispatch(closeHistory(editor.state.tr));
    const accepted: UploadTask[] = [];
    files.forEach((file) => {
      let reason: TiptapImageUploadError['reason'] | undefined;
      if (!/^image\/(png|jpeg|gif|webp)$/i.test(file.type)) reason = 'unsupported-image';
      else if (!options.enabled()) reason = 'upload-unavailable';
      if (reason) {
        options.error({ file, source, reason });
        return;
      }
      const task: UploadTask = {
        id: `a9-image-${(sequence += 1)}`,
        source,
        file,
        display: options.display(),
        preview: URL.createObjectURL(file),
        status: 'pending',
        run: 0,
      };
      tasks.set(task.id, task);
      accepted.push(task);
    });
    if (!accepted.length) return true;
    const range = position ?? { from: editor.state.selection.from, to: editor.state.selection.to };
    const inserted = editor.commands.insertContentAt(
      range,
      accepted.map((task) => ({
        type: task.display === 'inline' ? inlineUploadNodeName : uploadNodeName,
        attrs: { id: task.id },
      }))
    );
    editor.view.dispatch(closeHistory(editor.state.tr));
    accepted.forEach((task) => {
      if (!inserted || !positions().has(task.id)) {
        fail(task, 'insert-failed');
        releasePreview(task);
      }
    });
    sync();
    return true;
  };
  const pause = () => {
    tasks.forEach((task) => {
      if (task.status === 'pending' || task.status === 'uploading') stop(task);
    });
    notify();
  };
  const reset = () => {
    tasks.forEach((task) => {
      stop(task);
      releasePreview(task);
    });
    tasks.clear();
  };
  return {
    extension,
    inlineExtension: extension.extend({ name: inlineUploadNodeName, group: 'inline', inline: true }),
    insert,
    sync,
    state,
    pause,
    dispose: () => {
      disposed = true;
      reset();
      views.clear();
    },
  };
}
