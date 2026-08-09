/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaGroup, MediaItem, MediaService, MediaType } from '../src/services/types';
import AMediaPicker from '../src/components/media-picker/index.vue';

const mountedApps: App[] = [];
const media: MediaItem = {
  id: '7',
  name: 'avatar.png',
  type: 'image',
  groupId: null,
  url: '/media/avatar.png',
  status: 'ready',
};

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
const InputSearchStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue', 'search', 'clear'],
  setup(props, { emit }) {
    return () =>
      h('div', [
        h('input', {
          'data-testid': 'media-search',
          'value': props.modelValue,
          'onInput': (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
        }),
        h('button', { 'data-testid': 'submit-search', 'onClick': () => emit('search') }, 'Search'),
      ]);
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

function mountApp(app: App) {
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
          'admin9Ui.mediaPicker.select.image': 'Select image',
          'admin9Ui.mediaPicker.select.video': 'Select video',
          'admin9Ui.mediaPicker.select.audio': 'Select audio',
          'admin9Ui.mediaPicker.upload.image': 'Upload image',
          'admin9Ui.mediaPicker.upload.video': 'Upload video',
          'admin9Ui.mediaPicker.upload.audio': 'Upload audio',
          'admin9Ui.mediaPicker.uploadFailed': 'Upload failed',
          'admin9Ui.mediaPicker.processing': 'Processing',
          'admin9Ui.mediaPicker.failed': 'Failed',
          'admin9Ui.mediaPicker.unavailable': 'Unavailable',
          'admin9Ui.mediaPicker.wrongType': 'Wrong type',
          'admin9Ui.mediaPicker.searchPlaceholder': 'Search media',
          'admin9Ui.mediaPicker.refresh': 'Refresh',
          'admin9Ui.mediaPicker.groupAll': 'All',
          'admin9Ui.mediaPicker.groupUngrouped': 'Ungrouped',
          'admin9Ui.mediaPicker.groupLoadFailed': 'Group load failed',
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
  app.component('ASelect', Transparent);
  app.component('AOption', Transparent);
  app.component('AInputSearch', InputSearchStub);
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
  app.component('IconPlayArrow', Transparent);
  mountedApps.push(app);
  app.mount('#app');
}

function mountPicker(service: MediaService, props: Record<string, unknown> = {}) {
  const app = createApp(AMediaPicker, { multiple: true, service, canDelete: true, ...props });
  mountApp(app);
}

function mountDynamicPicker(service: MediaService, initialMediaType: MediaType) {
  const mediaType = ref(initialMediaType);
  const Host = defineComponent({
    setup() {
      return () =>
        h(AMediaPicker, {
          multiple: true,
          service,
          mediaType: mediaType.value,
          canDelete: false,
        });
    },
  });
  const app = createApp(Host);
  mountApp(app);
  return {
    setMediaType(value: MediaType) {
      mediaType.value = value;
    },
  };
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
    const pending = { ...media, id: '8', name: 'pending.png', url: null, status: 'pending' as const };
    const failed = { ...media, id: '9', name: 'failed.png', url: null, status: 'failed' as const };
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
    const failed = { ...media, id: '9', name: 'failed.png', url: null, status: 'failed' as const };
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
      ...media,
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
    const failedA = { ...media, id: '8', name: 'failed-a.png', url: null, status: 'failed' as const };
    const failedB = { ...media, id: '9', name: 'failed-b.png', url: null, status: 'failed' as const };
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
    const unavailableReady = { ...media, id: '10', name: 'missing.png', url: null, status: 'ready' as const };
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

  it.each<MediaType>(['image', 'video', 'audio'])(
    'sends mediaType=%s to the backend service and renders the matching media UI',
    async (mediaType) => {
      const item: MediaItem = {
        ...media,
        type: mediaType,
        name: `sample.${mediaType}`,
        url: `/media/sample.${mediaType}`,
        duration: mediaType === 'image' ? undefined : 75,
      };
      const service: MediaService = {
        list: vi.fn().mockResolvedValue({
          list: [item],
          pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
        }),
        upload: vi.fn(),
        remove: vi.fn(),
      };
      mountPicker(service, { mediaType, canDelete: false });

      document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();

      expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ mediaType, groupId: undefined, keyword: undefined }));
      expect(document.querySelector(`[data-media-type="${mediaType}"][data-selectable="true"]`)).not.toBeNull();
      if (mediaType === 'image') expect(document.querySelector('[data-testid="media-preview"]')).not.toBeNull();
      if (mediaType === 'video') expect(document.querySelector('video')).not.toBeNull();
      if (mediaType === 'audio') expect(document.querySelector('audio')).not.toBeNull();
    }
  );

  it('defaults to image and keeps delete disabled unless explicitly allowed', async () => {
    const service: MediaService = {
      list: vi.fn().mockResolvedValue({
        list: [media],
        pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
      }),
      upload: vi.fn(),
      remove: vi.fn(),
    };
    mountPicker(service, { canDelete: undefined });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="select-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'image' }));
    expect(batchDeleteButton()).toBeUndefined();
  });

  it('loads type-scoped groups and resets pagination when the backend group changes', async () => {
    const service: MediaService = {
      list: vi.fn().mockResolvedValue({
        list: [media],
        pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
      }),
      listGroups: vi.fn().mockResolvedValue([{ id: 'campaign', name: 'Campaign', count: 3 }]),
      upload: vi.fn(),
      remove: vi.fn(),
    };
    mountPicker(service, { canDelete: false });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="next-page"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-group-id="campaign"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(service.listGroups).toHaveBeenCalledWith('image');
    expect(service.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, mediaType: 'image', groupId: 'campaign' })
    );
    expect(document.querySelector('[data-testid="media-pagination"]')?.getAttribute('data-current')).toBe('1');

    document.querySelector('[data-group-kind="ungrouped"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, mediaType: 'image', groupId: null }));
  });

  it('removes old-type groups while the new mediaType groups are still loading', async () => {
    const videoGroups = deferred<MediaGroup[]>();
    const service: MediaService = {
      list: vi.fn().mockResolvedValue({
        list: [],
        pagination: { page: 1, pageSize: 24, total: 0, hasMore: false },
      }),
      listGroups: vi.fn().mockImplementation((mediaType: MediaType) => {
        if (mediaType === 'image') return Promise.resolve([{ id: 'image-group', name: 'Image group' }]);
        return videoGroups.promise;
      }),
      upload: vi.fn().mockResolvedValue({
        ...media,
        type: 'video',
        name: 'video.mp4',
        url: '/media/video.mp4',
      }),
      remove: vi.fn(),
    };
    const picker = mountDynamicPicker(service, 'image');

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(document.querySelector('[data-group-id="image-group"]')).not.toBeNull();

    picker.setMediaType('video');
    await flush();

    expect(document.querySelector('[data-group-id="image-group"]')).toBeNull();
    expect(document.querySelector('[data-group-id="video-group"]')).toBeNull();
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ mediaType: 'video', groupId: undefined }));
    expect(service.list).not.toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'video', groupId: 'image-group' }));
    document.querySelector('[data-testid="picker-upload"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(service.upload).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'video', groupId: null }));

    videoGroups.resolve([{ id: 'video-group', name: 'Video group' }]);
    await videoGroups.promise;
    await flush();

    expect(document.querySelector('[data-group-id="image-group"]')).toBeNull();
    expect(document.querySelector('[data-group-id="video-group"]')).not.toBeNull();
  });

  it('does not let a stale group request refill groups after mediaType changes', async () => {
    const imageGroups = deferred<MediaGroup[]>();
    const videoGroups = deferred<MediaGroup[]>();
    const service: MediaService = {
      list: vi.fn().mockResolvedValue({
        list: [],
        pagination: { page: 1, pageSize: 24, total: 0, hasMore: false },
      }),
      listGroups: vi
        .fn()
        .mockImplementation((mediaType: MediaType) => (mediaType === 'image' ? imageGroups.promise : videoGroups.promise)),
      upload: vi.fn(),
      remove: vi.fn(),
    };
    const picker = mountDynamicPicker(service, 'image');

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    picker.setMediaType('video');
    await flush();

    imageGroups.resolve([{ id: 'image-group', name: 'Image group' }]);
    await imageGroups.promise;
    await flush();
    expect(document.querySelector('[data-group-id="image-group"]')).toBeNull();

    videoGroups.resolve([{ id: 'video-group', name: 'Video group' }]);
    await videoGroups.promise;
    await flush();
    expect(document.querySelector('[data-group-id="video-group"]')).not.toBeNull();
  });

  it('hides group controls when listGroups is not implemented', async () => {
    const service: MediaService = {
      list: vi.fn().mockResolvedValue({
        list: [media],
        pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
      }),
      upload: vi.fn(),
      remove: vi.fn(),
    };
    mountPicker(service, { canDelete: false });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(document.querySelector('.a9-media-picker__groups')).toBeNull();
    expect(document.querySelector('.a9-media-picker__group-select')).toBeNull();
  });

  it('sends keyword and group filters to the backend instead of filtering the page locally', async () => {
    const service: MediaService = {
      list: vi.fn().mockResolvedValue({
        list: [media],
        pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
      }),
      listGroups: vi.fn().mockResolvedValue([{ id: 'campaign', name: 'Campaign' }]),
      upload: vi.fn(),
      remove: vi.fn(),
    };
    mountPicker(service, { canDelete: false });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-group-id="campaign"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    const search = document.querySelector<HTMLInputElement>('[data-testid="media-search"]');
    if (search) {
      search.value = 'launch';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.querySelector('[data-testid="next-page"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="submit-search"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(service.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, keyword: 'launch', mediaType: 'image', groupId: 'campaign' })
    );
  });

  it('uploads to ungrouped from All and to the active backend group from a concrete group', async () => {
    const service: MediaService = {
      list: vi.fn().mockResolvedValue({
        list: [media],
        pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
      }),
      listGroups: vi.fn().mockResolvedValue([{ id: 'campaign', name: 'Campaign' }]),
      upload: vi.fn().mockResolvedValue({ ...media, type: 'video' }),
      remove: vi.fn(),
    };
    mountPicker(service, { mediaType: 'video', canDelete: false });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="picker-upload"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-group-id="campaign"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="picker-upload"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    document.querySelector('[data-group-kind="ungrouped"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="picker-upload"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(service.listGroups).toHaveBeenCalledWith('video');
    expect(service.upload).toHaveBeenNthCalledWith(1, expect.objectContaining({ mediaType: 'video', groupId: null }));
    expect(service.upload).toHaveBeenNthCalledWith(2, expect.objectContaining({ mediaType: 'video', groupId: 'campaign' }));
    expect(service.upload).toHaveBeenNthCalledWith(3, expect.objectContaining({ mediaType: 'video', groupId: null }));
  });

  it('preserves multi-selection while browsing across backend groups', async () => {
    const groupedMedia: MediaItem = { ...media, id: '8', name: 'campaign.png', groupId: 'campaign' };
    const onChange = vi.fn();
    const service: MediaService = {
      list: vi.fn().mockImplementation(({ groupId }) =>
        Promise.resolve({
          list: groupId === 'campaign' ? [groupedMedia] : [media],
          pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
        })
      ),
      listGroups: vi.fn().mockResolvedValue([{ id: 'campaign', name: 'Campaign' }]),
      upload: vi.fn(),
      remove: vi.fn(),
    };
    mountPicker(service, { canDelete: false, onChange });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="select-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-group-id="campaign"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="select-all-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'OK (2)')
      ?.click();
    await flush();

    expect(onChange).toHaveBeenCalledWith([media, groupedMedia]);
  });

  it.each<MediaType>(['image', 'video', 'audio'])(
    'keeps wrong-type and unavailable records visible but unselectable in %s mode',
    async (mediaType) => {
      const otherType: MediaType = mediaType === 'image' ? 'video' : 'image';
      const valid: MediaItem = { ...media, type: mediaType, url: `/media/valid.${mediaType}` };
      const wrongType: MediaItem = { ...media, id: '8', type: otherType, url: '/media/wrong' };
      const pending: MediaItem = { ...media, id: '9', type: mediaType, status: 'pending' };
      const failed: MediaItem = { ...media, id: '10', type: mediaType, status: 'failed', url: null };
      const missingUrl: MediaItem = { ...media, id: '11', type: mediaType, url: null };
      const onSelect = vi.fn();
      const service: MediaService = {
        list: vi.fn().mockResolvedValue({
          list: [valid, wrongType, pending, failed, missingUrl],
          pagination: { page: 1, pageSize: 24, total: 5, hasMore: false },
        }),
        upload: vi.fn(),
        remove: vi.fn(),
      };
      mountPicker(service, { mediaType, canDelete: false, onSelect });

      document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      expect(document.querySelectorAll('[data-selectable="false"]')).toHaveLength(4);
      document.querySelector('[data-testid="select-all-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();

      expect(onSelect).toHaveBeenLastCalledWith([valid]);
    }
  );
});
