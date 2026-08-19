/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AFileUploader from '../src/components/file-uploader/index.vue';
import type { AFileUploaderExposed, FileUploadBatchResult } from '../src/components/file-uploader/types';
import { messages } from '../src/locale';
import type { FileItem, FileUploadCapability } from '../src/services/types';

const mountedApps: App[] = [];
let latestCustomRequest: ((option: Record<string, unknown>) => unknown) | undefined;
const Transparent = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, [slots.default?.(), slots['upload-button']?.(), slots.icon?.()]);
  },
});
const UploadStub = defineComponent({
  props: { customRequest: Function },
  setup(props, { attrs, slots }) {
    latestCustomRequest = props.customRequest as (option: Record<string, unknown>) => unknown;
    return () => h('div', attrs, slots['upload-button']?.());
  },
});
const ButtonStub = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, [slots.icon?.(), slots.default?.()]);
  },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await Promise.resolve();
  await nextTick();
}

function validItem(id: string, name: string, overrides: Partial<FileItem> = {}): FileItem {
  return {
    id,
    name,
    type: 'image',
    groupId: 'design',
    url: `/files/${name}`,
    status: 'ready',
    ...overrides,
  };
}

function mountUploader(
  service: Partial<FileUploadCapability>,
  props: Record<string, unknown> = {},
  listeners: Record<string, (...args: never[]) => void> = {}
) {
  const app = createApp(AFileUploader, {
    service,
    fileType: 'image',
    groupId: 'design',
    ...props,
    ...listeners,
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'en-US',
      fallbackLocale: 'en-US',
      messages,
    })
  );
  ['ATooltip', 'AProgress', 'ASpin'].forEach((name) => app.component(name, Transparent));
  app.component('AUpload', UploadStub);
  app.component('AButton', ButtonStub);
  ['IconUpload', 'IconClose', 'IconStop', 'IconRefresh', 'IconDelete'].forEach((name) => app.component(name, Transparent));
  const vm = app.mount('#app') as unknown as AFileUploaderExposed;
  mountedApps.push(app);
  return vm;
}

describe('AFileUploader', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    mountedApps.splice(0).forEach((app) => app.unmount());
    latestCustomRequest = undefined;
  });

  it('uploads a local batch through the single-file capability and keeps partial success', async () => {
    const complete = vi.fn<(result: FileUploadBatchResult) => void>();
    const service: FileUploadCapability = {
      upload: vi.fn(async (options) => {
        options.onProgress?.(55);
        if (options.file.name === 'failed.png') throw new Error('failed upload');
        return validItem(`item-${options.file.name}`, options.file.name);
      }),
    };
    const uploader = mountUploader(service, {}, { onComplete: complete as (...args: never[]) => void });
    const files = [
      new File(['ok'], 'ready.png', { type: 'image/png' }),
      new File(['bad'], 'failed.png', { type: 'image/png' }),
    ];

    const result = await uploader.upload(files);

    expect(service.upload).toHaveBeenCalledTimes(2);
    expect(service.upload).toHaveBeenCalledWith(
      expect.objectContaining({ file: files[0], fileType: 'image', groupId: 'design', signal: expect.any(AbortSignal) })
    );
    expect(result.succeeded.map((item) => item.name)).toEqual(['ready.png']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toBe('upload-failed');
    expect(result.cancelled).toEqual([]);
    expect(complete).toHaveBeenCalledOnce();
    expect(uploader.tasks.map((task) => task.status)).toEqual(['succeeded', 'failed']);
    expect(uploader.tasks[0].progress).toBe(100);
  });

  it('rejects wrong-type, pending, empty-url and duplicate successful results', async () => {
    const responses = [
      validItem('wrong', 'wrong.png', { type: 'video' }),
      validItem('pending', 'pending.png', { status: 'pending' }),
      validItem('empty', 'empty.png', { url: null }),
      validItem('same', 'first.png'),
      validItem('same', 'second.png'),
    ];
    const service: FileUploadCapability = { upload: vi.fn(async () => responses.shift() as FileItem) };
    const uploader = mountUploader(service);

    const result = await uploader.upload(
      ['wrong.png', 'pending.png', 'empty.png', 'first.png', 'second.png'].map(
        (name) => new File([name], name, { type: 'image/png' })
      )
    );

    expect(result.succeeded.map((item) => item.id)).toEqual(['same']);
    expect(result.failed).toHaveLength(4);
    expect(result.failed.every((failure) => failure.reason === 'invalid-result')).toBe(true);
  });

  it('cancels an active task, ignores its late response and allows retry', async () => {
    const first = deferred<FileItem>();
    const second = deferred<FileItem>();
    const service: FileUploadCapability = {
      upload: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    };
    const success = vi.fn();
    const uploader = mountUploader(service, {}, { onSuccess: success });

    const firstBatch = uploader.upload([new File(['one'], 'one.png', { type: 'image/png' })]);
    await flush();
    const taskId = uploader.tasks[0].id;
    const firstSignal = vi.mocked(service.upload).mock.calls[0][0].signal;
    uploader.cancel(taskId);
    const cancelled = await firstBatch;

    expect(firstSignal?.aborted).toBe(true);
    expect(cancelled.cancelled).toHaveLength(1);
    first.resolve(validItem('late', 'one.png'));
    await flush();
    expect(success).not.toHaveBeenCalled();

    uploader.retry(taskId);
    second.resolve(validItem('retried', 'one.png'));
    await flush();
    expect(success).toHaveBeenCalledWith(expect.objectContaining({ id: 'retried' }), expect.any(Object));
    expect(uploader.tasks).toEqual([]);
  });

  it('keeps file selection available while active and automatically closes a successful queue', async () => {
    const first = deferred<FileItem>();
    const second = deferred<FileItem>();
    const service: FileUploadCapability = {
      upload: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    };
    const uploader = mountUploader(service);

    const firstBatch = uploader.upload([new File(['one'], 'one.png', { type: 'image/png' })]);
    await flush();

    const trigger = document.querySelector<HTMLButtonElement>('.a9-file-uploader > div button');
    expect(trigger?.disabled).toBe(false);
    expect(document.querySelector('[aria-label="Close upload queue"]')).toBeNull();

    const secondBatch = uploader.upload([new File(['two'], 'two.png', { type: 'image/png' })]);
    await flush();
    expect(service.upload).toHaveBeenCalledTimes(2);
    expect(uploader.tasks).toHaveLength(2);

    first.resolve(validItem('ready-one', 'one.png'));
    await flush();
    expect(document.querySelector('[role="region"]')).not.toBeNull();

    second.resolve(validItem('ready-two', 'two.png'));
    const results = await Promise.all([firstBatch, secondBatch]);
    await flush();
    expect(results.every((result) => result.succeeded.length === 2)).toBe(true);
    expect(trigger?.disabled).toBe(false);
    expect(document.querySelector('[role="region"]')).toBeNull();
    expect(document.querySelector('[aria-label="Close upload queue"]')).toBeNull();
    expect(uploader.tasks).toEqual([]);
  });

  it('keeps a failed queue available and restores trigger focus when it is dismissed', async () => {
    const service: FileUploadCapability = { upload: vi.fn().mockRejectedValue(new Error('upload failed')) };
    const uploader = mountUploader(service);
    const trigger = document.querySelector<HTMLButtonElement>('.a9-file-uploader > div button');

    const result = await uploader.upload([new File(['one'], 'one.png', { type: 'image/png' })]);
    await flush();

    expect(result.failed).toHaveLength(1);
    expect(document.querySelector('[role="region"]')).not.toBeNull();
    const close = document.querySelector<HTMLButtonElement>('[aria-label="Close upload queue"]');
    expect(close).not.toBeNull();
    close?.click();
    await flush();
    expect(document.querySelector('[role="region"]')).toBeNull();
    expect(uploader.tasks).toEqual([]);
    expect(document.activeElement).toBe(trigger);
  });

  it('restores trigger focus when successful auto-close removes the focused queue action', async () => {
    const pending = deferred<FileItem>();
    const service: FileUploadCapability = { upload: vi.fn().mockReturnValue(pending.promise) };
    const uploader = mountUploader(service);
    const trigger = document.querySelector<HTMLButtonElement>('.a9-file-uploader > div button');
    const batch = uploader.upload([new File(['one'], 'one.png', { type: 'image/png' })]);
    await flush();

    const cancel = document.querySelector<HTMLButtonElement>('[aria-label="Cancel upload for one.png"]');
    expect(cancel).not.toBeNull();
    cancel?.focus();
    expect(document.activeElement).toBe(cancel);
    pending.resolve(validItem('ready', 'one.png'));
    await batch;
    await flush();

    expect(document.querySelector('[role="region"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('enforces queue count and file size without inventing a batch service API', async () => {
    const complete = vi.fn<(result: FileUploadBatchResult) => void>();
    const service: FileUploadCapability = {
      upload: vi.fn(async (options) => validItem(options.file.name, options.file.name)),
    };
    const uploader = mountUploader(
      service,
      { maxFiles: 2, maxFileSize: 4 },
      { onComplete: complete as (...args: never[]) => void }
    );

    const result = await uploader.upload([
      new File(['ok'], 'one.png'),
      new File(['large'], 'two.png'),
      new File(['ok'], 'three.png'),
    ]);

    expect(service.upload).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledOnce();
    expect(result.succeeded).toHaveLength(1);
    expect(result.failed.map((failure) => failure.reason).sort()).toEqual(['file-count', 'file-size']);
    expect(document.body.textContent).toContain('The file exceeds the 4 byte limit');
    expect(document.body.textContent).toContain('The queue accepts at most 2 files');
  });

  it('coalesces synchronous validation failures from one native multi-file selection', async () => {
    const complete = vi.fn<(result: FileUploadBatchResult) => void>();
    const service: FileUploadCapability = { upload: vi.fn() };
    mountUploader(service, { maxFileSize: 1 }, { onComplete: complete as (...args: never[]) => void });
    const callbacks = { onProgress: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() };

    latestCustomRequest?.({ fileItem: { file: new File(['12'], 'one.png') }, ...callbacks });
    latestCustomRequest?.({ fileItem: { file: new File(['12'], 'two.png') }, ...callbacks });
    await flush();

    expect(service.upload).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0][0].failed).toHaveLength(2);
  });

  it('requires a concrete FileType and suppresses callbacks after unmount', async () => {
    const pending = deferred<FileItem>();
    const service: FileUploadCapability = { upload: vi.fn().mockReturnValue(pending.promise) };
    const success = vi.fn();
    const uploader = mountUploader(service, { fileType: undefined }, { onSuccess: success });

    await expect(uploader.upload([new File(['one'], 'one.png')])).rejects.toThrow('concrete FileType');
    expect(service.upload).not.toHaveBeenCalled();

    mountedApps.pop()?.unmount();
    document.body.innerHTML = '<div id="app"></div>';
    const active = mountUploader(service, {}, { onSuccess: success });
    const activeResult = active.upload([new File(['two'], 'two.png')]);
    await flush();
    const [{ signal }] = vi.mocked(service.upload).mock.calls[0];
    mountedApps.pop()?.unmount();
    await activeResult;
    expect(signal?.aborted).toBe(true);
    pending.resolve(validItem('late', 'two.png'));
    await flush();
    expect(success).not.toHaveBeenCalled();
  });
});
