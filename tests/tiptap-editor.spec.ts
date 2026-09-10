/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, nextTick, ref, type App, type ComponentPublicInstance } from 'vue';
import { Message } from '@arco-design/web-vue';
import type { Editor } from '@tiptap/core';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { CellSelection, columnResizingPluginKey } from '@tiptap/pm/tables';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ATiptapEditor from '../src/components/tiptap-editor/index.vue';
import type { TiptapDocument, TiptapImageUploadState } from '../src/components/tiptap-editor/types';
import { messages } from '../src/locale';

vi.mock('../src/components/file-picker/index.vue', async () => {
  const vue = await import('vue');
  const selectedMedia = {
    document: { id: 'document-1', name: 'Registration.pdf', type: 'document', groupId: null, url: '/registration.pdf' },
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
      name: 'AFilePickerStub',
      inheritAttrs: false,
      props: {
        modelValue: Object,
        fileTypes: { type: Array, default: () => ['image'] },
      },
      emits: ['change', 'update:modelValue', 'visible-change'],
      setup(props, { attrs, emit, slots }) {
        return () => {
          const mediaType = (props.fileTypes?.[0] ?? 'image') as keyof typeof selectedMedia;
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
              'data-file-types': props.fileTypes?.join(','),
            },
            [
              slots.trigger?.({
                open: () => emit('visible-change', true),
                selectedItems: [],
                selectedCount: 0,
                disabled: false,
              }),
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
  getJSON: () => TiptapDocument;
  getImageUploadState: () => TiptapImageUploadState;
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
  app.component(
    'AModal',
    defineComponent({
      props: { visible: Boolean, onBeforeOk: Function },
      emits: ['update:visible'],
      setup:
        (props, { slots, emit }) =>
        () =>
          props.visible
            ? h('div', [
                slots.default?.(),
                h(
                  'button',
                  {
                    'data-testid': 'confirm-table-text',
                    'onClick': async () => {
                      if ((await props.onBeforeOk?.()) !== false) emit('update:visible', false);
                    },
                  },
                  'Confirm table'
                ),
              ])
            : null,
    })
  );
  app.component('ATextarea', InputStub);
  app.component('IconEraser', IconStub);
  app.component('IconAttachment', IconStub);
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
    'IconApps',
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

async function mountReactiveEditor(initialProps: Record<string, unknown>) {
  const props = ref(initialProps);
  const editorRef = ref<TiptapEditorInstance>();
  const app = createApp({ setup: () => () => h(ATiptapEditor, { ...props.value, ref: editorRef }) });
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  installStubs(app);
  mountedApps.push(app);
  app.mount('#app');
  await flush();
  if (!editorRef.value) throw new Error('Editor did not mount');
  return { props, instance: editorRef.value, editor: getInternalEditor(editorRef.value) };
}

function pasteTestImage(editor: Editor) {
  const data = new DataTransfer();
  data.items.add(new File(['image'], 'image.png', { type: 'image/png' }));
  editor.view.dom.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
}

function findNodePosition(editor: Editor, nodeName: string) {
  let position = -1;
  editor.state.doc.descendants((node, pos) => {
    if (position < 0 && node.type.name === nodeName) position = pos;
  });
  if (position < 0) throw new Error(`Node ${nodeName} was not found`);
  return position;
}

function dispatchEditorKey(key: 'ArrowLeft' | 'Backspace') {
  const prose = document.querySelector<HTMLElement>('.a9-tiptap-editor__prose');
  if (!prose) throw new Error('ATiptapEditor editable surface was not found');
  const event = new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true });
  prose.dispatchEvent(event);
  return event;
}

describe('ATiptapEditor public contract', () => {
  it('updates a linked inline image URL without replacing the image with text', async () => {
    const instance = mountEditor({ modelValue: '<p><a href="/old"><img src="/image.png" data-display="inline"></a></p>' });
    await flush();
    getInternalEditor(instance).commands.setNodeSelection(1);
    document.querySelector<HTMLButtonElement>('button[aria-label="Link"]')?.click();
    await flush();
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Link"]');
    if (!input) throw new Error('Link input did not mount');
    input.value = '/new';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    document.querySelector<HTMLButtonElement>('.a9-tiptap-editor__link-actions button:last-child')?.click();
    expect(instance.getHTML()).toContain('href="/new"');
    expect(instance.getHTML()).toContain('src="/image.png"');
    expect(getInternalEditor(instance).state.doc.textContent).toBe('');
  });

  it('preserves an over-limit table draft and inserts it after the limit is raised', async () => {
    const { props, instance } = await mountReactiveEditor({ modelValue: '<p>X</p>', maxLength: 5 });
    const error = vi.spyOn(Message, 'error').mockImplementation(() => ({} as ReturnType<typeof Message.error>));
    document.querySelector<HTMLButtonElement>('button[aria-label="Table"]')?.click();
    await flush();
    const open = [...document.querySelectorAll<HTMLButtonElement>('.a9-tiptap-editor__table-picker button')].find(
      (button) => button.textContent === 'Paste table data'
    );
    open?.click();
    await flush();
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Paste table data"]');
    if (!input) throw new Error('Table data input did not mount');
    input.value = 'abcdef\tghi';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    document.querySelector<HTMLButtonElement>('[data-testid="confirm-table-text"]')?.click();
    await flush();
    expect(instance.getHTML()).toBe('<p>X</p>');
    expect(document.querySelector('input[aria-label="Paste table data"]')).toBe(input);
    expect(input.value).toBe('abcdef\tghi');
    expect(error).toHaveBeenCalledOnce();
    props.value = { ...props.value, maxLength: 100 };
    await flush();
    document.querySelector<HTMLButtonElement>('[data-testid="confirm-table-text"]')?.click();
    await flush();
    expect(instance.getHTML()).toContain('abcdef');
    expect(instance.getHTML()).toContain('<table');
    expect(document.querySelector('input[aria-label="Paste table data"]')).toBeNull();
  });

  it('keeps keyboard-created default highlights through a JSON model round trip', async () => {
    const { props, instance, editor } = await mountReactiveEditor({
      valueFormat: 'json',
      modelValue: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Highlight' }] }] },
    });
    editor.commands.selectAll();
    editor.commands.keyboardShortcut('Mod-Shift-h');
    expect(instance.getHTML()).toContain('<mark>Highlight</mark>');
    const saved = instance.getJSON();
    props.value = { ...props.value, modelValue: saved };
    await flush();
    expect(instance.getJSON()).toEqual(saved);
    expect(instance.getHTML()).toContain('<mark>Highlight</mark>');
  });

  it.each(['readonly', 'disabled'])('blocks upload controls in %s and restores them on return to editing', async (mode) => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const { props, instance, editor } = await mountReactiveEditor({
      canUploadImage: true,
      service: {
        list: vi.fn(),
        upload: () =>
          new Promise(() => {
            /* Keep the upload pending until cancellation. */
          }),
      },
    });
    pasteTestImage(editor);
    await flush();
    props.value = { ...props.value, [mode]: true };
    await flush();
    let remove = document.querySelector<HTMLButtonElement>('.a9-tiptap-editor__upload button:last-child');
    expect(remove?.disabled).toBe(true);
    // Exercise the handler as well as the DOM disabled state.
    if (remove) remove.onclick?.call(remove, new MouseEvent('click'));
    expect(instance.getImageUploadState().failed).toBe(1);
    props.value = { ...props.value, [mode]: false };
    await flush();
    remove = document.querySelector<HTMLButtonElement>('.a9-tiptap-editor__upload button:last-child');
    expect(remove?.disabled).toBe(false);
    remove?.click();
    expect(instance.getImageUploadState().canSave).toBe(true);
  });

  it.each(['clear', 'external replacement'])(
    'restores a retryable image when undoing %s and ignores the cancelled response',
    async (operation) => {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      let complete!: (item: unknown) => void;
      const upload = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              complete = resolve;
            })
        )
        .mockResolvedValue({ id: 'retry', name: 'image.png', type: 'image', groupId: null, url: '/retry.png' });
      const { props, instance, editor } = await mountReactiveEditor({
        modelValue: '<p>Before</p>',
        canUploadImage: true,
        service: { list: vi.fn(), upload },
      });
      pasteTestImage(editor);
      await flush();
      if (operation === 'clear') instance.clear();
      else {
        props.value = { ...props.value, modelValue: '<p>Replacement</p>' };
        await flush();
      }
      editor.commands.undo();
      await flush();
      const retry = [...document.querySelectorAll<HTMLButtonElement>('.a9-tiptap-editor__upload button')].find(
        (button) => button.textContent === 'Retry'
      );
      expect(retry).toBeDefined();
      complete({ id: 'old', name: 'image.png', type: 'image', groupId: null, url: '/old.png' });
      await flush();
      expect(instance.getHTML()).not.toContain('/old.png');
      retry?.click();
      await flush();
      expect(instance.getHTML()).toContain('/retry.png');
      expect(instance.getImageUploadState().canSave).toBe(true);
    }
  );
  it('keeps safe pasted HTML images, reports inaccessible images once, and retains table structure', async () => {
    const warning = vi.fn();
    const instance = mountEditor({ onPasteWarning: warning });
    await flush();
    const editor = getInternalEditor(instance);
    editor.view.pasteHTML(
      '<p>Notice<img src="https://example.com/cover.png"><img src="file:///local.png"></p><table><tr><td>A</td><td>B</td></tr></table>'
    );
    await flush();
    expect(instance.getHTML()).toContain('https://example.com/cover.png');
    expect(instance.getHTML()).not.toContain('file:');
    expect(instance.getHTML()).toContain('<table');
    expect(warning).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith({ reason: 'unsupported-image', count: 1 });
  });

  it('round-trips safe colors, highlights and preset sizes through JSON', async () => {
    const instance = mountEditor({
      modelValue: '<p><span style="color:red;font-size:20px;background-color:yellow">Important</span></p>',
    });
    await flush();
    const saved = instance.getJSON();
    const html = instance.getHTML();
    expect(html).toContain('20px');
    expect(html).toContain('color: red');
    expect(html).toContain('<mark');
    const editor = getInternalEditor(instance);
    editor.commands.setContent(saved);
    expect(instance.getHTML()).toBe(html);
  });

  it('clears text formatting but preserves links, tables, and their contents', async () => {
    const instance = mountEditor({
      modelValue:
        '<p><a href="/notice"><strong><span style="color:red;font-size:20px">Notice</span></strong></a></p><table><tr><td>Keep</td></tr></table>',
    });
    await flush();
    const editor = getInternalEditor(instance);
    editor.commands.selectAll();
    document.querySelector<HTMLButtonElement>('button[aria-label="Clear text formatting"]')?.click();
    const html = instance.getHTML();
    expect(html).toContain('href="/notice"');
    expect(html).toContain('<table');
    expect(html).not.toContain('<strong');
    expect(html).not.toContain('font-size');
    expect(html).not.toContain('color: red');
    editor.commands.undo();
    expect(instance.getHTML()).toContain('<strong');
  });

  it('links selected text on URL paste without replacing the label', async () => {
    const instance = mountEditor({ modelValue: '<p>Documentation</p>' });
    await flush();
    const editor = getInternalEditor(instance);
    editor.commands.setTextSelection({ from: 1, to: 14 });
    editor.view.pasteText('https://example.com/docs');
    expect(instance.getHTML()).toContain('href="https://example.com/docs"');
    expect(editor.state.doc.textContent).toBe('Documentation');
  });

  it('merges and splits selected table cells without losing content', async () => {
    const instance = mountEditor({ modelValue: '<table><tr><td>A</td><td>B</td></tr></table>' });
    await flush();
    const editor = getInternalEditor(instance);
    const cells: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell') cells.push(pos);
    });
    editor.view.dispatch(
      editor.state.tr.setSelection(new CellSelection(editor.state.doc.resolve(cells[0]), editor.state.doc.resolve(cells[1])))
    );
    expect(editor.commands.mergeCells()).toBe(true);
    expect(instance.getHTML()).toContain('colspan="2"');
    expect(editor.commands.splitCell()).toBe(true);
    expect(editor.state.doc.textContent).toContain('A');
    expect(editor.state.doc.textContent).toContain('B');
    expect(instance.getHTML()).not.toContain('colspan="2"');
  });

  it('inserts a selected attachment as an ordinary link', async () => {
    const instance = mountEditor({ service: { list: vi.fn() } });
    await flush();
    document.querySelector<HTMLButtonElement>('[data-file-types="document,archive,other"] .media-picker-confirm')?.click();
    expect(instance.getHTML()).toContain('href="/registration.pdf"');
    expect(instance.getHTML()).toContain('Registration.pdf');
  });
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    // Notification transitions outlive individual fixtures on slower CI runners.
    // Assert the calls without mounting Arco's independent notification UI.
    vi.spyOn(Message, 'error').mockImplementation(() => ({} as ReturnType<typeof Message.error>));
    vi.spyOn(Message, 'warning').mockImplementation(() => ({} as ReturnType<typeof Message.warning>));
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

  it('edits JSON, emits independent snapshots, and clears to a native empty document', async () => {
    const onUpdate = vi.fn();
    const onChange = vi.fn();
    const instance = mountEditor({
      'valueFormat': 'json',
      'modelValue': { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] },
      'onUpdate:modelValue': onUpdate,
      'onChange': onChange,
    });
    await flush();
    expect(instance.getHTML()).toBe('<p>Hello</p>');
    expect(onUpdate).not.toHaveBeenCalled();
    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.setTextSelection(6);
    internalEditor.commands.insertContent(' JSON');
    await flush();
    expect(instance.getHTML()).toBe('<p>Hello JSON</p>');
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();
    expect(onUpdate.mock.calls[0][0]).toEqual(instance.getJSON());
    expect(onUpdate.mock.calls[0][0]).not.toBe(onChange.mock.calls[0][0]);
    onUpdate.mock.calls[0][0].content[0].attrs.textAlign = 'right';
    expect(instance.getJSON().content[0].attrs?.textAlign).toBeNull();
    expect(onChange.mock.calls[0][0].content[0].attrs.textAlign).toBeNull();
    instance.clear();
    await flush();
    expect(instance.getHTML()).toBe('');
    expect(onUpdate.mock.lastCall?.[0]).toEqual(internalEditor.getJSON());
    expect(onUpdate.mock.lastCall?.[0].type).toBe('doc');
    expect(onUpdate.mock.lastCall?.[0].content[0].type).toBe('paragraph');
  });

  it.each(['html', 'json'])('initializes omitted %s models without emitting an update', async (valueFormat) => {
    const onUpdate = vi.fn();
    const onContentError = vi.fn();
    const instance = mountEditor({ valueFormat, 'onUpdate:modelValue': onUpdate, onContentError });
    await flush();
    expect(instance.getHTML()).toBe('');
    expect(instance.getJSON().type).toBe('doc');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onContentError).not.toHaveBeenCalled();
  });

  it('keeps each JSON change snapshot paired with its update when the parent immediately clears the editor', async () => {
    let cleared = false;
    let instance: TiptapEditorInstance;
    const onChange = vi.fn();
    const onUpdate = vi.fn(() => {
      if (!cleared) {
        cleared = true;
        instance.clear();
      }
    });
    instance = mountEditor({ 'valueFormat': 'json', 'onUpdate:modelValue': onUpdate, onChange });
    await flush();
    getInternalEditor(instance).commands.insertContent('Submitted');
    await flush();
    expect(instance.getHTML()).toBe('');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[0][0]).toEqual(instance.getJSON());
    expect(onChange.mock.calls[1][0].content[0].content[0].text).toBe('Submitted');
  });

  it('keeps JSON feedback and reordered equivalent objects from resetting selection or history', async () => {
    const value = ref<TiptapDocument>({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }],
    });
    const instanceRef = ref<TiptapEditorInstance>();
    const onUpdate = vi.fn((nextValue: TiptapDocument) => {
      value.value = nextValue;
    });
    const onChange = vi.fn();
    const app = createApp(
      defineComponent({
        setup: () => () =>
          h(ATiptapEditor<'json'>, {
            'ref': instanceRef,
            'valueFormat': 'json',
            'modelValue': value.value,
            'onUpdate:modelValue': onUpdate,
            onChange,
          }),
      })
    );
    app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
    installStubs(app);
    mountedApps.push(app);
    app.mount('#app');
    await flush();
    const instance = instanceRef.value;
    if (!instance) throw new Error('ATiptapEditor did not mount');
    const internalEditor = getInternalEditor(instance);
    const setContent = vi.spyOn(internalEditor.commands, 'setContent');
    internalEditor.commands.setTextSelection(3);
    internalEditor.commands.insertContent('!');
    await flush();
    const { selection } = internalEditor.state;
    const document = internalEditor.state.doc;
    value.value = JSON.parse(
      JSON.stringify(
        value.value,
        Object.keys({
          content: 0,
          attrs: 0,
          textAlign: 0,
          text: 0,
          type: 0,
          marks: 0,
        })
      )
    );
    await flush();
    expect(internalEditor.state.doc).toBe(document);
    expect(internalEditor.state.selection).toBe(selection);
    expect(setContent).not.toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();
    internalEditor.commands.undo();
    expect(instance.getHTML()).toBe('<p>First</p>');
    internalEditor.commands.redo();
    expect(instance.getHTML()).toBe('<p>Fi!rst</p>');
    await flush();
    onUpdate.mockClear();
    onChange.mockClear();
    value.value = {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Replacement' }] }],
    };
    await flush();
    expect(instance.getHTML()).toBe('<h2>Replacement</h2>');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('round-trips tables and every media node through JSON without sharing nested attributes', async () => {
    const instance = mountEditor({
      modelValue: [
        '<table><tr><th colspan="2" colwidth="140,160"><p>Header</p></th></tr>',
        '<tr><td rowspan="2"><p>One</p></td><td><p>Two</p></td></tr><tr><td><p>Three</p></td></tr></table>',
        '<p><strong>Bold</strong><a href="/article" target="_self" class="article-link" rel="ugc">Article</a><img src="/inline.png" data-display="inline" data-size="1.5em"></p>',
        '<img src="/block.png" alt="Cover" data-display="block" data-width="63%" data-align="right">',
        '<video src="/movie.mp4" data-width="75%" data-align="center"></video>',
        '<audio src="/podcast.mp3" data-width="compact" data-align="right"></audio>',
      ].join(''),
    });
    await flush();
    const saved = instance.getJSON();
    const expectedHTML = instance.getHTML();
    const header = saved.content[0].content?.[0].content?.[0];
    expect(header?.attrs?.colspan).toBe(2);
    expect(header?.attrs?.colwidth).toEqual([140, 160]);
    mountedApps.pop()?.unmount();
    document.body.innerHTML = '<div id="app"></div>';
    const reloaded = mountEditor({ valueFormat: 'json', modelValue: saved });
    await flush();
    expect(reloaded.getJSON()).toEqual(saved);
    expect(reloaded.getHTML()).toBe(expectedHTML);
    if (!header?.attrs?.colwidth) throw new Error('Expected header widths');
    header.attrs.colwidth[0] = 999;
    const snapshot = reloaded.getJSON();
    expect(snapshot.content[0].content?.[0].content?.[0].attrs?.colwidth).toEqual([140, 160]);
    const snapshotWidths = snapshot.content[0].content?.[0].content?.[0].attrs?.colwidth;
    if (!snapshotWidths) throw new Error('Expected snapshot widths');
    snapshotWidths[1] = 888;
    expect(reloaded.getJSON().content[0].content?.[0].content?.[0].attrs?.colwidth).toEqual([140, 160]);
    const internalEditor = getInternalEditor(reloaded);
    internalEditor.commands.setTextSelection(4);
    internalEditor.commands.insertContent(' edited');
    expect(reloaded.getHTML()).toContain(' edited');
    internalEditor.commands.setNodeSelection(findNodePosition(internalEditor, 'blockImage'));
    internalEditor.commands.updateAttributes('blockImage', { width: '50%' });
    expect(reloaded.getJSON().content.find((node) => node.type === 'blockImage')?.attrs?.width).toBe('50%');
  });

  it.each([0, -2, 3])('preserves the native ordered-list start %i through JSON reload and editing', async (start) => {
    const original = mountEditor({ modelValue: `<ol start="${start}"><li><p>Item</p></li></ol>` });
    await flush();
    const saved = original.getJSON();
    const html = original.getHTML();
    expect(saved.content[0].attrs?.start).toBe(start);
    mountedApps.pop()?.unmount();
    document.body.innerHTML = '<div id="app"></div>';
    const onUpdate = vi.fn();
    const reloaded = mountEditor({
      'valueFormat': 'json',
      'modelValue': saved,
      'onUpdate:modelValue': onUpdate,
    });
    await flush();
    expect(reloaded.getJSON()).toEqual(saved);
    expect(reloaded.getHTML()).toBe(html);
    const editor = getInternalEditor(reloaded);
    editor.commands.setTextSelection(3);
    editor.commands.insertContent('Edited ');
    await flush();
    expect(onUpdate.mock.lastCall?.[0].content[0].attrs.start).toBe(start);
  });

  it('normalizes JSON media, links and table attributes before rendering without mutating input', async () => {
    const unsafeUrl = ['java', 'script:alert(1)'].join('');
    const modelValue: TiptapDocument = {
      type: 'doc',
      content: [
        { type: 'blockImage', attrs: { src: unsafeUrl } },
        {
          type: 'paragraph',
          attrs: { textAlign: 'invalid' },
          content: [
            { type: 'text', text: 'Unsafe link', marks: [{ type: 'link', attrs: { href: unsafeUrl } }] },
            { type: 'text', text: 'Safe link', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
            { type: 'inlineImage', attrs: { src: '/inline.png', size: '99em' } },
          ],
        },
        { type: 'blockImage', attrs: { src: '/block.png', width: '150%', align: 'justify', alt: 123 } },
        { type: 'video', attrs: { src: '/movie.mp4', width: '150%', align: 'invalid', autoplay: true } },
        { type: 'audio', attrs: { src: '/audio.mp3', width: '200px', align: 'right' } },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  attrs: {
                    colspan: -2,
                    rowspan: 0,
                    colwidth: [-1],
                    align: 'invalid',
                  },
                  content: [{ type: 'paragraph' }],
                },
              ],
            },
          ],
        },
      ],
    };
    const original = JSON.stringify(modelValue);
    const instance = mountEditor({ valueFormat: 'json', modelValue });
    await flush();
    expect(JSON.stringify(modelValue)).toBe(original);
    const nodes = instance.getJSON().content;
    expect(nodes[0].type).toBe('paragraph');
    expect(nodes[0].content?.[0].marks).toBeUndefined();
    expect(nodes[0].content?.[1].marks?.[0].attrs).toMatchObject({
      href: 'https://example.com',
      rel: 'noopener noreferrer nofollow',
    });
    expect(nodes[0].content?.[2].attrs?.size).toBe('1em');
    expect(nodes[1].attrs).toMatchObject({ width: 'natural', align: 'left', alt: '' });
    expect(nodes[2].attrs).toMatchObject({ width: '100%', align: 'left' });
    expect(nodes[3].attrs).toMatchObject({ width: 'standard', align: 'right' });
    expect(nodes[4].content?.[0].content?.[0].attrs).toMatchObject({ colspan: 1, rowspan: 1, colwidth: null, align: null });
    expect(document.querySelector('.a9-tiptap-editor__prose')?.innerHTML).not.toContain(unsafeUrl);
    expect(JSON.stringify(instance.getJSON())).not.toContain(unsafeUrl);
    expect(instance.getHTML()).not.toContain('autoplay');
  });

  it.each([
    ['html', { type: 'doc', content: [] }, 'format-mismatch'],
    ['json', '<p>HTML</p>', 'format-mismatch'],
    ['json', '{"type":"doc","content":[]}', 'format-mismatch'],
    ['json', [{ type: 'paragraph' }], 'invalid-document'],
    ['json', { type: 'doc', content: [{ type: 'unknown' }] }, 'invalid-document'],
    [
      'json',
      {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bad mark', marks: [{ type: 'unknown' }] }] }],
      },
      'invalid-document',
    ],
    ['json', { type: 'doc', content: [{ type: 'text', text: 'Invalid nesting' }] }, 'invalid-document'],
    ['json', null, 'invalid-document'],
  ])(
    'reports invalid %s initial content without emitting an empty replacement (%#)',
    async (valueFormat, modelValue, reason) => {
      const onContentError = vi.fn();
      const onUpdate = vi.fn();
      const instance = mountEditor({ valueFormat, modelValue, onContentError, 'onUpdate:modelValue': onUpdate });
      await flush();
      expect(instance.getHTML()).toBe('');
      expect(onContentError).toHaveBeenCalledOnce();
      expect(onContentError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'initial', reason }));
      expect(onUpdate).not.toHaveBeenCalled();
    }
  );

  it('preserves the document on invalid JSON updates and accepts a later valid replacement', async () => {
    const modelValue = ref<unknown>({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] }],
    });
    const instanceRef = ref<TiptapEditorInstance>();
    const onContentError = vi.fn();
    const onUpdate = vi.fn();
    const app = createApp(
      defineComponent({
        setup: () => () =>
          h(ATiptapEditor<'json'>, {
            'ref': instanceRef,
            'valueFormat': 'json',
            'modelValue': modelValue.value as TiptapDocument,
            onContentError,
            'onUpdate:modelValue': onUpdate,
          }),
      })
    );
    app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
    installStubs(app);
    mountedApps.push(app);
    app.mount('#app');
    await flush();
    const instance = instanceRef.value;
    if (!instance) throw new Error('ATiptapEditor did not mount');
    const original = getInternalEditor(instance).state.doc;
    modelValue.value = { type: 'doc', content: [{ type: 'unknown' }] };
    await flush();
    expect(getInternalEditor(instance).state.doc).toBe(original);
    expect(onContentError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'update', reason: 'invalid-document' }));
    expect(onUpdate).not.toHaveBeenCalled();
    modelValue.value = { type: 'doc', content: [] };
    await flush();
    expect(instance.getHTML()).toBe('');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('applies character limits in JSON mode', async () => {
    const instance = mountEditor({ valueFormat: 'json', maxLength: 5 });
    await flush();
    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.insertContent('12345');
    internalEditor.commands.insertContent('6');
    expect(instance.getHTML()).toBe('<p>12345</p>');
    expect(instance.getJSON().content[0].content?.[0].text).toBe('12345');
  });

  it.each(['readonly', 'disabled'])('renders JSON in %s mode without enabling editing', async (mode) => {
    const instance = mountEditor({
      valueFormat: 'json',
      [mode]: true,
      modelValue: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Locked document' }] },
          { type: 'audio', attrs: { src: '/audio.mp3', width: 'compact' } },
        ],
      },
    });
    await flush();
    expect(getInternalEditor(instance).isEditable).toBe(false);
    expect(instance.getJSON().content[1].attrs?.width).toBe('compact');
    expect(document.querySelector('.a9-tiptap-editor__prose')?.getAttribute('contenteditable')).toBe('false');
    expect(document.querySelector('audio')?.hasAttribute('controls')).toBe(true);
    if (mode === 'readonly') expect(document.querySelector('.a9-tiptap-editor__toolbar')).toBeNull();
    else expect(document.querySelector<HTMLButtonElement>('button[aria-label="Bold"]')?.disabled).toBe(true);
  });

  it('rejects cyclic JSON and text nodes with hidden child nodes', async () => {
    const onContentError = vi.fn();
    const cyclic: TiptapDocument = { type: 'doc', content: [] };
    cyclic.content.push(cyclic);
    mountEditor({ valueFormat: 'json', modelValue: cyclic, onContentError });
    await flush();
    expect(onContentError).toHaveBeenCalledWith(expect.objectContaining({ reason: 'invalid-document' }));
    mountedApps.pop()?.unmount();
    document.body.innerHTML = '<div id="app"></div>';
    onContentError.mockClear();
    mountEditor({
      valueFormat: 'json',
      onContentError,
      modelValue: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hidden', content: [{ type: 'unknown' }] }] }],
      },
    });
    await flush();
    expect(onContentError).toHaveBeenCalledWith(expect.objectContaining({ reason: 'invalid-document' }));
  });

  it('parses, edits, and serializes table HTML', async () => {
    const instance = mountEditor({
      modelValue:
        '<table><tbody><tr><th colspan="2"><p>Header</p></th></tr><tr><td><p>One</p></td><td><p>Two</p></td></tr></tbody></table>',
    });
    await flush();

    const table = document.querySelector('table');
    expect(table).not.toBeNull();
    expect(table?.querySelector('th')?.getAttribute('colspan')).toBe('2');
    expect(instance.getHTML()).toContain('<table');
    expect(instance.getHTML()).toContain('<th colspan="2"');

    const internalEditor = getInternalEditor(instance);
    expect(internalEditor.chain().focus().addRowAfter().run()).toBe(true);
    await flush();
    expect(document.querySelectorAll('table tr')).toHaveLength(3);
    expect(instance.getHTML()).toContain('<table');
  });

  it.each(['readonly', 'disabled'] as const)('keeps column resizing available after initial %s is lifted', async (mode) => {
    const locked = ref(true);
    const editorRef = ref<TiptapEditorInstance>();
    const Root = defineComponent({
      setup: () => () =>
        h(ATiptapEditor, {
          ref: editorRef,
          modelValue: '<table><tr><td>A</td><td>B</td></tr></table>',
          [mode]: locked.value,
        }),
    });
    const app = createApp(Root);
    app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
    installStubs(app);
    mountedApps.push(app);
    app.mount('#app');
    await flush();
    if (!editorRef.value) throw new Error('Editor did not mount');
    const internalEditor = getInternalEditor(editorRef.value);
    const original = internalEditor.getHTML();
    expect(internalEditor.isEditable).toBe(false);
    expect(columnResizingPluginKey.getState(internalEditor.state)).toBeDefined();
    locked.value = false;
    await flush();
    expect(internalEditor.isEditable).toBe(true);
    expect(columnResizingPluginKey.getState(internalEditor.state)).toBeDefined();
    locked.value = true;
    await flush();
    expect(internalEditor.isEditable).toBe(false);
    expect(internalEditor.getHTML()).toBe(original);
  });

  it('previews a rectangle and inserts the selected dimensions without a header', async () => {
    mountEditor();
    await flush();

    const tableButton = document.querySelector<HTMLButtonElement>('button[aria-label="Table"]');
    tableButton?.click();
    await flush();
    expect(document.querySelectorAll('[data-table-size]')).toHaveLength(80);
    const cell = document.querySelector<HTMLButtonElement>('[data-table-size="2-4"]');
    cell?.dispatchEvent(new MouseEvent('mouseenter'));
    await flush();
    expect(document.querySelector('.a9-tiptap-editor__table-size')?.textContent).toBe('2 rows × 4 columns');
    expect(document.querySelectorAll('.a9-tiptap-editor__table-cell.is-selected')).toHaveLength(8);
    cell?.click();
    await waitForEditorStateRender();

    expect(document.querySelectorAll('table tr')).toHaveLength(2);
    expect(document.querySelectorAll('table td')).toHaveLength(8);
    expect(document.querySelectorAll('table th')).toHaveLength(0);
    expect(document.body.textContent).toContain('Insert row below');
    expect(document.body.textContent).toContain('Delete table');
  });

  it('moves the single picker tab stop with arrow keys and cancels with Escape', async () => {
    mountEditor();
    await flush();
    document.querySelector<HTMLButtonElement>('button[aria-label="Table"]')?.click();
    await flush();
    const first = document.querySelector<HTMLButtonElement>('[data-table-size="1-1"]');
    first?.focus();
    first?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await flush();
    expect(document.activeElement?.getAttribute('data-table-size')).toBe('1-2');
    expect(document.querySelectorAll('[data-table-size][tabindex="0"]')).toHaveLength(1);
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(document.querySelector('.a9-tiptap-editor__table-picker')).toBeNull();
    expect(document.querySelector('table')).toBeNull();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Table');
  });

  it('removes a leading empty paragraph before block media when the cursor is already in it and supports undo', async () => {
    const onUpdate = vi.fn();
    const onChange = vi.fn();
    const instance = mountEditor({
      'modelValue': '<p></p><img src="/cover.png" data-display="block">',
      'onUpdate:modelValue': onUpdate,
      'onChange': onChange,
    });
    await flush();

    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.setTextSelection(1);
    internalEditor.view.focus();
    const event = dispatchEditorKey('Backspace');
    await flush();

    expect(event.defaultPrevented).toBe(true);
    expect(instance.getHTML()).not.toContain('<p></p>');
    expect(new DOMParser().parseFromString(instance.getHTML(), 'text/html').body.children).toHaveLength(1);
    expect(internalEditor.state.selection).toBeInstanceOf(GapCursor);
    expect(internalEditor.state.selection.from).toBe(0);
    expect(onUpdate).toHaveBeenLastCalledWith(instance.getHTML());
    expect(onChange).toHaveBeenLastCalledWith(instance.getHTML());

    expect(internalEditor.commands.undo()).toBe(true);
    await flush();
    expect(instance.getHTML()).toContain('<p></p>');
  });

  it.each([
    ['block image', 'blockImage', '<img src="/cover.png" data-display="block">', 'img'],
    ['video', 'video', '<video src="/demo.mp4"></video>', 'video'],
    ['audio', 'audio', '<audio src="/demo.mp3"></audio>', 'audio'],
  ])('removes a leading empty paragraph after moving left from selected %s', async (_label, nodeName, mediaHtml, tagName) => {
    const onUpdate = vi.fn();
    const onChange = vi.fn();
    const instance = mountEditor({
      'modelValue': `<p></p>${mediaHtml}`,
      'onUpdate:modelValue': onUpdate,
      'onChange': onChange,
    });
    await flush();

    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.setNodeSelection(findNodePosition(internalEditor, nodeName));
    internalEditor.view.focus();
    const leftEvent = dispatchEditorKey('ArrowLeft');
    await flush();

    expect(leftEvent.defaultPrevented).toBe(false);
    // happy-dom does not apply native caret movement, so model the browser's ArrowLeft result explicitly.
    internalEditor.commands.setTextSelection(1);
    expect(internalEditor.state.selection).toBeInstanceOf(TextSelection);
    expect(internalEditor.state.selection.from).toBe(1);

    const event = dispatchEditorKey('Backspace');
    await flush();
    const parsedDocument = new DOMParser().parseFromString(instance.getHTML(), 'text/html');

    expect(event.defaultPrevented).toBe(true);
    expect(parsedDocument.body.children).toHaveLength(1);
    expect(parsedDocument.body.firstElementChild?.tagName.toLowerCase()).toBe(tagName);
    expect(internalEditor.state.selection).toBeInstanceOf(GapCursor);
    expect(internalEditor.state.selection.from).toBe(0);
    expect(onUpdate).toHaveBeenLastCalledWith(instance.getHTML());
    expect(onChange).toHaveBeenLastCalledWith(instance.getHTML());
  });

  it.each([
    ['a space', ' '],
    ['a tab', '\t'],
    ['text', 'A'],
  ])('deletes %s as ordinary content without removing its paragraph', async (_label, text) => {
    const instance = mountEditor({ modelValue: '<p></p><img src="/cover.png" data-display="block">' });
    await flush();

    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.setContent({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text }] },
        { type: 'blockImage', attrs: { src: '/cover.png' } },
      ],
    });
    internalEditor.commands.setTextSelection(2);
    internalEditor.view.focus();
    const event = dispatchEditorKey('Backspace');
    await flush();

    expect(event.defaultPrevented).toBe(false);
    expect(internalEditor.state.doc.childCount).toBe(2);
    expect(internalEditor.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(internalEditor.state.doc.firstChild?.textContent).toBe(text);
    expect(internalEditor.state.doc.child(1).type.name).toBe('blockImage');
  });

  it('leaves a leading empty paragraph before a non-media atom to the default keymap', async () => {
    const instance = mountEditor({ modelValue: '<p></p><hr>' });
    await flush();

    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.setTextSelection(1);
    internalEditor.view.focus();
    dispatchEditorKey('Backspace');
    await flush();

    expect(internalEditor.state.doc.childCount).toBe(2);
    expect(internalEditor.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(internalEditor.state.doc.child(1).type.name).toBe('horizontalRule');
  });

  it('leaves a leading empty paragraph before an inline image to the default keymap', async () => {
    const instance = mountEditor({
      modelValue: '<p></p><p><img src="/inline.png" data-display="inline"></p>',
    });
    await flush();

    const internalEditor = getInternalEditor(instance);
    internalEditor.commands.setTextSelection(1);
    internalEditor.view.focus();
    const event = dispatchEditorKey('Backspace');
    await flush();

    expect(event.defaultPrevented).toBe(false);
    expect(internalEditor.state.doc.childCount).toBe(2);
    expect(internalEditor.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(internalEditor.state.doc.child(1).firstChild?.type.name).toBe('inlineImage');
  });

  it('leaves an empty paragraph outside the document start to the default keymap', async () => {
    const instance = mountEditor({
      modelValue: '<p>Before</p><p></p><img src="/cover.png" data-display="block">',
    });
    await flush();

    const internalEditor = getInternalEditor(instance);
    const emptyParagraphPosition = internalEditor.state.doc.child(0).nodeSize;
    internalEditor.commands.setTextSelection(emptyParagraphPosition + 1);
    internalEditor.view.focus();
    dispatchEditorKey('Backspace');
    await flush();

    expect(internalEditor.state.selection).not.toBeInstanceOf(GapCursor);
    expect(internalEditor.state.doc.firstChild?.textContent).toBe('Before');
    expect(internalEditor.state.doc.lastChild?.type.name).toBe('blockImage');
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
    expect(picker?.getAttribute('data-file-types')).toBe('image');
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
    expect(videoPicker?.getAttribute('data-file-types')).toBe('video');
    expect(audioPicker?.getAttribute('data-file-types')).toBe('audio');

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

    expect(replacementPicker?.getAttribute('data-file-types')).toBe('image');
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
