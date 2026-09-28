/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, inject, nextTick, provide, ref, shallowRef, watch, type App, type Ref } from 'vue';
import { Checkbox, Modal, Radio, RadioGroup } from '@arco-design/web-vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Admin9UI from '../src';
import AFilePicker from '../src/components/file-picker/index.vue';
import { messages } from '../src/locale';
import type { FileItem, FileListParams, FileListResult, FilePickerAdapter, FileType } from '../src/services/types';

const mountedApps: App[] = [];
const uploads: Array<{
  accept: unknown;
  request: (option: Record<string, unknown>) => unknown;
  onProgress: ReturnType<typeof vi.fn>;
  onSuccess: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
}> = [];

const image: FileItem = {
  id: 'image-1',
  name: 'dashboard.png',
  type: 'image',
  groupId: 'design',
  url: '/files/dashboard.png',
  thumbnail: '/files/dashboard.png',
  extension: 'png',
  status: 'ready',
};
const implicitReady: FileItem = {
  id: 'document-1',
  name: 'specification.pdf',
  type: 'document',
  groupId: null,
  url: '/files/specification.pdf',
  extension: 'pdf',
};
const video: FileItem = {
  id: 'video-1',
  name: 'launch.mp4',
  type: 'video',
  groupId: null,
  url: '/files/launch.mp4',
  duration: 15,
  status: 'ready',
};

function result(list: FileItem[], page = 1, pageSize = 2, total = list.length): FileListResult {
  return { list, pagination: { page, pageSize, total, hasMore: page * pageSize < total } };
}

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
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await nextTick();
}

const Transparent = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.());
  },
});
const ButtonStub = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  setup(props, { attrs, slots }) {
    return () => h('button', { ...attrs, disabled: props.disabled }, [slots.icon?.(), slots.default?.()]);
  },
});
const ModalStub = defineComponent({
  props: { visible: Boolean },
  emits: ['cancel', 'close'],
  setup(props, { attrs, emit, slots }) {
    watch(
      () => props.visible,
      (visible, previous) => {
        if (previous && !visible) emit('close');
      }
    );
    return () =>
      props.visible
        ? h('div', { ...attrs, 'data-testid': 'file-picker-modal' }, [
            slots.default?.(),
            slots.footer?.(),
            h('button', { 'data-testid': 'modal-cancel', 'onClick': () => emit('cancel') }, 'Close'),
          ])
        : null;
  },
});
const SpinStub = defineComponent({
  props: { loading: Boolean },
  setup(props, { attrs, slots }) {
    return () => h('div', { ...attrs, 'data-loading': String(props.loading) }, slots.default?.());
  },
});
const ImageStub = defineComponent({
  props: { src: String, preview: Boolean },
  setup(props) {
    return () => h('div', { 'data-src': props.src, 'data-preview': String(props.preview) });
  },
});
const InputSearchStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue', 'search', 'clear'],
  setup(props, { attrs, emit }) {
    return () =>
      h('div', attrs, [
        h('input', {
          'data-testid': 'picker-search',
          'value': props.modelValue,
          'onInput': (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
        }),
        h('button', { 'data-testid': 'picker-search-submit', 'onClick': () => emit('search') }, 'Search'),
        h(
          'button',
          {
            'data-testid': 'picker-search-clear',
            'onClick': () => {
              emit('update:modelValue', '');
              emit('clear');
            },
          },
          'Clear'
        ),
      ]);
  },
});
const SelectStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: undefined } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'select',
        {
          ...attrs,
          value: props.modelValue === undefined ? '' : String(props.modelValue),
          onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value),
        },
        slots.default?.()
      );
  },
});
const OptionStub = defineComponent({
  props: { value: { type: [String, Number], required: true } },
  setup(props, { slots }) {
    return () => h('option', { value: String(props.value) }, slots.default?.());
  },
});
const CheckboxStub = defineComponent({
  props: { modelValue: Boolean, disabled: Boolean },
  emits: ['change', 'keydown'],
  setup(props, { attrs, emit }) {
    const activate = () => {
      if (!props.disabled) emit('change', !props.modelValue);
    };
    return () =>
      h('button', {
        ...attrs,
        'disabled': props.disabled,
        'data-selected': String(props.modelValue),
        'onClick': activate,
        'onKeydown': (event: KeyboardEvent) => {
          if (event.key === ' ') activate();
          else emit('keydown', event);
        },
      });
  },
});
const UploadStub = defineComponent({
  props: { disabled: Boolean, accept: String },
  setup(props, { attrs, slots }) {
    const upload = () => {
      if (props.disabled) return;
      const request = (attrs.customRequest ?? attrs['custom-request']) as (option: Record<string, unknown>) => unknown;
      const onProgress = vi.fn();
      const onSuccess = vi.fn();
      const onError = vi.fn();
      uploads.push({ accept: props.accept, request, onProgress, onSuccess, onError });
      request({ fileItem: { file: new File(['fixture'], 'fixture.bin') }, onProgress, onSuccess, onError });
    };
    return () =>
      h(
        'div',
        {
          'data-testid': 'file-picker-upload',
          'data-disabled': String(props.disabled),
          'data-accept': props.accept,
          'onClick': upload,
        },
        slots['upload-button']?.()
      );
  },
});
const PaginationStub = defineComponent({
  props: { current: Number, pageSize: Number, total: Number },
  emits: ['change'],
  setup(props, { attrs, emit }) {
    return () =>
      h('div', { ...attrs, 'data-current': String(props.current), 'data-total': String(props.total) }, [
        h('button', { 'data-testid': 'picker-next-page', 'onClick': () => emit('change', (props.current ?? 1) + 1) }, 'Next'),
      ]);
  },
});
const radioGroupKey = Symbol('file-picker-radio-group');
const RadioGroupStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup(_, { attrs, emit, slots }) {
    provide(radioGroupKey, (value: string) => emit('update:modelValue', value));
    return () => h('div', attrs, slots.default?.());
  },
});
const RadioStub = defineComponent({
  props: {
    value: { type: String, default: '' },
    modelValue: { type: Boolean, default: undefined },
    disabled: Boolean,
  },
  emits: ['change', 'keydown'],
  setup(props, { attrs, emit, slots }) {
    const updateGroup = inject<(value: string) => void>(radioGroupKey, () => undefined);
    const activate = () => {
      if (props.disabled) return;
      if (typeof props.modelValue === 'boolean') emit('change', true);
      else updateGroup(props.value);
    };
    return () =>
      h(
        'button',
        {
          ...attrs,
          'disabled': props.disabled,
          'data-selected': String(props.modelValue),
          'data-value': props.value,
          'onClick': activate,
          'onKeydown': (event: KeyboardEvent) => {
            if (event.key === ' ') activate();
            else emit('keydown', event);
          },
        },
        slots.default?.()
      );
  },
});

function installStubs(app: App, options: { realModal?: boolean; realSelectionControls?: boolean } = {}) {
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  app.component('AButton', ButtonStub);
  app.component('AModal', options.realModal ? Modal : ModalStub);
  app.component('ATooltip', Transparent);
  app.component('AAlert', Transparent);
  app.component('ASpin', SpinStub);
  app.component('AProgress', Transparent);
  app.component('AEmpty', Transparent);
  app.component('AImage', ImageStub);
  app.component('AInputSearch', InputSearchStub);
  app.component('ASelect', SelectStub);
  app.component('AOption', OptionStub);
  app.component('ACheckbox', options.realSelectionControls ? Checkbox : CheckboxStub);
  app.component('AUpload', UploadStub);
  app.component('APagination', PaginationStub);
  app.component('ARadioGroup', options.realSelectionControls ? RadioGroup : RadioGroupStub);
  app.component('ARadio', options.realSelectionControls ? Radio : RadioStub);
  [
    'IconDown',
    'IconRight',
    'IconEye',
    'IconApps',
    'IconArchive',
    'IconClose',
    'IconDelete',
    'IconFile',
    'IconFileAudio',
    'IconFileImage',
    'IconFilePdf',
    'IconFileVideo',
    'IconFolder',
    'IconLaunch',
    'IconList',
    'IconRefresh',
    'IconStop',
    'IconUpload',
  ].forEach((name) => app.component(name, Transparent));
}

function makeService(overrides: Partial<FilePickerAdapter> = {}): FilePickerAdapter {
  return {
    list: vi.fn().mockResolvedValue(result([image, implicitReady, video])),
    listGroups: vi.fn().mockResolvedValue([{ id: 'design', name: 'Design', count: 1 }]),
    upload: vi.fn().mockResolvedValue({ ...image, id: 'uploaded-1', name: 'fixture.bin' }),
    ...overrides,
  };
}

interface MountOptions {
  service?: FilePickerAdapter;
  pluginService?: FilePickerAdapter;
  props?: Record<string, unknown>;
  realModal?: boolean;
  realSelectionControls?: boolean;
}

function mountPicker({
  service,
  pluginService,
  props = {},
  realModal = false,
  realSelectionControls = false,
}: MountOptions = {}) {
  const emitted: Record<string, unknown[][]> = {};
  const capture =
    (name: string) =>
    (...args: unknown[]) => {
      (emitted[name] ??= []).push(args);
    };
  const app = createApp(AFilePicker, {
    ...(service ? { service } : {}),
    ...props,
    'onUpdate:modelValue': capture('update:modelValue'),
    'onChange': capture('change'),
    'onSelectionChange': capture('selectionChange'),
    'onVisibleChange': capture('visibleChange'),
    'onUploadSuccess': capture('uploadSuccess'),
    'onUploadError': capture('uploadError'),
  });
  installStubs(app, { realModal, realSelectionControls });
  if (pluginService) app.use(Admin9UI, { fileService: pluginService });
  const vm = app.mount('#app');
  mountedApps.push(app);
  return { app, emitted, vm };
}

function mountDynamic(
  service: Ref<FilePickerAdapter>,
  modelValue: Ref<FileItem | FileItem[] | undefined>,
  fileTypes: Ref<readonly FileType[]>,
  props: Record<string, unknown> = {}
) {
  const emitted: Record<string, unknown[][]> = {};
  const capture =
    (name: string) =>
    (...args: unknown[]) => {
      (emitted[name] ??= []).push(args);
    };
  const errors: unknown[] = [];
  const Host = defineComponent({
    setup() {
      return () =>
        h(AFilePicker, {
          ...props,
          'service': service.value,
          'modelValue': modelValue.value,
          'fileTypes': fileTypes.value,
          'onUpdate:modelValue': capture('update:modelValue'),
          'onChange': capture('change'),
          'onSelectionChange': capture('selectionChange'),
        });
    },
  });
  const app = createApp(Host);
  app.config.errorHandler = (error) => errors.push(error);
  installStubs(app);
  app.mount('#app');
  mountedApps.push(app);
  return { app, emitted, errors };
}

function click(selector: string) {
  const element =
    document.querySelector<HTMLElement>(selector) ??
    (selector === '[data-testid="file-picker-trigger"]'
      ? document.querySelector<HTMLElement>('[data-testid="file-picker-replace"]')
      : null);
  if (!element) throw new Error(`Missing element: ${selector}`);
  element.click();
}

function item(id: string) {
  const element = document.querySelector<HTMLElement>(`[data-file-id="${id}"]`);
  if (!element) throw new Error(`Missing file item: ${id}`);
  return element;
}

function selectItem(id: string) {
  const control = item(id).querySelector<HTMLElement>('.a9-file-picker__checkbox');
  if (!control) throw new Error(`Missing file selection control: ${id}`);
  control.click();
}

function selectType(value: string) {
  const select = document.querySelector<HTMLSelectElement>('.a9-file-picker__type-select');
  if (!select) throw new Error('Missing file type selector');
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('AFilePicker', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    uploads.length = 0;
  });

  afterEach(() => {
    mountedApps.splice(0).forEach((app) => app.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads only after opening and preserves the aggregate query contract for all and subsets', async () => {
    const allService = makeService();
    mountPicker({ service: allService });
    await flush();
    expect(allService.list).not.toHaveBeenCalled();

    click('[data-testid="file-picker-trigger"]');
    await flush();
    expect(allService.list).toHaveBeenCalledWith({ page: 1, pageSize: 24, keyword: undefined, groupId: undefined });
    expect((allService.list as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toHaveProperty('fileTypes');
    expect((allService.list as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveProperty('groupId', undefined);

    mountedApps.pop()?.unmount();
    document.body.innerHTML = '<div id="app"></div>';
    const subsetService = makeService({ list: vi.fn().mockResolvedValue(result([image, implicitReady], 1, 24, 30)) });
    mountPicker({ service: subsetService, props: { fileTypes: ['image', 'document'] } });
    click('[data-testid="file-picker-trigger"]');
    await flush();

    expect(subsetService.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 24,
      keyword: undefined,
      fileTypes: ['image', 'document'],
      groupId: undefined,
    });
    expect(document.querySelector('[data-testid="file-picker-pagination"]')?.getAttribute('data-total')).toBe('30');
  });

  it('uses a concrete query and real-type groups for one allowed type', async () => {
    const service = makeService({ list: vi.fn().mockResolvedValue(result([image])) });
    mountPicker({ service, props: { fileTypes: ['image'] } });
    click('[data-testid="file-picker-trigger"]');
    await flush();

    expect(service.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 24,
      keyword: undefined,
      fileType: 'image',
      groupId: undefined,
    });
    expect(service.listGroups).toHaveBeenCalledWith();
    expect(document.querySelectorAll('.a9-file-picker__type-select')).toHaveLength(0);
  });

  it('normalizes duplicate and invalid file types without inventing all', async () => {
    const service = makeService();
    mountPicker({
      service,
      props: { fileTypes: ['image', 'image', 'all', 'document', 'bogus'] as unknown as FileType[] },
    });
    click('[data-testid="file-picker-trigger"]');
    await flush();

    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ fileTypes: ['image', 'document'] }));
    expect(document.querySelectorAll('.a9-file-picker__type-select option')).toHaveLength(3);
  });

  it('treats an empty allowed set as zero matches without mutating the external value', async () => {
    const service = makeService();
    const { emitted } = mountPicker({ service, props: { fileTypes: [], modelValue: image, accept: '*/*', canUpload: true } });
    await flush();

    expect(emitted['update:modelValue']).toBeUndefined();
    expect(emitted.change).toBeUndefined();
    click('[data-testid="file-picker-trigger"]');
    await flush();
    expect(service.list).not.toHaveBeenCalled();
    expect(service.listGroups).not.toHaveBeenCalled();
    expect(service.upload).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('No file types available');
  });

  it('invalidates an old request when restrictions become empty and resumes when restored', async () => {
    const pending = deferred<FileListResult>();
    const service = shallowRef(
      makeService({
        list: vi
          .fn()
          .mockReturnValueOnce(pending.promise)
          .mockResolvedValue(result([image])),
      })
    );
    const model = ref<FileItem | FileItem[] | undefined>(image);
    const fileTypes = ref<readonly FileType[]>(['image']);
    const { emitted } = mountDynamic(service, model, fileTypes);
    click('[data-testid="file-picker-trigger"]');
    await nextTick();

    fileTypes.value = [];
    await flush();
    expect(emitted['update:modelValue']).toBeUndefined();
    expect(document.querySelector('[data-file-id="image-1"]')).toBeNull();

    pending.resolve(result([image]));
    await flush();
    expect(document.querySelector('[data-file-id="image-1"]')).toBeNull();

    fileTypes.value = ['image'];
    await flush();
    expect(service.value.list).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-file-id="image-1"]')).not.toBeNull();
  });

  it('keeps draft selection across pages, cancels transactionally, and confirms once', async () => {
    const pageTwo = { ...implicitReady, id: 'document-2', name: 'guide.pdf' };
    const service = makeService({
      list: vi
        .fn()
        .mockImplementation((params: FileListParams) =>
          Promise.resolve(params.page === 1 ? result([image], 1, 1, 2) : result([pageTwo], 2, 1, 2))
        ),
    });
    const { emitted } = mountPicker({ service, props: { multiple: true, pageSize: 1 } });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    selectItem('image-1');
    click('[data-testid="picker-next-page"]');
    await flush();
    selectItem('document-2');
    await nextTick();
    expect(emitted.selectionChange?.at(-1)?.[0]).toEqual([image, pageTwo]);
    expect(document.querySelector('.a9-file-picker__selected-count')?.textContent).toContain('2 selected');

    click('[data-testid="modal-cancel"]');
    await flush();
    expect(emitted['update:modelValue']).toBeUndefined();
    expect(document.activeElement).toBe(document.querySelector('[data-testid="file-picker-trigger"]'));

    click('[data-testid="file-picker-trigger"]');
    await flush();
    selectItem('image-1');
    await nextTick();
    const confirmButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Confirm selection'
    );
    confirmButton?.click();
    confirmButton?.click();
    await flush();

    expect(emitted['update:modelValue']).toEqual([[[image]]]);
    expect(emitted.change).toEqual([[[image]]]);
  });

  it('disables wrong-type, pending, failed, empty-url, empty-id and every duplicate-id row', async () => {
    const invalidItems: FileItem[] = [
      implicitReady,
      { ...image, id: 'pending', status: 'pending' },
      { ...image, id: 'failed', status: 'failed' },
      { ...image, id: 'empty-url', url: '   ' },
      { ...image, id: '' },
      { ...image, id: 'duplicate', name: 'duplicate-a.png' },
      { ...image, id: 'duplicate', name: 'duplicate-b.png' },
      video,
    ];
    const service = makeService({ list: vi.fn().mockResolvedValue(result(invalidItems)) });
    const { emitted } = mountPicker({ service, props: { fileTypes: ['document'], multiple: true } });
    click('[data-testid="file-picker-trigger"]');
    await flush();

    expect(item('document-1').querySelector('.a9-file-picker__checkbox')?.hasAttribute('disabled')).toBe(false);
    expect(item('pending').querySelector('.a9-file-picker__checkbox')?.hasAttribute('disabled')).toBe(true);
    expect(item('failed').querySelector('.a9-file-picker__checkbox')?.hasAttribute('disabled')).toBe(true);
    expect(item('empty-url').querySelector('.a9-file-picker__checkbox')?.hasAttribute('disabled')).toBe(true);
    expect(document.querySelectorAll('[data-file-id="duplicate"] .a9-file-picker__checkbox:disabled')).toHaveLength(2);
    expect(item('video-1').querySelector('.a9-file-picker__checkbox')?.hasAttribute('disabled')).toBe(true);

    invalidItems.forEach((entry) => {
      const rows = document.querySelectorAll<HTMLElement>(`[data-file-id="${entry.id}"] .a9-file-picker__checkbox`);
      rows.forEach((row) => row.click());
    });
    expect(emitted.selectionChange?.at(-1)?.[0]).toEqual([implicitReady]);
  });

  it('supports Space and Enter selection and exposes selected and disabled control state', async () => {
    const service = makeService({
      list: vi.fn().mockResolvedValue(result([image, implicitReady, { ...image, id: 'failed', status: 'failed' }])),
    });
    mountPicker({ service, props: { multiple: true, fileTypes: ['image', 'document'] } });
    click('[data-testid="file-picker-trigger"]');
    await flush();

    const imageControl = item('image-1').querySelector<HTMLElement>('.a9-file-picker__checkbox');
    imageControl?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await nextTick();
    expect(imageControl?.getAttribute('data-selected')).toBe('true');
    expect(imageControl?.hasAttribute('disabled')).toBe(false);
    const documentControl = item('document-1').querySelector<HTMLElement>('.a9-file-picker__checkbox');
    documentControl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await nextTick();
    expect(documentControl?.getAttribute('data-selected')).toBe('true');
    const failedControl = item('failed').querySelector<HTMLElement>('.a9-file-picker__checkbox');
    expect(failedControl?.getAttribute('data-selected')).toBe('false');
    expect(failedControl?.hasAttribute('disabled')).toBe(true);

    const eventsBeforeOpen = document.querySelectorAll('.a9-file-picker__item.is-selected').length;
    const openLink = item('image-1').querySelector<HTMLElement>('.a9-file-item__open');
    openLink?.addEventListener('click', (event) => event.preventDefault());
    openLink?.click();
    await nextTick();
    expect(document.querySelectorAll('.a9-file-picker__item.is-selected')).toHaveLength(eventsBeforeOpen);
  });

  it('gives toggleable selection inputs native labels in both single and multiple selection', async () => {
    const invalid = { ...image, id: 'failed', name: 'failed.png', status: 'failed' as const };
    const checkboxMount = mountPicker({
      service: makeService({ list: vi.fn().mockResolvedValue(result([image, invalid])) }),
      props: { multiple: true, fileTypes: ['image'] },
      realSelectionControls: true,
    });
    click('[data-testid="file-picker-trigger"]');
    await flush();

    const checkbox = item('image-1').querySelector<HTMLInputElement>('input[type="checkbox"]');
    const disabledCheckbox = item('failed').querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox?.labels).toHaveLength(1);
    expect(checkbox?.closest('.a9-file-item__heading')).not.toBeNull();
    expect(checkbox?.closest('.a9-file-item__visual')).toBeNull();
    expect(checkbox?.labels?.[0]?.textContent?.trim()).toBe('Select dashboard.png');
    expect(checkbox?.getAttribute('aria-label')).toBeNull();
    expect(checkbox?.checked).toBe(false);
    checkbox?.click();
    await nextTick();
    expect(checkbox?.checked).toBe(true);
    expect(disabledCheckbox?.labels?.[0]?.textContent?.trim()).toBe('Select failed.png');
    expect(disabledCheckbox?.disabled).toBe(true);

    checkboxMount.app.unmount();
    mountedApps.splice(mountedApps.indexOf(checkboxMount.app), 1);
    document.body.innerHTML = '<div id="app"></div>';
    mountPicker({
      service: makeService({ list: vi.fn().mockResolvedValue(result([image])) }),
      props: { fileTypes: ['image'] },
      realSelectionControls: true,
    });
    click('[data-testid="file-picker-trigger"]');
    await flush();

    const group = document.querySelector<HTMLElement>('.a9-file-picker__items[role="group"]');
    const single = item('image-1').querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(group?.getAttribute('aria-label')).toBe('File results');
    expect(single?.labels).toHaveLength(1);
    expect(single?.labels?.[0]?.textContent?.trim()).toBe('Select dashboard.png');
    single?.click();
    await nextTick();
    expect(single?.checked).toBe(true);
    single?.click();
    await nextTick();
    expect(single?.checked).toBe(false);
  });

  it('preserves real Arco centering with a bounded scrollable body outside the header and footer', async () => {
    vi.stubGlobal('innerWidth', 700);
    vi.stubGlobal('innerHeight', 800);
    mountPicker({
      service: makeService({ list: vi.fn().mockResolvedValue(result([image])) }),
      props: { fileTypes: ['image'] },
      realModal: true,
      realSelectionControls: true,
    });
    click('[data-testid="file-picker-trigger"]');
    await flush();

    const modal = document.querySelector<HTMLElement>('.a9-file-picker-modal');
    const header = modal?.querySelector<HTMLElement>('.arco-modal-header');
    const body = modal?.querySelector<HTMLElement>('.arco-modal-body');
    const workspace = body?.querySelector<HTMLElement>('.a9-file-picker__workspace');
    const footer = modal?.querySelector<HTMLElement>('.arco-modal-footer');
    expect(modal?.style.width).toBe('calc(100vw - 32px)');
    expect(modal?.style.maxWidth).toBe('1040px');
    // Geometry and scroll bounds require real-browser acceptance; happy-dom only checks this contract.
    expect(modal?.parentElement?.classList.contains('arco-modal-wrapper-align-center')).toBe(true);
    expect(modal?.style.top).toBe('');
    expect(modal?.style.display).toBe('inline-flex');
    expect(modal?.style.maxHeight).toBe('calc(100dvh - 32px)');
    expect(modal?.style.flexDirection).toBe('column');
    expect(body?.style.minHeight).toBe('0');
    expect(body?.style.overflow).toBe('auto');
    expect(workspace?.parentElement).toBe(body);
    expect(header?.parentElement).toBe(modal);
    expect(footer?.parentElement).toBe(modal);
  });

  it('commits an explicitly cleared draft once', async () => {
    const service = makeService({ list: vi.fn().mockResolvedValue(result([image])) });
    const { emitted } = mountPicker({ service, props: { modelValue: [image], multiple: true, fileTypes: ['image'] } });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    selectItem('image-1');
    await nextTick();

    const confirmButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Confirm selection'
    );
    confirmButton?.click();
    confirmButton?.click();
    await flush();

    expect(emitted['update:modelValue']).toEqual([[[]]]);
    expect(emitted.change).toEqual([[[]]]);
  });

  it('keeps closed outer clear events independent of prior open and cancel history', async () => {
    const direct = mountPicker({ service: makeService(), props: { modelValue: [image], multiple: true } });
    await flush();
    click('.a9-file-picker__committed button');
    await flush();
    expect(direct.emitted['update:modelValue']).toEqual([[[]]]);
    expect(direct.emitted.change).toEqual([[[]]]);
    expect(direct.emitted.selectionChange).toBeUndefined();

    direct.app.unmount();
    mountedApps.splice(mountedApps.indexOf(direct.app), 1);
    document.body.innerHTML = '<div id="app"></div>';
    const afterCancel = mountPicker({ service: makeService(), props: { modelValue: [image], multiple: true } });
    await flush();
    click('[data-testid="file-picker-trigger"]');
    await flush();
    click('[data-testid="modal-cancel"]');
    click('.a9-file-picker__committed button');
    await flush();
    expect(afterCancel.emitted['update:modelValue']).toEqual([[[]]]);
    expect(afterCancel.emitted.change).toEqual([[[]]]);
    expect(afterCancel.emitted.selectionChange).toBeUndefined();
  });

  it('clears visible draft and committed value once through the exposed command', async () => {
    const { emitted, vm } = mountPicker({ service: makeService(), props: { modelValue: [image], multiple: true } });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    (vm as unknown as { clear: () => void }).clear();
    await flush();

    expect(emitted.selectionChange).toEqual([[[]]]);
    expect(emitted['update:modelValue']).toEqual([[[]]]);
    expect(emitted.change).toEqual([[[]]]);
    expect(document.querySelector('[data-testid="file-picker-modal"]')).not.toBeNull();
  });

  it('keeps remote metadata reconciliation transactional until explicit confirmation', async () => {
    const changedImage = { ...image, name: 'dashboard-renamed.png', size: 4096 };
    const service = makeService({ list: vi.fn().mockResolvedValue(result([changedImage])) });
    const { emitted } = mountPicker({ service, props: { modelValue: image, fileTypes: ['image'] } });

    click('[data-testid="file-picker-trigger"]');
    await flush();
    click('[data-testid="modal-cancel"]');
    await flush();
    expect(emitted['update:modelValue']).toBeUndefined();
    expect(emitted.change).toBeUndefined();

    click('[data-testid="file-picker-trigger"]');
    await flush();
    const confirmButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Confirm selection'
    );
    confirmButton?.click();
    await flush();
    expect(emitted['update:modelValue']).toEqual([[changedImage]]);
    expect(emitted.change).toEqual([[changedImage]]);
  });

  it('displays non-string adapter URLs as unavailable without throwing', async () => {
    const invalid = { ...image, url: 42 as unknown as string };
    const mounted = mountDynamic(
      shallowRef(makeService({ list: async () => result([invalid]) })),
      ref(undefined),
      ref<readonly FileType[]>(['image'])
    );
    click('[data-testid="file-picker-trigger"]');
    await flush();
    expect(mounted.errors).toEqual([]);
    expect(document.querySelector('[data-file-id="image-1"]')?.classList.contains('is-disabled')).toBe(true);
  });

  it('commits the visible constrained value on confirmation without requiring another selection', async () => {
    const { emitted } = mountPicker({
      service: makeService(),
      props: { multiple: true, limit: 1, modelValue: [image, video] },
    });
    await flush();
    expect(emitted['update:modelValue']).toBeUndefined();
    click('[data-testid="file-picker-trigger"]');
    await flush();
    click('.a9-file-picker__footer-actions button:last-child');
    await flush();
    expect(emitted['update:modelValue']).toEqual([[[image]]]);
    expect(emitted.change).toEqual([[[image]]]);
    click('[data-testid="file-picker-trigger"]');
    await flush();
    click('.a9-file-picker__footer-actions button:last-child');
    expect(emitted['update:modelValue']).toHaveLength(1);
  });

  it('clears an externally supplied value that is no longer eligible', async () => {
    const { emitted, vm } = mountPicker({ service: makeService(), props: { fileTypes: ['image'], modelValue: video } });
    await flush();
    expect(emitted['update:modelValue']).toBeUndefined();
    (vm as unknown as { clear(): void }).clear();
    expect(emitted['update:modelValue']).toEqual([[undefined]]);
    expect(emitted.change).toEqual([[undefined]]);
    (vm as unknown as { clear(): void }).clear();
    expect(emitted['update:modelValue']).toHaveLength(1);
  });

  it('normalizes external models for display without writing back or emitting user changes', async () => {
    const service = shallowRef(makeService());
    const model = ref<FileItem | FileItem[] | undefined>([image, { ...image }, implicitReady, video]);
    const fileTypes = ref<readonly FileType[]>(['image', 'document']);
    const { emitted } = mountDynamic(service, model, fileTypes, { multiple: true, limit: 2 });
    await flush();
    expect(emitted['update:modelValue']).toBeUndefined();
    expect(emitted.change).toBeUndefined();
    expect(document.querySelector('[data-testid="file-picker-trigger"]')?.textContent).toContain('(1)');
    model.value = [image, implicitReady, video];
    await flush();
    expect(document.querySelector('[data-testid="file-picker-trigger"]')?.textContent).toContain('(2)');
    expect(emitted['update:modelValue']).toBeUndefined();
    expect(emitted.change).toBeUndefined();
  });

  it('does not repeat draft events for equal external writeback or unchanged refreshes', async () => {
    const service = shallowRef(makeService({ list: vi.fn().mockResolvedValue(result([image])) }));
    const model = ref<FileItem | FileItem[] | undefined>([image]);
    const fileTypes = ref<readonly FileType[]>(['image']);
    const { emitted } = mountDynamic(service, model, fileTypes, { multiple: true });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    const initialEvents = emitted.selectionChange?.length ?? 0;

    model.value = [{ ...image }];
    await flush();
    click('[data-testid="file-picker-refresh"]');
    await flush();
    click('[data-testid="file-picker-refresh"]');
    await flush();

    expect(emitted.selectionChange ?? []).toHaveLength(initialEvents);
  });

  it('prioritizes the service prop, falls back to shared fileService, and fails clearly without browse', async () => {
    const explicit = makeService();
    const plugin = makeService();
    mountPicker({ service: explicit, pluginService: plugin });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    expect(explicit.list).toHaveBeenCalledOnce();
    expect(plugin.list).not.toHaveBeenCalled();

    mountedApps.pop()?.unmount();
    document.body.innerHTML = '<div id="app"></div>';
    mountPicker({ pluginService: plugin });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    expect(plugin.list).toHaveBeenCalledOnce();

    mountedApps.pop()?.unmount();
    document.body.innerHTML = '<div id="app"></div>';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => mountPicker()).toThrow('FileBrowseCapability');
    warn.mockRestore();
  });

  it('revalidates upload capability when service or switches change', async () => {
    const service = shallowRef<FilePickerAdapter>(makeService());
    const model = ref<FileItem | FileItem[] | undefined>();
    const fileTypes = ref<readonly FileType[]>(['image']);
    const { errors } = mountDynamic(service, model, fileTypes, { canUpload: true });
    await flush();

    service.value = { list: vi.fn().mockResolvedValue(result([])) };
    await flush();
    expect(errors.some((error) => String(error).includes('FileUploadCapability'))).toBe(true);
  });

  it('uploads from the aggregate view, passes accept only as a hint and leaves the draft unchanged', async () => {
    const uploaded = deferred<FileItem>();
    const service = makeService({ upload: vi.fn().mockReturnValue(uploaded.promise) });
    const { emitted } = mountPicker({
      service,
      props: { fileTypes: ['image', 'document'], multiple: true, canUpload: true, accept: '.pdf' },
    });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    expect(document.querySelector('[data-testid="file-picker-upload"]')?.getAttribute('data-disabled')).toBe('false');
    click('[data-testid="file-picker-upload"]');
    expect(uploads[0].accept).toBe('.pdf');
    expect(service.upload).toHaveBeenCalledWith(
      expect.objectContaining({ fileTypes: ['image', 'document'], groupId: null, file: expect.any(File) })
    );
    const uploadOptions = (service.upload as ReturnType<typeof vi.fn>).mock.calls[0][0];
    uploadOptions.onProgress(42);
    expect(uploads[0].onProgress).toHaveBeenCalledWith(42);

    const listCallsBeforeUploadCompletes = vi.mocked(service.list).mock.calls.length;
    uploaded.resolve({ ...image, id: 'new-image', name: 'fixture.bin' });
    await flush();
    expect(emitted.uploadSuccess).toEqual([[expect.objectContaining({ id: 'new-image' })]]);
    expect(emitted.selectionChange).toBeUndefined();
    expect(emitted['update:modelValue']).toBeUndefined();
    expect(emitted.change).toBeUndefined();
    expect(service.list).toHaveBeenCalledTimes(listCallsBeforeUploadCompletes + 1);
  });

  it('keeps upload constraints independent of the last browsed type', async () => {
    const service = makeService({
      upload: vi.fn(async () => ({ ...image, id: 'document-upload' })),
    });
    mountPicker({ service, props: { fileTypes: ['image', 'document'], canUpload: true } });
    click('[data-testid="file-picker-trigger"]');
    await flush();

    selectType('document');
    await flush();
    selectType('');
    await flush();
    click('[data-testid="file-picker-upload"]');
    await flush();

    expect(service.upload).toHaveBeenCalledWith(expect.objectContaining({ fileTypes: ['image', 'document'], groupId: null }));
  });

  it('never auto-selects invalid, duplicate or stale upload responses and reports current errors', async () => {
    const firstUpload = deferred<FileItem>();
    const secondUpload = deferred<FileItem>();
    const service = makeService({
      upload: vi.fn().mockReturnValueOnce(firstUpload.promise).mockReturnValueOnce(secondUpload.promise),
    });
    const { emitted } = mountPicker({ service, props: { fileTypes: ['image'], canUpload: true, multiple: true } });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    click('[data-testid="file-picker-upload"]');
    firstUpload.resolve({ ...image });
    await flush();
    expect(emitted.selectionChange).toBeUndefined();

    click('[data-testid="file-picker-upload"]');
    click('[data-testid="modal-cancel"]');
    secondUpload.resolve({ ...image, id: 'late-upload' });
    await flush();
    expect(emitted.uploadSuccess).toHaveLength(1);
    expect(emitted.selectionChange).toBeUndefined();

    click('[data-testid="file-picker-trigger"]');
    await flush();
    const rejecting = Promise.reject(new Error('upload failed'));
    (service.upload as ReturnType<typeof vi.fn>).mockReturnValueOnce(rejecting);
    click('[data-testid="file-picker-upload"]');
    await flush();
    expect(emitted.uploadError?.at(-1)?.[0]).toBeInstanceOf(Error);
  });

  it('does not auto-select wrong-type, pending or empty-url upload responses', async () => {
    const service = makeService({
      upload: vi
        .fn()
        .mockResolvedValueOnce({ ...video, id: 'wrong-type-upload' })
        .mockResolvedValueOnce({ ...image, id: 'pending-upload', status: 'pending' })
        .mockResolvedValueOnce({ ...image, id: 'empty-url-upload', url: null }),
    });
    const { emitted } = mountPicker({ service, props: { fileTypes: ['image'], canUpload: true, multiple: true } });
    click('[data-testid="file-picker-trigger"]');
    await flush();

    click('[data-testid="file-picker-upload"]');
    await flush();
    click('[data-testid="file-picker-upload"]');
    await flush();
    click('[data-testid="file-picker-upload"]');
    await flush();

    expect(emitted.uploadSuccess).toBeUndefined();
    expect(emitted.uploadError).toHaveLength(3);
    expect(emitted.selectionChange).toBeUndefined();
  });

  it('does not overwrite a cross-page selected id or emit when upload is blocked by the limit', async () => {
    const conflictingUpload = deferred<FileItem>();
    const limitedUpload = deferred<FileItem>();
    const service = makeService({
      list: vi.fn().mockResolvedValue(result([{ ...image, id: 'visible-image' }])),
      upload: vi.fn().mockReturnValueOnce(conflictingUpload.promise).mockReturnValueOnce(limitedUpload.promise),
    });
    const { emitted } = mountPicker({
      service,
      props: { modelValue: [image], multiple: true, limit: 1, fileTypes: ['image'], canUpload: true },
    });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    const eventsBeforeUpload = emitted.selectionChange?.length ?? 0;

    click('[data-testid="file-picker-upload"]');
    conflictingUpload.resolve({ ...image, name: 'conflicting-upload.png' });
    await flush();
    expect(emitted.selectionChange ?? []).toHaveLength(eventsBeforeUpload);
    expect(
      document.querySelector('[data-file-id="visible-image"] .a9-file-picker__checkbox')?.getAttribute('data-selected')
    ).toBe('false');

    click('[data-testid="file-picker-upload"]');
    limitedUpload.resolve({ ...image, id: 'new-but-over-limit' });
    await flush();
    expect(emitted.selectionChange ?? []).toHaveLength(eventsBeforeUpload);
  });

  it('retries current list and group failures', async () => {
    const service = makeService({
      list: vi
        .fn()
        .mockRejectedValueOnce(new Error('list failed'))
        .mockResolvedValue(result([image])),
      listGroups: vi.fn().mockRejectedValueOnce(new Error('groups failed')).mockResolvedValue([]),
    });
    mountPicker({ service, props: { fileTypes: ['image'] } });
    click('[data-testid="file-picker-trigger"]');
    await flush();

    expect(document.body.textContent).toContain('Failed to load files');
    expect(document.body.textContent).toContain('Failed to load groups');
    click('[data-testid="file-picker-retry-list"]');
    click('[data-testid="file-picker-retry-groups"]');
    await flush();

    expect(service.list).toHaveBeenCalledTimes(2);
    expect(service.listGroups).toHaveBeenCalledTimes(2);
    expect(item('image-1')).not.toBeNull();
  });

  it('resets the page for search, type and group changes and ignores old list responses', async () => {
    const aggregate = deferred<FileListResult>();
    const service = makeService({
      list: vi.fn().mockImplementation((params: FileListParams) => {
        if (!params.fileType && !params.keyword) return aggregate.promise;
        return Promise.resolve(result(params.fileType === 'video' ? [video] : [image], 1, 1, 3));
      }),
    });
    mountPicker({ service, props: { fileTypes: ['image', 'video'], pageSize: 1 } });
    click('[data-testid="file-picker-trigger"]');
    await nextTick();
    selectType('video');
    await flush();
    expect(item('video-1')).not.toBeNull();

    aggregate.resolve(result([image]));
    await flush();
    expect(document.querySelector('[data-file-id="image-1"]')).toBeNull();

    click('[data-testid="picker-next-page"]');
    const search = document.querySelector<HTMLInputElement>('[data-testid="picker-search"]');
    if (!search) throw new Error('Missing search input');
    search.value = 'launch';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    click('[data-testid="picker-search-submit"]');
    await flush();
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, keyword: 'launch' }));

    document.querySelectorAll<HTMLButtonElement>('.a9-file-picker__group-button')[1].click();
    await flush();
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, groupId: null }));
  });
  it('combines global groups with type filters without refetching groups or losing selections', async () => {
    const documents = { ...implicitReady, groupId: 'design' };
    const service = makeService({
      list: vi.fn(async (params) => {
        const files = [image, documents].filter(
          (file) =>
            (!params.fileType || file.type === params.fileType) &&
            (params.groupId === undefined || file.groupId === params.groupId)
        );
        return result(files);
      }),
    });
    const { emitted } = mountPicker({ service, props: { multiple: true, fileTypes: ['image', 'document'] } });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    click('[data-group-id="design"]');
    await flush();
    expect(service.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ groupId: 'design', fileTypes: ['image', 'document'] })
    );
    item(image.id).click();
    await flush();
    selectType('document');
    await flush();
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ groupId: 'design', fileType: 'document' }));
    expect(service.listGroups).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.a9-file-picker__selected-count')?.textContent).toContain('1 selected');
    item(documents.id).click();
    await flush();
    expect(emitted.selectionChange.at(-1)?.[0]).toEqual([image, documents]);
    document.querySelectorAll<HTMLButtonElement>('.a9-file-picker__group-button')[1].click();
    await flush();
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ groupId: null, fileType: 'document' }));
    expect(document.querySelector('[data-testid="file-picker-pagination"]')).toBeNull();
  });

  it('browses two-level groups independently and uploads into the selected child', async () => {
    const service = makeService({
      listGroups: vi.fn().mockResolvedValue([
        { id: 'child', name: 'Assets', parentId: 'design' },
        { id: 'design', name: 'Design' },
      ]),
    });
    mountPicker({ service, props: { fileTypes: ['image', 'document'], canUpload: true } });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    expect(document.querySelector('[data-group-id="child"]')?.getAttribute('aria-label')).toBe('Design / Assets');
    click('[data-group-id="child"]');
    await flush();
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ groupId: 'child' }));
    const calls = vi.mocked(service.list).mock.calls.length;
    click('.a9-file-picker__group-toggle');
    await flush();
    expect(document.querySelector('[data-group-id="child"]')).toBeNull();
    expect(service.list).toHaveBeenCalledTimes(calls);
    click('.a9-file-picker__group-toggle');
    await flush();
    expect(document.querySelector('[data-group-id="child"]')?.getAttribute('aria-pressed')).toBe('true');
    selectType('document');
    await flush();
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ groupId: 'child', fileType: 'document' }));
    click('[data-testid="file-picker-upload"]');
    await flush();
    expect(service.upload).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'child', fileTypes: ['image', 'document'] })
    );
    click('[data-group-id="design"]');
    await flush();
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ groupId: 'design', fileType: 'document' }));
  });

  it('defaults to expanded groups and toggles the selected parent without refetching', async () => {
    const service = makeService({
      listGroups: vi.fn().mockResolvedValue([
        { id: 'design', name: 'Design' },
        { id: 'child', name: 'Assets', parentId: 'design' },
      ]),
    });
    mountPicker({ service });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    expect(document.querySelector('[data-group-id="child"]')).not.toBeNull();
    click('.a9-file-picker__group-toggle');
    await flush();
    expect(document.querySelector('[data-group-id="child"]')).toBeNull();
    click('[data-group-id="design"]');
    await flush();
    expect(document.querySelector('[data-group-id="child"]')).not.toBeNull();
    click('.a9-file-picker__group-toggle');
    await flush();
    const calls = vi.mocked(service.list).mock.calls.length;
    click('[data-group-id="design"]');
    await flush();
    expect(document.querySelector('[data-group-id="child"]')).not.toBeNull();
    expect(service.list).toHaveBeenCalledTimes(calls);
    click('[data-group-id="design"]');
    await flush();
    expect(document.querySelector('[data-group-id="child"]')).toBeNull();
    expect(document.querySelector('.a9-file-picker__group-toggle')?.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[data-group-id="design"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(service.list).toHaveBeenCalledTimes(calls);
    click('[data-group-id="design"]');
    await flush();
    expect(document.querySelector('[data-group-id="child"]')).not.toBeNull();
    expect(document.querySelector('.a9-file-picker__group-toggle')?.getAttribute('aria-expanded')).toBe('true');
    click('[data-group-id="design"]');
    click('[data-testid="modal-cancel"]');
    await flush();
    click('[data-testid="file-picker-trigger"]');
    await flush();
    expect(document.querySelector('[data-group-id="child"]')).not.toBeNull();
  });

  it('shows full child paths in the narrow group selector', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const service = makeService({
      listGroups: vi.fn().mockResolvedValue([
        { id: 'design', name: 'Design', parentId: null },
        { id: 'child', name: 'Assets', parentId: 'design' },
      ]),
    });
    mountPicker({ service });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    const select = document.querySelector<HTMLSelectElement>('.a9-file-picker__compact-groups select');
    expect(select?.querySelector('[value="group:child"]')?.textContent).toBe('Design / Assets');
    if (!select) throw new Error('Missing group selector');
    select.value = 'group:child';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ groupId: 'child' }));
    vi.unstubAllGlobals();
  });

  it('keeps uploads alive across type/search filters and locks only group navigation', async () => {
    const pending = deferred<FileItem>();
    const service = makeService({ upload: vi.fn(() => pending.promise) });
    const { emitted } = mountPicker({ service, props: { fileTypes: ['image', 'document'], canUpload: true } });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    click('[data-group-id="design"]');
    await flush();
    click('[data-testid="file-picker-upload"]');
    await flush();
    const options = vi.mocked(service.upload).mock.calls[0][0];
    expect(options.groupId).toBe('design');
    expect(document.querySelector<HTMLButtonElement>('.a9-file-picker__group-button')?.disabled).toBe(true);
    selectType('document');
    click('[data-testid="picker-search-submit"]');
    await flush();
    expect(options.signal?.aborted).toBe(false);
    pending.resolve({ ...image, id: 'new-mixed' });
    await flush();
    expect(document.querySelector<HTMLButtonElement>('.a9-file-picker__group-button')?.disabled).toBe(false);
    expect(document.querySelector('.a9-file-picker__upload-result')?.textContent).toContain('Select them, then confirm');
    expect(emitted.selectionChange).toBeUndefined();
    expect(emitted['update:modelValue']).toBeUndefined();
  });

  it('explains the limit and lets a selected card be deselected', async () => {
    const { emitted } = mountPicker({ service: makeService(), props: { multiple: true, limit: 1 } });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    item(image.id).click();
    await flush();
    item(video.id).click();
    await flush();
    expect(emitted.selectionChange).toHaveLength(1);
    expect(document.querySelector('.a9-file-picker__limit-notice')?.textContent).toContain('Select up to 1 files');
    expect(document.querySelector('.a9-file-picker__selected-count')?.textContent).toContain('1 / 1');
    item(image.id).click();
    await flush();
    expect(emitted.selectionChange.at(-1)).toEqual([[]]);
    item(video.id).click();
    await flush();
    click('.a9-file-picker__footer-actions button:last-child');
    await flush();
    expect(document.querySelector('.a9-file-picker__committed')?.textContent).toContain(video.name);
    click('.a9-file-picker__committed button');
    await flush();
    expect(emitted['update:modelValue'].at(-1)).toEqual([[]]);
  });
  it('resets all browse filters before the first reopen query and retains the chosen view', async () => {
    const service = makeService();
    mountPicker({ service, props: { multiple: true } });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    click('[data-group-id="design"]');
    selectType('document');
    await flush();
    const search = document.querySelector<HTMLInputElement>('[data-testid="picker-search"]');
    if (!search) throw new Error('Missing search');
    search.value = 'report';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    click('[data-testid="picker-search-submit"]');
    await flush();
    click('[data-testid="modal-cancel"]');
    await flush();
    vi.mocked(service.list).mockClear();
    click('[data-testid="file-picker-trigger"]');
    await flush();
    expect(service.list).toHaveBeenCalledTimes(1);
    expect(service.list).toHaveBeenCalledWith({ page: 1, pageSize: 2, keyword: undefined, groupId: undefined });
    expect(document.querySelector<HTMLInputElement>('[data-testid="picker-search"]')?.value).toBe('');
  });

  it('only announces attempted over-selection, deduplicates notices and clears its timer', async () => {
    const { emitted } = mountPicker({ service: makeService(), props: { multiple: true, limit: 1 } });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    vi.useFakeTimers();
    selectItem(image.id);
    await nextTick();
    expect(document.querySelector('.a9-file-picker__limit-notice')).toBeNull();
    selectItem(video.id);
    await nextTick();
    expect(document.querySelectorAll('.a9-file-picker__limit-notice')).toHaveLength(1);
    expect(emitted.selectionChange).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2000);
    selectItem(video.id);
    await nextTick();
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.querySelectorAll('.a9-file-picker__limit-notice')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    await nextTick();
    expect(document.querySelector('.a9-file-picker__limit-notice')).toBeNull();
    selectItem(video.id);
    await nextTick();
    selectItem(image.id);
    await nextTick();
    expect(document.querySelector('.a9-file-picker__limit-notice')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disables an empty confirm while allowing a deliberate normalized empty commit', async () => {
    const empty = mountPicker({ service: makeService() });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    const confirm = document.querySelector<HTMLButtonElement>('.a9-file-picker__footer-actions button:last-child');
    expect(confirm?.disabled).toBe(true);
    confirm?.click();
    expect(empty.emitted['update:modelValue']).toBeUndefined();
    empty.app.unmount();
    mountedApps.splice(mountedApps.indexOf(empty.app), 1);
    document.body.innerHTML = '<div id="app"></div>';
    const invalid = mountPicker({ service: makeService(), props: { fileTypes: ['image'], modelValue: video } });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    expect(document.querySelector<HTMLButtonElement>('.a9-file-picker__footer-actions button:last-child')?.disabled).toBe(
      false
    );
    expect(document.querySelector('.a9-file-picker__notice')?.textContent).toContain('clear');
    click('.a9-file-picker__footer-actions button:last-child');
    await flush();
    expect(invalid.emitted['update:modelValue']).toEqual([[undefined]]);
  });

  it('renders only replace and one remove for a single committed file and restores focus', async () => {
    const { emitted } = mountPicker({ service: makeService(), props: { modelValue: image } });
    await flush();
    expect(document.querySelector('[data-testid="file-picker-trigger"]')).toBeNull();
    expect(document.querySelector('[data-testid="file-picker-clear"]')).toBeNull();
    const replace = document.querySelector<HTMLButtonElement>('[data-testid="file-picker-replace"]');
    replace?.focus();
    replace?.click();
    await flush();
    click('[data-testid="modal-cancel"]');
    await flush();
    expect(document.activeElement).toBe(replace);
    click('.a9-file-picker__committed button:last-child');
    await flush();
    expect(emitted['update:modelValue']).toEqual([[undefined]]);
    expect(document.activeElement).toBe(document.querySelector('[data-testid="file-picker-trigger"]'));
  });

  it('shows a textual bulk clear only for multiple committed files', async () => {
    const { emitted } = mountPicker({ service: makeService(), props: { modelValue: [image, implicitReady], multiple: true } });
    await flush();
    expect(document.querySelector('[data-testid="file-picker-clear"]')?.textContent).toBe('Clear selection');
    click('[data-testid="file-picker-clear"]');
    await flush();
    expect(emitted['update:modelValue']).toEqual([[[]]]);
    expect(emitted.clear).toBeUndefined();
    expect(document.querySelector('[data-testid="file-picker-clear"]')).toBeNull();
  });

  it('places upload success outside toolbar and hides single-page pagination and group counts', async () => {
    mountPicker({
      service: makeService({ list: vi.fn().mockResolvedValue(result([image], 1, 24)) }),
      props: { canUpload: true },
    });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    expect(document.querySelector('[data-testid="file-picker-pagination"]')).toBeNull();
    expect(document.querySelector('[data-group-id="design"] small')).toBeNull();
    click('[data-testid="file-picker-upload"]');
    await flush();
    expect(document.querySelector('.a9-file-picker__toolbar .a9-file-picker__upload-result')).toBeNull();
    expect(document.querySelector('.a9-file-picker__feedback .a9-file-picker__upload-result')).not.toBeNull();
  });
  it('shows only a live count without a selected-list entry or focus stop', async () => {
    const { emitted } = mountPicker({ service: makeService(), props: { multiple: true, limit: 4 } });
    click('[data-testid="file-picker-trigger"]');
    await flush();
    const count = document.querySelector<HTMLElement>('.a9-file-picker__selected-count');
    expect(count?.textContent).toBe('Selected 0 / 4');
    expect(count?.getAttribute('role')).toBe('status');
    expect(count?.tabIndex).toBe(-1);
    item(image.id).click();
    await flush();
    expect(count?.textContent).toBe('Selected 1 / 4');
    count?.click();
    await flush();
    expect(document.querySelector('.a9-file-picker__selected')).toBeNull();
    expect(document.querySelector('.a9-file-picker__selection-panel')).toBeNull();
    expect(count?.hasAttribute('aria-expanded')).toBe(false);
    expect(emitted['update:modelValue']).toBeUndefined();
    item(image.id).click();
    await flush();
    expect(count?.textContent).toBe('Selected 0 / 4');
  });
});
