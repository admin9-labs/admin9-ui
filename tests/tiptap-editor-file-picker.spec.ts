/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, inject, nextTick, provide, type App, type ComponentPublicInstance } from 'vue';
import type { Editor } from '@tiptap/core';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ATiptapEditor from '../src/components/tiptap-editor/index.vue';
import { messages } from '../src/locale';
import type { FileItem, FileListParams, FilePickerAdapter } from '../src/services/types';

const mountedApps: App[] = [];

const files: Record<'image' | 'video' | 'audio', FileItem> = {
  image: {
    id: 'image-1',
    name: 'Cover image',
    type: 'image',
    groupId: null,
    url: '/media/cover.png',
    status: 'ready',
  },
  video: {
    id: 'video-1',
    name: 'Travel video',
    type: 'video',
    groupId: null,
    url: '/media/travel.mp4',
    status: 'ready',
  },
  audio: {
    id: 'audio-1',
    name: 'Audio guide',
    type: 'audio',
    groupId: null,
    url: '/media/guide.mp3',
    status: 'ready',
  },
};

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean, loading: Boolean, type: String, size: String },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          'disabled': props.disabled,
          'data-button-type': props.type,
          'data-button-size': props.size,
        },
        [slots.icon?.(), slots.default?.()]
      );
  },
});

const TransparentStub = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, [slots.default?.(), slots.content?.()]);
  },
});

const ModalStub = defineComponent({
  inheritAttrs: false,
  props: { visible: Boolean },
  emits: ['cancel'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      props.visible
        ? h('section', { ...attrs, 'data-testid': 'file-picker-modal' }, [
            slots.default?.(),
            slots.footer?.(),
            h('button', { 'data-testid': 'modal-cancel', 'onClick': () => emit('cancel') }, 'Cancel modal'),
          ])
        : null;
  },
});

const InputStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue', 'search', 'clear', 'pressEnter'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
        onKeydown: (event: KeyboardEvent) => {
          if (event.key === 'Enter') {
            emit('search');
            emit('pressEnter');
          }
        },
      });
  },
});

const radioGroupKey = Symbol('real-picker-radio-group');
const RadioGroupStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup(_, { attrs, emit, slots }) {
    provide(radioGroupKey, (value: string) => emit('update:modelValue', value));
    return () => h('div', attrs, slots.default?.());
  },
});

const RadioStub = defineComponent({
  inheritAttrs: false,
  props: { value: { type: String, default: '' }, disabled: Boolean },
  setup(props, { attrs, slots }) {
    const select = inject<(value: string) => void>(radioGroupKey, () => undefined);
    return () =>
      h(
        'button',
        {
          ...attrs,
          disabled: props.disabled,
          onClick: () => {
            if (!props.disabled) select(props.value);
          },
        },
        slots.default?.()
      );
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

function installStubs(app: App) {
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  app.component('AButton', ButtonStub);
  app.component('AModal', ModalStub);
  app.component('ATooltip', TransparentStub);
  app.component('AAlert', TransparentStub);
  app.component('ASpin', TransparentStub);
  app.component('AEmpty', TransparentStub);
  app.component('AImage', TransparentStub);
  app.component('AInput', InputStub);
  app.component('AInputSearch', InputStub);
  app.component('ASelect', SelectStub);
  app.component('AOption', OptionStub);
  app.component('ARadioGroup', RadioGroupStub);
  app.component('ARadio', RadioStub);
  app.component('APagination', TransparentStub);
  app.component('ADropdown', TransparentStub);
  app.component('ADoption', TransparentStub);
  app.component('APopover', TransparentStub);
  app.component('AUpload', TransparentStub);
  app.component('ACheckbox', TransparentStub);
  [
    'IconAlignCenter',
    'IconAlignLeft',
    'IconAlignRight',
    'IconApps',
    'IconArchive',
    'IconBold',
    'IconCheck',
    'IconClose',
    'IconDelete',
    'IconDown',
    'IconEdit',
    'IconFile',
    'IconFileAudio',
    'IconFileImage',
    'IconFilePdf',
    'IconFileVideo',
    'IconFolder',
    'IconImage',
    'IconItalic',
    'IconLaunch',
    'IconLink',
    'IconList',
    'IconMinus',
    'IconOrderedList',
    'IconOriginalSize',
    'IconQuote',
    'IconRedo',
    'IconRefresh',
    'IconSound',
    'IconStrikethrough',
    'IconSwap',
    'IconUnderline',
    'IconUndo',
    'IconUnorderedList',
    'IconUpload',
    'IconVideoCamera',
  ].forEach((name) => app.component(name, TransparentStub));
}

interface TiptapEditorInstance extends ComponentPublicInstance {
  getHTML: () => string;
}

async function flush() {
  await Promise.resolve();
  await nextTick();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await nextTick();
}

function makeService(currentFiles: Record<'image' | 'video' | 'audio', FileItem>) {
  const list = vi.fn((params: FileListParams) => {
    const type = params.fileType as 'image' | 'video' | 'audio';
    const item = currentFiles[type];
    return Promise.resolve({
      list: item ? [item] : [],
      pagination: { page: 1, pageSize: 24, total: item ? 1 : 0, hasMore: false },
    });
  });
  return { list } satisfies FilePickerAdapter;
}

function mountEditor(props: Record<string, unknown>) {
  const app = createApp(ATiptapEditor, props);
  installStubs(app);
  mountedApps.push(app);
  return app.mount('#app') as TiptapEditorInstance;
}

function internalEditor(instance: TiptapEditorInstance) {
  return (instance.$.setupState as { editor: Editor }).editor;
}

function selectMediaNode(editor: Editor, nodeName: 'blockImage' | 'video' | 'audio') {
  let position = -1;
  editor.state.doc.descendants((node, pos) => {
    if (position < 0 && node.type.name === nodeName) position = pos;
  });
  if (position < 0) throw new Error(`Missing ${nodeName} node`);
  editor.commands.setNodeSelection(position);
}

function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  element.click();
  return element;
}

function confirmPicker() {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-testid="file-picker-modal"] button')).find(
    (candidate) => candidate.textContent?.trim() === 'Confirm'
  );
  if (!button) throw new Error('Missing picker confirm button');
  button.click();
  return button;
}

describe('ATiptapEditor real AFilePicker integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    mountedApps.splice(0).forEach((app) => app.unmount());
    vi.restoreAllMocks();
  });

  it.each([
    ['image', 'Insert image', 'img', 'image'],
    ['video', 'Insert video', 'video', 'video'],
    ['audio', 'Insert audio', 'audio', 'audio'],
  ] as const)('opens the real picker, queries, and inserts %s', async (type, label, tagName, expectedType) => {
    const currentFiles = { ...files };
    const service = makeService(currentFiles);
    const instance = mountEditor({ modelValue: '<p>Before</p>', service });
    await flush();

    click(`button[aria-label="${label}"]`);
    await flush();

    expect(document.querySelector('[data-testid="file-picker-modal"]')).not.toBeNull();
    expect(service.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 24,
      keyword: undefined,
      fileType: expectedType,
      groupId: undefined,
    });
    click(`[data-file-id="${currentFiles[type].id}"] .a9-file-picker__checkbox`);
    confirmPicker();
    await flush();

    const media = new DOMParser().parseFromString(instance.getHTML(), 'text/html').querySelector(tagName);
    expect(media?.getAttribute('src')).toBe(currentFiles[type].url);
  });

  it('opens replacement with the selected media type and replaces only that node', async () => {
    const currentFiles = { ...files };
    const service = makeService(currentFiles);
    const instance = mountEditor({ modelValue: '<img src="/media/original.png" data-display="block">', service });
    await flush();
    selectMediaNode(internalEditor(instance), 'blockImage');
    await flush();

    currentFiles.image = { ...files.image, id: 'image-2', url: '/media/replacement.png' };
    click('button[aria-label="Replace image"]');
    await flush();

    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ fileType: 'image' }));
    click('[data-file-id="image-2"] .a9-file-picker__checkbox');
    confirmPicker();
    await flush();

    const documentHtml = new DOMParser().parseFromString(instance.getHTML(), 'text/html');
    expect(documentHtml.querySelectorAll('img')).toHaveLength(1);
    expect(documentHtml.querySelector('img')?.getAttribute('src')).toBe('/media/replacement.png');
  });

  it('does not mutate on cancel and does not duplicate on repeated confirm', async () => {
    const service = makeService({ ...files });
    const instance = mountEditor({ modelValue: '<p>Keep me</p>', service });
    await flush();
    const original = instance.getHTML();

    click('button[aria-label="Insert audio"]');
    await flush();
    click('[data-file-id="audio-1"] .a9-file-picker__checkbox');
    click('[data-testid="modal-cancel"]');
    await flush();
    expect(instance.getHTML()).toBe(original);

    click('button[aria-label="Insert audio"]');
    await flush();
    click('[data-file-id="audio-1"] .a9-file-picker__checkbox');
    const confirm = confirmPicker();
    confirm.click();
    await flush();
    expect(new DOMParser().parseFromString(instance.getHTML(), 'text/html').querySelectorAll('audio')).toHaveLength(1);
  });

  it('does not open while disabled and does not render picker triggers while readonly', async () => {
    const disabledService = makeService({ ...files });
    mountEditor({ modelValue: '<p>Disabled</p>', service: disabledService, disabled: true });
    await flush();
    const disabledTrigger = document.querySelector<HTMLButtonElement>('button[aria-label="Insert image"]');
    expect(disabledTrigger?.disabled).toBe(true);
    disabledTrigger?.click();
    await flush();
    expect(disabledService.list).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="file-picker-modal"]')).toBeNull();

    mountedApps.splice(0).forEach((app) => app.unmount());
    document.body.innerHTML = '<div id="app"></div>';
    const readonlyService = makeService({ ...files });
    mountEditor({ modelValue: '<p>Readonly</p>', service: readonlyService, readonly: true });
    await flush();
    expect(document.querySelector('button[aria-label="Insert image"]')).toBeNull();
    expect(readonlyService.list).not.toHaveBeenCalled();
  });
});
