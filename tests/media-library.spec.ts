/* eslint-disable vue/one-component-per-file */
import {
  createApp,
  defineComponent,
  h,
  inject,
  nextTick,
  provide,
  ref,
  shallowRef,
  type App,
  type InjectionKey,
  type Slots,
} from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AMediaLibrary from '../src/components/media-library/index.vue';
import type { MediaGroup, MediaItem, MediaLibraryAdapter, MediaLibraryService, MediaType } from '../src/services/types';

const mountedApps: App[] = [];
const baseMedia: MediaItem = {
  id: 'media-1',
  name: 'sample.png',
  type: 'image',
  groupId: null,
  url: '/media/sample.png',
  status: 'ready',
};
const MOVE_UNGROUPED = '__admin9_ui_library_move_ungrouped__';
const MOVE_GROUP_PREFIX = '__admin9_ui_library_move_group__:';
const GROUP_ALL = '__admin9_ui_library_all__';
const GROUP_PREFIX = '__admin9_ui_library_group__:';
const moveGroupValue = (groupId: string) => `${MOVE_GROUP_PREFIX}${groupId}`;
const groupValue = (groupId: string) => `${GROUP_PREFIX}${groupId}`;
const mediaLibraryMessages = {
  upload: { image: 'Upload Image', video: 'Upload Video', audio: 'Upload Audio' },
  searchPlaceholder: 'Search media',
  refresh: 'Refresh media',
  retry: 'Retry',
  groups: 'Media groups',
  groupAll: 'All',
  groupUngrouped: 'Ungrouped',
  createGroup: 'Create group',
  renameGroup: 'Rename group',
  renameGroupItem: 'Rename group {name}',
  deleteGroup: 'Delete group',
  deleteGroupItem: 'Delete group {name}',
  groupNamePlaceholder: 'Enter a group name',
  groupDeleteConfirm: 'Delete group?',
  groupLoadFailed: 'Failed to load groups',
  groupMutationFailed: 'Failed to save group',
  groupDeleteFailed: 'Failed to delete group',
  selectedCount: '{count} selected',
  select: 'Select',
  selectItem: 'Select {name}',
  clearSelection: 'Clear selection',
  move: 'Move',
  moveItem: 'Move {name}',
  moveTarget: 'Move to group',
  moveTargetItem: 'Choose a move destination for {name}',
  moveOneConfirm: 'Move {name} to the selected group?',
  moveFailed: 'Move failed',
  movePartial: 'Some media could not be moved',
  delete: 'Delete',
  deleteItem: 'Delete {name}',
  deleteConfirm: 'Delete {count} selected items?',
  deleteOneConfirm: 'Delete this item?',
  deleteFailed: 'Delete failed',
  deletePartial: 'Some media could not be deleted',
  uploadFailed: 'Upload failed',
  loadFailed: 'Failed to load media',
  empty: 'No media',
  processing: 'Processing',
  failed: 'Failed',
  unavailable: 'Media unavailable',
  wrongType: 'Media type mismatch',
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

async function flush() {
  // Mutations refresh both the list and groups before releasing their busy state.
  // Cross an event-loop boundary so nested promises settle before Vue renders.
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
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, [slots.icon?.(), slots.default?.()]);
  },
});
const SpinStub = defineComponent({
  props: { loading: Boolean },
  setup(props, { attrs, slots }) {
    return () => h('div', { ...attrs, 'data-loading': String(props.loading) }, slots.default?.());
  },
});
const EmptyStub = defineComponent({
  props: { description: String },
  setup(props) {
    return () => h('div', { 'data-testid': 'empty-state' }, props.description);
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
const InputSearchStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue', 'search', 'clear'],
  setup(props, { emit, attrs }) {
    return () =>
      h('div', attrs, [
        h('input', {
          'data-testid': 'library-search',
          'value': props.modelValue,
          'onInput': (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
        }),
        h('button', { 'data-testid': 'submit-search', 'onClick': () => emit('search') }, 'Search'),
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
        onKeydown: (event: KeyboardEvent) => {
          if (event.key === 'Enter') emit('pressEnter');
        },
      });
  },
});
const ModalStub = defineComponent({
  props: { visible: Boolean, onBeforeOk: Function },
  emits: ['update:visible'],
  setup(props, { emit, attrs, slots }) {
    const confirm = async () => {
      const { onBeforeOk: beforeOk } = props;
      if (typeof beforeOk !== 'function') return;
      const shouldClose = await beforeOk();
      if (shouldClose !== false) emit('update:visible', false);
    };
    return () =>
      props.visible
        ? h('div', { ...attrs, 'data-testid': 'group-modal' }, [
            slots.default?.(),
            h('button', { 'data-testid': 'group-modal-ok', 'onClick': confirm }, 'OK'),
          ])
        : null;
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
const OptionStub = defineComponent({
  props: { value: { type: [String, Number, Boolean, Object], required: true } },
  setup(props, { slots }) {
    return () => h('option', { value: String(props.value) }, slots.default?.());
  },
});
const SelectStub = defineComponent({
  props: { modelValue: { type: [String, Number, Boolean, Object], default: undefined } },
  emits: ['update:modelValue', 'change'],
  setup(props, { emit, attrs, slots }) {
    return () =>
      h(
        'select',
        {
          ...attrs,
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
const UploadStub = defineComponent({
  setup(_, { attrs, slots }) {
    const upload = () => {
      const request = attrs.customRequest ?? attrs['custom-request'];
      if (typeof request !== 'function') return;
      request({
        fileItem: { file: new File(['media'], 'upload.bin') },
        onProgress: vi.fn(),
        onSuccess: vi.fn(),
        onError: vi.fn(),
      });
    };
    return () =>
      h(
        'div',
        { 'data-testid': 'library-upload', 'data-accept': String(attrs.accept), 'onClick': upload },
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

interface SelectionContext {
  selected: (id: string) => boolean;
  toggle: (id: string) => void;
}
const selectionKey: InjectionKey<SelectionContext> = Symbol('selection');
const CheckboxGroupStub = defineComponent({
  props: { modelValue: { type: Array, default: () => [] } },
  emits: ['change'],
  setup(props, { emit, slots }) {
    provide(selectionKey, {
      selected: (id) => props.modelValue.map(String).includes(id),
      toggle: (id) => {
        const selected = props.modelValue.map(String);
        emit('change', selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
      },
    });
    return () => h('div', slots.default?.());
  },
});
const CheckboxStub = defineComponent({
  props: { value: { type: [String, Number, Boolean], required: true }, disabled: Boolean },
  setup(props, { attrs, slots }) {
    const group = inject(selectionKey);
    return () => {
      const id = String(props.value);
      return h(
        'button',
        {
          ...attrs,
          'data-testid': `select-${id}`,
          'data-selected': String(group?.selected(id) ?? false),
          'disabled': props.disabled,
          'onClick': () => group?.toggle(id),
        },
        slots.default?.()
      );
    };
  },
});

function makeService(overrides: Partial<MediaLibraryService> = {}): MediaLibraryService {
  return {
    list: vi.fn().mockResolvedValue({
      list: [baseMedia],
      pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
    }),
    listGroups: vi.fn().mockResolvedValue([{ id: 'campaign', name: 'Campaign', count: 1 }]),
    upload: vi.fn().mockResolvedValue(baseMedia),
    remove: vi.fn().mockImplementation((ids: string[]) => Promise.resolve(ids)),
    createGroup: vi.fn().mockResolvedValue({ id: 'created', name: 'Created' }),
    renameGroup: vi.fn().mockResolvedValue({ id: 'campaign', name: 'Renamed' }),
    removeGroup: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockImplementation(({ ids }) => Promise.resolve(ids)),
    ...overrides,
  };
}

function installStubs(app: App) {
  app.use(
    createI18n({
      legacy: false,
      locale: 'en-US',
      messages: { 'en-US': { admin9Ui: { mediaItem: { preview: 'Preview {name}' }, mediaLibrary: mediaLibraryMessages } } },
    })
  );
  app.component('AButton', ButtonStub);
  app.component('AUpload', UploadStub);
  app.component('AInputSearch', InputSearchStub);
  app.component('AInput', InputStub);
  app.component('AModal', ModalStub);
  app.component('APopconfirm', PopconfirmStub);
  app.component('ASelect', SelectStub);
  app.component('AOption', OptionStub);
  app.component('ASpin', SpinStub);
  app.component('AAlert', Transparent);
  app.component('AEmpty', EmptyStub);
  app.component('APagination', PaginationStub);
  app.component('ACheckboxGroup', CheckboxGroupStub);
  app.component('ACheckbox', CheckboxStub);
  app.component('AImage', ImageStub);
  app.component('AImagePreview', ImagePreviewStub);
  app.component('IconRefresh', Transparent);
  app.component('IconUpload', Transparent);
  app.component('IconPlus', Transparent);
  app.component('IconEdit', Transparent);
  app.component('IconDelete', Transparent);
  app.component('IconPlayArrow', Transparent);
  app.component('IconEye', Transparent);
}

function mountLibrary(
  service: MediaLibraryAdapter,
  props: Record<string, unknown> = {},
  slots: Partial<Slots> | undefined = undefined
) {
  const Root = slots
    ? defineComponent({
        setup() {
          return () => h(AMediaLibrary, { service, ...props }, slots);
        },
      })
    : AMediaLibrary;
  const app = createApp(Root, slots ? undefined : { service, ...props });
  installStubs(app);
  app.mount('#app');
  mountedApps.push(app);
}

function mountDynamicLibrary(service: MediaLibraryAdapter, props: Record<string, unknown> = {}) {
  const mediaType = ref<MediaType>('image');
  const Host = defineComponent({
    setup() {
      return () => h(AMediaLibrary, { service, ...props, mediaType: mediaType.value });
    },
  });
  const app = createApp(Host);
  installStubs(app);
  mountedApps.push(app);
  app.mount('#app');
  return {
    setMediaType(value: MediaType) {
      mediaType.value = value;
    },
  };
}

function mountDynamicService(initialService: MediaLibraryAdapter) {
  const service = shallowRef(initialService);
  const Host = defineComponent({
    setup() {
      return () => h(AMediaLibrary, { service: service.value });
    },
  });
  const app = createApp(Host);
  installStubs(app);
  app.mount('#app');
  mountedApps.push(app);
  return {
    setService(value: MediaLibraryAdapter) {
      service.value = value;
    },
  };
}

function click(selector: string) {
  document.querySelector<HTMLButtonElement>(selector)?.click();
}

function changeSelect(selector: string, value: string) {
  const select = document.querySelector<HTMLSelectElement>(selector);
  if (!select) throw new Error(`Missing select ${selector}`);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function confirmFor(selector: string) {
  document
    .querySelector(selector)
    ?.closest('[data-testid="popconfirm"]')
    ?.querySelector<HTMLButtonElement>('[data-testid="confirm-action"]')
    ?.click();
}

describe('AMediaLibrary', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    mountedApps.splice(0).forEach((app) => app.unmount());
  });

  it('runs in read-only mode with only list and hides group navigation', async () => {
    const service: MediaLibraryAdapter = {
      list: vi.fn().mockResolvedValue({
        list: [baseMedia],
        pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
      }),
    };

    mountLibrary(service, { canUpload: false, canDelete: false, canMove: false, canManageGroups: false });
    await flush();

    expect(service.list).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-media-id="media-1"]')).not.toBeNull();
    expect(document.querySelector('.a9-media-library__groups')).toBeNull();
    expect(document.querySelector('.a9-media-library__layout')?.classList.contains('without-groups')).toBe(true);
    expect(document.querySelector('[data-testid="library-upload"]')).toBeNull();
    expect(document.querySelector('[data-testid="move-media-media-1"]')).toBeNull();
    expect(document.querySelector('[data-testid="delete-media-media-1"]')).toBeNull();
  });

  it('always requires the browse list method', () => {
    const service = { list: undefined } as unknown as MediaLibraryAdapter;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => mountLibrary(service, { canUpload: false, canDelete: false, canMove: false, canManageGroups: false })).toThrow(
      '[admin9-ui] AMediaLibrary requires MediaBrowseService'
    );
    warn.mockRestore();
  });

  it.each([
    ['upload', 'canUpload', 'MediaUploadCapability'],
    ['remove', 'canDelete', 'MediaRemoveCapability'],
    ['move', 'canMove', 'MediaMoveCapability'],
  ] as const)('requires %s only when %s is enabled', (method, flag, capability) => {
    const service = { ...makeService(), [method]: undefined } as unknown as MediaLibraryAdapter;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => mountLibrary(service, { [flag]: true })).toThrow(capability);
    warn.mockRestore();
  });

  it.each(['listGroups', 'createGroup', 'renameGroup', 'removeGroup'] as const)(
    'requires the complete group capability when management is enabled and %s is missing',
    (method) => {
      const service = { ...makeService(), [method]: undefined } as unknown as MediaLibraryAdapter;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      expect(() => mountLibrary(service, { canManageGroups: true })).toThrow('MediaGroupCapability');
      warn.mockRestore();
    }
  );

  it('allows move-to-ungrouped without group browsing', async () => {
    const service: MediaLibraryAdapter = {
      list: vi.fn().mockResolvedValue({
        list: [baseMedia],
        pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
      }),
      move: vi.fn().mockResolvedValue(['media-1']),
    };
    mountLibrary(service, { canUpload: false, canDelete: false, canMove: true, canManageGroups: false });
    await flush();

    expect(document.querySelector('.a9-media-library__groups')).toBeNull();
    const moveSelect = document.querySelector<HTMLSelectElement>('[data-testid="move-media-media-1"]');
    expect(Array.from(moveSelect?.options ?? []).map((option) => option.value)).toEqual(['', MOVE_UNGROUPED]);
    changeSelect('[data-testid="move-media-media-1"]', MOVE_UNGROUPED);
    await flush();
    expect(service.move).not.toHaveBeenCalled();
    confirmFor('[data-testid="confirm-move-media-media-1"]');
    await flush();
    expect(service.move).toHaveBeenCalledWith({ mediaType: 'image', ids: ['media-1'], groupId: null });
  });

  it('reloads from a replacement service and ignores responses from the previous service', async () => {
    const oldList = deferred<Awaited<ReturnType<MediaLibraryService['list']>>>();
    const oldGroups = deferred<MediaGroup[]>();
    const replacementMedia = { ...baseMedia, id: 'replacement', name: 'replacement.png' };
    const oldService = makeService({
      list: vi.fn().mockReturnValue(oldList.promise),
      listGroups: vi.fn().mockReturnValue(oldGroups.promise),
    });
    const replacementService = makeService({
      list: vi.fn().mockResolvedValue({
        list: [replacementMedia],
        pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
      }),
      listGroups: vi.fn().mockResolvedValue([{ id: 'replacement-group', name: 'Replacement group' }]),
    });
    const library = mountDynamicService(oldService);
    await flush();

    library.setService(replacementService);
    await flush();
    oldList.resolve({
      list: [baseMedia],
      pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
    });
    oldGroups.resolve([{ id: 'old-group', name: 'Old group' }]);
    await flush();

    expect(replacementService.list).toHaveBeenCalledTimes(1);
    expect(replacementService.listGroups).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-media-id="replacement"]')).not.toBeNull();
    expect(document.querySelector('[data-media-id="media-1"]')).toBeNull();
    expect(document.body.textContent).toContain('Replacement group');
    expect(document.body.textContent).not.toContain('Old group');
  });

  it('delegates all filters to the backend and resets page for group, keyword, and media type changes', async () => {
    const service = makeService({
      list: vi.fn().mockImplementation(({ page }) =>
        Promise.resolve({
          list: [baseMedia],
          pagination: { page, pageSize: 24, total: 48, hasMore: page < 2 },
        })
      ),
    });
    const library = mountDynamicLibrary(service);
    await flush();

    expect(service.list).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 24,
      keyword: undefined,
      mediaType: 'image',
      groupId: undefined,
    });
    click('[data-testid="next-page"]');
    await flush();
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));

    click('[data-group-id="campaign"]');
    await flush();
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, groupId: 'campaign' }));

    const search = document.querySelector<HTMLInputElement>('[data-testid="library-search"]');
    if (search) {
      search.value = 'launch';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
    click('[data-testid="submit-search"]');
    await flush();
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, keyword: 'launch', groupId: 'campaign' }));

    click('[data-group-id="ungrouped"]');
    await flush();
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, groupId: null }));

    library.setMediaType('video');
    await flush();
    expect(service.listGroups).toHaveBeenLastCalledWith('video');
    expect(service.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, keyword: 'launch', mediaType: 'video', groupId: undefined })
    );
  });

  it('ignores stale list and group responses after the media type changes', async () => {
    const imageList = deferred<Awaited<ReturnType<MediaLibraryService['list']>>>();
    const videoList = deferred<Awaited<ReturnType<MediaLibraryService['list']>>>();
    const imageGroups = deferred<MediaGroup[]>();
    const videoGroups = deferred<MediaGroup[]>();
    const videoMedia: MediaItem = {
      ...baseMedia,
      id: 'video-1',
      name: 'launch.mp4',
      type: 'video',
      url: '/media/launch.mp4',
    };
    const service = makeService({
      list: vi.fn().mockImplementation(({ mediaType }) => (mediaType === 'image' ? imageList.promise : videoList.promise)),
      listGroups: vi
        .fn()
        .mockImplementation((mediaType) => (mediaType === 'image' ? imageGroups.promise : videoGroups.promise)),
    });
    const library = mountDynamicLibrary(service);
    await flush();

    library.setMediaType('video');
    await flush();
    videoList.resolve({
      list: [videoMedia],
      pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
    });
    videoGroups.resolve([{ id: 'video-group', name: 'Video group' }]);
    await flush();

    imageList.resolve({
      list: [baseMedia],
      pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
    });
    imageGroups.resolve([{ id: 'image-group', name: 'Image group' }]);
    await flush();

    expect(document.querySelector('[data-media-id="video-1"]')).not.toBeNull();
    expect(document.querySelector('[data-media-id="media-1"]')).toBeNull();
    expect(document.body.textContent).toContain('Video group');
    expect(document.body.textContent).not.toContain('Image group');
  });

  it('renders responsive group controls on a component-owned native wrapper', async () => {
    const service = makeService();
    mountLibrary(service);
    await flush();

    const compactControl = document.querySelector('.a9-media-library__group-select');
    const desktopControl = document.querySelector('.a9-media-library__groups');
    expect(compactControl?.tagName).toBe('DIV');
    expect(compactControl?.querySelector('[data-testid="compact-groups"]')).not.toBeNull();
    expect(compactControl?.querySelector('[data-testid="compact-create-group"]')).not.toBeNull();
    expect(compactControl?.querySelector('[data-testid="compact-rename-group"]')).toBeNull();
    expect(compactControl?.querySelector('[data-testid="compact-delete-group"]')).toBeNull();
    expect(compactControl?.textContent).toContain('Campaign');
    expect(desktopControl?.tagName).toBe('ASIDE');
    expect(document.querySelector('[data-testid="rename-group-campaign"]')?.getAttribute('aria-label')).toBe(
      'Rename group Campaign'
    );
    expect(document.querySelector('[data-testid="delete-group-campaign"]')?.getAttribute('aria-label')).toBe(
      'Delete group Campaign'
    );

    changeSelect('[data-testid="compact-groups"]', groupValue('campaign'));
    await flush();
    expect(compactControl?.querySelector('[data-testid="compact-rename-group"]')).not.toBeNull();
    expect(compactControl?.querySelector('[data-testid="compact-delete-group"]')).not.toBeNull();

    changeSelect('[data-testid="compact-groups"]', GROUP_ALL);
    await flush();
    expect(compactControl?.querySelector('[data-testid="compact-rename-group"]')).toBeNull();
    expect(compactControl?.querySelector('[data-testid="compact-delete-group"]')).toBeNull();
  });

  it('creates and manages the selected backend group from compact controls', async () => {
    const service = makeService();
    mountLibrary(service, { mediaType: 'video' });
    await flush();

    click('[data-testid="compact-create-group"]');
    await flush();
    const createInput = document.querySelector<HTMLInputElement>('[data-testid="group-name"]');
    if (createInput) {
      createInput.value = 'Launch';
      createInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    click('[data-testid="group-modal-ok"]');
    await flush();
    expect(service.createGroup).toHaveBeenCalledWith({ mediaType: 'video', name: 'Launch' });

    changeSelect('[data-testid="compact-groups"]', groupValue('campaign'));
    await flush();
    click('[data-testid="compact-rename-group"]');
    await flush();
    const renameInput = document.querySelector<HTMLInputElement>('[data-testid="group-name"]');
    if (renameInput) {
      renameInput.value = 'Campaign 2';
      renameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    click('[data-testid="group-modal-ok"]');
    await flush();
    expect(service.renameGroup).toHaveBeenCalledWith({ mediaType: 'video', groupId: 'campaign', name: 'Campaign 2' });

    confirmFor('[data-testid="compact-delete-group"]');
    await flush();
    expect(service.removeGroup).toHaveBeenCalledWith({ mediaType: 'video', groupId: 'campaign' });
  });

  it('creates, renames, and deletes only backend groups with typed payloads', async () => {
    const service = makeService();
    mountLibrary(service, { mediaType: 'video' });
    await flush();

    click('[data-testid="create-group"]');
    await flush();
    const createInput = document.querySelector<HTMLInputElement>('[data-testid="group-name"]');
    if (createInput) {
      createInput.value = 'Launch';
      createInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await flush();
    click('[data-testid="group-modal-ok"]');
    await flush();
    expect(service.createGroup).toHaveBeenCalledWith({ mediaType: 'video', name: 'Launch' });
    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, groupId: 'created' }));

    click('[data-testid="rename-group-campaign"]');
    await flush();
    const renameInput = document.querySelector<HTMLInputElement>('[data-testid="group-name"]');
    if (renameInput) {
      renameInput.value = 'Campaign 2';
      renameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await flush();
    click('[data-testid="group-modal-ok"]');
    await flush();
    expect(service.renameGroup).toHaveBeenCalledWith({ mediaType: 'video', groupId: 'campaign', name: 'Campaign 2' });

    confirmFor('[data-testid="delete-group-campaign"]');
    await flush();
    expect(service.removeGroup).toHaveBeenCalledWith({ mediaType: 'video', groupId: 'campaign' });
  });

  it('keeps the group form open when the backend rejects a mutation', async () => {
    const service = makeService({ createGroup: vi.fn().mockRejectedValue(new Error('duplicate')) });
    mountLibrary(service);
    await flush();

    click('[data-testid="create-group"]');
    await flush();
    const input = document.querySelector<HTMLInputElement>('[data-testid="group-name"]');
    if (input) {
      input.value = 'Duplicate';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await flush();
    click('[data-testid="group-modal-ok"]');
    await flush();

    expect(service.createGroup).toHaveBeenCalledWith({ mediaType: 'image', name: 'Duplicate' });
    expect(document.querySelector('[data-testid="group-modal"]')).not.toBeNull();
  });

  it('uploads to a concrete group and maps All or Ungrouped to a null target', async () => {
    const service = makeService();
    mountLibrary(service, { mediaType: 'audio' });
    await flush();

    click('[data-group-id="campaign"]');
    await flush();
    click('[data-testid="library-upload"]');
    await flush();
    expect(service.upload).toHaveBeenNthCalledWith(1, expect.objectContaining({ mediaType: 'audio', groupId: 'campaign' }));

    click('[data-group-id="all"]');
    await flush();
    click('[data-testid="library-upload"]');
    await flush();
    click('[data-group-id="ungrouped"]');
    await flush();
    click('[data-testid="library-upload"]');
    await flush();

    expect(service.upload).toHaveBeenNthCalledWith(2, expect.objectContaining({ mediaType: 'audio', groupId: null }));
    expect(service.upload).toHaveBeenNthCalledWith(3, expect.objectContaining({ mediaType: 'audio', groupId: null }));
  });

  it('honors capability and accept props', async () => {
    const service = makeService();
    mountLibrary(service, {
      accept: 'image/avif',
      canDelete: false,
      canMove: false,
      canManageGroups: false,
    });
    await flush();

    expect(document.querySelector('[data-testid="library-upload"]')?.getAttribute('data-accept')).toBe('image/avif');
    expect(document.querySelector('[data-testid="create-group"]')).toBeNull();
    expect(document.querySelector('[data-testid="compact-create-group"]')).toBeNull();
    expect(document.querySelector('[data-testid="rename-group-campaign"]')).toBeNull();
    expect(document.querySelector('[data-testid="delete-media-media-1"]')).toBeNull();
    expect(document.querySelector('[data-testid="move-media-media-1"]')).toBeNull();
  });

  it('emits upload, move, and delete results and reports upload failures', async () => {
    const onUploadSuccess = vi.fn();
    const onUploadError = vi.fn();
    const onMoveSuccess = vi.fn();
    const onDeleteSuccess = vi.fn();
    const uploadError = new Error('upload rejected');
    const service = makeService({
      upload: vi.fn().mockResolvedValueOnce(baseMedia).mockRejectedValueOnce(uploadError),
    });
    mountLibrary(service, { onUploadSuccess, onUploadError, onMoveSuccess, onDeleteSuccess });
    await flush();

    click('[data-testid="library-upload"]');
    await flush();
    expect(onUploadSuccess).toHaveBeenCalledWith(baseMedia);

    click('[data-testid="library-upload"]');
    await flush();
    expect(onUploadError).toHaveBeenCalledWith(uploadError);

    changeSelect('[data-testid="move-media-media-1"]', moveGroupValue('campaign'));
    await flush();
    expect(onMoveSuccess).not.toHaveBeenCalled();
    confirmFor('[data-testid="confirm-move-media-media-1"]');
    await flush();
    expect(onMoveSuccess).toHaveBeenCalledWith(['media-1'], 'campaign');

    confirmFor('[data-testid="delete-media-media-1"]');
    await flush();
    expect(onDeleteSuccess).toHaveBeenCalledWith(['media-1']);
  });

  it('suppresses stale upload, move, and remove effects after the media type changes', async () => {
    const uploadResult = deferred<MediaItem>();
    const moveResult = deferred<string[]>();
    const removeResult = deferred<string[]>();
    const onUploadSuccess = vi.fn();
    const onMoveSuccess = vi.fn();
    const onDeleteSuccess = vi.fn();
    const secondImage = { ...baseMedia, id: 'media-2', name: 'second.png' };
    const videoMedia: MediaItem = {
      ...baseMedia,
      id: 'video-1',
      name: 'current.mp4',
      type: 'video',
      url: '/media/current.mp4',
    };
    const service = makeService({
      list: vi.fn().mockImplementation(({ mediaType }) =>
        Promise.resolve({
          list: mediaType === 'image' ? [baseMedia, secondImage] : [videoMedia],
          pagination: { page: 1, pageSize: 24, total: mediaType === 'image' ? 2 : 1, hasMore: false },
        })
      ),
      upload: vi.fn().mockReturnValue(uploadResult.promise),
      move: vi.fn().mockReturnValue(moveResult.promise),
      remove: vi.fn().mockReturnValue(removeResult.promise),
    });
    const library = mountDynamicLibrary(service, { onUploadSuccess, onMoveSuccess, onDeleteSuccess });
    await flush();

    click('[data-testid="library-upload"]');
    changeSelect('[data-testid="move-media-media-1"]', moveGroupValue('campaign'));
    confirmFor('[data-testid="confirm-move-media-media-1"]');
    confirmFor('[data-testid="delete-media-media-2"]');
    await flush();
    expect(service.upload).toHaveBeenCalledTimes(1);
    expect(service.upload).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'image' }));
    expect(service.move).toHaveBeenCalledWith({ mediaType: 'image', ids: ['media-1'], groupId: 'campaign' });
    expect(service.remove).toHaveBeenCalledTimes(1);

    library.setMediaType('video');
    await flush();
    const listCallsAfterSwitch = vi.mocked(service.list).mock.calls.length;
    const groupCallsAfterSwitch = vi.mocked(service.listGroups).mock.calls.length;

    uploadResult.resolve(baseMedia);
    moveResult.resolve(['media-1']);
    removeResult.resolve(['media-2']);
    await flush();

    expect(onUploadSuccess).not.toHaveBeenCalled();
    expect(onMoveSuccess).not.toHaveBeenCalled();
    expect(onDeleteSuccess).not.toHaveBeenCalled();
    expect(service.list).toHaveBeenCalledTimes(listCallsAfterSwitch);
    expect(service.listGroups).toHaveBeenCalledTimes(groupCallsAfterSwitch);
    expect(document.querySelector('[data-media-id="video-1"]')).not.toBeNull();
  });

  it.each(['create', 'rename', 'delete'] as const)(
    'suppresses stale group %s effects after the media type changes',
    async (operation) => {
      const mutation = deferred<void>();
      const service = makeService({
        createGroup: vi.fn(async () => {
          await mutation.promise;
          return { id: 'created', name: 'Created' };
        }),
        renameGroup: vi.fn(async () => {
          await mutation.promise;
          return { id: 'campaign', name: 'Renamed' };
        }),
        removeGroup: vi.fn(async () => mutation.promise),
      });
      const library = mountDynamicLibrary(service);
      await flush();

      if (operation === 'delete') {
        confirmFor('[data-testid="delete-group-campaign"]');
      } else {
        click(`[data-testid="${operation}-group${operation === 'rename' ? '-campaign' : ''}"]`);
        await flush();
        const input = document.querySelector<HTMLInputElement>('[data-testid="group-name"]');
        if (input) {
          input.value = operation === 'create' ? 'Created' : 'Renamed';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        await flush();
        click('[data-testid="group-modal-ok"]');
      }
      await flush();

      if (operation === 'create') {
        expect(service.createGroup).toHaveBeenCalledWith({ mediaType: 'image', name: 'Created' });
      } else if (operation === 'rename') {
        expect(service.renameGroup).toHaveBeenCalledWith({
          mediaType: 'image',
          groupId: 'campaign',
          name: 'Renamed',
        });
      } else {
        expect(service.removeGroup).toHaveBeenCalledWith({ mediaType: 'image', groupId: 'campaign' });
      }

      library.setMediaType('video');
      await flush();
      const listCallsAfterSwitch = vi.mocked(service.list).mock.calls.length;
      const groupCallsAfterSwitch = vi.mocked(service.listGroups).mock.calls.length;
      mutation.resolve();
      await flush();

      expect(service.list).toHaveBeenCalledTimes(listCallsAfterSwitch);
      expect(service.listGroups).toHaveBeenCalledTimes(groupCallsAfterSwitch);
      expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ mediaType: 'video', groupId: undefined }));
    }
  );

  it('passes typed context to toolbar and item slots', async () => {
    const service = makeService();
    mountLibrary(
      service,
      {},
      {
        'toolbar-extra': ({ loading }: { loading: boolean }) =>
          h('span', { 'data-testid': 'toolbar-extra', 'data-loading': String(loading) }, 'Extra'),
        'item': ({ item, available, selected }: { item: MediaItem; available: boolean; selected: boolean }) =>
          h(
            'div',
            {
              'data-testid': 'custom-item',
              'data-available': String(available),
              'data-selected': String(selected),
            },
            item.name
          ),
      }
    );
    await flush();

    expect(document.querySelector('[data-testid="toolbar-extra"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="custom-item"]')?.textContent).toBe('sample.png');
    expect(document.querySelector('[data-testid="custom-item"]')?.getAttribute('data-available')).toBe('true');
    click('[data-testid="select-media-1"]');
    await flush();
    expect(document.querySelector('[data-testid="custom-item"]')?.getAttribute('data-selected')).toBe('true');
  });

  it('keeps empty content hidden while loading and supports an empty slot', async () => {
    const listResult = deferred<Awaited<ReturnType<MediaLibraryService['list']>>>();
    const service = makeService({ list: vi.fn().mockReturnValue(listResult.promise) });
    mountLibrary(
      service,
      {},
      {
        empty: () => h('div', { 'data-testid': 'custom-empty' }, 'Nothing here'),
      }
    );
    await flush();

    expect(document.querySelector('.a9-media-library__spin')?.getAttribute('data-loading')).toBe('true');
    expect(document.querySelector('[data-testid="custom-empty"]')).toBeNull();

    listResult.resolve({
      list: [],
      pagination: { page: 1, pageSize: 24, total: 0, hasMore: false },
    });
    await flush();

    expect(document.querySelector('.a9-media-library__spin')?.getAttribute('data-loading')).toBe('false');
    expect(document.querySelector('[data-testid="custom-empty"]')?.textContent).toBe('Nothing here');
  });

  it('shows a retryable error state after a list failure', async () => {
    const service = makeService({
      list: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({
          list: [baseMedia],
          pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
        }),
    });
    mountLibrary(service);
    await flush();

    expect(document.body.textContent).toContain('Failed to load media');
    click('[data-testid="retry-list"]');
    await flush();

    expect(service.list).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-media-id="media-1"]')).not.toBeNull();
  });

  it('keeps group failures visible and retries group loading', async () => {
    const service = makeService({
      listGroups: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce([{ id: 'campaign', name: 'Campaign', count: 1 }]),
    });
    mountLibrary(service);
    await flush();

    expect(document.querySelector('.a9-media-library__group-error')?.textContent).toContain('Failed to load groups');
    expect(document.body.textContent).not.toContain('Campaign');
    click('[data-testid="retry-groups"]');
    await flush();

    expect(service.listGroups).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.a9-media-library__group-error')).toBeNull();
    expect(document.body.textContent).toContain('Campaign');
  });

  it('preserves selections across pages and groups and exposes an explicit clear action', async () => {
    const pageOne = baseMedia;
    const pageTwo = { ...baseMedia, id: 'media-2', name: 'page-two.png' };
    const grouped = { ...baseMedia, id: 'media-3', name: 'grouped.png', groupId: 'campaign' };
    const service = makeService({
      list: vi.fn().mockImplementation(({ page, groupId }) => {
        let item = pageOne;
        if (page === 2) item = pageTwo;
        if (groupId === 'campaign') item = grouped;
        return Promise.resolve({
          list: [item],
          pagination: { page, pageSize: 1, total: 3, hasMore: page < 3 },
        });
      }),
    });
    mountLibrary(service, { pageSize: 1 });
    await flush();

    click('[data-testid="select-media-1"]');
    click('[data-testid="next-page"]');
    await flush();
    click('[data-testid="select-media-2"]');
    click('[data-group-id="campaign"]');
    await flush();
    click('[data-testid="select-media-3"]');
    await flush();

    expect(document.body.textContent).toContain('3 selected');
    click('[data-testid="clear-selection"]');
    await flush();
    expect(document.body.textContent).toContain('0 selected');
  });

  it('moves and deletes cross-page selections and supports single-item operations', async () => {
    const pageTwo = { ...baseMedia, id: 'media-2', name: 'page-two.png' };
    const service = makeService({
      list: vi.fn().mockImplementation(({ page }) =>
        Promise.resolve({
          list: [page === 2 ? pageTwo : baseMedia],
          pagination: { page, pageSize: 1, total: 2, hasMore: page < 2 },
        })
      ),
    });
    mountLibrary(service, { pageSize: 1 });
    await flush();

    click('[data-testid="select-media-1"]');
    click('[data-testid="next-page"]');
    await flush();
    click('[data-testid="select-media-2"]');
    await flush();
    changeSelect('[data-testid="batch-move-target"]', moveGroupValue('campaign'));
    await flush();
    click('[data-testid="batch-move"]');
    await flush();
    expect(service.move).toHaveBeenNthCalledWith(1, {
      mediaType: 'image',
      ids: ['media-1', 'media-2'],
      groupId: 'campaign',
    });

    click('[data-testid="select-media-2"]');
    await flush();
    confirmFor('[data-testid="batch-delete"]');
    await flush();
    expect(service.remove).toHaveBeenNthCalledWith(1, ['media-2']);

    changeSelect('[data-testid="move-media-media-2"]', MOVE_UNGROUPED);
    await flush();
    expect(service.move).toHaveBeenCalledTimes(1);
    confirmFor('[data-testid="confirm-move-media-media-2"]');
    await flush();
    expect(service.move).toHaveBeenNthCalledWith(2, { mediaType: 'image', ids: ['media-2'], groupId: null });
    confirmFor('[data-testid="delete-media-media-2"]');
    await flush();
    expect(service.remove).toHaveBeenNthCalledWith(2, ['media-2']);
  });

  it('deduplicates and intersects mutation result ids before selection cleanup and events', async () => {
    const secondImage = { ...baseMedia, id: 'media-2', name: 'second.png' };
    const onMoveSuccess = vi.fn();
    const onDeleteSuccess = vi.fn();
    const service = makeService({
      list: vi.fn().mockResolvedValue({
        list: [baseMedia, secondImage],
        pagination: { page: 1, pageSize: 24, total: 2, hasMore: false },
      }),
      move: vi.fn().mockResolvedValue(['media-1', 'media-1', 'foreign-id']),
      remove: vi.fn().mockResolvedValue(['media-2', 'media-2', 'foreign-id']),
    });
    mountLibrary(service, { onMoveSuccess, onDeleteSuccess });
    await flush();

    click('[data-testid="select-media-1"]');
    await flush();
    click('[data-testid="select-media-2"]');
    await flush();
    changeSelect('[data-testid="batch-move-target"]', moveGroupValue('campaign'));
    await flush();
    click('[data-testid="batch-move"]');
    await flush();

    expect(onMoveSuccess).toHaveBeenCalledWith(['media-1'], 'campaign');
    expect(document.body.textContent).toContain('1 selected');
    confirmFor('[data-testid="batch-delete"]');
    await flush();

    expect(service.remove).toHaveBeenCalledWith(['media-2']);
    expect(onDeleteSuccess).toHaveBeenCalledWith(['media-2']);
    expect(document.body.textContent).toContain('0 selected');
  });

  it('encodes real group ids so they cannot collide with the ungrouped move target', async () => {
    const collidingGroupId = MOVE_UNGROUPED;
    const service = makeService({
      listGroups: vi.fn().mockResolvedValue([{ id: collidingGroupId, name: 'Reserved-looking group' }]),
    });
    mountLibrary(service);
    await flush();

    changeSelect('[data-testid="move-media-media-1"]', moveGroupValue(collidingGroupId));
    await flush();
    expect(service.move).not.toHaveBeenCalled();
    confirmFor('[data-testid="confirm-move-media-media-1"]');
    await flush();
    expect(service.move).toHaveBeenNthCalledWith(1, {
      mediaType: 'image',
      ids: ['media-1'],
      groupId: collidingGroupId,
    });

    changeSelect('[data-testid="move-media-media-1"]', MOVE_UNGROUPED);
    await flush();
    expect(service.move).toHaveBeenCalledTimes(1);
    confirmFor('[data-testid="confirm-move-media-media-1"]');
    await flush();
    expect(service.move).toHaveBeenNthCalledWith(2, {
      mediaType: 'image',
      ids: ['media-1'],
      groupId: null,
    });
  });

  it('falls back to the last valid page after deleting the final item on the current page', async () => {
    let removed = false;
    const pageTwo = { ...baseMedia, id: 'media-2', name: 'page-two.png' };
    const service = makeService({
      list: vi.fn().mockImplementation(({ page }) => {
        if (removed) {
          return Promise.resolve({
            list: page === 1 ? [baseMedia] : [],
            pagination: { page, pageSize: 1, total: 1, hasMore: false },
          });
        }
        return Promise.resolve({
          list: [page === 1 ? baseMedia : pageTwo],
          pagination: { page, pageSize: 1, total: 2, hasMore: page === 1 },
        });
      }),
      remove: vi.fn().mockImplementation((ids: string[]) => {
        removed = true;
        return Promise.resolve(ids);
      }),
    });
    mountLibrary(service, { pageSize: 1 });
    await flush();

    click('[data-testid="next-page"]');
    await flush();
    confirmFor('[data-testid="delete-media-media-2"]');
    await flush();

    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    expect(document.querySelector('[data-media-id="media-1"]')).not.toBeNull();
    expect(document.querySelector('[data-media-id="media-2"]')).toBeNull();
  });

  it('falls back to the last valid page after moving the final item out of the current group page', async () => {
    let moved = false;
    const pageTwo = { ...baseMedia, id: 'media-2', name: 'page-two.png', groupId: 'campaign' };
    const pageOne = { ...baseMedia, groupId: 'campaign' };
    const service = makeService({
      list: vi.fn().mockImplementation(({ page }) => {
        if (moved) {
          return Promise.resolve({
            list: page === 1 ? [pageOne] : [],
            pagination: { page, pageSize: 1, total: 1, hasMore: false },
          });
        }
        return Promise.resolve({
          list: [page === 1 ? pageOne : pageTwo],
          pagination: { page, pageSize: 1, total: 2, hasMore: page === 1 },
        });
      }),
      move: vi.fn().mockImplementation(({ ids }) => {
        moved = true;
        return Promise.resolve(ids);
      }),
    });
    mountLibrary(service, { pageSize: 1 });
    await flush();

    click('[data-group-id="campaign"]');
    await flush();
    click('[data-testid="next-page"]');
    await flush();
    changeSelect('[data-testid="move-media-media-2"]', MOVE_UNGROUPED);
    await flush();
    expect(service.move).not.toHaveBeenCalled();
    confirmFor('[data-testid="confirm-move-media-media-2"]');
    await flush();

    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, groupId: 'campaign' }));
    expect(document.querySelector('[data-media-id="media-1"]')).not.toBeNull();
    expect(document.querySelector('[data-media-id="media-2"]')).toBeNull();
  });

  it('drops a retained selection when the backend reports that item as unavailable', async () => {
    const pending = { ...baseMedia, url: null, status: 'pending' as const };
    const service = makeService({
      list: vi
        .fn()
        .mockResolvedValueOnce({
          list: [baseMedia],
          pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
        })
        .mockResolvedValueOnce({
          list: [pending],
          pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
        }),
    });
    mountLibrary(service);
    await flush();
    click('[data-testid="select-media-1"]');
    await flush();
    expect(document.body.textContent).toContain('1 selected');

    const refreshButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.getAttribute('aria-label') === 'Refresh media'
    );
    refreshButton?.click();
    await flush();

    expect(document.body.textContent).toContain('0 selected');
    expect(document.querySelector('[data-testid="select-media-1"]')?.hasAttribute('disabled')).toBe(true);
  });

  it.each<MediaType>(['image', 'video', 'audio'])(
    'renders typed %s previews and marks unavailable records as non-operable',
    async (mediaType) => {
      const extensions: Record<MediaType, string> = { image: 'png', video: 'mp4', audio: 'mp3' };
      const extension = extensions[mediaType];
      const valid: MediaItem = {
        ...baseMedia,
        type: mediaType,
        name: `valid.${extension}`,
        url: `/media/valid.${extension}`,
        duration: mediaType === 'image' ? undefined : 75,
      };
      const pending: MediaItem = { ...valid, id: 'pending', url: null, status: 'pending' };
      const failed: MediaItem = { ...valid, id: 'failed', url: null, status: 'failed' };
      const missing: MediaItem = { ...valid, id: 'missing', url: null, status: 'ready' };
      const wrong: MediaItem = {
        ...valid,
        id: 'wrong',
        type: mediaType === 'image' ? 'video' : 'image',
      };
      const service = makeService({
        list: vi.fn().mockResolvedValue({
          list: [valid, pending, failed, missing, wrong],
          pagination: { page: 1, pageSize: 24, total: 5, hasMore: false },
        }),
      });
      mountLibrary(service, { mediaType });
      await flush();

      expect(document.querySelectorAll('[data-available="false"]')).toHaveLength(4);
      expect(document.querySelector('[data-testid="select-media-1"]')?.getAttribute('aria-label')).toBe(
        `Select valid.${extension}`
      );
      expect(document.querySelector('[data-testid="move-media-media-1"]')?.getAttribute('aria-label')).toBe(
        `Choose a move destination for valid.${extension}`
      );
      expect(document.querySelector('[data-testid="confirm-move-media-media-1"]')?.getAttribute('aria-label')).toBe(
        `Move valid.${extension}`
      );
      expect(document.querySelector('[data-testid="delete-media-media-1"]')?.getAttribute('aria-label')).toBe(
        `Delete valid.${extension}`
      );
      expect(document.querySelector('[data-testid="select-pending"]')?.hasAttribute('disabled')).toBe(true);
      expect(document.querySelector('[data-testid="move-media-pending"]')).toBeNull();
      expect(document.querySelector('[data-testid="delete-media-pending"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="delete-media-failed"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="delete-media-wrong"]')).toBeNull();
      expect(document.body.textContent).toContain('Processing');
      expect(document.body.textContent).toContain('Media type mismatch');
      if (mediaType === 'image') {
        expect(document.querySelector('img[data-testid="media-preview"]')).not.toBeNull();
        expect(document.querySelector('.a9-media-item__preview')?.getAttribute('aria-label')).toBe('Preview valid.png');
      }
      if (mediaType === 'video') expect(document.querySelector('video')).not.toBeNull();
      if (mediaType === 'audio') expect(document.querySelector('audio')).not.toBeNull();
    }
  );
});
