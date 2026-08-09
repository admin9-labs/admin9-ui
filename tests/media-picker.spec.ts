/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaService } from '../src/services/types';
import AMediaPicker from '../src/components/media-picker/index.vue';

const mountedApps: App[] = [];
const media = { id: '7', name: 'avatar.png', url: '/media/avatar.png', status: 'ready' as const };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const Transparent = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.());
  },
});
const ModalStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', [slots.default?.(), slots.footer?.()]);
  },
});
const PopconfirmStub = defineComponent({
  setup(_, { attrs, slots }) {
    const invoke = (event: 'onOk' | 'onCancel') => {
      const handler = attrs[event];
      if (typeof handler === 'function') handler();
    };
    return () =>
      h('div', { 'data-testid': 'delete-popconfirm', 'data-ok-loading': String(attrs.okLoading ?? false) }, [
        slots.default?.(),
        h('button', { 'data-testid': 'confirm-delete', 'onClick': () => invoke('onOk') }, 'Confirm delete'),
        h('button', { 'data-testid': 'cancel-delete', 'onClick': () => invoke('onCancel') }, 'Cancel delete'),
      ]);
  },
});
const ChoiceStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.checkbox?.() ?? slots.radio?.() ?? slots.default?.());
  },
});
const UploadStub = defineComponent({
  setup(_, { attrs, slots }) {
    const triggerUpload = () => {
      if (attrs.onButtonClick) {
        (attrs.onButtonClick as () => void)();
        return;
      }
      const customRequest = attrs.customRequest ?? attrs['custom-request'];
      const autoUpload = attrs.autoUpload ?? attrs['auto-upload'];
      if (!customRequest || autoUpload === false) return;
      (customRequest as (option: Record<string, unknown>) => unknown)({
        fileItem: { file: new File(['image'], 'upload.png', { type: 'image/png' }) },
        onProgress: vi.fn(),
        onSuccess: vi.fn(),
        onError: vi.fn(),
      });
    };
    return () =>
      h(
        'div',
        {
          'data-testid': attrs.customRequest || attrs['custom-request'] ? 'picker-upload' : 'picker-trigger',
          'onClick': triggerUpload,
        },
        slots['upload-button']?.()
      );
  },
});
const CheckboxGroupStub = defineComponent({
  emits: ['change'],
  setup(_, { emit, slots }) {
    return () =>
      h('div', [
        h('button', { 'data-testid': 'select-media', 'onClick': () => emit('change', ['7']) }),
        h('button', { 'data-testid': 'select-all-media', 'onClick': () => emit('change', ['7', '8', '9']) }),
        slots.default?.(),
      ]);
  },
});
const ImageStub = defineComponent({
  props: { src: String },
  setup(props) {
    return () => h('img', { 'data-testid': 'media-preview', 'data-src': props.src });
  },
});
const SpinStub = defineComponent({
  props: { loading: Boolean },
  setup(props, { slots }) {
    return () => h('div', { 'data-testid': 'media-gallery', 'data-loading': String(props.loading) }, slots.default?.());
  },
});
const PaginationStub = defineComponent({
  props: { current: Number, pageSize: Number, total: Number },
  emits: ['change'],
  setup(props, { emit }) {
    return () =>
      h(
        'div',
        {
          'data-testid': 'media-pagination',
          'data-current': String(props.current),
          'data-page-size': String(props.pageSize),
          'data-total': String(props.total),
        },
        [h('button', { 'data-testid': 'next-page', 'onClick': () => emit('change', (props.current ?? 0) + 1) })]
      );
  },
});

async function flush() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

function batchDeleteButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.includes('Delete 1 selected')
  );
}

function confirmDelete(button: HTMLButtonElement | undefined) {
  button
    ?.closest('[data-testid="delete-popconfirm"]')
    ?.querySelector<HTMLButtonElement>('[data-testid="confirm-delete"]')
    ?.click();
}

function cancelDelete(button: HTMLButtonElement | undefined) {
  button
    ?.closest('[data-testid="delete-popconfirm"]')
    ?.querySelector<HTMLButtonElement>('[data-testid="cancel-delete"]')
    ?.click();
}

function mountPicker(service: MediaService, props: Record<string, unknown> = {}) {
  const app = createApp(AMediaPicker, { multiple: true, service, ...props });
  app.use(
    createI18n({
      legacy: false,
      locale: 'en-US',
      messages: {
        'en-US': {
          'admin9Ui.mediaPicker.deleteCount': 'Delete {count} selected',
          'admin9Ui.mediaPicker.delete': 'Delete',
          'admin9Ui.mediaPicker.deleteConfirm': 'Deleted media cannot be recovered. Continue?',
          'admin9Ui.mediaPicker.deleteFailed': 'Delete failed',
          'admin9Ui.mediaPicker.empty': 'Empty',
          'admin9Ui.mediaPicker.confirm': 'OK',
          'admin9Ui.mediaPicker.cancel': 'Cancel',
          'admin9Ui.mediaPicker.selectImage': 'Select image',
          'admin9Ui.mediaPicker.uploadImage': 'Upload image',
          'admin9Ui.mediaPicker.uploadFailed': 'Upload failed',
          'admin9Ui.mediaPicker.processing': 'Processing',
          'admin9Ui.mediaPicker.failed': 'Failed',
        },
      },
    })
  );
  app.component('AUpload', UploadStub);
  app.component('AModal', ModalStub);
  app.component('APopconfirm', PopconfirmStub);
  app.component('ASpace', Transparent);
  app.component('ASpin', SpinStub);
  app.component('ACheckboxGroup', CheckboxGroupStub);
  app.component('ACheckbox', ChoiceStub);
  app.component('ARadio', ChoiceStub);
  app.component('ARadioGroup', Transparent);
  app.component('AImage', ImageStub);
  app.component(
    'AButton',
    defineComponent({
      setup(_, { attrs, slots }) {
        return () => h('button', attrs, slots.default?.());
      },
    })
  );
  app.component('APagination', PaginationStub);
  app.component('AEmpty', Transparent);
  app.component('IconRefresh', Transparent);
  app.component('IconUpload', Transparent);
  mountedApps.push(app);
  app.mount('#app');
}

describe('AMediaPicker permissions and partial-delete recovery', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });
  afterEach(() => {
    mountedApps.splice(0).forEach((app) => app.unmount());
  });

  it('refreshes the list before reporting a failed serial delete', async () => {
    const service: MediaService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
      upload: vi.fn(),
      remove: vi.fn().mockRejectedValue(new Error('media_delete_failed')),
    };
    mountPicker(service);

    document.querySelector('button')?.click();
    await flush();
    document.querySelector('[data-testid="select-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    const deleteButton = batchDeleteButton();
    deleteButton?.click();
    await flush();
    confirmDelete(deleteButton);
    await flush();

    expect(service.remove).toHaveBeenCalledWith(['7']);
    expect(service.list).toHaveBeenCalledTimes(2);
  });

  it('requires confirmation before deleting selected media', async () => {
    const service: MediaService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
      upload: vi.fn(),
      remove: vi.fn().mockResolvedValue(['7']),
    };
    mountPicker(service);

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="select-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    const deleteButton = batchDeleteButton();
    expect(deleteButton?.textContent).toContain('Delete 1 selected');
    deleteButton?.click();
    await flush();
    expect(service.remove).not.toHaveBeenCalled();

    cancelDelete(deleteButton);
    await flush();
    expect(service.remove).not.toHaveBeenCalled();

    confirmDelete(deleteButton);
    await flush();
    expect(service.remove).toHaveBeenCalledTimes(1);
    expect(service.remove).toHaveBeenCalledWith(['7']);
  });

  it('clears stale selection after a partial delete failure before allowing a new retry', async () => {
    const nextMedia = { ...media, id: '8', name: 'next.png', url: '/media/next.png' };
    const service: MediaService = {
      list: vi
        .fn()
        .mockResolvedValueOnce({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } })
        .mockResolvedValueOnce({ list: [nextMedia], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } })
        .mockResolvedValueOnce({ list: [], pagination: { page: 1, pageSize: 24, total: 0, hasMore: false } }),
      upload: vi.fn(),
      remove: vi.fn().mockRejectedValueOnce(new Error('media_delete_failed')).mockResolvedValueOnce(['8']),
    };
    mountPicker(service);

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="select-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    const firstDeleteButton = batchDeleteButton();
    firstDeleteButton?.click();
    await flush();
    confirmDelete(firstDeleteButton);
    await flush();

    expect(document.body.textContent).not.toContain('Delete 1 selected');
    document.querySelector('[data-testid="select-all-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    const retryDeleteButton = batchDeleteButton();
    retryDeleteButton?.click();
    await flush();
    confirmDelete(retryDeleteButton);
    await flush();

    expect(service.remove).toHaveBeenNthCalledWith(1, ['7']);
    expect(service.remove).toHaveBeenNthCalledWith(2, ['8']);
  });

  it('uploads a selected file exactly once and refreshes the list after success', async () => {
    const service: MediaService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
      upload: vi.fn().mockResolvedValue(media),
      remove: vi.fn(),
    };
    mountPicker(service);

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="picker-upload"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(service.upload).toHaveBeenCalledTimes(1);
    expect(service.upload).toHaveBeenCalledWith(expect.objectContaining({ file: expect.any(File) }));
    expect(service.list).toHaveBeenCalledTimes(2);
  });

  it('recovers after an upload failure and allows the next file selection', async () => {
    const service: MediaService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
      upload: vi.fn().mockRejectedValueOnce(new Error('upload failed')).mockResolvedValueOnce(media),
      remove: vi.fn(),
    };
    mountPicker(service);

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="picker-upload"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="picker-upload"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(service.upload).toHaveBeenCalledTimes(2);
    expect(service.list).toHaveBeenCalledTimes(2);
  });

  it('keeps existing-media selection available while hiding disallowed upload and delete controls', async () => {
    const service: MediaService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
      upload: vi.fn(),
      remove: vi.fn(),
    };
    mountPicker(service, { canUpload: false, canDelete: false });

    document.querySelector('button')?.click();
    await flush();

    expect(document.querySelector('[data-testid="select-media"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Upload image');
  });

  it('keeps pending and failed media visible but out of selection while allowing failed cleanup', async () => {
    const pending = { id: '8', name: 'pending.png', url: null, status: 'pending' as const };
    const failed = { id: '9', name: 'failed.png', url: null, status: 'failed' as const };
    const service: MediaService = {
      list: vi
        .fn()
        .mockResolvedValue({ list: [media, pending, failed], pagination: { page: 1, pageSize: 24, total: 3, hasMore: false } }),
      upload: vi.fn(),
      remove: vi.fn().mockResolvedValue(['9']),
    };
    mountPicker(service);

    document.querySelector('button')?.click();
    await flush();
    expect(document.body.textContent).toContain('Processing');
    expect(document.body.textContent).toContain('Failed');
    expect(document.querySelectorAll('[data-testid="media-preview"]')).toHaveLength(1);

    document.querySelector('[data-testid="select-all-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(document.body.textContent).toContain('Delete 1 selected');

    const failedDeleteButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Delete'
    );
    failedDeleteButton?.click();
    await flush();
    expect(service.remove).not.toHaveBeenCalled();
    cancelDelete(failedDeleteButton);
    await flush();
    expect(service.remove).not.toHaveBeenCalled();
    confirmDelete(failedDeleteButton);
    await flush();
    expect(service.remove).toHaveBeenCalledWith(['9']);
    expect(service.list).toHaveBeenCalledTimes(2);
  });

  it('sends only one delete when the same failed item is clicked again before completion', async () => {
    const failed = { id: '9', name: 'failed.png', url: null, status: 'failed' as const };
    const deletion = deferred<string[]>();
    const service: MediaService = {
      list: vi.fn().mockResolvedValue({
        list: [failed],
        pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
      }),
      upload: vi.fn(),
      remove: vi.fn().mockReturnValue(deletion.promise),
    };
    mountPicker(service);

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    const deleteButton = document.querySelector<HTMLButtonElement>('button.a9-media-picker__delete');
    deleteButton?.click();
    await flush();
    confirmDelete(deleteButton);
    confirmDelete(deleteButton);
    await flush();

    expect(service.remove).toHaveBeenCalledTimes(1);
    expect(service.remove).toHaveBeenCalledWith(['9']);
    expect(deleteButton?.disabled).toBe(true);

    deletion.resolve(['9']);
    await deletion.promise;
    await flush();
    expect(service.remove).toHaveBeenCalledTimes(1);
  });

  it('prevents batch and failed-item deletion from owning the same id concurrently', async () => {
    const overlapping = {
      id: '7',
      name: 'overlapping.png',
      url: '/media/overlapping.png' as string | null,
      status: 'ready' as 'ready' | 'failed',
    };
    const deletion = deferred<string[]>();
    const service: MediaService = {
      list: vi.fn().mockResolvedValue({
        list: [overlapping],
        pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
      }),
      upload: vi.fn(),
      remove: vi.fn().mockReturnValue(deletion.promise),
    };
    mountPicker(service);

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="select-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    const batchDelete = batchDeleteButton();
    batchDelete?.click();
    await flush();
    confirmDelete(batchDelete);
    overlapping.status = 'failed';
    overlapping.url = null;
    await flush();
    const failedDelete = document.querySelector<HTMLButtonElement>('button.a9-media-picker__delete');
    failedDelete?.click();
    await flush();
    confirmDelete(failedDelete);
    await flush();

    expect(service.remove).toHaveBeenCalledTimes(1);
    expect(service.remove).toHaveBeenCalledWith(['7']);

    deletion.resolve(['7']);
    await deletion.promise;
    await flush();
  });

  it('allows deletes for different failed ids to proceed independently', async () => {
    const failedA = { id: '8', name: 'failed-a.png', url: null, status: 'failed' as const };
    const failedB = { id: '9', name: 'failed-b.png', url: null, status: 'failed' as const };
    const deletionA = deferred<string[]>();
    const deletionB = deferred<string[]>();
    const service: MediaService = {
      list: vi
        .fn()
        .mockResolvedValue({ list: [failedA, failedB], pagination: { page: 1, pageSize: 24, total: 2, hasMore: false } }),
      upload: vi.fn(),
      remove: vi.fn().mockReturnValueOnce(deletionA.promise).mockReturnValueOnce(deletionB.promise),
    };
    mountPicker(service);

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    const deleteButtons = document.querySelectorAll<HTMLButtonElement>('button.a9-media-picker__delete');
    deleteButtons[0]?.click();
    deleteButtons[1]?.click();
    await flush();
    confirmDelete(deleteButtons[0]);
    confirmDelete(deleteButtons[1]);
    await flush();

    expect(service.remove).toHaveBeenNthCalledWith(1, ['8']);
    expect(service.remove).toHaveBeenNthCalledWith(2, ['9']);
    expect(service.remove).toHaveBeenCalledTimes(2);

    deletionA.resolve(['8']);
    deletionB.resolve(['9']);
    await Promise.all([deletionA.promise, deletionB.promise]);
    await flush();
  });

  it('keeps ready media without a URL visible but prevents preview and selection', async () => {
    const unavailableReady = { id: '10', name: 'missing.png', url: null, status: 'ready' as const };
    const service: MediaService = {
      list: vi
        .fn()
        .mockResolvedValue({ list: [unavailableReady], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
      upload: vi.fn(),
      remove: vi.fn(),
    };
    mountPicker(service);

    document.querySelector('button')?.click();
    await flush();

    expect(document.querySelector('[data-testid="media-preview"]')).toBeNull();
    document.querySelector('[data-testid="select-all-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(document.body.textContent).not.toContain('Delete 1 selected');
  });

  it('keeps loading and pagination owned by the newer list request when an older request settles first', async () => {
    const first = deferred<Awaited<ReturnType<MediaService['list']>>>();
    const second = deferred<Awaited<ReturnType<MediaService['list']>>>();
    const olderMedia = { ...media, id: '8', name: 'older.png', url: '/media/older.png' };
    const latestMedia = { ...media, id: '9', name: 'latest.png', url: '/media/latest.png' };
    const service: MediaService = {
      list: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
      upload: vi.fn(),
      remove: vi.fn(),
    };
    mountPicker(service);

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="next-page"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    first.resolve({ list: [olderMedia], pagination: { page: 1, pageSize: 12, total: 1, hasMore: false } });
    await first.promise;
    await flush();

    expect(document.querySelector('[data-testid="media-gallery"]')?.getAttribute('data-loading')).toBe('true');
    expect(document.querySelector('[data-testid="media-preview"]')).toBeNull();
    expect(document.querySelector('[data-testid="media-pagination"]')?.getAttribute('data-total')).toBe('0');

    second.resolve({ list: [latestMedia], pagination: { page: 2, pageSize: 48, total: 3, hasMore: false } });
    await second.promise;
    await flush();

    expect(document.querySelector('[data-testid="media-gallery"]')?.getAttribute('data-loading')).toBe('false');
    expect(document.querySelector('[data-testid="media-preview"]')?.getAttribute('data-src')).toBe('/media/latest.png');
    expect(document.querySelector('[data-testid="media-pagination"]')?.getAttribute('data-page-size')).toBe('48');
    expect(document.querySelector('[data-testid="media-pagination"]')?.getAttribute('data-total')).toBe('3');
  });

  it('does not let an older list response replace a newer list result', async () => {
    const first = deferred<Awaited<ReturnType<MediaService['list']>>>();
    const second = deferred<Awaited<ReturnType<MediaService['list']>>>();
    const olderMedia = { ...media, id: '8', name: 'older.png', url: '/media/older.png' };
    const latestMedia = { ...media, id: '9', name: 'latest.png', url: '/media/latest.png' };
    const service: MediaService = {
      list: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
      upload: vi.fn(),
      remove: vi.fn(),
    };
    mountPicker(service);

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="next-page"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    second.resolve({ list: [latestMedia], pagination: { page: 2, pageSize: 24, total: 3, hasMore: false } });
    await second.promise;
    await flush();
    first.resolve({ list: [olderMedia], pagination: { page: 1, pageSize: 12, total: 1, hasMore: false } });
    await first.promise;
    await flush();

    expect(document.querySelector('[data-testid="media-preview"]')?.getAttribute('data-src')).toBe('/media/latest.png');
    expect(document.querySelector('[data-testid="media-pagination"]')?.getAttribute('data-current')).toBe('2');
    expect(document.querySelector('[data-testid="media-pagination"]')?.getAttribute('data-page-size')).toBe('24');
    expect(document.querySelector('[data-testid="media-pagination"]')?.getAttribute('data-total')).toBe('3');
  });
});
