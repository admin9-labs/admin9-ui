import type { Editor, EditorEvents } from '@tiptap/core';
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
  closePreview?(): void;
  crop(file: File): Promise<File | null>;
  onPhase?(phase: 'idle' | 'read' | 'preview' | 'commit'): void;
  onRetryChange?(available: boolean): void;
  onState(pending: boolean): void;
  onError(error: EditorImageCropError): void;
}

/** One image target and one abortable read/upload generation per editor. */
export function createEditorImageCrop(options: EditorImageCropOptions) {
  let generation = 0;
  let active = false;
  let retryTarget: (() => number | undefined) | undefined;
  const setRetryTarget = (target: typeof retryTarget) => {
    const changed = Boolean(retryTarget) !== Boolean(target);
    retryTarget = target;
    if (changed) options.onRetryChange?.(Boolean(target));
  };
  let currentPhase: 'idle' | 'read' | 'preview' | 'commit' = 'idle';
  const setPhase = (phase: typeof currentPhase) => {
    if (currentPhase === phase) return;
    currentPhase = phase;
    options.onPhase?.(phase);
  };
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
    active = false;
    controller?.abort();
    controller = undefined;
    detach?.();
    detach = undefined;
    const previewOpen = cropPending;
    cropPending = false;
    if (previewOpen) options.closePreview?.();
    setRetryTarget(undefined);
    notify(false);
    setPhase('idle');
  };
  const setCommitPending = (value: boolean) => {
    if (!active || !cropPending) return;
    if (value) {
      setPhase('commit');
      notify(true);
    } else if (cropPending) {
      const current = generation;
      // Cropper resolves open() and emits false in the same stack. Let the
      // promise continuation claim the upload before releasing an encode error.
      queueMicrotask(() => {
        if (current === generation && cropPending) {
          notify(false);
          setPhase('preview');
        }
      });
    }
  };
  const start = async (position: number): Promise<void> => {
    if (active) return;
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
    active = true;
    let target = position;
    let commitTransaction: Transaction | undefined;
    let commitApplied = false;
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
    const onTransaction = ({ transaction, appendedTransactions }: EditorEvents['transaction']) => {
      if (commitTransaction) {
        if (transaction === commitTransaction) commitApplied = true;
        return;
      }
      const deleted = [transaction, ...appendedTransactions].some(({ mapping }) => {
        const mapped = mapping.mapResult(target, 1);
        target = mapped.pos;
        return mapped.deleted;
      });
      if (deleted) cancel();
      else valid();
    };
    editor.on('transaction', onTransaction);
    detach = () => editor.off('transaction', onTransaction);
    let failed = false;
    let phase: EditorImageCropError['phase'] = 'read';
    try {
      setPhase('read');
      if (!valid()) return;
      const file = await config.readSource({ src: original.attrs.src, signal: abort.signal });
      if (!valid()) return;
      phase = 'crop';
      cropPending = true;
      setPhase('preview');
      if (!valid()) return;
      const output = await options.crop(file);
      if (!valid()) return;
      cropPending = false;
      if (!output) {
        cancel();
        return;
      }
      phase = 'upload';
      setPhase('commit');
      notify(true);
      if (!valid()) return;
      const item = await service.upload({ file: output, fileTypes: ['image'], groupId: null, signal: abort.signal });
      if (!valid()) return;
      const invalid = fileUploadResultError(item, ['image']);
      if (invalid || !isSafeMediaUrl(item.url)) throw new Error(invalid ?? 'Image crop requires a persistent media URL.');
      phase = 'commit';
      const node = editor.state.doc.nodeAt(target);
      if (!node) return;
      commitTransaction = closeHistory(editor.state.tr).setNodeMarkup(
        target,
        undefined,
        { ...node.attrs, src: item.url },
        node.marks
      );
      editor.view.dispatch(commitTransaction);
      if (!commitApplied) throw new Error('Image crop replacement transaction was rejected.');
      editor.view.dispatch(closeHistory(editor.state.tr));
    } catch (cause) {
      if (valid()) {
        failed = true;
        setRetryTarget(() => (valid() ? target : undefined));
        options.onError({ phase, cause });
      }
    } finally {
      if (current === generation) {
        if (failed) {
          active = false;
          commitTransaction = undefined;
          cropPending = false;
          notify(false);
          setPhase('idle');
        } else cancel();
      }
    }
  };
  const retry = (): void => {
    if (active) return;
    const target = retryTarget?.();
    if (target !== undefined) start(target);
  };
  return { start, retry, cancel, setCommitPending };
}
