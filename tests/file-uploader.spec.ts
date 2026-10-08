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
    fileTypes: ['image'],
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

  it('classifies non-string adapter URLs as invalid results', async () => {
    const uploader = mountUploader({
      upload: async () => validItem('invalid-url', 'image.png', { url: 42 as unknown as string }),
    });
    const result = await uploader.upload([new File(['image'], 'image.png')]);
    expect(result.failed[0].reason).toBe('invalid-result');
  });

  it('keeps size/count constraints but never renders the native accept value as copy', () => {
    mountUploader({}, { accept: 'image/*', limit: 2, maxFileSize: 1024 });
    const text = document.querySelector('.a9-file-uploader__constraints')?.textContent;
    expect(text).toContain('Up to 2 records in the current queue');
    expect(text).toContain('Up to 1 KB per file');
    expect(text).not.toContain('image/*');
  });

  it('omits zero counts and includes cancelled tasks in the queue summary', async () => {
    const pending = deferred<FileItem>();
    const uploader = mountUploader({ upload: () => pending.promise });
    const batch = uploader.upload([new File(['one'], 'one.png')]);
    await flush();
    expect(document.querySelector('.a9-file-uploader__summary')?.textContent).toBe('1 uploading');
    uploader.cancel(uploader.tasks[0].id);
    await batch;
    await flush();
    expect(document.querySelector('.a9-file-uploader__summary')?.textContent).toBe('1 cancelled');
    pending.resolve(validItem('ignored', 'one.png'));
  });

  it('rejects executable URLs returned by an upload adapter', async () => {
    // eslint-disable-next-line no-script-url -- Adversarial adapter result must be rejected.
    const uploader = mountUploader({ upload: async () => validItem('unsafe', 'unsafe.png', { url: 'javascript:alert(1)' }) });
    const result = await uploader.upload([new File(['image'], 'unsafe.png')]);
    expect(result.succeeded).toEqual([]);
    expect(result.failed[0].reason).toBe('invalid-result');
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
      expect.objectContaining({ file: files[0], fileTypes: ['image'], groupId: 'design', signal: expect.any(AbortSignal) })
    );
    expect(result.succeeded.map((item) => item.name)).toEqual(['ready.png']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toBe('upload-failed');
    expect(result.cancelled).toEqual([]);
    expect(complete).toHaveBeenCalledOnce();
    expect(uploader.tasks.map((task) => task.status)).toEqual(['succeeded', 'failed']);
    expect(uploader.tasks[0].progress).toBe(100);
    await flush();
    expect(document.querySelector('.a9-file-uploader__panel')).not.toBeNull();
    expect(document.querySelector('.a9-file-uploader__result')).toBeNull();
    document.querySelector<HTMLButtonElement>('[aria-label="Close upload queue"]')?.click();
    await flush();
    expect(document.querySelector('.a9-file-uploader__panel')).toBeNull();
    expect(document.querySelector('.a9-file-uploader__result')?.textContent).toContain('Uploaded 1 file');
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
      { limit: 2, maxFileSize: 4 },
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
    expect(document.body.textContent).toContain('The file exceeds 4 B. Compress it or choose another file.');
    expect(document.body.textContent).toContain(
      'The current queue allows 2 records. Remove finished records, then choose the files again.'
    );
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

  it('counts retained success, failure and cancellation records until they are removed', async () => {
    const pending = deferred<FileItem>();
    const upload = vi
      .fn()
      .mockResolvedValueOnce(validItem('ready', 'ready.png'))
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(validItem('next', 'next.png'));
    const uploader = mountUploader({ upload }, { limit: 3 });
    const batch = uploader.upload([
      new File(['a'], 'ready.png'),
      new File(['b'], 'failed.png'),
      new File(['c'], 'cancelled.png'),
    ]);
    await flush();
    uploader.cancel(uploader.tasks[2].id);
    await batch;
    expect(uploader.tasks.map((task) => task.status)).toEqual(['succeeded', 'failed', 'cancelled']);

    const blocked = await uploader.upload([new File(['d'], 'next.png')]);
    await flush();
    expect(upload).toHaveBeenCalledTimes(3);
    expect(blocked.failed.at(-1)?.reason).toBe('file-count');
    expect(document.querySelector('[aria-label="Retry upload for next.png"]')).toBeNull();
    expect(document.body.textContent).toContain('Remove finished records, then choose the files again.');
    uploader.tasks.forEach((task) => uploader.remove(task.id));

    const recovered = await uploader.upload([new File(['d'], 'next.png')]);
    expect(upload).toHaveBeenCalledTimes(4);
    expect(recovered.succeeded.map((item) => item.id)).toEqual(['next']);
    pending.resolve(validItem('late', 'cancelled.png'));
  });

  it('requires allowed types and suppresses callbacks after unmount', async () => {
    const pending = deferred<FileItem>();
    const service: FileUploadCapability = { upload: vi.fn().mockReturnValue(pending.promise) };
    const success = vi.fn();
    const uploader = mountUploader(service, { fileTypes: [] }, { onSuccess: success });

    await expect(uploader.upload([new File(['one'], 'one.png')])).rejects.toThrow('allowed FileType');
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
  it('accepts mixed actual types in one group and retains a dismissible success summary', async () => {
    const service: FileUploadCapability = {
      upload: vi.fn(async ({ file, groupId }) =>
        validItem(file.name, file.name, {
          groupId,
          type: file.name.endsWith('.pdf') ? 'document' : 'image',
        })
      ),
    };
    const uploader = mountUploader(service, { fileTypes: ['image', 'document'] });
    const result = await uploader.upload([new File(['a'], 'a.png'), new File(['b'], 'b.pdf')]);
    await flush();
    expect(result.succeeded.map((file) => file.type)).toEqual(['image', 'document']);
    expect(service.upload).toHaveBeenCalledWith(
      expect.objectContaining({ fileTypes: ['image', 'document'], groupId: 'design' })
    );
    expect(document.querySelector('.a9-file-uploader__panel')).toBeNull();
    expect(document.querySelector('.a9-file-uploader__result')?.textContent).toContain('Uploaded 2 files');
    document.querySelector<HTMLButtonElement>('[aria-label="Dismiss upload result"]')?.click();
    await flush();
    expect(document.querySelector('.a9-file-uploader__result')).toBeNull();
  });

  it('defaults to all known types but rejects a result outside a restricted set', async () => {
    const service = { upload: vi.fn(async () => validItem('doc', 'a.pdf', { type: 'document' })) };
    const unrestricted = mountUploader(service, { fileTypes: undefined });
    expect((await unrestricted.upload([new File(['a'], 'a.pdf')])).succeeded).toHaveLength(1);
    expect(service.upload).toHaveBeenCalledWith(
      expect.objectContaining({ fileTypes: ['image', 'video', 'audio', 'document', 'archive', 'other'] })
    );
    mountedApps.pop()?.unmount();
    document.body.innerHTML = '<div id="app"></div>';
    const restricted = mountUploader(service, { fileTypes: ['image'] });
    expect((await restricted.upload([new File(['a'], 'a.pdf')])).failed[0].reason).toBe('invalid-result');
  });
  it.each(['sync', 'async'])('classifies %s type rejection and never retries it', async (mode) => {
    const rejection = { code: 'unsupported-file-type', message: 'PRIVATE BACKEND DETAIL' };
    const upload = vi.fn(() => {
      if (mode === 'sync') throw rejection;
      return Promise.reject(rejection);
    });
    const error = vi.fn();
    const uploader = mountUploader({ upload }, { fileTypes: ['image', 'document'] }, { onError: error });
    const result = await uploader.upload([new File(['bad'], 'a.mp4')]);
    await flush();
    expect(result.failed[0].reason).toBe('file-type');
    expect(error.mock.calls[0][0].error).toBe(rejection);
    expect(document.body.textContent).toContain('Unsupported file type. Choose: Images, Documents');
    expect(document.body.textContent).not.toContain('PRIVATE BACKEND DETAIL');
    expect(document.querySelector('[aria-label="Retry upload for a.mp4"]')).toBeNull();
    uploader.retry(result.failed[0].task.id);
    await flush();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it.each([
    { allowedFormats: [' PNG ', 'PNG', '', 4, 'JPG'], message: 'Unsupported format. Choose: PNG, JPG' },
    { allowedFormats: 'PNG', message: 'Unsupported file format. Choose another file.' },
    { allowedFormats: undefined, message: 'Unsupported file format. Choose another file.' },
  ])('normalizes controlled format guidance without raw exception messages', async ({ allowedFormats, message }) => {
    const rejection = { code: 'unsupported-file-format', allowedFormats, message: '<script>private</script>' };
    const upload = vi.fn().mockRejectedValue(rejection);
    const uploader = mountUploader({ upload });
    const result = await uploader.upload([new File(['bad'], 'a.svg')]);
    await flush();
    expect(result.failed[0].reason).toBe('file-format');
    expect(document.body.textContent).toContain(message);
    expect(document.body.textContent).not.toContain('<script>private</script>');
    uploader.retry(result.failed[0].task.id);
    await flush();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('keeps unknown failures retryable and preserves successful files in a mixed batch', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce(validItem('ok', 'ok.png'))
      .mockRejectedValueOnce({ code: 'unsupported-file-format' })
      .mockRejectedValueOnce({ code: 'upstream-unavailable' })
      .mockResolvedValueOnce(validItem('retry', 'retry.png'));
    const uploader = mountUploader({ upload });
    const result = await uploader.upload([new File(['a'], 'ok.png'), new File(['b'], 'bad.svg'), new File(['c'], 'retry.png')]);
    expect(result.succeeded).toHaveLength(1);
    expect(result.failed.map((entry) => entry.reason)).toEqual(['file-format', 'upload-failed']);
    uploader.retry(result.failed[1].task.id);
    await flush();
    expect(upload).toHaveBeenCalledTimes(4);
    expect(uploader.tasks.filter((task) => task.status === 'succeeded')).toHaveLength(2);
  });
});
