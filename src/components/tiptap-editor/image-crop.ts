import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Node } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import type { ImageCropOptions } from '../image-cropper/types';
import type { FilePickerAdapter } from '../../services/types';
import fileUploadResultError from '../../internal/file-upload-result';
import { isSafeMediaUrl } from './media-attributes';

export interface EditorImageCropConfig extends ImageCropOptions {
  readSource(options: { src: string; signal: AbortSignal }): Promise<File>;
  aspectRatioMode?: 'free' | 'original';
}

export interface EditorImageCropError {
  phase: 'read' | 'crop' | 'upload' | 'commit';
  cause: unknown;
}

interface EditorImageCropOptions {
  getEditor(): Editor | undefined;
  editable(): boolean;
  config(): EditorImageCropConfig | undefined;
  service(): FilePickerAdapter | undefined;
  crop(file: File): Promise<File | null>;
  onState(pending: boolean): void;
  onError(error: EditorImageCropError): void;
}

/** One image target and one abortable read/upload generation per editor. */
export function createEditorImageCrop(options: EditorImageCropOptions) {
  let generation = 0;
  let pending = false;
  let cropPending = false;
  let controller: AbortController | undefined;
  let detach: (() => void) | undefined;
  const notify = (value: boolean) => {
    if (pending === value) return;
    pending = value;
    options.onState(value);
  };
  const cancel = () => {
    generation += 1;
    controller?.abort();
    controller = undefined;
    detach?.();
    detach = undefined;
    cropPending = false;
    notify(false);
  };
  const setCommitPending = (value: boolean) => {
    if (!controller) return;
    if (value) notify(true);
    else if (cropPending) {
      const current = generation;
      // Cropper resolves open() and emits false in the same stack. Let the
      // promise continuation claim the upload before releasing an encode error.
      queueMicrotask(() => {
        if (current === generation && cropPending) notify(false);
      });
    }
  };
  const start = async (position: number): Promise<void> => {
    cancel();
    const editor = options.getEditor();
    const config = options.config();
    const service = options.service();
    if (!editor || editor.isDestroyed || !editor.isEditable || !options.editable() || !config || !service?.upload) return;
    const original: Node | null = editor.state.doc.nodeAt(position);
    if (!original || !['blockImage', 'inlineImage'].includes(original.type.name) || !original.attrs.src) return;
    const current = generation;
    const abort = new AbortController();
    controller = abort;
    let target = position;
    let committing = false;
    const valid = () => {
      if (current !== generation) return false;
      if (
        abort.signal.aborted ||
        editor.isDestroyed ||
        options.getEditor() !== editor ||
        !editor.isEditable ||
        !options.editable() ||
        !editor.state.doc.nodeAt(target)?.sameMarkup(original)
      ) {
        cancel();
        return false;
      }
      return true;
    };
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (committing) return;
      const mapped = transaction.mapping.mapResult(target, 1);
      target = mapped.pos;
      if (mapped.deleted) cancel();
      else valid();
    };
    editor.on('transaction', onTransaction);
    detach = () => editor.off('transaction', onTransaction);
    let phase: EditorImageCropError['phase'] = 'read';
    try {
      const file = await config.readSource({ src: original.attrs.src, signal: abort.signal });
      if (!valid()) return;
      phase = 'crop';
      cropPending = true;
      const output = await options.crop(file);
      if (!valid()) return;
      cropPending = false;
      if (!output) {
        cancel();
        return;
      }
      phase = 'upload';
      notify(true);
      if (!valid()) return;
      const item = await service.upload({ file: output, fileTypes: ['image'], groupId: null, signal: abort.signal });
      if (!valid()) return;
      const invalid = fileUploadResultError(item, ['image']);
      if (invalid || !isSafeMediaUrl(item.url)) throw new Error(invalid ?? 'Image crop requires a persistent media URL.');
      phase = 'commit';
      const node = editor.state.doc.nodeAt(target);
      if (!node) return;
      const transaction = closeHistory(editor.state.tr).setNodeMarkup(
        target,
        undefined,
        { ...node.attrs, src: item.url },
        node.marks
      );
      committing = true;
      editor.view.dispatch(transaction);
      editor.view.dispatch(closeHistory(editor.state.tr));
    } catch (cause) {
      if (valid()) options.onError({ phase, cause });
    } finally {
      if (current === generation) cancel();
    }
  };
  return { start, cancel, setCommitPending };
}
