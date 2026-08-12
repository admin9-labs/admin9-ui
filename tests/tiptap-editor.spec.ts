/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, nextTick, ref, type App, type ComponentPublicInstance } from 'vue';
import { Message } from '@arco-design/web-vue';
import type { Editor } from '@tiptap/core';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { NodeSelection } from '@tiptap/pm/state';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ATiptapEditor from '../src/components/tiptap-editor/index.vue';
import { messages } from '../src/locale';

vi.mock('../src/components/media-picker/index.vue', async () => {
  const vue = await import('vue');
  const selectedMedia = {
    image: {
      id: 'image-1',
      name: 'Admin9 cover',
      type: 'image',
      groupId: null,
      url: 'https://cdn.example.com/admin9-cover.png',
    },
    video: {
      id: 'video-1',
      name: 'Admin9 demo',
      type: 'video',
      groupId: null,
      url: 'https://cdn.example.com/admin9-demo.mp4',
    },
    audio: {
      id: 'audio-1',
      name: 'Admin9 theme',
      type: 'audio',
      groupId: null,
      url: 'https://cdn.example.com/admin9-theme.mp3',
    },
  };

  return {
    default: vue.defineComponent({
      name: 'AMediaPickerStub',
      inheritAttrs: false,
      props: {
        modelValue: Object,
        mediaType: { type: String, default: 'image' },
        valueType: { type: String, default: 'item' },
      },
      emits: ['change', 'update:modelValue', 'visible-change'],
      setup(props, { attrs, emit, slots }) {
        return () => {
          const mediaType = props.mediaType as keyof typeof selectedMedia;
          const selectedItem = selectedMedia[mediaType];
          const wrongType = mediaType === 'image' ? 'video' : 'image';
          const invalidItems = [
            { ...selectedItem, id: `${mediaType}-wrong-type`, type: wrongType },
            { ...selectedItem, id: `${mediaType}-missing-url`, url: null },
            {
              ...selectedItem,
              id: `${mediaType}-unsafe-url`,
              url: ['java', 'script:alert(1)'].join(''),
            },
          ];
          const replacementItem = {
            ...selectedItem,
            id: `${mediaType}-replacement`,
            name: `${selectedItem.name} replacement`,
            url: selectedItem.url.replace('.', '-replacement.'),
          };

          return vue.h(
            'div',
            {
              ...attrs,
              'data-model-id': (props.modelValue as { id?: string } | undefined)?.id ?? '',
              'data-value-type': props.valueType,
            },
            [
              slots.trigger?.(),
              vue.h(
                'button',
                {
                  class: 'media-picker-open',
                  onClick: () => emit('visible-change', true),
                },
                'Open picker'
              ),
              vue.h(
                'button',
                {
                  class: 'media-picker-close',
                  onClick: () => emit('visible-change', false),
                },
                'Close picker'
              ),
              vue.h(
                'button',
                {
                  class: 'media-picker-confirm',
                  onClick: () => {
                    emit('change', [attrs['data-media-replace'] !== undefined ? replacementItem : selectedItem]);
                    emit('update:modelValue', selectedItem);
                  },
                },
                'Confirm image'
              ),
              vue.h(
                'button',
                {
                  class: 'media-picker-mixed',
                  onClick: () =>
                    emit('change', [
                      ...invalidItems,
                      attrs['data-media-replace'] !== undefined ? replacementItem : selectedItem,
                    ]),
                },
                'Confirm mixed media'
              ),
              vue.h(
                'button',
                {
                  class: 'media-picker-invalid',
                  onClick: () => emit('change', invalidItems),
                },
                'Confirm invalid media'
              ),
              vue.h(
                'button',
                {
                  class: 'media-picker-clear',
                  onClick: () => {
                    emit('change', []);
                    emit('update:modelValue', undefined);
                  },
                },
                'Clear selection'
              ),
            ]
          );
        };
      },
    }),
  };
});

const mountedApps: App[] = [];

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { disabled: Boolean, type: String, size: String },
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
  props: { content: String },
  setup(props, { slots }) {
    return () => h('span', { 'data-tooltip-content': props.content }, [slots.default?.(), slots.content?.()]);
  },
});

const PopoverStub = defineComponent({
  props: { popupVisible: Boolean },
  emits: ['update:popupVisible'],
  setup(props, { emit, slots }) {
    return () =>
      h(
        'span',
        {
          class: 'popover-stub',
          onClickCapture: () => {
            if (!props.popupVisible) emit('update:popupVisible', true);
          },
        },
        [slots.default?.(), props.popupVisible ? slots.content?.() : undefined]
      );
  },
});

const InputStub = defineComponent({
  props: { modelValue: String, placeholder: String },
  emits: ['update:modelValue', 'pressEnter'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        value: props.modelValue,
        placeholder: props.placeholder,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
        onKeydown: (event: KeyboardEvent) => {
          if (event.key === 'Enter') emit('pressEnter');
        },
      });
  },
});

const IconStub = defineComponent({
  setup() {
    return () => h('i');
  },
});

interface TiptapEditorInstance extends ComponentPublicInstance {
  focus: () => boolean;
  clear: () => boolean;
  getHTML: () => string;
}

async function flush() {
  await Promise.resolve();
  await nextTick();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  await nextTick();
}

async function waitForEditorStateRender() {
  // Tiptap publishes its reactive editor state after two animation frames.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await nextTick();
}

function installStubs(app: App) {
  app.component('AButton', ButtonStub);
  app.component('ATooltip', TransparentStub);
  app.component('ADropdown', TransparentStub);
  app.component('ADoption', TransparentStub);
  app.component('APopover', PopoverStub);
  app.component('AInput', InputStub);
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
  ].forEach((name) => app.component(name, IconStub));
}

function mountEditor(props: Record<string, unknown> = {}) {
  const app = createApp(ATiptapEditor, props);
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  installStubs(app);
  mountedApps.push(app);
  return app.mount('#app') as TiptapEditorInstance;
}

function getInternalEditor(instance: TiptapEditorInstance) {
  return (instance.$.setupState as { editor: Editor }).editor;
}

function findNodePosition(editor: Editor, nodeName: string) {
  let position = -1;
  editor.state.doc.descendants((node, pos) => {
    if (position < 0 && node.type.name === nodeName) position = pos;
  });
  if (position < 0) throw new Error(`Node ${nodeName} was not found`);
  return position;
}

describe('ATiptapEditor public contract', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    mountedApps.splice(0).forEach((app) => app.unmount());
    vi.restoreAllMocks();
  });

  it('renders HTML, reports characters, and normalizes a cleared document to an empty string', async () => {
    const onUpdate = vi.fn();
    const onChange = vi.fn();
    const instance = mountEditor({
      'modelValue': '<p>Hello <strong>Admin9</strong></p>',
      'maxLength': 50,
      'onUpdate:modelValue': onUpdate,
      'onChange': onChange,
    });
    await flush();

    expect(instance.getHTML()).toBe('<p>Hello <strong>Admin9</strong></p>');
    expect(document.querySelector('.a9-tiptap-editor__prose')?.textContent).toBe('Hello Admin9');
    expect(document.querySelector('.a9-tiptap-editor__footer')?.textContent).toContain('12 / 50 characters');

    expect(instance.clear()).toBe(true);
    await flush();
    expect(instance.getHTML()).toBe('');
    expect(onUpdate).toHaveBeenLastCalledWith('');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('toggles the focused class with the editable surface focus state', async () => {
    mountEditor();
    await flush();
    const root = document.querySelector<HTMLElement>('.a9-tiptap-editor');
    const prose = document.querySelector<HTMLElement>('.a9-tiptap-editor__prose');

    if (!root || !prose) throw new Error('ATiptapEditor did not mount');

    prose.focus();
    await nextTick();
    expect(root.classList.contains('is-focused')).toBe(true);

    prose.blur();
    await nextTick();
    expect(root.classList.contains('is-focused')).toBe(false);
  });

  it('keeps ordinary toolbar actions neutral and reserves primary state for active formatting', async () => {
    const instance = mountEditor({ modelValue: '<p>Toolbar state</p>', service: {} });
    await flush();

    const ordinaryLabels = ['Bold', 'Italic', 'Insert image', 'Insert video', 'Insert audio', 'Undo', 'Redo'];
    ordinaryLabels.forEach((label) => {
      expect(document.querySelector(`button[aria-label="${label}"]`)?.getAttribute('data-button-type')).toBe('text');
    });
    const boldButton = document.querySelector<HTMLButtonElement>('button[aria-label="Bold"]');
    expect(boldButton?.getAttribute('aria-pressed')).toBe('false');

    const internalEditor = getInternalEditor(instance);
    internalEditor.chain().setTextSelection({ from: 1, to: 8 }).toggleBold().run();
    expect(internalEditor.isActive('bold')).toBe(true);
    await waitForEditorStateRender();

    expect(document.querySelector('button[aria-label="Bold"]')?.getAttribute('data-button-type')).toBe('primary');
    expect(document.querySelector('button[aria-label="Bold"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('button[aria-label="Italic"]')?.getAttribute('data-button-type')).toBe('text');
    expect(document.querySelector('button[aria-label="Italic"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('maps numeric and string workspace heights while keeping minHeight and maxHeight together', async () => {
    const Root = defineComponent({
      setup() {
        return () =>
          h('div', [
            h(ATiptapEditor, { minHeight: 180, maxHeight: 420 }),
            h(ATiptapEditor, { minHeight: '12rem', maxHeight: 'min(36rem, 55dvh)' }),
          ]);
      },
    });
    const app = createApp(Root);
    app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
    installStubs(app);
    mountedApps.push(app);
    app.mount('#app');
    await flush();

    const editors = document.querySelectorAll<HTMLElement>('.a9-tiptap-editor');
    expect(editors[0]?.style.getPropertyValue('--a9-tiptap-editor-min-height')).toBe('180px');
    expect(editors[0]?.style.getPropertyValue('--a9-tiptap-editor-max-height')).toBe('420px');
    expect(editors[1]?.style.getPropertyValue('--a9-tiptap-editor-min-height')).toBe('12rem');
    expect(editors[1]?.style.getPropertyValue('--a9-tiptap-editor-max-height')).toBe('min(36rem, 55dvh)');
  });

  it('portals media controls without changing editor geometry or scroll state', async () => {
    const instance = mountEditor({
      modelValue: '<p>Before</p><img src="/tall.png" data-display="block" data-width="100%" data-align="left">',
      service: {},
      maxHeight: 400,
    });
    await flush();

    const root = document.querySelector<HTMLElement>('.a9-tiptap-editor');
    const toolbar = document.querySelector<HTMLElement>('.a9-tiptap-editor__toolbar');
    const content = document.querySelector<HTMLElement>('.a9-tiptap-editor__content');
    const footer = document.querySelector<HTMLElement>('.a9-tiptap-editor__footer');
    const media = document.querySelector<HTMLElement>('[data-media-node="blockImage"]');
    if (!root || !toolbar || !content || !footer || !media) throw new Error('Editor workspace did not mount');

    expect(toolbar.parentElement).toBe(root);
    expect(content.parentElement).toBe(root);
    expect(footer.parentElement).toBe(root);
    expect(content.contains(document.querySelector('.a9-tiptap-editor__prose'))).toBe(true);
    expect(content.contains(toolbar)).toBe(false);
    expect(content.contains(footer)).toBe(false);
    expect(content.getAttribute('role')).toBe('region');

    content.scrollTop = 100;
    root.getBoundingClientRect = () => new DOMRect(10, 40, 620, 480);
    content.getBoundingClientRect = () => new DOMRect(20, 100, 600, 400);
    media.getBoundingClientRect = () => new DOMRect(40, 40, 560, 700);
    const rootHeight = root.getBoundingClientRect().height;
    const contentHeight = content.getBoundingClientRect().height;
    const pageScrollY = window.scrollY;
    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.setNodeSelection(findNodePosition(internalEditor, 'blockImage'));
    await flush();

    const mediaToolbar = document.querySelector<HTMLElement>('.a9-tiptap-editor__media-toolbar');
    const mediaBubble = document.querySelector<HTMLElement>('.a9-tiptap-editor__media-bubble');
    expect(mediaToolbar?.parentElement).toBe(mediaBubble);
    expect(mediaBubble?.parentElement).toBe(document.body);
    expect(root.contains(mediaToolbar)).toBe(false);
    expect(content.contains(mediaToolbar)).toBe(false);
    expect(mediaBubble?.style.visibility).toBe('visible');
    expect(root.getBoundingClientRect().height).toBe(rootHeight);
    expect(content.getBoundingClientRect().height).toBe(contentHeight);
    expect(content.scrollTop).toBe(100);
    expect(window.scrollY).toBe(pageScrollY);

    document.querySelector('[data-media-replace]')?.querySelector<HTMLButtonElement>('.media-picker-open')?.click();
    await flush();
    expect(mediaBubble?.style.visibility).toBe('hidden');
    expect(mediaBubble?.style.pointerEvents).toBe('none');
    expect(mediaBubble?.getAttribute('aria-hidden')).toBe('true');
    expect(mediaBubble?.inert).toBe(true);
    expect(internalEditor.state.selection).toBeInstanceOf(NodeSelection);

    document.querySelector('[data-media-replace]')?.querySelector<HTMLButtonElement>('.media-picker-close')?.click();
    await flush();
    expect(mediaBubble?.style.visibility).toBe('visible');
    expect(mediaBubble?.style.pointerEvents).toBe('');
    expect(mediaBubble?.hasAttribute('aria-hidden')).toBe(false);
    expect(mediaBubble?.inert).toBe(false);
    expect(internalEditor.state.selection).toBeInstanceOf(NodeSelection);

    mediaToolbar?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    document.querySelector<HTMLButtonElement>('button[data-media-width="50%"]')?.click();
    await flush();
    expect(internalEditor.state.selection).toBeInstanceOf(NodeSelection);
    expect(content.scrollTop).toBe(100);

    media.getBoundingClientRect = () => new DOMRect(40, 520, 560, 700);
    content.dispatchEvent(new Event('scroll'));
    await flush();
    expect(mediaBubble?.style.visibility).toBe('hidden');

    media.getBoundingClientRect = () => new DOMRect(40, 250, 560, 700);
    content.dispatchEvent(new Event('scroll'));
    await flush();
    expect(mediaBubble?.style.visibility).toBe('visible');
    expect(root.getBoundingClientRect().height).toBe(rootHeight);
    expect(content.getBoundingClientRect().height).toBe(contentHeight);
    expect(content.scrollTop).toBe(100);
    expect(window.scrollY).toBe(pageScrollY);

    internalEditor.commands.setTextSelection(1);
    await flush();
    expect(document.querySelector('.a9-tiptap-editor__media-toolbar')).toBeNull();
    expect(root.getBoundingClientRect().height).toBe(rootHeight);
    expect(content.getBoundingClientRect().height).toBe(contentHeight);
    expect(content.scrollTop).toBe(100);
    expect(window.scrollY).toBe(pageScrollY);
  });

  it('syncs controlled model changes without emitting a duplicate update', async () => {
    const value = ref('<p>First</p>');
    const onUpdate = vi.fn((nextValue: string) => {
      value.value = nextValue;
    });
    const Root = defineComponent({
      setup() {
        return () =>
          h(ATiptapEditor, {
            'modelValue': value.value,
            'onUpdate:modelValue': onUpdate,
          });
      },
    });
    const app = createApp(Root);
    app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
    installStubs(app);
    mountedApps.push(app);
    app.mount('#app');
    await flush();

    value.value = '<h2>Replacement</h2>';
    await flush();

    expect(document.querySelector('.a9-tiptap-editor__prose h2')?.textContent).toBe('Replacement');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('supports disabled and readonly presentation states', async () => {
    mountEditor({ modelValue: '<p>Locked</p>', disabled: true, minHeight: 160, maxHeight: 320 });
    await flush();

    const disabledRoot = document.querySelector<HTMLElement>('.a9-tiptap-editor');
    const disabledContent = document.querySelector<HTMLElement>('.a9-tiptap-editor__content');
    expect(disabledRoot?.classList.contains('is-disabled')).toBe(true);
    expect(disabledRoot?.style.getPropertyValue('--a9-tiptap-editor-min-height')).toBe('160px');
    expect(disabledRoot?.style.getPropertyValue('--a9-tiptap-editor-max-height')).toBe('320px');
    expect(disabledContent?.parentElement).toBe(disabledRoot);
    expect(document.querySelector('.a9-tiptap-editor__footer')?.parentElement).toBe(disabledRoot);
    expect(document.querySelector('.a9-tiptap-editor__prose')?.getAttribute('contenteditable')).toBe('false');
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Bold"]')?.disabled).toBe(true);
    expect(document.querySelector('button[aria-label="Bold"]')?.getAttribute('data-button-type')).toBe('text');
    expect(document.querySelector('button[aria-label="Bold"]')?.getAttribute('aria-pressed')).toBe('false');

    mountedApps.splice(0).forEach((app) => app.unmount());
    document.body.innerHTML = '<div id="app"></div>';
    mountEditor({ modelValue: '<p>Read only</p>', readonly: true, maxHeight: '48dvh' });
    await flush();

    const readonlyRoot = document.querySelector<HTMLElement>('.a9-tiptap-editor');
    expect(readonlyRoot?.classList.contains('is-readonly')).toBe(true);
    expect(readonlyRoot?.style.getPropertyValue('--a9-tiptap-editor-max-height')).toBe('48dvh');
    expect(document.querySelector('.a9-tiptap-editor__content')?.parentElement).toBe(readonlyRoot);
    expect(document.querySelector('.a9-tiptap-editor__footer')?.parentElement).toBe(readonlyRoot);
    expect(document.querySelector('.a9-tiptap-editor__toolbar')).toBeNull();
    expect(document.querySelector('.a9-tiptap-editor__media-toolbar')).toBeNull();
    expect(document.querySelector('.a9-tiptap-editor__prose')?.getAttribute('contenteditable')).toBe('false');
  });

  it('updates readonly and disabled root states dynamically', async () => {
    const mode = ref<'normal' | 'readonly' | 'disabled'>('normal');
    const editorRef = ref<TiptapEditorInstance>();
    const Root = defineComponent({
      setup() {
        return () =>
          h(ATiptapEditor, {
            ref: editorRef,
            modelValue: '<p>Dynamic state</p><audio src="/dynamic.mp3"></audio>',
            readonly: mode.value === 'readonly',
            disabled: mode.value === 'disabled',
          });
      },
    });
    const app = createApp(Root);
    app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
    installStubs(app);
    mountedApps.push(app);
    app.mount('#app');
    await flush();

    const root = document.querySelector<HTMLElement>('.a9-tiptap-editor');
    const audioWrapper = document.querySelector<HTMLElement>('[data-media-node="audio"]');
    const editorInstance = editorRef.value;
    if (!editorInstance) throw new Error('ATiptapEditor did not mount');
    const internalEditor = getInternalEditor(editorInstance);
    document.querySelector<HTMLAudioElement>('audio')?.click();
    await flush();
    expect(internalEditor.state.selection).toBeInstanceOf(NodeSelection);
    expect(audioWrapper?.classList.contains('is-selected')).toBe(true);
    expect(audioWrapper?.classList.contains('ProseMirror-selectednode')).toBe(true);
    expect(document.querySelector('.a9-tiptap-editor__media-toolbar')).not.toBeNull();

    mode.value = 'readonly';
    await flush();
    expect(root?.classList.contains('is-readonly')).toBe(true);
    expect(internalEditor.state.selection).not.toBeInstanceOf(NodeSelection);
    expect(audioWrapper?.classList.contains('is-selected')).toBe(false);
    expect(audioWrapper?.classList.contains('ProseMirror-selectednode')).toBe(false);
    expect(document.querySelector('.a9-tiptap-editor__toolbar')).toBeNull();
    expect(document.querySelector('.a9-tiptap-editor__media-toolbar')).toBeNull();
    expect(document.querySelector('audio')?.hasAttribute('controls')).toBe(true);

    mode.value = 'normal';
    await flush();
    document.querySelector<HTMLAudioElement>('audio')?.click();
    await flush();
    expect(internalEditor.state.selection).toBeInstanceOf(NodeSelection);
    expect(audioWrapper?.classList.contains('is-selected')).toBe(true);
    expect(audioWrapper?.classList.contains('ProseMirror-selectednode')).toBe(true);
    expect(document.querySelector('.a9-tiptap-editor__media-toolbar')).not.toBeNull();

    mode.value = 'disabled';
    await flush();
    expect(root?.classList.contains('is-readonly')).toBe(false);
    expect(root?.classList.contains('is-disabled')).toBe(true);
    expect(internalEditor.state.selection).not.toBeInstanceOf(NodeSelection);
    expect(audioWrapper?.classList.contains('is-selected')).toBe(false);
    expect(audioWrapper?.classList.contains('ProseMirror-selectednode')).toBe(false);
    expect(document.querySelector('.a9-tiptap-editor__media-toolbar')).toBeNull();
    expect(document.querySelector('audio')?.hasAttribute('controls')).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Bold"]')?.disabled).toBe(true);
  });

  it('falls back to a non-node selection when readonly media has no textblock', async () => {
    const readonly = ref(false);
    const modelValue = ref('<audio src="/only-audio.mp3"></audio>');
    const editorRef = ref<TiptapEditorInstance>();
    const Root = defineComponent({
      setup() {
        return () =>
          h(ATiptapEditor, {
            ref: editorRef,
            modelValue: modelValue.value,
            readonly: readonly.value,
          });
      },
    });
    const app = createApp(Root);
    app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
    installStubs(app);
    mountedApps.push(app);
    app.mount('#app');
    await flush();

    const editorInstance = editorRef.value;
    if (!editorInstance) throw new Error('ATiptapEditor did not mount');
    const internalEditor = getInternalEditor(editorInstance);
    const audioWrapper = document.querySelector<HTMLElement>('[data-media-node="audio"]');
    document.querySelector<HTMLAudioElement>('audio')?.click();
    await flush();
    expect(internalEditor.state.selection).toBeInstanceOf(NodeSelection);

    readonly.value = true;
    await flush();
    expect(internalEditor.state.selection).toBeInstanceOf(GapCursor);
    expect(audioWrapper?.classList.contains('is-selected')).toBe(false);
    expect(audioWrapper?.classList.contains('ProseMirror-selectednode')).toBe(false);
    expect(document.querySelector('.a9-tiptap-editor__media-toolbar')).toBeNull();
    expect(document.querySelector('audio')?.hasAttribute('controls')).toBe(true);

    modelValue.value = '<audio src="/updated-only-audio.mp3"></audio>';
    await flush();
    const updatedAudioWrapper = document.querySelector<HTMLElement>('[data-media-node="audio"]');
    expect(internalEditor.state.selection).toBeInstanceOf(GapCursor);
    expect(updatedAudioWrapper?.classList.contains('is-selected')).toBe(false);
    expect(updatedAudioWrapper?.classList.contains('ProseMirror-selectednode')).toBe(false);
    expect(document.querySelector('.a9-tiptap-editor__media-toolbar')).toBeNull();
    expect(document.querySelector('audio')?.hasAttribute('controls')).toBe(true);
  });

  it('keeps playback controls out of the editable tab order and updates them with editor state', async () => {
    const mode = ref<'normal' | 'readonly' | 'disabled'>('normal');
    const editorRef = ref<TiptapEditorInstance>();
    const modelValue = '<video src="/demo.mp4"></video><audio src="/demo.mp3"></audio>';
    const Root = defineComponent({
      setup() {
        return () =>
          h(ATiptapEditor, {
            ref: editorRef,
            modelValue,
            readonly: mode.value === 'readonly',
            disabled: mode.value === 'disabled',
          });
      },
    });
    const app = createApp(Root);
    app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
    installStubs(app);
    mountedApps.push(app);
    app.mount('#app');
    await flush();

    const playbackElements = () => Array.from(document.querySelectorAll<HTMLMediaElement>('video, audio'));
    expect(playbackElements().map((element) => element.getAttribute('tabindex'))).toEqual(['-1', '-1']);
    expect(editorRef.value?.getHTML()).not.toContain('tabindex');

    mode.value = 'readonly';
    await flush();
    expect(playbackElements().map((element) => element.hasAttribute('tabindex'))).toEqual([false, false]);

    mode.value = 'disabled';
    await flush();
    expect(playbackElements().map((element) => element.getAttribute('tabindex'))).toEqual(['-1', '-1']);
    expect(editorRef.value?.getHTML()).not.toContain('tabindex');
  });

  it('leaves ordinary Tab navigation unhandled without selecting or scrolling to internal media', async () => {
    const editorRef = ref<TiptapEditorInstance>();
    const Root = defineComponent({
      setup() {
        return () =>
          h('div', [
            h(ATiptapEditor, {
              ref: editorRef,
              modelValue: '<p>Start here</p><video src="/demo.mp4"></video><audio src="/demo.mp3"></audio><p>Finish here</p>',
            }),
            h('button', { 'type': 'button', 'data-testid': 'after-editor' }, 'After editor'),
          ]);
      },
    });
    const app = createApp(Root);
    app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
    installStubs(app);
    mountedApps.push(app);
    app.mount('#app');
    await flush();

    const instance = editorRef.value;
    const prose = document.querySelector<HTMLElement>('.a9-tiptap-editor__prose');
    const content = document.querySelector<HTMLElement>('.a9-tiptap-editor__content');
    if (!instance || !prose || !content) throw new Error('ATiptapEditor did not mount');
    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.setTextSelection(2);
    prose.focus();
    content.scrollTop = 37;

    const event = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true });
    prose.dispatchEvent(event);
    await flush();

    expect(event.defaultPrevented).toBe(false);
    expect(content.scrollTop).toBe(37);
    expect(internalEditor.state.selection).not.toBeInstanceOf(NodeSelection);
    expect(document.querySelector('.a9-tiptap-editor__media-toolbar')).toBeNull();
    expect(
      Array.from(document.querySelectorAll('video, audio')).every((element) => element.getAttribute('tabindex') === '-1')
    ).toBe(true);
  });

  it('preserves Tab and Shift+Tab list indentation shortcuts', async () => {
    const instance = mountEditor({ modelValue: '<ul><li><p>First</p></li><li><p>Second</p></li></ul>' });
    await flush();

    const internalEditor = getInternalEditor(instance);
    const prose = document.querySelector<HTMLElement>('.a9-tiptap-editor__prose');
    if (!prose) throw new Error('ATiptapEditor did not mount');
    let secondPosition = -1;
    internalEditor.state.doc.descendants((node, pos) => {
      if (secondPosition < 0 && node.isText && node.text === 'Second') secondPosition = pos + 1;
    });
    if (secondPosition < 0) throw new Error('Second list item was not found');
    internalEditor.commands.setTextSelection(secondPosition);
    prose.focus();

    const indentEvent = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true });
    prose.dispatchEvent(indentEvent);
    await flush();
    expect(indentEvent.defaultPrevented).toBe(true);
    expect(instance.getHTML()).toContain('<li><p>First</p><ul><li><p>Second</p></li></ul></li>');

    const outdentEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    prose.dispatchEvent(outdentEvent);
    await flush();
    expect(outdentEvent.defaultPrevented).toBe(true);
    expect(instance.getHTML()).toBe('<ul><li><p>First</p></li><li><p>Second</p></li></ul>');
  });

  it('runs formatting commands from the toolbar', async () => {
    const instance = mountEditor({ modelValue: '<p>Admin9</p>' });
    await flush();

    getInternalEditor(instance).commands.setTextSelection({ from: 1, to: 7 });
    document.querySelector<HTMLButtonElement>('button[aria-label="Bold"]')?.click();
    await flush();

    expect(instance.getHTML()).toBe('<p><strong>Admin9</strong></p>');
  });

  it('strips unsafe link protocols and serializes safe links with protective attributes', async () => {
    const instance = mountEditor({ modelValue: '<p>Admin9</p>' });
    await flush();
    const internalEditor = getInternalEditor(instance);
    const unsafeHref = ['java', 'script:alert(1)'].join('');

    internalEditor.commands.setTextSelection({ from: 1, to: 7 });
    internalEditor.commands.setLink({ href: unsafeHref });
    expect(instance.getHTML()).not.toContain(unsafeHref);

    internalEditor.commands.setTextSelection({ from: 1, to: 7 });
    internalEditor.commands.setLink({ href: 'https://admin9.dev/docs' });

    const document = new DOMParser().parseFromString(instance.getHTML(), 'text/html');
    const link = document.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://admin9.dev/docs');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('inserts valid picker images, reports rejected items, and keeps picker integration explicit', async () => {
    const onMediaError = vi.fn();
    const messageError = vi.spyOn(Message, 'error').mockImplementation(() => ({ close: vi.fn() }));
    const instance = mountEditor({ service: {}, onMediaError });
    await flush();

    const picker = document.querySelector('[data-media-type="image"]');
    picker?.querySelector<HTMLButtonElement>('.media-picker-mixed')?.click();
    await flush();

    let parsedDocument = new DOMParser().parseFromString(instance.getHTML(), 'text/html');
    const images = parsedDocument.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute('src')).toBe('https://cdn.example.com/admin9-cover.png');
    expect(images[0]?.getAttribute('alt')).toBe('Admin9 cover');
    expect(images[0]?.getAttribute('title')).toBe('Admin9 cover');
    expect(images[0]?.getAttribute('data-display')).toBe('block');
    expect(images[0]?.getAttribute('data-width')).toBe('natural');
    expect(images[0]?.getAttribute('data-align')).toBe('left');
    const defaultImageWrapper = document.querySelector<HTMLElement>('[data-media-node="blockImage"]');
    expect(defaultImageWrapper?.style.getPropertyValue('--a9-media-width')).toBe('fit-content');
    expect(defaultImageWrapper?.style.maxWidth).toBe('100%');
    expect(instance.getHTML()).not.toContain(['java', 'script:'].join(''));
    expect(picker?.getAttribute('data-model-id')).toBe('');
    expect(picker?.getAttribute('data-value-type')).toBe('item');
    expect(picker?.querySelector('button[aria-label="Insert image"]')).not.toBeNull();
    expect(messageError).toHaveBeenCalledWith('Some selected media were skipped because their type or URL is invalid.');
    expect(onMediaError).toHaveBeenCalledTimes(1);
    expect(onMediaError).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'insert',
        mediaType: 'image',
        reason: 'invalid-selection',
        attemptedItems: expect.arrayContaining([expect.objectContaining({ id: 'image-1' })]),
        rejectedItems: expect.arrayContaining([
          expect.objectContaining({ id: 'image-wrong-type' }),
          expect.objectContaining({ id: 'image-missing-url' }),
          expect.objectContaining({ id: 'image-unsafe-url' }),
        ]),
      })
    );

    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.setNodeSelection(findNodePosition(internalEditor, 'blockImage'));
    await flush();
    expect(document.querySelector('button[data-media-width="natural"]')).toBeNull();
    expect(document.querySelector('button[data-media-reset-size]')).toBeNull();

    picker?.querySelector<HTMLButtonElement>('.media-picker-clear')?.click();
    await flush();
    parsedDocument = new DOMParser().parseFromString(instance.getHTML(), 'text/html');
    expect(parsedDocument.querySelectorAll('img')).toHaveLength(1);
    expect(picker?.getAttribute('data-model-id')).toBe('');
  });

  it('does not run an insert command when every selected item is invalid', async () => {
    const onMediaError = vi.fn();
    vi.spyOn(Message, 'error').mockImplementation(() => ({ close: vi.fn() }));
    const instance = mountEditor({ service: {}, onMediaError });
    await flush();
    const internalEditor = getInternalEditor(instance);
    const chainSpy = vi.spyOn(internalEditor, 'chain');

    document.querySelector('[data-media-type="image"]')?.querySelector<HTMLButtonElement>('.media-picker-invalid')?.click();
    await flush();

    expect(chainSpy).not.toHaveBeenCalled();
    expect(instance.getHTML()).toBe('');
    expect(onMediaError).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'insert',
        reason: 'invalid-selection',
        attemptedItems: expect.any(Array),
        rejectedItems: expect.any(Array),
      })
    );
  });

  it('reports a failed Tiptap insert command without claiming success', async () => {
    const onMediaError = vi.fn();
    const messageError = vi.spyOn(Message, 'error').mockImplementation(() => ({ close: vi.fn() }));
    const instance = mountEditor({ service: {}, onMediaError });
    await flush();
    const internalEditor = getInternalEditor(instance);
    const commandChain = {
      focus: vi.fn(),
      insertContent: vi.fn(),
      command: vi.fn(),
      run: vi.fn(() => false),
    };
    commandChain.focus.mockReturnValue(commandChain);
    commandChain.insertContent.mockReturnValue(commandChain);
    commandChain.command.mockReturnValue(commandChain);
    vi.spyOn(internalEditor, 'chain').mockReturnValue(commandChain as unknown as ReturnType<Editor['chain']>);

    document.querySelector('[data-media-type="image"]')?.querySelector<HTMLButtonElement>('.media-picker-confirm')?.click();
    await flush();

    expect(commandChain.run).toHaveBeenCalledOnce();
    expect(instance.getHTML()).toBe('');
    expect(messageError).toHaveBeenCalledWith('The selected media could not be inserted.');
    expect(onMediaError).toHaveBeenCalledWith({
      operation: 'insert',
      mediaType: 'image',
      reason: 'command-failed',
      attemptedItems: [expect.objectContaining({ id: 'image-1' })],
      rejectedItems: [],
    });
  });

  it('reports an exception thrown by the Tiptap insert command', async () => {
    const onMediaError = vi.fn();
    const messageError = vi.spyOn(Message, 'error').mockImplementation(() => ({ close: vi.fn() }));
    const instance = mountEditor({ service: {}, onMediaError });
    await flush();
    const internalEditor = getInternalEditor(instance);
    const cause = new Error('insert failed');
    const commandChain = {
      focus: vi.fn(),
      insertContent: vi.fn(),
      command: vi.fn(),
      run: vi.fn(() => {
        throw cause;
      }),
    };
    commandChain.focus.mockReturnValue(commandChain);
    commandChain.insertContent.mockReturnValue(commandChain);
    commandChain.command.mockReturnValue(commandChain);
    vi.spyOn(internalEditor, 'chain').mockReturnValue(commandChain as unknown as ReturnType<Editor['chain']>);

    document.querySelector('[data-media-type="image"]')?.querySelector<HTMLButtonElement>('.media-picker-confirm')?.click();
    await flush();

    expect(instance.getHTML()).toBe('');
    expect(messageError).toHaveBeenCalledWith('The selected media could not be inserted.');
    expect(onMediaError).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'insert',
        mediaType: 'image',
        reason: 'command-failed',
        attemptedItems: [expect.objectContaining({ id: 'image-1' })],
        rejectedItems: [],
        cause,
      })
    );
  });

  it('inserts block and inline images at the current text cursor without inferring display from dimensions', async () => {
    const blockInstance = mountEditor({ modelValue: '<p>BeforeAfter</p>', service: {} });
    await flush();
    getInternalEditor(blockInstance).commands.setTextSelection(7);
    document.querySelector('[data-media-type="image"]')?.querySelector<HTMLButtonElement>('.media-picker-confirm')?.click();
    await flush();

    expect(blockInstance.getHTML()).toBe(
      '<p>Before</p><img src="https://cdn.example.com/admin9-cover.png" title="Admin9 cover" alt="Admin9 cover" loading="lazy" data-display="block" data-width="natural" data-align="left"><p>After</p>'
    );

    mountedApps.splice(0).forEach((app) => app.unmount());
    document.body.innerHTML = '<div id="app"></div>';
    const inlineInstance = mountEditor({
      modelValue: '<p>BeforeAfter</p>',
      service: {},
      defaultImageDisplay: 'inline',
    });
    await flush();
    getInternalEditor(inlineInstance).commands.setTextSelection(7);
    document.querySelector('[data-media-type="image"]')?.querySelector<HTMLButtonElement>('.media-picker-confirm')?.click();
    await flush();

    const inlineDocument = new DOMParser().parseFromString(inlineInstance.getHTML(), 'text/html');
    const inlineImage = inlineDocument.querySelector('p img');
    expect(inlineDocument.querySelector('p')?.textContent).toBe('BeforeAfter');
    expect(inlineImage?.getAttribute('data-display')).toBe('inline');
    expect(inlineImage?.getAttribute('data-size')).toBe('1em');
    expect(inlineImage?.previousSibling?.textContent).toBe('Before');
    expect(inlineImage?.nextSibling?.textContent).toBe('After');
  });

  it('converts between inline and block images while preserving source and alternative text', async () => {
    const instance = mountEditor({
      modelValue:
        '<p>Before<img src="/icon.png" alt="Status icon" title="Status" data-display="inline" data-size="1.5em">After</p>',
    });
    await flush();
    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.setNodeSelection(findNodePosition(internalEditor, 'inlineImage'));
    await flush();
    expect(document.querySelector('button[data-media-size="1.5em"]')?.getAttribute('aria-label')).toBe('Large icon');
    expect(document.querySelector('button[data-media-size="1.5em"]')?.getAttribute('aria-pressed')).toBe('true');
    document.querySelector<HTMLButtonElement>('button[aria-label="Place image on its own line"]')?.click();
    await flush();

    let parsedDocument = new DOMParser().parseFromString(instance.getHTML(), 'text/html');
    let image = parsedDocument.querySelector('img');
    expect(image?.getAttribute('data-display')).toBe('block');
    expect(image?.getAttribute('src')).toBe('/icon.png');
    expect(image?.getAttribute('alt')).toBe('Status icon');
    expect(parsedDocument.body.innerHTML).toContain('<p>Before</p>');
    expect(parsedDocument.body.innerHTML).toContain('<p>After</p>');

    document.querySelector<HTMLButtonElement>('button[aria-label="Place image with text"]')?.click();
    await flush();
    parsedDocument = new DOMParser().parseFromString(instance.getHTML(), 'text/html');
    image = parsedDocument.querySelector('p img');
    expect(image?.getAttribute('data-display')).toBe('inline');
    expect(image?.getAttribute('data-size')).toBe('1em');
    expect(image?.getAttribute('alt')).toBe('Status icon');
  });

  it('updates block media presets, alignment, alt text, drag width, replacement, and deletion', async () => {
    const instance = mountEditor({
      modelValue: '<img src="/cover.png" alt="Old alt" title="Cover" data-display="block" data-width="25%" data-align="left">',
      service: {},
    });
    await flush();
    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.setNodeSelection(findNodePosition(internalEditor, 'blockImage'));
    await flush();

    const smallButton = document.querySelector('button[data-media-width="25%"]');
    const mediumButton = document.querySelector('button[data-media-width="50%"]');
    const resetSizeButton = document.querySelector<HTMLButtonElement>('button[data-media-reset-size]');
    expect(document.querySelector('button[data-media-width="natural"]')).toBeNull();
    expect(document.querySelectorAll('[data-selected-media="blockImage"] button[data-media-width]')).toHaveLength(4);
    expect(smallButton?.getAttribute('aria-label')).toBe('Small');
    expect(smallButton?.getAttribute('aria-pressed')).toBe('true');
    expect(smallButton?.getAttribute('data-button-type')).toBe('primary');
    expect(mediumButton?.getAttribute('aria-label')).toBe('Medium');
    expect(mediumButton?.getAttribute('aria-pressed')).toBe('false');
    expect(mediumButton?.getAttribute('data-button-type')).toBe('text');
    expect(document.querySelector('[data-selected-media="blockImage"]')?.textContent).not.toMatch(
      /original|natural|auto size|25%|50%|75%|100%|\bem\b|\bpx\b/i
    );
    expect(resetSizeButton?.getAttribute('aria-label')).toBe('Reset size');
    expect(resetSizeButton?.getAttribute('data-button-type')).toBe('text');
    expect(resetSizeButton?.closest('[data-tooltip-content]')?.getAttribute('data-tooltip-content')).toBe('Reset size');
    resetSizeButton?.click();
    await flush();
    let image = new DOMParser().parseFromString(instance.getHTML(), 'text/html').querySelector('img');
    expect(image?.getAttribute('data-width')).toBe('natural');
    expect(image?.hasAttribute('width')).toBe(false);
    expect(
      document.querySelector<HTMLElement>('[data-media-node="blockImage"]')?.style.getPropertyValue('--a9-media-width')
    ).toBe('fit-content');
    expect(document.querySelector('button[data-media-reset-size]')).toBeNull();

    document.querySelector<HTMLButtonElement>('button[data-media-width="50%"]')?.click();
    document.querySelector<HTMLButtonElement>('button[data-media-align="right"]')?.click();
    await flush();
    expect(mediumButton?.getAttribute('aria-pressed')).toBe('true');
    expect(mediumButton?.getAttribute('data-button-type')).toBe('primary');
    const alignRightButton = document.querySelector('button[data-media-align="right"]');
    expect(alignRightButton?.getAttribute('aria-pressed')).toBe('true');
    expect(alignRightButton?.getAttribute('data-button-type')).toBe('primary');
    expect(alignRightButton?.closest('[data-tooltip-content]')?.getAttribute('data-tooltip-content')).toBe('Align right');
    const replaceImageButton = document.querySelector('button[aria-label="Replace image"]');
    const deleteImageButton = document.querySelector('button[aria-label="Delete image"]');
    expect(replaceImageButton?.getAttribute('data-button-type')).toBe('text');
    expect(deleteImageButton?.getAttribute('data-button-type')).toBe('text');
    expect(deleteImageButton?.getAttribute('status')).toBe('danger');
    expect(replaceImageButton?.closest('[data-tooltip-content]')?.getAttribute('data-tooltip-content')).toBe('Replace image');
    expect(deleteImageButton?.closest('[data-tooltip-content]')?.getAttribute('data-tooltip-content')).toBe('Delete image');
    expect(document.querySelector('button[aria-label="Image description"]')?.closest('[data-tooltip-content]')).not.toBeNull();
    document.querySelector<HTMLButtonElement>('button[aria-label="Image description"]')?.click();
    await flush();
    const altInput = document.querySelector<HTMLInputElement>('input[aria-label="Image description"]');
    if (!altInput) throw new Error('Image description input did not mount');
    altInput.value = 'Updated alt';
    altInput.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector<HTMLButtonElement>('button[aria-label="Save image description"]')?.click();
    await flush();

    const wrapper = document.querySelector<HTMLElement>('[data-media-node="blockImage"]');
    const prose = document.querySelector<HTMLElement>('.a9-tiptap-editor__prose');
    const handle = document.querySelector<HTMLElement>('.a9-tiptap-editor__resize-handle');
    if (!wrapper || !prose || !handle) throw new Error('Resizable block image did not mount');
    expect(handle.getAttribute('aria-label')).toBe('Drag to resize');
    wrapper.getBoundingClientRect = () => ({ width: 500 } as DOMRect);
    prose.getBoundingClientRect = () => ({ width: 1000 } as DOMRect);
    handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 100, pointerType: 'mouse' }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, pointerType: 'mouse' }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'mouse' }));
    await flush();

    image = new DOMParser().parseFromString(instance.getHTML(), 'text/html').querySelector('img');
    expect(image?.getAttribute('data-width')).toBe('60%');
    expect(image?.getAttribute('width')).toBe('60%');
    expect(image?.getAttribute('data-align')).toBe('right');
    expect(image?.getAttribute('alt')).toBe('Updated alt');

    document.querySelector('[data-media-replace]')?.querySelector<HTMLButtonElement>('.media-picker-confirm')?.click();
    await flush();
    image = new DOMParser().parseFromString(instance.getHTML(), 'text/html').querySelector('img');
    expect(image?.getAttribute('src')).toBe('https://cdn-replacement.example.com/admin9-cover.png');
    expect(image?.getAttribute('data-width')).toBe('60%');
    expect(image?.getAttribute('alt')).toBe('Updated alt');

    handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 100, pointerType: 'mouse' }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 2000, pointerType: 'mouse' }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'mouse' }));
    await flush();
    image = new DOMParser().parseFromString(instance.getHTML(), 'text/html').querySelector('img');
    expect(image?.getAttribute('data-width')).toBe('100%');
    expect(image?.getAttribute('width')).toBe('100%');

    document.querySelector<HTMLButtonElement>('button[aria-label="Delete image"]')?.click();
    await flush();
    expect(instance.getHTML()).toBe('');
  });

  it('inserts safe video and audio picker items without retaining or duplicating selection state', async () => {
    const instance = mountEditor({ service: {} });
    await flush();
    const videoPicker = document.querySelector('[data-media-type="video"]');
    const audioPicker = document.querySelector('[data-media-type="audio"]');
    expect(videoPicker?.getAttribute('data-value-type')).toBe('item');
    expect(audioPicker?.getAttribute('data-value-type')).toBe('item');

    videoPicker?.querySelector<HTMLButtonElement>('.media-picker-confirm')?.click();
    audioPicker?.querySelector<HTMLButtonElement>('.media-picker-confirm')?.click();
    await flush();

    let parsedDocument = new DOMParser().parseFromString(instance.getHTML(), 'text/html');
    const video = parsedDocument.querySelector('video');
    const audio = parsedDocument.querySelector('audio');
    expect(parsedDocument.querySelectorAll('video')).toHaveLength(1);
    expect(parsedDocument.querySelectorAll('audio')).toHaveLength(1);
    expect(video?.getAttribute('src')).toBe('https://cdn.example.com/admin9-demo.mp4');
    expect(video?.getAttribute('title')).toBe('Admin9 demo');
    expect(audio?.getAttribute('src')).toBe('https://cdn.example.com/admin9-theme.mp3');
    expect(audio?.getAttribute('title')).toBe('Admin9 theme');
    expect(audio?.getAttribute('data-width')).toBe('standard');
    expect(audio?.getAttribute('data-align')).toBe('left');
    [video, audio].forEach((element) => {
      expect(element?.hasAttribute('controls')).toBe(true);
      expect(element?.getAttribute('preload')).toBe('metadata');
      expect(element?.hasAttribute('autoplay')).toBe(false);
    });

    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.setNodeSelection(findNodePosition(internalEditor, 'video'));
    await flush();
    expect(document.querySelector('button[data-media-width="natural"]')).toBeNull();
    expect(document.querySelector('button[data-media-reset-size]')).toBeNull();
    const videoWrapper = document.querySelector<HTMLElement>('[data-media-node="video"]');
    expect(videoWrapper?.style.maxWidth).toBe('100%');
    expect(instance.getHTML()).not.toContain(['java', 'script:'].join(''));
    expect(videoPicker?.getAttribute('data-model-id')).toBe('');
    expect(audioPicker?.getAttribute('data-model-id')).toBe('');

    videoPicker?.querySelector<HTMLButtonElement>('.media-picker-clear')?.click();
    audioPicker?.querySelector<HTMLButtonElement>('.media-picker-clear')?.click();
    await flush();
    parsedDocument = new DOMParser().parseFromString(instance.getHTML(), 'text/html');
    expect(parsedDocument.querySelectorAll('video')).toHaveLength(1);
    expect(parsedDocument.querySelectorAll('audio')).toHaveLength(1);
    expect(videoPicker?.getAttribute('data-model-id')).toBe('');
    expect(audioPicker?.getAttribute('data-model-id')).toBe('');
    expect(instance.getHTML()).not.toContain('<p></p>');
    expect(instance.getHTML()).not.toContain('<p><br></p>');
  });

  it('rejects an invalid replacement atomically and keeps the selected media unchanged', async () => {
    const onMediaError = vi.fn();
    const messageError = vi.spyOn(Message, 'error').mockImplementation(() => ({ close: vi.fn() }));
    const instance = mountEditor({
      modelValue: '<img src="/cover.png" alt="Cover" title="Cover" data-display="block">',
      service: {},
      onMediaError,
    });
    await flush();
    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.setNodeSelection(findNodePosition(internalEditor, 'blockImage'));
    await flush();
    const replacementPicker = document.querySelector('[data-media-replace]');

    expect(replacementPicker?.getAttribute('data-value-type')).toBe('item');
    replacementPicker?.querySelector<HTMLButtonElement>('.media-picker-mixed')?.click();
    await flush();

    expect(new DOMParser().parseFromString(instance.getHTML(), 'text/html').querySelector('img')?.getAttribute('src')).toBe(
      '/cover.png'
    );
    expect(messageError).toHaveBeenCalledWith('Some selected media were skipped because their type or URL is invalid.');
    expect(onMediaError).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'replace',
        mediaType: 'image',
        reason: 'invalid-selection',
        attemptedItems: expect.any(Array),
        rejectedItems: expect.any(Array),
      })
    );
  });

  it('reports a failed replacement when the originally selected media node is no longer available', async () => {
    const onMediaError = vi.fn();
    const messageError = vi.spyOn(Message, 'error').mockImplementation(() => ({ close: vi.fn() }));
    const instance = mountEditor({
      modelValue: '<img src="/cover.png" alt="Cover" title="Cover" data-display="block">',
      service: {},
      onMediaError,
    });
    await flush();
    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.setNodeSelection(findNodePosition(internalEditor, 'blockImage'));
    await flush();
    const replacementPicker = document.querySelector('[data-media-replace]');
    vi.spyOn(internalEditor.state.doc, 'nodeAt').mockReturnValue(null);

    replacementPicker?.querySelector<HTMLButtonElement>('.media-picker-confirm')?.click();
    await flush();

    expect(new DOMParser().parseFromString(instance.getHTML(), 'text/html').querySelector('img')?.getAttribute('src')).toBe(
      '/cover.png'
    );
    expect(messageError).toHaveBeenCalledWith('The selected media could not be replaced.');
    expect(onMediaError).toHaveBeenCalledWith({
      operation: 'replace',
      mediaType: 'image',
      reason: 'command-failed',
      attemptedItems: [expect.objectContaining({ id: 'image-replacement' })],
      rejectedItems: [],
    });
  });

  it('parses only safe video and audio nodes and normalizes playback attributes', async () => {
    const unsafeUrl = ['java', 'script:alert(1)'].join('');
    const instance = mountEditor({
      modelValue: [
        '<video src="https://cdn.example.com/safe.mp4" title="Safe video" autoplay preload="none"></video>',
        `<video src="${unsafeUrl}" autoplay></video>`,
        '<audio src="/safe.mp3" title="Safe audio" autoplay preload="auto" data-width="compact" data-align="right"></audio>',
        '<audio src="/fallback.mp3" data-width="999px" data-align="justify"></audio>',
        `<audio src="${unsafeUrl}" autoplay></audio>`,
      ].join(''),
    });
    await flush();

    const parsedDocument = new DOMParser().parseFromString(instance.getHTML(), 'text/html');
    const video = parsedDocument.querySelector('video');
    const audio = parsedDocument.querySelector('audio');
    expect(parsedDocument.querySelectorAll('video')).toHaveLength(1);
    expect(parsedDocument.querySelectorAll('audio')).toHaveLength(2);
    expect(video?.getAttribute('src')).toBe('https://cdn.example.com/safe.mp4');
    expect(audio?.getAttribute('src')).toBe('/safe.mp3');
    expect(audio?.getAttribute('data-width')).toBe('compact');
    expect(audio?.getAttribute('data-align')).toBe('right');
    const fallbackAudio = parsedDocument.querySelectorAll('audio')[1];
    expect(fallbackAudio?.getAttribute('data-width')).toBe('standard');
    expect(fallbackAudio?.getAttribute('data-align')).toBe('left');
    [video, audio].forEach((element) => {
      expect(element?.hasAttribute('controls')).toBe(true);
      expect(element?.getAttribute('preload')).toBe('metadata');
      expect(element?.hasAttribute('autoplay')).toBe(false);
    });
    expect(instance.getHTML()).not.toContain(unsafeUrl);
  });

  it('updates, replaces, reloads, and deletes audio layout without enabling drag resize', async () => {
    const instance = mountEditor({
      modelValue: '<p>Before audio</p><audio src="/podcast.mp3" data-width="standard" data-align="left"></audio>',
      service: {},
    });
    await flush();
    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.setTextSelection(1);
    const audio = document.querySelector<HTMLAudioElement>('audio');
    const audioNodeWrapper = document.querySelector<HTMLElement>('[data-media-node="audio"]');
    const playbackClick = vi.fn();
    const parentClick = vi.fn();
    audio?.addEventListener('click', playbackClick);
    audioNodeWrapper?.addEventListener('click', parentClick);
    const playbackEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    expect(audio?.dispatchEvent(playbackEvent)).toBe(true);
    await flush();

    expect(playbackClick).toHaveBeenCalledOnce();
    expect(parentClick).toHaveBeenCalledOnce();
    expect(playbackEvent.defaultPrevented).toBe(false);
    expect(internalEditor.state.selection).toBeInstanceOf(NodeSelection);
    expect(internalEditor.state.selection.from).toBe(findNodePosition(internalEditor, 'audio'));
    expect(document.querySelector('[data-selected-media="audio"]')).not.toBeNull();
    expect(document.querySelector('button[data-media-width="compact"]')?.getAttribute('aria-label')).toBe('Small player');
    expect(document.querySelector('button[data-media-width="standard"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('button[data-media-width="standard"]')?.getAttribute('data-button-type')).toBe('primary');
    expect(document.querySelector('button[data-media-width="compact"]')?.getAttribute('data-button-type')).toBe('text');
    expect(document.querySelector('[data-selected-media="audio"]')?.textContent).not.toMatch(/320px|480px|compact|full width/i);
    expect(document.querySelector('button[aria-label="Replace audio"]')).not.toBeNull();
    expect(document.querySelector('button[aria-label="Delete audio"]')).not.toBeNull();
    expect(document.querySelector('button[aria-label="Replace audio"]')?.getAttribute('data-button-type')).toBe('text');
    expect(document.querySelector('button[aria-label="Delete audio"]')?.getAttribute('status')).toBe('danger');
    expect(document.querySelector('.a9-tiptap-editor__resize-handle')).toBeNull();
    document.querySelector<HTMLButtonElement>('button[data-media-width="compact"]')?.click();
    document.querySelector<HTMLButtonElement>('button[data-media-align="right"]')?.click();
    await flush();
    expect(document.querySelector('button[data-media-width="compact"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('button[data-media-align="right"]')?.getAttribute('aria-pressed')).toBe('true');

    document.querySelector('[data-media-replace]')?.querySelector<HTMLButtonElement>('.media-picker-confirm')?.click();
    await flush();
    let serializedAudio = new DOMParser().parseFromString(instance.getHTML(), 'text/html').querySelector('audio');
    expect(serializedAudio?.getAttribute('src')).toBe('https://cdn-replacement.example.com/admin9-theme.mp3');
    expect(serializedAudio?.getAttribute('data-width')).toBe('compact');
    expect(serializedAudio?.getAttribute('data-align')).toBe('right');

    const serialized = instance.getHTML();
    mountedApps.shift()?.unmount();
    document.body.innerHTML = '<div id="app"></div>';
    const reloadedInstance = mountEditor({ modelValue: serialized, service: {} });
    await flush();
    const audioWrapper = document.querySelector<HTMLElement>('[data-media-node="audio"]');
    expect(audioWrapper?.style.getPropertyValue('--a9-media-width')).toBe('320px');
    expect(audioWrapper?.getAttribute('data-width')).toBe('compact');
    expect(audioWrapper?.getAttribute('data-align')).toBe('right');

    document.querySelector<HTMLAudioElement>('audio')?.click();
    await flush();
    expect(document.querySelector('[data-selected-media="audio"]')).not.toBeNull();
    document.querySelector<HTMLButtonElement>('button[data-media-width="full"]')?.click();
    document.querySelector<HTMLButtonElement>('button[data-media-align="center"]')?.click();
    await flush();
    serializedAudio = new DOMParser().parseFromString(reloadedInstance.getHTML(), 'text/html').querySelector('audio');
    expect(serializedAudio?.getAttribute('data-width')).toBe('full');
    expect(serializedAudio?.getAttribute('data-align')).toBe('center');
    expect(document.querySelector<HTMLElement>('[data-media-node="audio"]')?.style.getPropertyValue('--a9-media-width')).toBe(
      '100%'
    );

    document.querySelector<HTMLButtonElement>('button[aria-label="Delete audio"]')?.click();
    await flush();
    expect(reloadedInstance.getHTML()).toBe('<p>Before audio</p>');
  });

  it('parses safe image forms, strips arbitrary styles, and rejects unsafe image sources', async () => {
    const unsafeUrl = ['java', 'script:alert(1)'].join('');
    const instance = mountEditor({
      modelValue: [
        '<img src="/block.png" alt="Block" style="position:fixed;width:9999px" data-display="block" data-width="75%" data-align="center">',
        '<img src="/oversized.png" alt="Oversized" style="width:150%" data-display="block" data-width="150%" data-align="right">',
        '<p>Text <img src="/inline.png" alt="Inline" style="height:50em" data-display="inline" data-size="2em"></p>',
        `<img src="${unsafeUrl}" data-display="block">`,
      ].join(''),
    });
    await flush();

    const html = instance.getHTML();
    const parsedDocument = new DOMParser().parseFromString(html, 'text/html');
    const images = parsedDocument.querySelectorAll('img');
    expect(images).toHaveLength(3);
    expect(images[0]?.getAttribute('data-width')).toBe('75%');
    expect(images[0]?.getAttribute('data-align')).toBe('center');
    expect(images[1]?.getAttribute('data-width')).toBe('natural');
    expect(images[1]?.hasAttribute('width')).toBe(false);
    expect(images[1]?.getAttribute('data-align')).toBe('right');
    expect(images[2]?.getAttribute('data-size')).toBe('2em');
    const oversizedWrapper = document.querySelectorAll<HTMLElement>('[data-media-node="blockImage"]')[1];
    expect(oversizedWrapper?.style.getPropertyValue('--a9-media-width')).toBe('fit-content');
    expect(html).not.toContain('style=');
    expect(html).not.toContain(unsafeUrl);
  });

  it('normalizes oversized video input and resets adjusted videos to their default width', async () => {
    const instance = mountEditor({
      modelValue: '<video src="/oversized.mp4" style="width:140%" data-width="140%" data-align="right"></video>',
    });
    await flush();

    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.setNodeSelection(findNodePosition(internalEditor, 'video'));
    await flush();
    let video = new DOMParser().parseFromString(instance.getHTML(), 'text/html').querySelector('video');
    expect(video?.getAttribute('data-width')).toBe('100%');
    expect(video?.getAttribute('width')).toBe('100%');
    expect(instance.getHTML()).not.toContain('style=');
    expect(document.querySelector('button[data-media-width="natural"]')).toBeNull();
    expect(document.querySelector('button[data-media-reset-size]')).toBeNull();

    document.querySelector<HTMLButtonElement>('button[data-media-width="50%"]')?.click();
    await flush();
    expect(document.querySelector('button[data-media-reset-size]')?.getAttribute('aria-label')).toBe('Reset size');
    document.querySelector<HTMLButtonElement>('button[data-media-reset-size]')?.click();
    await flush();
    video = new DOMParser().parseFromString(instance.getHTML(), 'text/html').querySelector('video');
    expect(video?.getAttribute('data-width')).toBe('100%');
    expect(document.querySelector('button[data-media-reset-size]')).toBeNull();
  });

  it('keeps media controls hidden in readonly and disabled states while playback remains available', async () => {
    const modelValue =
      '<video src="/locked.mp4" data-width="75%" data-align="center"></video><audio src="/locked.mp3"></audio>';
    const disabledInstance = mountEditor({ modelValue, disabled: true, service: {} });
    await flush();
    const disabledEditor = getInternalEditor(disabledInstance);
    disabledEditor.commands.setNodeSelection(findNodePosition(disabledEditor, 'video'));
    await flush();
    expect(document.querySelector('.a9-tiptap-editor__media-toolbar')).toBeNull();
    expect(document.querySelector('.a9-tiptap-editor__resize-handle')).toBeNull();
    expect(document.querySelector('video')?.hasAttribute('controls')).toBe(true);
    expect(document.querySelector('audio')?.hasAttribute('controls')).toBe(true);

    mountedApps.splice(0).forEach((app) => app.unmount());
    document.body.innerHTML = '<div id="app"></div>';
    const readonlyInstance = mountEditor({ modelValue, readonly: true, service: {} });
    await flush();
    const readonlyEditor = getInternalEditor(readonlyInstance);
    readonlyEditor.commands.setNodeSelection(findNodePosition(readonlyEditor, 'video'));
    await flush();
    expect(document.querySelector('.a9-tiptap-editor__toolbar')).toBeNull();
    expect(document.querySelector('.a9-tiptap-editor__media-toolbar')).toBeNull();
    expect(document.querySelector('video')?.hasAttribute('controls')).toBe(true);
    expect(document.querySelector('audio')?.hasAttribute('controls')).toBe(true);
  });

  it('applies maxLength changes without recreating the editor', async () => {
    const maxLength = ref(0);
    const editorRef = ref<TiptapEditorInstance>();
    const Root = defineComponent({
      setup() {
        return () =>
          h(ATiptapEditor, {
            ref: editorRef,
            modelValue: '',
            maxLength: maxLength.value,
          });
      },
    });
    const app = createApp(Root);
    app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
    installStubs(app);
    mountedApps.push(app);
    app.mount('#app');
    await flush();

    const instance = editorRef.value;
    if (!instance) throw new Error('ATiptapEditor did not mount');
    const internalEditor = getInternalEditor(instance);

    internalEditor.commands.insertContent('123456');
    expect(instance.getHTML()).toBe('<p>123456</p>');

    maxLength.value = 5;
    await flush();
    internalEditor.commands.insertContent('7');
    expect(instance.getHTML()).toBe('<p>123456</p>');

    maxLength.value = 8;
    await flush();
    internalEditor.commands.insertContent('78');
    expect(instance.getHTML()).toBe('<p>12345678</p>');

    maxLength.value = 0;
    await flush();
    internalEditor.commands.insertContent('9');
    expect(instance.getHTML()).toBe('<p>123456789</p>');
  });
});
