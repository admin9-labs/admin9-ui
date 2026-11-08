import type { FileItem, FilePickerAdapter } from '../services/types';
import fileUploadResultError from './file-upload-result';

export type CropSessionStage = 'idle' | 'reading' | 'cropping' | 'uploading' | 'error';
export interface CropSessionState {
  stage: CropSessionStage;
  error?: 'read' | 'upload';
  progress?: number;
}

/** One library selection; upload retries reuse the same cropped file. */
export default function createImageCropSession(onState: (state: CropSessionState) => void, onError?: (error: unknown) => void) {
  let generation = 0;
  let controller: AbortController | undefined;
  let settle: ((item: FileItem | null) => void) | undefined;
  let resume: (() => Promise<void>) | undefined;
  let running = false;
  const cancel = () => {
    generation += 1;
    controller?.abort();
    controller = undefined;
    resume = undefined;
    running = false;
    const pending = settle;
    settle = undefined;
    onState({ stage: 'idle' });
    pending?.(null);
  };
  const run = (source: FileItem, service: FilePickerAdapter, crop: (file: File) => Promise<File | null>) => {
    cancel();
    if (!service.upload || !service.readOriginal)
      throw new Error('[admin9-ui] Cropping library images requires upload and readOriginal.');
    const current = generation;
    const upload = service.upload.bind(service);
    const readOriginal = service.readOriginal.bind(service);
    let prepared: File | undefined;
    const result = new Promise<FileItem | null>((resolve) => {
      settle = resolve;
    });
    const active = () => current === generation;
    resume = async () => {
      if (running || !active()) return;
      running = true;
      controller = new AbortController();
      const { signal } = controller;
      let failureStage: 'read' | 'upload' = 'read';
      try {
        if (!prepared) {
          onState({ stage: 'reading' });
          if (!active()) return;
          const file = await readOriginal({ item: source, signal });
          if (!active()) return;
          onState({ stage: 'cropping' });
          if (!active()) return;
          const output = await crop(file);
          if (!active()) return;
          if (!output) {
            cancel();
            return;
          }
          prepared = output;
        }
        failureStage = 'upload';
        onState({ stage: 'uploading' });
        if (!active()) return;
        let settled = false;
        const item = await upload({
          file: prepared,
          fileTypes: ['image'],
          groupId: null,
          signal,
          onProgress: (progress) => {
            if (active() && !settled && !signal.aborted) onState({ stage: 'uploading', progress });
          },
        }).finally(() => {
          settled = true;
        });
        if (!active()) return;
        const invalid = fileUploadResultError(item, ['image']);
        if (invalid) throw new Error(invalid);
        const done = settle;
        settle = undefined;
        resume = undefined;
        controller = undefined;
        onState({ stage: 'idle' });
        done?.(item);
      } catch (error) {
        if (active()) {
          onState({ stage: 'error', error: failureStage });
          onError?.(error);
        }
      } finally {
        if (active()) running = false;
      }
    };
    resume();
    return result;
  };
  return {
    run,
    cancel,
    retry: () => {
      if (resume) resume();
    },
  };
}
