/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, nextTick, type App, type ComponentPublicInstance } from 'vue';
import { Message } from '@arco-design/web-vue';
import type { Editor } from '@tiptap/core';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ATiptapEditor from '../src/components/tiptap-editor/index.vue';
import { messages } from '../src/locale';
import type { MediaItem, MediaPickerService } from '../src/services/types';

const mountedApps: App[] = [];

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean, type: String, size: String, loading: Boolean },
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

const UploadStub = defineComponent({
  emits: ['buttonClick'],
  setup(_, { emit, slots }) {
    return () => h('div', { class: 'upload-stub', onClick: () => emit('buttonClick') }, slots['upload-button']?.());
  },
});

const ModalStub = defineComponent({
  props: { visible: Boolean },
  emits: ['update:visible', 'close'],
  setup(props, { slots }) {
    return () =>
      props.visible
        ? h('section', { role: 'dialog', class: 'modal-stub' }, [
            h('header', slots.title?.()),
            slots.default?.(),
            h('footer', slots.footer?.()),
          ])
        : undefined;
  },
});

const RadioGroupStub = defineComponent({
  emits: ['change'],
  setup(_, { emit, slots }) {
    return () =>
      h(
        'div',
        {
          class: 'radio-group-stub',
          onClick: (event: Event) => {
            const option = (event.target as Element).closest<HTMLElement>('[data-radio-value]');
            if (option?.dataset.radioValue) emit('change', option.dataset.radioValue);
          },
        },
        slots.default?.()
      );
  },
});

const RadioStub = defineComponent({
  inheritAttrs: false,
  props: { value: { type: String, required: true }, disabled: Boolean },
  setup(props, { attrs, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          'type': 'button',
          'data-radio-value': props.value,
          'disabled': props.disabled,
        },
        slots.default?.()
      );
  },
});

const InputSearchStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue', 'search', 'clear'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        value: props.modelValue,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      });
  },
});

const TransparentStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.());
  },
});

const TooltipStub = defineComponent({
  setup(_, { slots }) {
    return () => h('span', [slots.default?.(), slots.content?.()]);
  },
});

const ImageStub = defineComponent({
  props: { src: String },
  setup(props) {
    return () => h('img', { src: props.src });
  },
});

const IconStub = defineComponent({
  setup() {
    return () => h('i');
  },
});

interface TiptapEditorInstance extends ComponentPublicInstance {
  getHTML: () => string;
}

const mediaItems: MediaItem[] = [
  {
    id: 'image-1',
    name: 'first.png',
    type: 'image',
    groupId: null,
    url: 'https://cdn.example.com/first.png',
    status: 'ready',
  },
  {
    id: 'image-2',
    name: 'second.png',
    type: 'image',
    groupId: null,
    url: 'https://cdn.example.com/second.png',
    status: 'ready',
  },
];

function makeBrowseOnlyService(): MediaPickerService {
  return {
    list: vi.fn().mockImplementation(({ page, pageSize, mediaType }) =>
      Promise.resolve({
        list: mediaItems.filter((item) => item.type === mediaType),
        pagination: { page, pageSize, total: mediaType === 'image' ? mediaItems.length : 0, hasMore: false },
      })
    ),
  };
}

function installStubs(app: App) {
  app.component('AButton', ButtonStub);
  app.component('AUpload', UploadStub);
  app.component('AModal', ModalStub);
  app.component('ARadioGroup', RadioGroupStub);
  app.component('ARadio', RadioStub);
  app.component('AInputSearch', InputSearchStub);
  app.component('ASelect', TransparentStub);
  app.component('AOption', TransparentStub);
  app.component('ASpace', TransparentStub);
  app.component('ATooltip', TooltipStub);
  app.component('ADropdown', TooltipStub);
  app.component('ADoption', TransparentStub);
  app.component('APopover', TooltipStub);
  app.component('AInput', InputSearchStub);
  app.component('AAlert', TransparentStub);
  app.component('ASpin', TransparentStub);
  app.component('AEmpty', TransparentStub);
  app.component('APagination', TransparentStub);
  app.component('ACheckboxGroup', TransparentStub);
  app.component('ACheckbox', TransparentStub);
  app.component('AImage', ImageStub);
  app.component('AImagePreview', TransparentStub);
  [
    'IconDown',
    'IconBold',
    'IconItalic',
    'IconUnderline',
    'IconStrikethrough',
    'IconUnorderedList',
    'IconOrderedList',
    'IconQuote',
    'IconMinus',
    'IconLink',
    'IconImage',
    'IconVideoCamera',
    'IconSound',
    'IconAlignLeft',
    'IconAlignCenter',
    'IconAlignRight',
    'IconUndo',
    'IconRedo',
    'IconCheck',
    'IconEdit',
    'IconSwap',
    'IconRefresh',
    'IconOriginalSize',
    'IconDelete',
    'IconFolder',
    'IconUpload',
    'IconEye',
    'IconPlayArrow',
  ].forEach((name) => app.component(name, IconStub));
}

function mountEditor(service = makeBrowseOnlyService()) {
  const app = createApp(ATiptapEditor, { service });
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  installStubs(app);
  mountedApps.push(app);
  return app.mount('#app') as TiptapEditorInstance;
}

async function flush() {
  await Promise.resolve();
  await nextTick();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  await nextTick();
}

function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  element.click();
}

function findButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.trim() === label
  );
}

function requireButton(label: string) {
  const button = findButton(label);
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

function openImagePicker() {
  click('button[aria-label="Insert image"]');
}

function getInternalEditor(instance: TiptapEditorInstance) {
  return (instance.$.setupState as { editor: Editor }).editor;
}

describe('ATiptapEditor with the real AMediaPicker', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    mountedApps.splice(0).forEach((app) => app.unmount());
    vi.restoreAllMocks();
  });

  it('uses a browse-only service and clears successful insert and same-type replacement selections', async () => {
    const service = makeBrowseOnlyService();
    const instance = mountEditor(service);
    await flush();

    expect(document.querySelector('.upload-stub .upload-stub')).toBeNull();
    openImagePicker();
    await flush();
    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'image' }));

    click('[data-radio-value="image-1"]');
    await nextTick();
    expect(requireButton('OK').disabled).toBe(false);
    requireButton('OK').click();
    await flush();
    expect(instance.getHTML()).toContain('https://cdn.example.com/first.png');

    openImagePicker();
    await flush();
    expect(requireButton('OK').disabled).toBe(true);
    requireButton('Cancel').click();

    const editor = getInternalEditor(instance);
    let imagePosition = -1;
    editor.state.doc.descendants((node, pos) => {
      if (imagePosition < 0 && node.type.name === 'blockImage') imagePosition = pos;
    });
    editor.commands.setNodeSelection(imagePosition);
    await flush();

    click('[data-media-replace] button[aria-label="Replace image"]');
    await flush();
    click('[data-radio-value="image-2"]');
    await nextTick();
    requireButton('OK').click();
    await flush();
    expect(instance.getHTML()).toContain('https://cdn.example.com/second.png');
    expect(instance.getHTML()).not.toContain('https://cdn.example.com/first.png');

    click('[data-media-replace] button[aria-label="Replace image"]');
    await flush();
    expect(requireButton('OK').disabled).toBe(true);
  });

  it('retains the confirmed picker value when the editor command fails so the user can retry', async () => {
    const instance = mountEditor();
    await flush();
    const editor = getInternalEditor(instance);
    const commandChain = {
      focus: vi.fn(),
      insertContent: vi.fn(),
      command: vi.fn(),
      run: vi.fn(() => false),
    };
    commandChain.focus.mockReturnValue(commandChain);
    commandChain.insertContent.mockReturnValue(commandChain);
    commandChain.command.mockReturnValue(commandChain);
    vi.spyOn(editor, 'chain').mockReturnValue(commandChain as unknown as ReturnType<Editor['chain']>);
    vi.spyOn(Message, 'error').mockImplementation(() => ({ close: vi.fn() }));

    openImagePicker();
    await flush();
    click('[data-radio-value="image-1"]');
    await nextTick();
    requireButton('OK').click();
    await flush();

    expect(instance.getHTML()).toBe('');
    openImagePicker();
    await flush();
    expect(requireButton('OK').disabled).toBe(false);
  });
});
