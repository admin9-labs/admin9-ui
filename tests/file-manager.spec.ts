/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, inject, nextTick, provide, shallowRef, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AFileManager from '../src/components/file-manager/index.vue';
import { messages } from '../src/locale';
import Admin9UI from '../src';
import type { FileItem, FileListResult, FileManagerAdapter, FileManagerService, FileType } from '../src/services/types';
import createFakeFileManagerService from '../dev/fake-file-manager-service';

const mountedApps: App[] = [];
const MOVE_GROUP_PREFIX = '__admin9_ui_file_manager_move_group__:';
const moveGroupValue = (groupId: string) => `${MOVE_GROUP_PREFIX}${groupId}`;

const imageFile: FileItem = {
  id: 'image-1',
  name: 'dashboard.png',
  type: 'image',
  groupId: 'image-design',
  url: '/files/dashboard.png',
  thumbnail: '/files/dashboard.png',
  extension: 'png',
  size: 2048,
  status: 'ready',
};
const videoFile: FileItem = {
  id: 'video-1',
  name: 'launch.mp4',
  type: 'video',
  groupId: null,
  url: '/files/launch.mp4',
  extension: 'mp4',
  duration: 15,
  status: 'ready',
};
const failedDocument: FileItem = {
  id: 'document-failed',
  name: 'broken.pdf',
  type: 'document',
  groupId: null,
  url: null,
  extension: 'pdf',
  status: 'failed',
};

function result(list: FileItem[], page = 1, pageSize = 24): FileListResult {
  return {
    list,
    pagination: { page, pageSize, total: list.length, hasMore: false },
    typeCounts: { image: 1, video: 1, document: 1 },
  };
}

function pagedResult(list: FileItem[], page: number, pageSize: number, total: number): FileListResult {
  return {
    list,
    pagination: { page, pageSize, total, hasMore: page * pageSize < total },
    typeCounts: { image: total },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flush() {
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
const SpinStub = defineComponent({
  props: { loading: Boolean },
  setup(props, { attrs, slots }) {
    return () => h('div', { ...attrs, 'data-loading': String(props.loading) }, slots.default?.());
  },
});
const ImageStub = defineComponent({
  props: { src: String, preview: Boolean },
  setup(props) {
    return () => h('img', { 'src': props.src, 'data-preview': String(props.preview) });
  },
});
const InputSearchStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue', 'search', 'clear'],
  setup(props, { emit, attrs }) {
    return () =>
      h('div', attrs, [
        h('input', {
          'data-testid': 'file-search',
          'value': props.modelValue,
          'onInput': (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
        }),
        h('button', { 'data-testid': 'file-search-submit', 'onClick': () => emit('search') }, 'Search'),
        h(
          'button',
          {
            'data-testid': 'file-search-clear',
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
const InputStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue', 'pressEnter'],
  setup(props, { emit, attrs }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      });
  },
});
const SelectStub = defineComponent({
  props: { modelValue: { type: [String, Number, Boolean, Object], default: undefined }, disabled: Boolean },
  emits: ['update:modelValue', 'change'],
  setup(props, { emit, attrs, slots }) {
    return () =>
      h(
        'select',
        {
          ...attrs,
          disabled: props.disabled,
          value: props.modelValue === undefined ? '' : String(props.modelValue),
          onChange: (event: Event) => {
            const { value } = event.target as HTMLSelectElement;
            emit('update:modelValue', value);
            emit('change', value);
          },
        },
        [h('option', { value: '' }, ''), slots.default?.()]
      );
  },
});
const OptionStub = defineComponent({
  props: { value: { type: [String, Number, Boolean, Object], required: true } },
  setup(props, { slots }) {
    return () => h('option', { value: String(props.value) }, slots.default?.());
  },
});
const uploadRequests: Array<{
  onProgress: ReturnType<typeof vi.fn>;
  onSuccess: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
}> = [];
const CheckboxStub = defineComponent({
  props: { modelValue: Boolean, disabled: Boolean },
  emits: ['change'],
  setup(props, { emit, attrs }) {
    return () =>
      h('button', {
        ...attrs,
        'type': 'button',
        'disabled': props.disabled,
        'data-selected': String(props.modelValue),
        'onClick': () => emit('change', !props.modelValue),
      });
  },
});
const UploadStub = defineComponent({
  props: { accept: String, disabled: Boolean },
  setup(props, { attrs, slots }) {
    const upload = () => {
      if (props.disabled) return;
      const request = attrs.customRequest ?? attrs['custom-request'];
      if (typeof request !== 'function') return;
      const callbacks = {
        onProgress: vi.fn(),
        onSuccess: vi.fn(),
        onError: vi.fn(),
      };
      uploadRequests.push(callbacks);
      request({
        fileItem: { file: new File(['file'], 'fixture.bin') },
        ...callbacks,
      });
    };
    return () =>
      h(
        'div',
        {
          'data-testid': 'file-upload',
          'data-accept': props.accept,
          'data-disabled': String(props.disabled),
          'onClick': upload,
        },
        slots['upload-button']?.()
      );
  },
});
const PaginationStub = defineComponent({
  props: { current: Number, pageSize: Number, total: Number },
  emits: ['change'],
  setup(props, { emit, attrs }) {
    return () =>
      h('div', { ...attrs, 'data-current': String(props.current), 'data-total': String(props.total) }, [
        h('button', { 'data-testid': 'next-page', 'onClick': () => emit('change', (props.current ?? 1) + 1) }, 'Next'),
      ]);
  },
});
const PopconfirmStub = defineComponent({
  emits: ['ok'],
  setup(_, { emit, slots }) {
    return () =>
      h('span', { 'data-testid': 'popconfirm' }, [
        slots.default?.(),
        h('button', { 'data-testid': 'confirm-action', 'onClick': () => emit('ok') }, 'Confirm'),
      ]);
  },
});
const ModalStub = defineComponent({
  props: { visible: Boolean, onBeforeOk: Function },
  emits: ['update:visible'],
  setup(props, { attrs, emit, slots }) {
    const confirm = async () => {
      if (typeof props.onBeforeOk !== 'function') return;
      const shouldClose = await props.onBeforeOk();
      if (shouldClose !== false) emit('update:visible', false);
    };
    return () =>
      props.visible
        ? h('div', { ...attrs, 'data-testid': 'file-group-modal' }, [
            slots.default?.(),
            h('button', { 'data-testid': 'file-group-modal-ok', 'onClick': confirm }, 'OK'),
          ])
        : null;
  },
});
const radioGroupKey = Symbol('file-manager-radio-group');
const RadioGroupStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup(_, { attrs, emit, slots }) {
    provide(radioGroupKey, (value: string) => emit('update:modelValue', value));
    return () => h('div', attrs, slots.default?.());
  },
});
const RadioStub = defineComponent({
  props: { value: { type: String, required: true } },
  setup(props, { attrs, slots }) {
    const update = inject<(value: string) => void>(radioGroupKey);
    return () => h('button', { ...attrs, onClick: () => update?.(props.value) }, slots.default?.());
  },
});

function installStubs(app: App) {
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  app.component('AButton', ButtonStub);
  app.component('ATooltip', Transparent);
  app.component('ASpin', SpinStub);
  app.component('AProgress', Transparent);
  app.component('AAlert', Transparent);
  app.component('AEmpty', Transparent);
  app.component('AImage', ImageStub);
  app.component('AInputSearch', InputSearchStub);
  app.component('AInput', InputStub);
  app.component('ASelect', SelectStub);
  app.component('AOption', OptionStub);
  app.component('ACheckbox', CheckboxStub);
  app.component('AUpload', UploadStub);
  app.component('APagination', PaginationStub);
  app.component('APopconfirm', PopconfirmStub);
  app.component('AModal', ModalStub);
  app.component('ARadioGroup', RadioGroupStub);
  app.component('ARadio', RadioStub);
  app.component('ADropdown', Transparent);
  app.component('ADoption', Transparent);
  [
    'IconApps',
    'IconArchive',
    'IconClose',
    'IconDelete',
    'IconDriveFile',
    'IconFile',
    'IconFileAudio',
    'IconFileImage',
    'IconFilePdf',
    'IconFileVideo',
    'IconEdit',
    'IconLaunch',
    'IconList',
    'IconMore',
    'IconPlus',
    'IconRefresh',
    'IconStop',
    'IconUpload',
  ].forEach((name) => app.component(name, Transparent));
}

function mountManager(service: FileManagerAdapter, props: Record<string, unknown> = {}) {
  const app = createApp(AFileManager, { service, ...props });
  installStubs(app);
  app.mount('#app');
  mountedApps.push(app);
  return app;
}

function mountInjectedManager(service: FileManagerAdapter) {
  const Root = defineComponent({
    setup() {
      return () => h(AFileManager);
    },
  });
  const app = createApp(Root);
  installStubs(app);
  app.use(Admin9UI, { fileService: service });
  app.mount('#app');
  mountedApps.push(app);
}

function mountDynamicService(initialService: FileManagerAdapter, props: Record<string, unknown> = {}) {
  const service = shallowRef(initialService);
  const errors: unknown[] = [];
  const Host = defineComponent({
    setup() {
      return () => h(AFileManager, { service: service.value, ...props });
    },
  });
  const app = createApp(Host);
  app.config.errorHandler = (error) => errors.push(error);
  installStubs(app);
  app.mount('#app');
  mountedApps.push(app);
  return { service, errors };
}

function makeService(overrides: Partial<FileManagerService> = {}): FileManagerService {
  return {
    list: vi.fn().mockResolvedValue(result([imageFile, videoFile, failedDocument])),
    listGroups: vi.fn().mockResolvedValue([{ id: 'image-design', name: 'Design', count: 1 }]),
    upload: vi.fn().mockResolvedValue(imageFile),
    remove: vi.fn().mockImplementation((ids: string[]) => Promise.resolve(ids)),
    createGroup: vi.fn().mockResolvedValue({ id: 'created', name: 'Created' }),
    renameGroup: vi.fn().mockResolvedValue({ id: 'image-design', name: 'Renamed' }),
    removeGroup: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockImplementation(({ ids }) => Promise.resolve(ids)),
    ...overrides,
  };
}

function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  element.click();
}

function changeSelect(selector: string, value: string) {
  const select = document.querySelector<HTMLSelectElement>(selector);
  if (!select) throw new Error(`Missing select: ${selector}`);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function confirmFor(selector: string) {
  const target = document.querySelector(selector);
  if (!target) throw new Error(`Missing confirmation target: ${selector}`);
  target.closest('[data-testid="popconfirm"]')?.querySelector<HTMLButtonElement>('[data-testid="confirm-action"]')?.click();
}

describe('AFileManager', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    uploadRequests.length = 0;
  });

  afterEach(() => {
    mountedApps.splice(0).forEach((app) => app.unmount());
  });

  it('mounts with a list-only adapter in default read-only mode', async () => {
    const service: FileManagerAdapter = { list: vi.fn().mockResolvedValue(result([imageFile])) };

    mountManager(service);
    await flush();

    expect(service.list).toHaveBeenCalledWith({ page: 1, pageSize: 24, keyword: undefined });
    expect(document.querySelector('[data-file-id="image-1"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="file-upload"]')).toBeNull();
    expect(document.querySelector('.a9-file-manager__checkbox')).toBeNull();
    expect(document.querySelector('.a9-file-manager__item-actions')).toBeNull();
  });

  it('mounts in default read-only mode from the shared plugin fileService', async () => {
    const service: FileManagerAdapter = { list: vi.fn().mockResolvedValue(result([imageFile])) };

    mountInjectedManager(service);
    await flush();

    expect(service.list).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-file-id="image-1"]')).not.toBeNull();
  });

  it.each([
    ['upload', 'canUpload', 'FileUploadCapability'],
    ['remove', 'canDelete', 'FileRemoveCapability'],
    ['move', 'canMove', 'FileMoveCapability'],
  ] as const)('requires %s only when %s is explicitly enabled', (method, flag, capability) => {
    const service = { ...makeService(), [method]: undefined } as unknown as FileManagerAdapter;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => mountManager(service, { [flag]: true })).toThrow(capability);
    warn.mockRestore();
  });

  it.each(['listGroups', 'createGroup', 'renameGroup', 'removeGroup'] as const)(
    'requires the complete group capability when management is enabled and %s is missing',
    (method) => {
      const service = { ...makeService(), [method]: undefined } as unknown as FileManagerAdapter;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      expect(() => mountManager(service, { canManageGroups: true })).toThrow('FileGroupCapability');
      warn.mockRestore();
    }
  );

  it('revalidates explicit capabilities when the service changes at runtime', async () => {
    const manager = mountDynamicService(makeService(), { canUpload: true });
    await flush();

    manager.service.value = { list: vi.fn().mockResolvedValue(result([])) };
    await flush();

    expect(manager.errors.some((error) => String(error).includes('FileUploadCapability'))).toBe(true);
  });

  it('keeps all as an aggregate list filter, allows upload and disables move until a concrete type is selected', async () => {
    const service = makeService();
    mountManager(service, { canUpload: true, canMove: true, canDelete: true });
    await flush();

    expect(service.list).toHaveBeenLastCalledWith({ page: 1, pageSize: 24, keyword: undefined });
    expect((service.list as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toHaveProperty('fileTypes');
    expect((service.list as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toHaveProperty('groupId');
    expect(service.listGroups).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="file-upload"]')?.getAttribute('data-disabled')).toBe('false');
    expect(document.querySelector<HTMLSelectElement>('[data-file-id="image-1"] select')?.disabled).toBe(true);
    click('[data-testid="file-upload"]');
    await flush();
    expect(service.upload).toHaveBeenCalledWith(expect.objectContaining({ fileType: 'image', groupId: null }));
    expect(service.move).not.toHaveBeenCalled();

    click('[data-file-type="image"]');
    await flush();

    expect(service.list).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 24,
      keyword: undefined,
      fileType: 'image',
      groupId: undefined,
    });
    expect(service.listGroups).toHaveBeenLastCalledWith('image');
    expect(document.querySelector('[data-testid="file-upload"]')?.getAttribute('data-disabled')).toBe('false');
  });

  it('clears scoped state on every type change and ignores older aggregate responses', async () => {
    const aggregate = deferred<FileListResult>();
    const service = makeService({
      list: vi.fn().mockImplementation((params) => {
        if (!params.fileType) return aggregate.promise;
        if (params.fileType === 'image') return Promise.resolve(result([imageFile]));
        return Promise.resolve(result([videoFile]));
      }),
      listGroups: vi
        .fn()
        .mockImplementation((fileType: FileType) =>
          Promise.resolve([{ id: `${fileType}-group`, name: `${fileType} group`, count: 1 }])
        ),
    });
    mountManager(service, { canMove: true, canDelete: true });

    click('[data-file-type="image"]');
    await flush();
    click('[data-file-id="image-1"] .a9-file-manager__checkbox');
    await flush();
    expect(document.body.textContent).toContain('1 selected');
    changeSelect('[data-file-id="image-1"] select', moveGroupValue('image-group'));

    click('[data-file-type="video"]');
    await flush();
    expect(document.body.textContent).toContain('0 selected');
    expect(document.querySelector('[data-file-id="video-1"]')).not.toBeNull();
    expect(document.querySelector('[data-file-id="image-1"]')).toBeNull();

    aggregate.resolve(result([failedDocument]));
    await flush();

    expect(document.querySelector('[data-file-id="video-1"]')).not.toBeNull();
    expect(document.querySelector('[data-file-id="document-failed"]')).toBeNull();
    expect(service.listGroups).toHaveBeenNthCalledWith(1, 'image');
    expect(service.listGroups).toHaveBeenNthCalledWith(2, 'video');
  });

  it('clears stale files and type counts immediately when the service changes', async () => {
    const replacement = deferred<FileListResult>();
    const manager = mountDynamicService(makeService());
    await flush();
    expect(document.querySelector('[data-file-id="image-1"]')).not.toBeNull();
    expect(document.body.textContent).toContain('1');

    manager.service.value = { list: vi.fn().mockReturnValue(replacement.promise) };
    await nextTick();

    expect(document.querySelector('[data-file-id="image-1"]')).toBeNull();
    expect(document.querySelector('[data-file-type="image"] .a9-file-manager__type-count')).toBeNull();

    replacement.resolve(result([]));
    await flush();
  });

  it('closes a pending group editor when the file type changes and cannot submit the old group', async () => {
    const service = makeService();
    mountManager(service, { initialFileType: 'image', canManageGroups: true });
    await flush();

    const designGroup = Array.from(document.querySelectorAll<HTMLButtonElement>('.a9-file-manager__group-button')).find(
      (button) => button.textContent?.includes('Design')
    );
    if (!designGroup) throw new Error('Missing Design group button');
    designGroup.click();
    await nextTick();
    const renameButtons = document.querySelectorAll<HTMLButtonElement>('button[aria-label="Rename group"]');
    renameButtons[renameButtons.length - 1]?.click();
    await nextTick();
    expect(document.querySelector('[data-testid="file-group-modal"]')).not.toBeNull();

    click('[data-file-type="video"]');
    await nextTick();

    expect(document.querySelector('[data-testid="file-group-modal"]')).toBeNull();
    expect(service.renameGroup).not.toHaveBeenCalled();
  });

  it('exposes the active desktop group with aria-pressed for every group variant', async () => {
    const service = makeService();
    mountManager(service, { initialFileType: 'image' });
    await flush();

    const groupButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.a9-file-manager__group-button'));
    expect(
      groupButtons()
        .find((button) => button.textContent?.includes('All groups'))
        ?.getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      groupButtons()
        .find((button) => button.textContent?.includes('Ungrouped'))
        ?.getAttribute('aria-pressed')
    ).toBe('false');
    const design = groupButtons().find((button) => button.textContent?.includes('Design'));
    expect(design?.getAttribute('aria-pressed')).toBe('false');

    design?.click();
    await flush();
    expect(
      groupButtons()
        .find((button) => button.textContent?.includes('All groups'))
        ?.getAttribute('aria-pressed')
    ).toBe('false');
    expect(
      groupButtons()
        .find((button) => button.textContent?.includes('Design'))
        ?.getAttribute('aria-pressed')
    ).toBe('true');

    groupButtons()
      .find((button) => button.textContent?.includes('Ungrouped'))
      ?.click();
    await flush();
    expect(
      groupButtons()
        .find((button) => button.textContent?.includes('Ungrouped'))
        ?.getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('releases group mutation loading on type change and ignores the old completion', async () => {
    const creating = deferred<{ id: string; name: string }>();
    const service = makeService({ createGroup: vi.fn().mockReturnValue(creating.promise) });
    mountManager(service, { initialFileType: 'image', canManageGroups: true });
    await flush();

    const createButtons = document.querySelectorAll<HTMLButtonElement>('button[aria-label="Create group"]');
    createButtons[createButtons.length - 1]?.click();
    await nextTick();
    const input = document.querySelector<HTMLInputElement>('[data-testid="file-group-modal"] input');
    if (!input) throw new Error('Missing group input');
    input.value = 'Old image group';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    click('[data-testid="file-group-modal-ok"]');
    await nextTick();
    expect(service.createGroup).toHaveBeenCalledWith({ fileType: 'image', name: 'Old image group' });

    click('[data-file-type="video"]');
    await flush();
    const nextCreateButtons = document.querySelectorAll<HTMLButtonElement>('button[aria-label="Create group"]');
    expect(nextCreateButtons[nextCreateButtons.length - 1]?.disabled).toBe(false);
    const listCallsBeforeCompletion = (service.list as ReturnType<typeof vi.fn>).mock.calls.length;

    creating.resolve({ id: 'old-created', name: 'Old image group' });
    await flush();

    expect((service.list as ReturnType<typeof vi.fn>).mock.calls.length).toBe(listCallsBeforeCompletion);
    expect(service.listGroups).toHaveBeenLastCalledWith('video');
  });

  it('rejects wrong-type records from typed selection while retaining row deletion', async () => {
    const service = makeService();
    mountManager(service, { initialFileType: 'image', canDelete: true, canMove: true });
    await flush();

    expect(document.querySelector<HTMLButtonElement>('[data-file-id="video-1"] .a9-file-manager__checkbox')?.disabled).toBe(
      true
    );
    expect(
      document.querySelector('[data-file-id="video-1"] .a9-file-manager__item-actions button[status="danger"]')
    ).not.toBeNull();
  });

  it('does not enable image preview for pending or failed records with a URL', async () => {
    const pendingImage: FileItem = { ...imageFile, id: 'image-pending', status: 'pending' };
    const service = makeService({ list: vi.fn().mockResolvedValue(result([pendingImage])) });
    mountManager(service, { initialFileType: 'image' });
    await flush();

    expect(document.querySelector('[data-file-id="image-pending"] img')?.getAttribute('data-preview')).toBe('false');
  });

  it('shows compact group retry and management actions for the responsive layout', async () => {
    const service = makeService({ listGroups: vi.fn().mockRejectedValueOnce(new Error('groups unavailable')) });
    mountManager(service, { initialFileType: 'image', canManageGroups: true });
    await flush();

    expect(document.querySelector('.a9-file-manager__compact-group-error')).not.toBeNull();
    expect(document.querySelector('.a9-file-manager__compact-group-error')?.textContent).toContain('Retry');
    expect(document.querySelector('.a9-file-manager__compact-group-controls button[aria-label="Create group"]')).not.toBeNull();
  });

  it('allows mixed-type deletion, keeps partial failures selected, and never moves unavailable records', async () => {
    const service = makeService({ remove: vi.fn().mockResolvedValue(['image-1']) });
    mountManager(service, { canDelete: true, canMove: true });
    await flush();

    click('[data-file-id="image-1"] .a9-file-manager__checkbox');
    click('[data-file-id="video-1"] .a9-file-manager__checkbox');
    click('[data-file-id="document-failed"] .a9-file-manager__checkbox');
    await flush();
    expect(document.body.textContent).toContain('3 selected');
    expect(document.querySelector<HTMLSelectElement>('[data-file-id="document-failed"] select')?.disabled).toBe(true);

    confirmFor('.a9-file-manager__batch-actions button[status="danger"]');
    await flush();

    expect(service.remove).toHaveBeenCalledWith(['image-1', 'video-1', 'document-failed']);
    expect(document.body.textContent).toContain('2 selected');
    expect(service.move).not.toHaveBeenCalled();
  });

  it('submits and clears search from page one with the concrete type and active group', async () => {
    const service = makeService({
      list: vi.fn().mockImplementation(({ page }) => Promise.resolve(pagedResult([imageFile], page, 1, 3))),
    });
    mountManager(service, { initialFileType: 'image', pageSize: 1 });
    await flush();

    const designGroup = Array.from(document.querySelectorAll<HTMLButtonElement>('.a9-file-manager__group-button')).find(
      (button) => button.textContent?.includes('Design')
    );
    designGroup?.click();
    click('[data-testid="next-page"]');
    await flush();

    const search = document.querySelector<HTMLInputElement>('[data-testid="file-search"]');
    if (!search) throw new Error('Missing file search input');
    search.value = 'dashboard';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    click('[data-testid="file-search-submit"]');
    await flush();
    expect(service.list).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 1,
      keyword: 'dashboard',
      fileType: 'image',
      groupId: 'image-design',
    });

    click('[data-testid="file-search-clear"]');
    await flush();
    expect(service.list).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 1,
      keyword: undefined,
      fileType: 'image',
      groupId: 'image-design',
    });
  });

  it('passes pagination to the adapter and falls back when a mutation empties the last page', async () => {
    const pageTwoFile = { ...imageFile, id: 'image-2', name: 'page-two.png' };
    let removed = false;
    const service = makeService({
      list: vi.fn().mockImplementation(({ page }) => {
        if (removed) return Promise.resolve(pagedResult(page === 1 ? [imageFile] : [], page, 1, 1));
        return Promise.resolve(pagedResult(page === 1 ? [imageFile] : [pageTwoFile], page, 1, 2));
      }),
      remove: vi.fn().mockImplementation(async (ids: string[]) => {
        removed = true;
        return ids;
      }),
    });
    mountManager(service, { initialFileType: 'image', pageSize: 1, canDelete: true });
    await flush();

    click('[data-testid="next-page"]');
    await flush();
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 1 }));
    confirmFor('[data-testid="file-delete-image-2"]');
    await flush();

    expect(service.remove).toHaveBeenCalledWith(['image-2']);
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 1 }));
    expect(document.querySelector('[data-testid="file-pagination"]')?.getAttribute('data-current')).toBe('1');
    expect(document.querySelector('[data-file-id="image-1"]')).not.toBeNull();
  });

  it('preserves cross-page selection and sends every selected id to batch move', async () => {
    const pageTwoFile = { ...imageFile, id: 'image-2', name: 'page-two.png' };
    const service = makeService({
      list: vi
        .fn()
        .mockImplementation(({ page }) => Promise.resolve(pagedResult([page === 1 ? imageFile : pageTwoFile], page, 1, 2))),
    });
    mountManager(service, { initialFileType: 'image', pageSize: 1, canMove: true });
    await flush();

    click('[data-file-id="image-1"] .a9-file-manager__checkbox');
    click('[data-testid="next-page"]');
    await flush();
    click('[data-file-id="image-2"] .a9-file-manager__checkbox');
    await flush();
    expect(document.body.textContent).toContain('2 selected');

    changeSelect('[data-testid="file-batch-move-target"]', moveGroupValue('image-design'));
    await nextTick();
    click('[data-testid="file-batch-move"]');
    await flush();
    expect(service.move).toHaveBeenCalledWith({
      fileType: 'image',
      ids: ['image-1', 'image-2'],
      groupId: 'image-design',
    });
  });

  it('preserves cross-page selection and sends every selected id to batch delete', async () => {
    const pageTwoFile = { ...imageFile, id: 'image-2', name: 'page-two.png' };
    const service = makeService({
      list: vi
        .fn()
        .mockImplementation(({ page }) => Promise.resolve(pagedResult([page === 1 ? imageFile : pageTwoFile], page, 1, 2))),
    });
    mountManager(service, { initialFileType: 'image', pageSize: 1, canDelete: true });
    await flush();

    click('[data-file-id="image-1"] .a9-file-manager__checkbox');
    click('[data-testid="next-page"]');
    await flush();
    click('[data-file-id="image-2"] .a9-file-manager__checkbox');
    confirmFor('[data-testid="file-batch-delete"]');
    await flush();

    expect(service.remove).toHaveBeenCalledWith(['image-1', 'image-2']);
  });

  it('handles single-item move success, partial success, and failure without losing retry state', async () => {
    const onMoveSuccess = vi.fn();
    const service = makeService({
      move: vi
        .fn()
        .mockResolvedValueOnce(['image-1'])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('move failed')),
    });
    mountManager(service, { initialFileType: 'image', canMove: true, onMoveSuccess });
    await flush();

    const moveOnce = async () => {
      changeSelect('[data-testid="file-move-target-image-1"]', moveGroupValue('image-design'));
      confirmFor('[data-testid="file-move-image-1"]');
      await flush();
    };
    await moveOnce();
    await moveOnce();
    await moveOnce();

    expect(service.move).toHaveBeenCalledTimes(3);
    expect(service.move).toHaveBeenLastCalledWith({ fileType: 'image', ids: ['image-1'], groupId: 'image-design' });
    expect(onMoveSuccess).toHaveBeenNthCalledWith(1, ['image-1'], 'image-design');
    expect(onMoveSuccess).toHaveBeenNthCalledWith(2, [], 'image-design');
    expect(onMoveSuccess).toHaveBeenCalledTimes(2);
    expect(document.querySelector<HTMLSelectElement>('[data-testid="file-move-target-image-1"]')?.disabled).toBe(false);
  });

  it('retains only partial and failed batch move ids for retry', async () => {
    const secondImage = { ...imageFile, id: 'image-2', name: 'second.png' };
    const service = makeService({
      list: vi.fn().mockResolvedValue(pagedResult([imageFile, secondImage], 1, 24, 2)),
      move: vi.fn().mockResolvedValueOnce(['image-1']).mockRejectedValueOnce(new Error('move failed')),
    });
    mountManager(service, { initialFileType: 'image', canMove: true });
    await flush();

    click('[data-file-id="image-1"] .a9-file-manager__checkbox');
    click('[data-file-id="image-2"] .a9-file-manager__checkbox');
    changeSelect('[data-testid="file-batch-move-target"]', moveGroupValue('image-design'));
    await nextTick();
    click('[data-testid="file-batch-move"]');
    await flush();
    expect(document.body.textContent).toContain('1 selected');

    click('[data-file-id="image-1"] .a9-file-manager__checkbox');
    changeSelect('[data-testid="file-batch-move-target"]', moveGroupValue('image-design'));
    await nextTick();
    click('[data-testid="file-batch-move"]');
    await flush();
    expect(service.move).toHaveBeenNthCalledWith(2, {
      fileType: 'image',
      ids: ['image-2', 'image-1'],
      groupId: 'image-design',
    });
    expect(document.body.textContent).toContain('2 selected');
  });

  it('uploads with type, group, progress and events, then recovers after an error', async () => {
    const onUploadSuccess = vi.fn();
    const onUploadError = vi.fn();
    const uploadError = new Error('upload failed');
    const service = makeService({
      upload: vi
        .fn()
        .mockImplementationOnce(async (options) => {
          options.onProgress?.(42);
          return imageFile;
        })
        .mockRejectedValueOnce(uploadError),
    });
    mountManager(service, { initialFileType: 'image', canUpload: true, onUploadSuccess, onUploadError });
    await flush();

    const designGroup = Array.from(document.querySelectorAll<HTMLButtonElement>('.a9-file-manager__group-button')).find(
      (button) => button.textContent?.includes('Design')
    );
    designGroup?.click();
    await flush();
    click('[data-testid="file-upload"]');
    await flush();

    expect(service.upload).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ file: expect.any(File), fileType: 'image', groupId: 'image-design' })
    );
    expect(uploadRequests[0]?.onProgress).toHaveBeenCalledWith(42);
    expect(uploadRequests[0]?.onSuccess).toHaveBeenCalledWith(imageFile);
    expect(onUploadSuccess).toHaveBeenCalledWith(imageFile);

    click('[data-testid="file-upload"]');
    await flush();
    expect(uploadRequests[1]?.onError).toHaveBeenCalledWith(uploadError);
    expect(onUploadError).toHaveBeenCalledWith(uploadError);
    expect(document.querySelector('[data-testid="file-upload"]')?.getAttribute('data-disabled')).toBe('false');
  });

  it('leaves native file formats unrestricted by default and forwards an explicit accept hint', async () => {
    const service = makeService();
    mountManager(service, { canUpload: true });
    await flush();

    expect(document.querySelector('[data-testid="file-upload"]')?.getAttribute('data-accept')).toBeNull();
    expect(document.querySelector('[data-testid="file-upload"]')?.getAttribute('data-disabled')).toBe('false');
    click('[data-testid="file-upload"]');
    await flush();
    expect(service.upload).toHaveBeenCalledWith(expect.objectContaining({ fileType: 'image', groupId: null }));

    mountedApps.pop()?.unmount();
    document.body.innerHTML = '<div id="app"></div>';
    mountManager(service, { initialFileType: 'image', canUpload: true, accept: '.doc,.pdf' });
    await flush();

    expect(document.querySelector('[data-testid="file-upload"]')?.getAttribute('data-accept')).toBe('.doc,.pdf');
  });

  it('keeps the most recently selected concrete type as the aggregate upload target', async () => {
    const service = makeService({
      upload: vi.fn(async (options) => ({ ...imageFile, id: 'document-upload', type: options.fileType })),
    });
    mountManager(service, { canUpload: true });
    await flush();

    click('[data-file-type="document"]');
    await flush();
    click('[data-file-type="all"]');
    await flush();
    click('[data-testid="file-upload"]');
    await flush();

    expect(service.upload).toHaveBeenCalledWith(expect.objectContaining({ fileType: 'document', groupId: null }));
  });

  it('suppresses a stale upload event and refresh after switching to another file type', async () => {
    const pendingUpload = deferred<FileItem>();
    const onUploadSuccess = vi.fn();
    const service = makeService({ upload: vi.fn().mockReturnValue(pendingUpload.promise) });
    mountManager(service, { initialFileType: 'image', canUpload: true, onUploadSuccess });
    await flush();

    click('[data-testid="file-upload"]');
    await nextTick();
    click('[data-file-type="video"]');
    await flush();
    const listCallsAfterSwitch = vi.mocked(service.list).mock.calls.length;
    const groupCallsAfterSwitch = vi.mocked(service.listGroups).mock.calls.length;

    pendingUpload.resolve(imageFile);
    await flush();
    expect(onUploadSuccess).not.toHaveBeenCalled();
    expect(service.list).toHaveBeenCalledTimes(listCallsAfterSwitch);
    expect(service.listGroups).toHaveBeenCalledTimes(groupCallsAfterSwitch);
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ fileType: 'video' }));
  });

  it('creates with retry, renames, and deletes the active group with refreshed scope', async () => {
    const service = makeService({
      createGroup: vi
        .fn()
        .mockRejectedValueOnce(new Error('create failed'))
        .mockResolvedValueOnce({ id: 'created', name: 'Created' }),
    });
    mountManager(service, { initialFileType: 'image', canDelete: true, canManageGroups: true });
    await flush();

    const createButtons = document.querySelectorAll<HTMLButtonElement>('button[aria-label="Create group"]');
    createButtons[createButtons.length - 1]?.click();
    await nextTick();
    const input = document.querySelector<HTMLInputElement>('[data-testid="file-group-modal"] input');
    if (!input) throw new Error('Missing group input');
    input.value = 'Created';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    click('[data-testid="file-group-modal-ok"]');
    await flush();
    expect(document.querySelector('[data-testid="file-group-modal"]')).not.toBeNull();
    click('[data-testid="file-group-modal-ok"]');
    await flush();
    expect(service.createGroup).toHaveBeenCalledTimes(2);
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ fileType: 'image', groupId: 'created' }));

    const designGroup = Array.from(document.querySelectorAll<HTMLButtonElement>('.a9-file-manager__group-button')).find(
      (button) => button.textContent?.includes('Design')
    );
    designGroup?.click();
    await flush();
    const renameButtons = document.querySelectorAll<HTMLButtonElement>('button[aria-label="Rename group"]');
    renameButtons[renameButtons.length - 1]?.click();
    await nextTick();
    const renameInput = document.querySelector<HTMLInputElement>('[data-testid="file-group-modal"] input');
    if (!renameInput) throw new Error('Missing rename input');
    renameInput.value = 'Design system';
    renameInput.dispatchEvent(new Event('input', { bubbles: true }));
    click('[data-testid="file-group-modal-ok"]');
    await flush();
    expect(service.renameGroup).toHaveBeenCalledWith({
      fileType: 'image',
      groupId: 'image-design',
      name: 'Design system',
    });

    click('[data-file-id="image-1"] .a9-file-manager__checkbox');
    const deleteGroupButtons = document.querySelectorAll<HTMLButtonElement>('button[aria-label="Delete group"]');
    deleteGroupButtons[deleteGroupButtons.length - 1]
      ?.closest('[data-testid="popconfirm"]')
      ?.querySelector<HTMLButtonElement>('[data-testid="confirm-action"]')
      ?.click();
    await flush();
    expect(service.removeGroup).toHaveBeenCalledWith({ fileType: 'image', groupId: 'image-design' });
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ fileType: 'image', groupId: undefined }));
    expect(document.body.textContent).toContain('0 selected');
  });

  it('retries a failed list request and switches between grid and list views', async () => {
    const service = makeService({
      list: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(result([imageFile])),
    });
    mountManager(service);
    await flush();

    expect(document.querySelector('.a9-file-manager__list-error')).not.toBeNull();
    click('[data-testid="file-retry-list"]');
    await flush();
    expect(service.list).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-file-id="image-1"]')).not.toBeNull();

    click('[data-testid="file-list-view"]');
    await nextTick();
    expect(document.querySelector('.a9-file-manager')?.classList.contains('is-list-view')).toBe(true);
    expect(document.querySelector('.a9-file-manager__items')?.getAttribute('data-view')).toBe('list');
    click('[data-testid="file-grid-view"]');
    await nextTick();
    expect(document.querySelector('.a9-file-manager')?.classList.contains('is-grid-view')).toBe(true);
  });

  it('disables duplicate and empty ids so invalid adapter records cannot share actions', async () => {
    const duplicate = { ...imageFile, name: 'duplicate.png' };
    const emptyId = { ...imageFile, id: '', name: 'empty-id.png' };
    const service = makeService({ list: vi.fn().mockResolvedValue(result([imageFile, duplicate, emptyId])) });
    mountManager(service, { initialFileType: 'image', canDelete: true, canMove: true });
    await flush();

    const duplicateRows = document.querySelectorAll('[data-file-id="image-1"]');
    expect(duplicateRows).toHaveLength(2);
    duplicateRows.forEach((row) => {
      expect(row.querySelector<HTMLButtonElement>('.a9-file-manager__checkbox')?.disabled).toBe(true);
      expect(row.querySelector<HTMLButtonElement>('[data-testid="file-delete-image-1"]')?.disabled).toBe(true);
    });
    expect(document.querySelector<HTMLButtonElement>('[data-file-id=""] .a9-file-manager__checkbox')?.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('[data-testid="file-delete-2"]')?.disabled).toBe(true);
    expect(service.remove).not.toHaveBeenCalled();
    expect(service.move).not.toHaveBeenCalled();
  });

  it('keeps fake partial move results consistent with persisted list state', async () => {
    vi.useFakeTimers();
    try {
      const service = createFakeFileManagerService('normal');
      const moving = service.move({
        fileType: 'image',
        ids: ['file-image-1', 'file-image-2'],
        groupId: null,
      });
      await vi.advanceTimersByTimeAsync(220);
      await expect(moving).resolves.toEqual(['file-image-1']);

      const ungrouped = service.list({ page: 1, pageSize: 24, fileType: 'image', groupId: null });
      const releaseGroup = service.list({ page: 1, pageSize: 24, fileType: 'image', groupId: 'image-release' });
      await vi.advanceTimersByTimeAsync(260);
      await expect(ungrouped).resolves.toEqual(
        expect.objectContaining({
          list: [expect.objectContaining({ id: 'file-image-1' })],
          typeCounts: { image: 2, video: 1, audio: 1, document: 4, archive: 2, other: 2 },
        })
      );
      await expect(releaseGroup).resolves.toEqual(
        expect.objectContaining({ list: [expect.objectContaining({ id: 'file-image-2' })] })
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
