/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, nextTick, ref, shallowRef, type App } from 'vue';
import { Message } from '@arco-design/web-vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaGroup, MediaItem, MediaPickerService, MediaType } from '../src/services/types';
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
  props: { visible: Boolean },
  setup(props, { slots }) {
    return () =>
      h('div', { 'data-testid': 'modal', 'data-visible': String(props.visible) }, [
        h('div', { 'data-testid': 'modal-title' }, slots.title?.()),
        slots.default?.(),
        slots.footer?.(),
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
  props: { modelValue: { type: Array, default: () => [] } },
  emits: ['change'],
  setup(props, { emit, slots }) {
    return () =>
      h('div', { 'data-testid': 'checkbox-group', 'data-model-value': props.modelValue.map(String).join(',') }, [
        h('button', { 'data-testid': 'select-media', 'onClick': () => emit('change', ['7']) }),
        h('button', { 'data-testid': 'select-all-media', 'onClick': () => emit('change', ['7', '8', '9']) }),
        slots.default?.(),
      ]);
  },
});
const RadioGroupStub = defineComponent({
  props: { modelValue: { type: [String, Number, Boolean], default: '' } },
  emits: ['change'],
  setup(props, { emit, slots }) {
    return () =>
      h('div', { 'data-testid': 'radio-group', 'data-model-value': String(props.modelValue) }, [
        h('button', { 'data-testid': 'select-single-media', 'onClick': () => emit('change', '7') }),
        slots.default?.(),
      ]);
  },
});
const ImageStub = defineComponent({
  props: { src: String, preview: Boolean },
  setup(props) {
    return () => h('img', { 'data-testid': 'media-preview', 'data-src': props.src, 'data-preview': String(props.preview) });
  },
});
const ImagePreviewStub = defineComponent({
  props: { src: String, visible: Boolean },
  setup(props) {
    return () => h('div', { 'data-testid': 'explicit-preview', 'data-src': props.src, 'data-visible': String(props.visible) });
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
const AlertStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', { 'data-testid': 'load-error' }, [slots.default?.(), slots.action?.()]);
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

function mountApp(app: App) {
  app.use(
    createI18n({
      legacy: false,
      locale: 'en-US',
      messages: {
        'en-US': {
          'admin9Ui.mediaItem.preview': 'Preview {name}',
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
          'admin9Ui.mediaPicker.loadFailed': 'Load failed',
          'admin9Ui.mediaPicker.processing': 'Processing',
          'admin9Ui.mediaPicker.failed': 'Failed',
          'admin9Ui.mediaPicker.unavailable': 'Unavailable',
          'admin9Ui.mediaPicker.wrongType': 'Wrong type',
          'admin9Ui.mediaPicker.searchPlaceholder': 'Search media',
          'admin9Ui.mediaPicker.refresh': 'Refresh',
          'admin9Ui.mediaPicker.retry': 'Retry',
          'admin9Ui.mediaPicker.groupAll': 'All',
          'admin9Ui.mediaPicker.groupUngrouped': 'Ungrouped',
          'admin9Ui.mediaPicker.groupLoadFailed': 'Group load failed',
        },
      },
    })
  );
  app.component('AUpload', UploadStub);
  app.component('AModal', ModalStub);
  app.component('ASpace', Transparent);
  app.component('ASpin', SpinStub);
  app.component('ACheckboxGroup', CheckboxGroupStub);
  app.component('ACheckbox', ChoiceStub);
  app.component('ARadio', ChoiceStub);
  app.component('ARadioGroup', RadioGroupStub);
  app.component('AImage', ImageStub);
  app.component('AImagePreview', ImagePreviewStub);
  app.component('ASelect', Transparent);
  app.component('AOption', Transparent);
  app.component('AInputSearch', InputSearchStub);
  app.component('AAlert', AlertStub);
  app.component(
    'AButton',
    defineComponent({
      props: { loading: Boolean },
      setup(props, { attrs, slots }) {
        return () => h('button', { ...attrs, 'data-loading': String(props.loading) }, slots.default?.());
      },
    })
  );
  app.component('APagination', PaginationStub);
  app.component('AEmpty', Transparent);
  app.component('IconRefresh', Transparent);
  app.component('IconUpload', Transparent);
  app.component('IconFolder', Transparent);
  app.component('IconEye', Transparent);
  app.component('IconPlayArrow', Transparent);
  mountedApps.push(app);
  app.mount('#app');
}

function mountPicker(
  service: MediaPickerService,
  props: Record<string, unknown> = {},
  slots: Record<string, () => unknown> = {}
) {
  const Host = defineComponent({
    setup() {
      return () => h(AMediaPicker, { multiple: true, service, ...props }, slots);
    },
  });
  const app = createApp(Host);
  mountApp(app);
}

function mountDynamicPicker(service: MediaPickerService, initialMediaType: MediaType) {
  const mediaType = ref(initialMediaType);
  const Host = defineComponent({
    setup() {
      return () =>
        h(AMediaPicker, {
          multiple: true,
          service,
          mediaType: mediaType.value,
          canUpload: true,
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

function mountReactivePicker(initialService: MediaPickerService, initialPageSize = 24, props: Record<string, unknown> = {}) {
  const service = shallowRef(initialService);
  const pageSize = ref(initialPageSize);
  const Host = defineComponent({
    setup() {
      return () => h(AMediaPicker, { multiple: true, service: service.value, pageSize: pageSize.value, ...props });
    },
  });
  const app = createApp(Host);
  mountApp(app);
  return {
    setService(value: MediaPickerService) {
      service.value = value;
    },
    setPageSize(value: number) {
      pageSize.value = value;
    },
  };
}

describe('AMediaPicker selection and capability contract', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });
  afterEach(() => {
    mountedApps.splice(0).forEach((app) => app.unmount());
    vi.restoreAllMocks();
  });

  it('emits modal visibility changes for open, cancel, and confirm flows', async () => {
    const onVisibleChange = vi.fn();
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
    };
    mountPicker(service, { onVisibleChange });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(onVisibleChange).toHaveBeenLastCalledWith(true);

    Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Cancel')
      ?.click();
    await flush();
    expect(onVisibleChange).toHaveBeenLastCalledWith(false);

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="select-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'OK (1)')
      ?.click();
    await flush();

    expect(onVisibleChange.mock.calls.map(([visible]) => visible)).toEqual([true, false, true, false]);
  });

  it('uploads a selected file exactly once and refreshes the list after success', async () => {
    const onUploadSuccess = vi.fn();
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
      upload: vi.fn().mockResolvedValue(media),
    };
    mountPicker(service, { canUpload: true, onUploadSuccess });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="picker-upload"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(service.upload).toHaveBeenCalledTimes(1);
    expect(service.upload).toHaveBeenCalledWith(expect.objectContaining({ file: expect.any(File) }));
    expect(service.list).toHaveBeenCalledTimes(2);
    expect(onUploadSuccess).toHaveBeenCalledWith(media);
  });

  it('recovers after an upload failure and allows the next file selection', async () => {
    const uploadError = new Error('upload failed');
    const onUploadError = vi.fn();
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
      upload: vi.fn().mockRejectedValueOnce(uploadError).mockResolvedValueOnce(media),
    };
    mountPicker(service, { canUpload: true, onUploadError });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="picker-upload"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="picker-upload"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(service.upload).toHaveBeenCalledTimes(2);
    expect(service.list).toHaveBeenCalledTimes(2);
    expect(onUploadError).toHaveBeenCalledWith(uploadError);
  });

  it('renders the public trigger slot without changing the service boundary', async () => {
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [], pagination: { page: 1, pageSize: 24, total: 0, hasMore: false } }),
      upload: vi.fn(),
    };
    mountPicker(service, {}, { trigger: () => h('span', { 'data-testid': 'custom-trigger' }, 'Choose') });
    await flush();

    expect(document.querySelector('[data-testid="custom-trigger"]')?.textContent).toBe('Choose');
  });

  it('keeps upload-button as a deprecated trigger slot alias', async () => {
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [], pagination: { page: 1, pageSize: 24, total: 0, hasMore: false } }),
    };
    mountPicker(service, {}, { 'upload-button': () => h('span', { 'data-testid': 'legacy-trigger' }, 'Legacy') });
    await flush();

    expect(document.querySelector('[data-testid="legacy-trigger"]')?.textContent).toBe('Legacy');
  });

  it.each<[MediaType, string]>([
    ['image', 'Select image'],
    ['video', 'Select video'],
    ['audio', 'Select audio'],
  ])('uses the %s selection label for both the default trigger and modal title', async (mediaType, label) => {
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [], pagination: { page: 1, pageSize: 24, total: 0, hasMore: false } }),
      upload: vi.fn(),
    };
    mountPicker(service, { mediaType });
    await flush();

    expect(document.querySelector('[data-testid="picker-trigger"]')?.textContent?.trim()).toBe(label);
    expect(document.querySelector('[data-testid="modal-title"]')?.textContent?.trim()).toBe(label);
  });

  it('renders responsive group controls on component-owned native wrappers', async () => {
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [], pagination: { page: 1, pageSize: 24, total: 0, hasMore: false } }),
      listGroups: vi.fn().mockResolvedValue([{ id: 'campaign', name: 'Campaign' }]),
      upload: vi.fn(),
    };
    mountPicker(service);
    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    const compactControl = document.querySelector('.a9-media-picker__group-select');
    const desktopControl = document.querySelector('.a9-media-picker__groups');
    expect(compactControl?.tagName).toBe('DIV');
    expect(compactControl?.textContent).toContain('Campaign');
    expect(desktopControl?.tagName).toBe('ASIDE');
    expect(desktopControl?.textContent).toContain('Campaign');
  });

  it('selects existing media with a browse-only service while keeping upload hidden by default', async () => {
    const onSelectionChange = vi.fn();
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
    };
    mountPicker(service, { onSelectionChange });

    document.querySelector('button')?.click();
    await flush();
    document.querySelector('[data-testid="select-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(document.querySelector('[data-testid="select-media"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Upload image');
    expect(onSelectionChange).toHaveBeenCalledWith([media]);
  });

  it('keeps pending and failed media visible but out of selection without exposing deletion', async () => {
    const pending = { ...media, id: '8', name: 'pending.png', url: null, status: 'pending' as const };
    const failed = { ...media, id: '9', name: 'failed.png', url: null, status: 'failed' as const };
    const onSelectionChange = vi.fn();
    const service: MediaPickerService = {
      list: vi
        .fn()
        .mockResolvedValue({ list: [media, pending, failed], pagination: { page: 1, pageSize: 24, total: 3, hasMore: false } }),
    };
    mountPicker(service, { onSelectionChange });

    document.querySelector('button')?.click();
    await flush();
    expect(document.body.textContent).toContain('Processing');
    expect(document.body.textContent).toContain('Failed');
    expect(document.querySelectorAll('[data-testid="media-preview"]')).toHaveLength(1);

    document.querySelector('[data-testid="select-all-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(onSelectionChange).toHaveBeenCalledWith([media]);
    expect(document.body.textContent).not.toContain('Delete');
  });

  it('keeps ready media without a URL visible but prevents preview and selection', async () => {
    const unavailableReady = { ...media, id: '10', name: 'missing.png', url: null, status: 'ready' as const };
    const service: MediaPickerService = {
      list: vi
        .fn()
        .mockResolvedValue({ list: [unavailableReady], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
      upload: vi.fn(),
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
    const first = deferred<Awaited<ReturnType<MediaPickerService['list']>>>();
    const second = deferred<Awaited<ReturnType<MediaPickerService['list']>>>();
    const olderMedia = { ...media, id: '8', name: 'older.png', url: '/media/older.png' };
    const latestMedia = { ...media, id: '9', name: 'latest.png', url: '/media/latest.png' };
    const service: MediaPickerService = {
      list: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
      upload: vi.fn(),
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
    const first = deferred<Awaited<ReturnType<MediaPickerService['list']>>>();
    const second = deferred<Awaited<ReturnType<MediaPickerService['list']>>>();
    const olderMedia = { ...media, id: '8', name: 'older.png', url: '/media/older.png' };
    const latestMedia = { ...media, id: '9', name: 'latest.png', url: '/media/latest.png' };
    const service: MediaPickerService = {
      list: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
      upload: vi.fn(),
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
      const service: MediaPickerService = {
        list: vi.fn().mockResolvedValue({
          list: [item],
          pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
        }),
        upload: vi.fn(),
      };
      mountPicker(service, { mediaType });

      document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();

      expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ mediaType, groupId: undefined, keyword: undefined }));
      expect(document.querySelector(`[data-media-type="${mediaType}"][data-available="true"]`)).not.toBeNull();
      if (mediaType === 'image') expect(document.querySelector('[data-testid="media-preview"]')).not.toBeNull();
      if (mediaType === 'video') expect(document.querySelector('video')).not.toBeNull();
      if (mediaType === 'audio') expect(document.querySelector('audio')).not.toBeNull();
    }
  );

  it('defaults to image and keeps upload hidden for a browse-only service', async () => {
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({
        list: [media],
        pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
      }),
    };
    mountPicker(service);

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="select-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'image' }));
    expect(document.querySelector('[data-testid="picker-upload"]')).toBeNull();
  });

  it('loads type-scoped groups and resets pagination when the backend group changes', async () => {
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({
        list: [media],
        pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
      }),
      listGroups: vi.fn().mockResolvedValue([{ id: 'campaign', name: 'Campaign', count: 3 }]),
      upload: vi.fn(),
    };
    mountPicker(service);

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
    const service: MediaPickerService = {
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
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({
        list: [],
        pagination: { page: 1, pageSize: 24, total: 0, hasMore: false },
      }),
      listGroups: vi
        .fn()
        .mockImplementation((mediaType: MediaType) => (mediaType === 'image' ? imageGroups.promise : videoGroups.promise)),
      upload: vi.fn(),
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
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({
        list: [media],
        pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
      }),
      upload: vi.fn(),
    };
    mountPicker(service);

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(document.querySelector('.a9-media-picker__groups')).toBeNull();
    expect(document.querySelector('.a9-media-picker__group-select')).toBeNull();
  });

  it('sends keyword and group filters to the backend instead of filtering the page locally', async () => {
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({
        list: [media],
        pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
      }),
      listGroups: vi.fn().mockResolvedValue([{ id: 'campaign', name: 'Campaign' }]),
      upload: vi.fn(),
    };
    mountPicker(service);

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
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({
        list: [media],
        pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
      }),
      listGroups: vi.fn().mockResolvedValue([{ id: 'campaign', name: 'Campaign' }]),
      upload: vi.fn().mockResolvedValue({ ...media, type: 'video' }),
    };
    mountPicker(service, { mediaType: 'video', canUpload: true });

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
    const onUpdate = vi.fn();
    const service: MediaPickerService = {
      list: vi.fn().mockImplementation(({ groupId }) =>
        Promise.resolve({
          list: groupId === 'campaign' ? [groupedMedia] : [media],
          pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
        })
      ),
      listGroups: vi.fn().mockResolvedValue([{ id: 'campaign', name: 'Campaign' }]),
      upload: vi.fn(),
    };
    mountPicker(service, { onChange, 'onUpdate:modelValue': onUpdate });

    expect(document.querySelector('[data-testid="modal"]')?.getAttribute('data-visible')).toBe('false');
    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(document.querySelector('[data-testid="modal"]')?.getAttribute('data-visible')).toBe('true');
    document.querySelector('[data-testid="select-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-group-id="campaign"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="select-all-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.startsWith('OK'))
      ?.click();
    await flush();

    expect(onChange).toHaveBeenCalledWith([media, groupedMedia]);
    expect(onUpdate).toHaveBeenCalledWith([media, groupedMedia]);
    expect(document.querySelector('[data-testid="modal"]')?.getAttribute('data-visible')).toBe('false');
  });

  it('keeps single selection as a draft until explicit confirmation', async () => {
    const onSelectionChange = vi.fn();
    const onSelect = vi.fn();
    const onChange = vi.fn();
    const onUpdate = vi.fn();
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
    };
    mountPicker(service, {
      'multiple': false,
      onSelectionChange,
      onSelect,
      onChange,
      'onUpdate:modelValue': onUpdate,
    });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="select-single-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(onSelectionChange).toHaveBeenCalledWith([media]);
    expect(onSelect).toHaveBeenCalledWith([media]);
    expect(onChange).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="modal"]')?.getAttribute('data-visible')).toBe('true');

    Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'OK')
      ?.click();
    await flush();

    expect(onChange).toHaveBeenCalledWith([media]);
    expect(onUpdate).toHaveBeenCalledWith(media);
    expect(document.querySelector('[data-testid="modal"]')?.getAttribute('data-visible')).toBe('false');
  });

  it('uses valueType instead of inferring output from the runtime model shape', async () => {
    const onUpdate = vi.fn();
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
    };
    mountPicker(service, { 'multiple': false, 'modelValue': media.url, 'onUpdate:modelValue': onUpdate });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(document.querySelector('[data-testid="radio-group"]')?.getAttribute('data-model-value')).toBe('');
    document.querySelector('[data-testid="select-single-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'OK')
      ?.click();
    await flush();

    expect(onUpdate).toHaveBeenCalledWith(media);
  });

  it('restores URL values and reconciles synthetic entries to real list items', async () => {
    const onUpdate = vi.fn();
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
    };
    mountPicker(service, {
      'multiple': false,
      'valueType': 'url',
      'modelValue': media.url,
      'onUpdate:modelValue': onUpdate,
    });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(document.querySelector('[data-testid="radio-group"]')?.getAttribute('data-model-value')).toBe(media.id);
    Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'OK')
      ?.click();
    await flush();
    expect(onUpdate).toHaveBeenCalledWith(media.url);
  });

  it('writes URL arrays for multiple selection when valueType is url', async () => {
    const onUpdate = vi.fn();
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
    };
    mountPicker(service, { 'valueType': 'url', 'modelValue': [media.url], 'onUpdate:modelValue': onUpdate });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(document.querySelector('[data-testid="checkbox-group"]')?.getAttribute('data-model-value')).toBe(media.id);
    Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'OK (1)')
      ?.click();
    await flush();

    expect(onUpdate).toHaveBeenCalledWith([media.url]);
  });

  it('separates image preview from selection', async () => {
    const onSelectionChange = vi.fn();
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
    };
    mountPicker(service, { onSelectionChange });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(document.querySelector('[data-testid="media-preview"]')?.getAttribute('data-preview')).toBe('false');
    expect(document.querySelector('.a9-media-item__preview')?.getAttribute('aria-label')).toBe('Preview avatar.png');
    document.querySelector('[data-testid="select-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(onSelectionChange).toHaveBeenCalledWith([media]);
    expect(document.querySelector('[data-testid="explicit-preview"]')?.getAttribute('data-visible')).toBe('false');

    document.querySelector<HTMLButtonElement>('.a9-media-item__preview')?.click();
    await flush();
    expect(document.querySelector('[data-testid="explicit-preview"]')?.getAttribute('data-visible')).toBe('true');
  });

  it('reacts to service and pageSize changes without accepting stale list state', async () => {
    const oldList = deferred<Awaited<ReturnType<MediaPickerService['list']>>>();
    const oldService: MediaPickerService = { list: vi.fn().mockReturnValue(oldList.promise) };
    const newService: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 12, total: 1, hasMore: false } }),
    };
    const picker = mountReactivePicker(oldService);

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    picker.setService(newService);
    await flush();
    picker.setPageSize(12);
    await flush();
    oldList.resolve({ list: [{ ...media, id: 'old' }], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } });
    await oldList.promise;
    await flush();

    expect(newService.list).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 12 }));
    expect(document.querySelector('[data-testid="media-preview"]')?.getAttribute('data-src')).toBe(media.url);
  });

  it('does not leave upload loading active when a reactive service lacks upload capability', async () => {
    const onUploadError = vi.fn();
    const initialService: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
      upload: vi.fn().mockResolvedValue(media),
    };
    const browseOnly: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
    };
    const picker = mountReactivePicker(initialService, 24, { canUpload: true, onUploadError });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    picker.setService(browseOnly);
    await flush();
    document.querySelector('[data-testid="picker-upload"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(document.querySelector('[data-testid="picker-upload"] button')?.getAttribute('data-loading')).toBe('false');
    expect(onUploadError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('does not refresh a new media type when an older upload completes', async () => {
    const upload = deferred<MediaItem>();
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [], pagination: { page: 1, pageSize: 24, total: 0, hasMore: false } }),
      upload: vi.fn().mockReturnValue(upload.promise),
    };
    const picker = mountDynamicPicker(service, 'image');

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="picker-upload"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    picker.setMediaType('video');
    await flush();
    upload.resolve(media);
    await upload.promise;
    await flush();

    expect(service.list).toHaveBeenCalledTimes(2);
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ mediaType: 'video' }));
  });

  it('refreshes both the list and group counts after upload success', async () => {
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
      listGroups: vi.fn().mockResolvedValue([{ id: 'campaign', name: 'Campaign', count: 1 }]),
      upload: vi.fn().mockResolvedValue(media),
    };
    mountPicker(service, { canUpload: true });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="picker-upload"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(service.list).toHaveBeenCalledTimes(2);
    expect(service.listGroups).toHaveBeenCalledTimes(2);
  });

  it('keeps a persistent load error with an explicit retry action', async () => {
    const messageError = vi.spyOn(Message, 'error').mockImplementation(() => ({ close: vi.fn() }));
    const service: MediaPickerService = {
      list: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ list: [media], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
    };
    mountPicker(service);

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(document.querySelector('[data-testid="load-error"]')?.textContent).toContain('Load failed');
    expect(document.body.textContent).not.toContain('Empty');
    expect(messageError).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>('[data-testid="load-error"] button')?.click();
    await flush();
    expect(service.list).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-testid="load-error"]')).toBeNull();
    expect(document.querySelector('[data-testid="media-preview"]')?.getAttribute('data-src')).toBe(media.url);
  });

  it('keeps the group load failure toast because it has no persistent error state', async () => {
    const messageError = vi.spyOn(Message, 'error').mockImplementation(() => ({ close: vi.fn() }));
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({ list: [], pagination: { page: 1, pageSize: 24, total: 0, hasMore: false } }),
      listGroups: vi.fn().mockRejectedValue(new Error('offline')),
    };
    mountPicker(service);

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(messageError).toHaveBeenCalledTimes(1);
    expect(messageError).toHaveBeenCalledWith('Group load failed');
    expect(document.querySelector('[data-testid="load-error"]')).toBeNull();
  });

  it('enforces the multi-select limit at the emitted change boundary', async () => {
    const items: MediaItem[] = [
      media,
      { ...media, id: '8', name: 'second.png', url: '/media/second.png' },
      { ...media, id: '9', name: 'third.png', url: '/media/third.png' },
    ];
    const onSelect = vi.fn();
    const service: MediaPickerService = {
      list: vi.fn().mockResolvedValue({
        list: items,
        pagination: { page: 1, pageSize: 24, total: 3, hasMore: false },
      }),
      upload: vi.fn(),
    };
    mountPicker(service, { limit: 1, onSelect });

    document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    document.querySelector('[data-testid="select-all-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(onSelect).toHaveBeenLastCalledWith([media]);
    expect(document.body.textContent).toContain('OK (1)');
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
      const service: MediaPickerService = {
        list: vi.fn().mockResolvedValue({
          list: [valid, wrongType, pending, failed, missingUrl],
          pagination: { page: 1, pageSize: 24, total: 5, hasMore: false },
        }),
        upload: vi.fn(),
      };
      mountPicker(service, { mediaType, onSelect });

      document.querySelector('[data-testid="picker-trigger"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      expect(document.querySelectorAll('[data-available="false"]')).toHaveLength(4);
      document.querySelector('[data-testid="select-all-media"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();

      expect(onSelect).toHaveBeenLastCalledWith([valid]);
    }
  );
});
