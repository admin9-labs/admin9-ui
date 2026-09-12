/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, inject, nextTick, provide, ref, shallowRef, type App, type Ref } from 'vue';
import { Form, FormItem } from '@arco-design/web-vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ACoverPicker from '../src/components/cover-picker/index.vue';
import { messages } from '../src/locale';
import type { CoverPickerSize, CoverPickerValue } from '../src/components/cover-picker/types';
import type { FileItem, FileListResult, FilePickerAdapter } from '../src/services/types';

const mountedApps: App[] = [];

const images: FileItem[] = [
  {
    id: 'image-1',
    name: 'cover-one.png',
    type: 'image',
    groupId: null,
    url: '/images/cover-one.png',
    thumbnail: '/images/cover-one-thumb.png',
    status: 'ready',
  },
  {
    id: 'image-2',
    name: 'cover-two.png',
    type: 'image',
    groupId: null,
    url: '/images/cover-two.png',
    status: 'ready',
  },
  {
    id: 'image-3',
    name: 'cover-three.png',
    type: 'image',
    groupId: null,
    url: '/images/cover-three.png',
    status: 'ready',
  },
];

const documentItem: FileItem = {
  id: 'document-1',
  name: 'not-an-image.pdf',
  type: 'document',
  groupId: null,
  url: '/documents/not-an-image.pdf',
  status: 'ready',
};

const pendingImage: FileItem = {
  ...images[1],
  id: 'pending-image',
  status: 'pending',
};

const result = (list: FileItem[]): FileListResult => ({
  list,
  pagination: { page: 1, pageSize: 24, total: list.length, hasMore: false },
});

const service = (): FilePickerAdapter => ({
  list: vi.fn().mockResolvedValue(result(images)),
});

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
    return () =>
      props.visible
        ? h('div', { ...attrs, 'data-testid': 'file-picker-modal' }, [
            slots.default?.(),
            slots.footer?.(),
            h('button', { 'data-testid': 'modal-cancel', 'onClick': () => emit('cancel') }, 'Cancel modal'),
          ])
        : null;
  },
});

const InputSearchStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue', 'search', 'clear'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      });
  },
});

const ImageStub = defineComponent({
  props: { src: String },
  setup(props) {
    return () => h('div', { 'data-src': props.src });
  },
});

const PaginationStub = defineComponent({
  setup(_, { attrs }) {
    return () => h('div', attrs);
  },
});

const radioGroupKey = Symbol('cover-picker-radio-group');
const RadioGroupStub = defineComponent({
  props: { modelValue: { type: [String, Boolean], default: undefined } },
  emits: ['update:modelValue'],
  setup(_, { attrs, emit, slots }) {
    provide(radioGroupKey, (value: string | boolean) => emit('update:modelValue', value));
    return () => h('div', attrs, slots.default?.());
  },
});

const RadioStub = defineComponent({
  props: { value: { type: [String, Boolean], required: true }, disabled: Boolean },
  setup(props, { attrs, slots }) {
    const updateGroup = inject<(value: string | boolean) => void>(radioGroupKey, () => undefined);
    return () =>
      h(
        'button',
        {
          ...attrs,
          'disabled': props.disabled,
          'data-value': String(props.value),
          'onClick': () => {
            if (!props.disabled) updateGroup(props.value);
          },
        },
        slots.default?.()
      );
  },
});

function installStubs(app: App) {
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  app.component('AButton', ButtonStub);
  app.component('AModal', ModalStub);
  app.component('ATooltip', Transparent);
  app.component('AAlert', Transparent);
  app.component('ASpin', Transparent);
  app.component('AEmpty', Transparent);
  app.component('AImage', ImageStub);
  app.component('AInputSearch', InputSearchStub);
  app.component('APagination', PaginationStub);
  app.component('ASelect', Transparent);
  app.component('AOption', Transparent);
  app.component('ACheckbox', Transparent);
  app.component('ARadioGroup', RadioGroupStub);
  app.component('ARadio', RadioStub);
  [
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
    'IconEdit',
    'IconImageClose',
    'IconLaunch',
    'IconList',
    'IconPlus',
    'IconRefresh',
  ].forEach((name) => app.component(name, Transparent));
}

interface MountOptions {
  value?: CoverPickerValue;
  pickerService?: FilePickerAdapter;
  disabled?: Ref<boolean>;
  formDisabled?: Ref<boolean>;
  size?: Ref<CoverPickerSize | undefined>;
}

function mountCoverPicker({
  value = { mode: 'single', images: [null] },
  pickerService = service(),
  disabled = ref(false),
  formDisabled,
  size = ref<CoverPickerSize>(),
}: MountOptions = {}) {
  const model = ref<CoverPickerValue>(value);
  const serviceRef = shallowRef(pickerService);
  const emitted: Record<string, unknown[][]> = {};
  const capture =
    (name: string) =>
    (...args: unknown[]) => {
      (emitted[name] ??= []).push(args);
    };
  const Host = defineComponent({
    setup() {
      const renderPicker = () =>
        h(ACoverPicker, {
          'modelValue': model.value,
          'service': serviceRef.value,
          'disabled': disabled.value,
          'size': size.value,
          'onUpdate:modelValue': (next: CoverPickerValue) => {
            model.value = next;
            capture('update:modelValue')(next);
          },
          'onChange': capture('change'),
          'onVisibleChange': capture('visibleChange'),
        });
      return () =>
        formDisabled
          ? h(
              Form,
              { model: { cover: model.value }, disabled: formDisabled.value },
              { default: () => h(FormItem, { field: 'cover' }, { default: renderPicker }) }
            )
          : renderPicker();
    },
  });
  const app = createApp(Host);
  installStubs(app);
  app.mount('#app');
  mountedApps.push(app);
  return { app, disabled, emitted, model, pickerService, serviceRef, size };
}

function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  element.click();
}

function selectFile(id: string) {
  click(`[data-file-id="${id}"] .a9-file-picker__checkbox`);
}

function confirmFilePicker() {
  const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.trim() === 'Confirm');
  if (!button) throw new Error('Missing file picker confirm button');
  button.click();
}

describe('ACoverPicker', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    mountedApps.splice(0).forEach((app) => app.unmount());
  });

  it('preserves fixed triple positions while selecting and removing images', async () => {
    const { emitted, model, pickerService } = mountCoverPicker({
      value: { mode: 'triple', images: [images[0], null, null] },
    });
    await flush();

    click('[data-testid="cover-picker-slot-2"]');
    await flush();
    expect(pickerService.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 24,
      keyword: undefined,
      fileType: 'image',
      groupId: undefined,
    });
    selectFile('image-3');
    confirmFilePicker();
    await flush();

    expect(model.value).toEqual({ mode: 'triple', images: [images[0], null, images[2]] });
    click('[data-testid="cover-picker-slot-1"]');
    await flush();
    expect(document.querySelector('.a9-file-picker__footer-status')?.textContent).toContain('0 selected');
    click('[data-testid="modal-cancel"]');
    await flush();
    click('[data-testid="cover-picker-remove-0"]');
    await flush();
    expect(model.value).toEqual({ mode: 'triple', images: [null, null, images[2]] });
    expect(emitted.change).toHaveLength(2);
  });

  it('normalizes mode changes without retaining discarded image drafts', async () => {
    const { model } = mountCoverPicker({
      value: { mode: 'triple', images: [null, images[1], images[2]] },
    });
    await flush();

    click('[data-testid="cover-picker-mode-single"]');
    await flush();
    expect(model.value).toEqual({ mode: 'single', images: [images[1]] });

    click('[data-testid="cover-picker-mode-triple"]');
    await flush();
    expect(model.value).toEqual({ mode: 'triple', images: [images[1], null, null] });

    click('[data-testid="cover-picker-mode-none"]');
    await flush();
    expect(model.value).toEqual({ mode: 'none', images: [] });

    click('[data-testid="cover-picker-mode-triple"]');
    await flush();
    expect(model.value).toEqual({ mode: 'triple', images: [null, null, null] });
  });

  it('keeps cancelled and equivalent picker confirmations silent', async () => {
    const { emitted, model } = mountCoverPicker({ value: { mode: 'single', images: [images[0]] } });
    await flush();

    click('[data-testid="cover-picker-slot-0"]');
    await flush();
    click('[data-testid="modal-cancel"]');
    await flush();
    expect(model.value).toEqual({ mode: 'single', images: [images[0]] });
    expect(emitted.change).toBeUndefined();

    click('[data-testid="cover-picker-slot-0"]');
    await flush();
    confirmFilePicker();
    await flush();
    expect(emitted.change).toBeUndefined();
    expect(document.activeElement).toBe(document.querySelector('[data-testid="cover-picker-slot-0"]'));
  });

  it('clears the active position when the picker confirms no eligible item', async () => {
    const unavailable = { ...images[0], url: null, status: 'failed' as const };
    const pickerService: FilePickerAdapter = {
      list: vi.fn().mockResolvedValue(result([unavailable])),
    };
    const { emitted, model } = mountCoverPicker({
      value: { mode: 'single', images: [images[0]] },
      pickerService,
    });
    await flush();

    click('[data-testid="cover-picker-slot-0"]');
    await flush();
    expect(document.querySelector('.a9-file-picker__footer-status')?.textContent).toContain('0 selected');
    confirmFilePicker();
    await flush();

    expect(model.value).toEqual({ mode: 'single', images: [null] });
    expect(emitted.change).toEqual([[{ mode: 'single', images: [null] }]]);
  });

  it('inherits a disabled form state for every interaction entry point', async () => {
    const formDisabled = ref(true);
    mountCoverPicker({ value: { mode: 'single', images: [images[0]] }, formDisabled });
    await flush();

    expect(document.querySelector<HTMLButtonElement>('[data-testid="cover-picker-slot-0"]')?.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('[data-testid="cover-picker-remove-0"]')?.disabled).toBe(true);
    click('[data-testid="cover-picker-slot-0"]');
    await flush();
    expect(document.querySelector('[data-testid="file-picker-modal"]')).toBeNull();

    formDisabled.value = false;
    await flush();
    click('[data-testid="cover-picker-slot-0"]');
    await flush();
    expect(document.querySelector('[data-testid="file-picker-modal"]')).not.toBeNull();

    formDisabled.value = true;
    await flush();
    expect(document.querySelector('[data-testid="file-picker-modal"]')).toBeNull();
  });

  it('defaults to medium and keeps the active draft and target when size changes', async () => {
    const { size, model, emitted, pickerService } = mountCoverPicker({
      value: { mode: 'triple', images: [images[0], null, null] },
    });
    await flush();
    expect(document.querySelector('.a9-cover-picker--medium')).not.toBeNull();
    const initialValue = model.value;
    const originalButton = document.querySelector('[data-testid="cover-picker-slot-2"]');
    click('[data-testid="cover-picker-slot-2"]');
    await flush();
    selectFile('image-3');
    await flush();
    const modal = document.querySelector('[data-testid="file-picker-modal"]');

    const checkSize = async (nextSize: CoverPickerSize) => {
      size.value = nextSize;
      await flush();
      expect(document.querySelector(`.a9-cover-picker--${nextSize}`)).not.toBeNull();
      expect(document.querySelector('[data-testid="file-picker-modal"]')).toBe(modal);
      expect(document.querySelector('[data-testid="cover-picker-slot-2"]')).toBe(originalButton);
      expect(document.querySelector('[data-file-id="image-3"]')?.classList.contains('is-selected')).toBe(true);
      expect(model.value).toBe(initialValue);
      expect(emitted.change).toBeUndefined();
      expect(emitted['update:modelValue']).toBeUndefined();
      expect(emitted.visibleChange).toEqual([[true]]);
      expect(pickerService.list).toHaveBeenCalledTimes(1);
    };
    await checkSize('small');
    await checkSize('large');
    await checkSize('medium');

    confirmFilePicker();
    await flush();
    expect(model.value).toEqual({ mode: 'triple', images: [images[0], null, images[2]] });
    expect(emitted.change).toHaveLength(1);
    expect(emitted['update:modelValue']).toHaveLength(1);
    expect(document.activeElement).toBe(originalButton);
  });

  it('commits normalized slots after explicitly confirming an unchanged valid slot', async () => {
    const { model, emitted } = mountCoverPicker({ value: { mode: 'triple', images: [images[0], pendingImage, null] } });
    await flush();
    expect(emitted.change).toBeUndefined();
    click('[data-testid="cover-picker-slot-0"]');
    await flush();
    click('.a9-file-picker__footer-actions button:last-child');
    await flush();
    expect(model.value).toEqual({ mode: 'triple', images: [images[0], null, null] });
    expect(emitted.change).toHaveLength(1);
  });

  it('displays invalid external image slots as empty without changing the parent model', async () => {
    const malformed = {
      mode: 'triple',
      images: [documentItem, pendingImage, images[2]],
    } as unknown as CoverPickerValue;
    const { emitted, model } = mountCoverPicker({ value: malformed });
    await flush();

    expect(model.value).toEqual(malformed);
    expect(emitted['update:modelValue']).toBeUndefined();
    expect(emitted.change).toBeUndefined();
    expect(document.querySelector('[data-testid="cover-picker-preview-0"]')).toBeNull();
    expect(document.querySelector('[data-testid="cover-picker-preview-1"]')).toBeNull();
    expect(document.querySelector('[data-testid="cover-picker-preview-2"]')).not.toBeNull();
  });

  it('closes an active selection when disabled or externally replaced and ignores the old operation', async () => {
    const disabled = ref(false);
    const mounted = mountCoverPicker({ value: { mode: 'single', images: [null] }, disabled });
    await flush();

    click('[data-testid="cover-picker-slot-0"]');
    await flush();
    expect(document.querySelector('[data-testid="file-picker-modal"]')).not.toBeNull();
    disabled.value = true;
    await flush();
    expect(document.querySelector('[data-testid="file-picker-modal"]')).toBeNull();
    expect(document.querySelector<HTMLButtonElement>('[data-testid="cover-picker-slot-0"]')?.disabled).toBe(true);

    disabled.value = false;
    await flush();
    click('[data-testid="cover-picker-slot-0"]');
    await flush();
    mounted.model.value = { mode: 'single', images: [images[1]] };
    await flush();
    expect(document.querySelector('[data-testid="file-picker-modal"]')).toBeNull();
    expect(mounted.model.value).toEqual({ mode: 'single', images: [images[1]] });

    click('[data-testid="cover-picker-slot-0"]');
    await flush();
    expect(document.querySelector('[data-testid="file-picker-modal"]')).not.toBeNull();
    mounted.serviceRef.value = service();
    await flush();
    expect(document.querySelector('[data-testid="file-picker-modal"]')).toBeNull();
    expect(mounted.model.value).toEqual({ mode: 'single', images: [images[1]] });
  });

  it('falls back from thumbnail to source and then to an accessible placeholder', async () => {
    mountCoverPicker({ value: { mode: 'single', images: [images[0]] } });
    await flush();

    const preview = document.querySelector<HTMLImageElement>('[data-testid="cover-picker-preview-0"]');
    expect(preview?.getAttribute('src')).toBe('/images/cover-one-thumb.png');
    preview?.dispatchEvent(new Event('error'));
    await nextTick();
    expect(preview?.getAttribute('src')).toBe('/images/cover-one.png');
    preview?.dispatchEvent(new Event('error'));
    await nextTick();
    expect(document.querySelector('[data-testid="cover-picker-preview-fallback-0"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="cover-picker-slot-0"]')?.getAttribute('aria-label')).toContain(
      'cover-one.png'
    );
  });
});
