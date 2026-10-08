/* eslint-disable no-await-in-loop, @typescript-eslint/no-non-null-assertion -- Await Vue flushes and assert mounted fixture elements. */
import { createApp, defineComponent, h, nextTick, reactive, ref, type App, type Component } from 'vue';
import ArcoVue, { ConfigProvider, Form, FormItem, Input, Message, type Size } from '@arco-design/web-vue';
import * as Icons from '@arco-design/web-vue/es/icon';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import AProTable from '../src/components/pro-table/index.vue';
import AIconPicker from '../src/components/icon-picker/index.vue';
import ACoordinatePicker from '../src/components/coordinate-picker/index.vue';
import AFilePicker from '../src/components/file-picker/index.vue';
import AImagePicker from '../src/components/image-picker/index.vue';
import AFileUploader from '../src/components/file-uploader/index.vue';
import ACoverPicker from '../src/components/cover-picker/index.vue';
import AChatComposer from '../src/components/chat-composer/index.vue';
import AFilterForm from '../src/components/filter-form/index.vue';
import ATiptapEditor from '../src/components/tiptap-editor/component';
import { messages } from '../src/locale';
import type { AProTableExposed } from '../src/components/pro-table/types';
import type { AFileUploaderExposed } from '../src/components/file-uploader/types';
import type { AFilterFormExposed } from '../src/components/filter-form/types';

const apps: App[] = [];
function mount(render: () => ReturnType<typeof h>) {
  const target = document.createElement('div');
  document.body.append(target);
  const app = createApp(defineComponent({ render }));
  app.use(ArcoVue);
  Object.entries(Icons).forEach(([name, icon]) => app.component(name, icon as Component));
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  app.mount(target);
  apps.push(app);
  return { app, target };
}
async function flush() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
    await nextTick();
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(async () => {
  apps.splice(0).forEach((app) => app.unmount());
  vi.useRealTimers();
  await flush();
  // Message portals finish their leave transition before the document is reset.
  await vi.waitFor(() => expect(document.querySelector('.arco-message-list')).toBeNull());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('real Arco 2.57 component contracts', () => {
  it('keeps picker messages independent from other pickers and application messages', async () => {
    const files = ['one', 'two'].map((id) => ({ id, name: `${id}.png`, type: 'image' as const, url: `/${id}.png` }));
    const service = { list: async () => ({ list: files, pagination: { page: 1, pageSize: 15, total: 2, hasMore: false } }) };
    const first = ref<import('../src').AFilePickerExposed>();
    const second = ref<import('../src').AFilePickerExposed>();
    const disabled = ref(false);
    mount(() => h(AFilePicker, { ref: first, service, multiple: true, limit: 1 }));
    mount(() => h(AFilePicker, { ref: second, service, multiple: true, limit: 1, disabled: disabled.value }));
    const outside = Message.info({ content: 'Application message', duration: 0 });
    try {
      first.value!.open();
      second.value!.open();
      await flush();
      document.querySelectorAll('.a9-file-picker__items').forEach((group) => {
        group.querySelector<HTMLElement>('[data-file-id="one"]')!.click();
        group.querySelector<HTMLElement>('[data-file-id="two"]')!.click();
      });
      await flush();
      expect(document.querySelectorAll('.arco-message-warning:not(.fade-message-leave-active)')).toHaveLength(2);
      first.value!.close();
      await flush();
      expect(document.querySelectorAll('.arco-message-warning:not(.fade-message-leave-active)')).toHaveLength(1);
      disabled.value = true;
      await flush();
      expect(document.querySelector('.arco-message-warning:not(.fade-message-leave-active)')).toBeNull();
      expect(document.querySelector('.arco-message-info')?.textContent).toBe('Application message');
    } finally {
      outside.close();
    }
  });

  it.each(['success', 'partial', 'failed', 'cancelled'] as const)(
    'keeps the %s upload result available without committing the field',
    async (scenario) => {
      let retry = false;
      const pending = deferred<import('../src').FileItem>();
      const change = vi.fn();
      const service: import('../src').FilePickerAdapter = {
        list: async () => ({ list: [], pagination: { page: 1, pageSize: 15, total: 0, hasMore: false } }),
        upload: async ({ file }) => {
          if (scenario === 'cancelled') return pending.promise;
          if (!retry && (scenario === 'failed' || (scenario === 'partial' && file.name === 'two.png')))
            throw new Error('private backend detail');
          return { id: file.name, name: file.name, type: 'image', url: `/${file.name}` };
        },
      };
      mount(() => h(AFilePicker, { service, canUpload: true, onChange: change }));
      document.querySelector<HTMLButtonElement>('[data-testid="file-picker-trigger"]')!.click();
      await flush();
      const input = document.querySelector<HTMLInputElement>('.a9-file-uploader input[type="file"]')!;
      Object.defineProperty(input, 'files', {
        value: ['one.png', 'two.png'].map((name) => new File(['png'], name, { type: 'image/png' })),
      });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
      if (scenario === 'cancelled') {
        document.querySelector<HTMLButtonElement>('[aria-label="Cancel upload for one.png"]')!.click();
        document.querySelector<HTMLButtonElement>('[aria-label="Cancel upload for two.png"]')!.click();
        await flush();
        pending.resolve({ id: 'late', name: 'late.png', type: 'image', url: '/late.png' });
        await flush();
        expect(document.querySelector('[data-testid="file-picker-upload-result"]')?.textContent).toContain('2 cancelled');
      } else {
        const content = document.querySelector('[data-testid="file-picker-upload-result"]')!.textContent!;
        expect(content).not.toContain('private backend detail');
        if (scenario === 'partial') {
          expect(content).toContain('1 file uploaded');
          expect(content).toContain('1 failed');
          retry = true;
          document.querySelector<HTMLButtonElement>('[aria-label="Retry upload for two.png"]')!.click();
          await flush();
          expect(document.querySelector('[data-testid="file-picker-upload-result"]')?.textContent).toContain(
            '2 files uploaded'
          );
          expect(document.querySelector('[data-testid="file-picker-upload-result"]')?.textContent).not.toContain('1 failed');
        } else if (scenario === 'success') {
          expect(content).toContain('2 files uploaded');
        } else {
          expect(content).toContain('2 failed');
        }
      }
      expect(document.querySelector('.arco-message')).toBeNull();
      expect(document.querySelectorAll('[data-testid="file-picker-upload-result"]')).toHaveLength(1);
      expect(document.querySelector('.a9-file-uploader__result')).toBeNull();
      expect(document.querySelector('.a9-file-picker__feedback-strip')).toBeNull();
      expect(change).not.toHaveBeenCalled();
    }
  );
  it('updates selectedKeys and reports official select arguments from real checkboxes', async () => {
    const keys = ref<(string | number)[]>([]);
    const selection = vi.fn();
    const select = vi.fn();
    const rows = [
      { id: 'one', name: 'One' },
      { id: 'two', name: 'Two' },
    ];
    const exposed = ref<AProTableExposed>();
    mount(() =>
      h(AProTable, {
        'ref': exposed,
        'columns': [{ title: 'Name', dataIndex: 'name' }],
        'fetcher': async () => ({ list: rows, total: 2 }),
        'multiple': true,
        'selectedKeys': keys.value,
        'onUpdate:selectedKeys': (value: (string | number)[]) => {
          keys.value = value;
        },
        'onSelectionChange': selection,
        'onSelect': select,
      })
    );
    await flush();
    const checkbox = document.querySelector<HTMLInputElement>('tbody input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    checkbox!.click();
    await flush();
    expect(keys.value).toEqual(['one']);
    expect(selection).toHaveBeenCalledOnce();
    expect(selection).toHaveBeenCalledWith(['one']);
    expect(select).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith(['one'], 'one', rows[0]);
    expect(checkbox!.checked).toBe(true);
    exposed.value!.clearSelection();
    await flush();
    expect(keys.value).toEqual([]);
    expect(checkbox!.checked).toBe(false);
  });

  it('reacts to pageSize and invalidates delayed requests on unmount', async () => {
    const pageSize = ref(10);
    const pending = deferred<{ list: { id: number }[]; total: number }>();
    const fetcher = vi.fn().mockResolvedValueOnce({ list: [], total: 0 }).mockReturnValue(pending.promise);
    const change = vi.fn();
    const error = vi.fn();
    const { app } = mount(() =>
      h(AProTable, { columns: [], fetcher, pageSize: pageSize.value, onDataChange: change, onError: error })
    );
    await flush();
    pageSize.value = 25;
    await flush();
    expect(fetcher).toHaveBeenLastCalledWith({ page: 1, pageSize: 25, keyword: undefined });
    change.mockClear();
    app.unmount();
    apps.splice(apps.indexOf(app), 1);
    pending.resolve({ list: [{ id: 1 }], total: 1 });
    await flush();
    expect(change).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('inherits Form disabled for custom triggers, editor and composer actions, including local false', async () => {
    const disabled = ref(true);
    const submit = vi.fn();
    const list = vi.fn(async () => ({ list: [], pagination: { page: 1, pageSize: 24, total: 0, hasMore: false } }));
    const service = { list };
    const value = { mode: 'single' as const, images: [null] as [null] };
    mount(() =>
      h(
        Form,
        { model: {}, disabled: disabled.value },
        {
          default: () => [
            h(FormItem, {}, { default: () => h(AIconPicker, { disabled: false }) }),
            h(FormItem, {}, { default: () => h(ACoordinatePicker, { apiKey: '', disabled: false }) }),
            h(FormItem, {}, { default: () => h(AFilePicker, { service, disabled: false }) }),
            h(FormItem, {}, { default: () => h(AImagePicker, { service, disabled: false }) }),
            h(FormItem, {}, { default: () => h(ACoverPicker, { service, modelValue: value, disabled: false }) }),
            h(FormItem, {}, { default: () => h(AChatComposer, { modelValue: 'Send me', disabled: false, onSubmit: submit }) }),
            h(FormItem, {}, { default: () => h(ATiptapEditor, { modelValue: '<p>Read me</p>', disabled: false }) }),
          ],
        }
      )
    );
    await flush();
    expect(document.querySelector<HTMLButtonElement>('[data-testid="file-picker-trigger"]')!.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('.a9-image-picker__add')!.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('.a9-chat-composer__action')!.disabled).toBe(true);
    expect(document.querySelector('.ProseMirror')!.getAttribute('contenteditable')).toBe('false');
    document.querySelector<HTMLButtonElement>('.a9-chat-composer__action')!.click();
    expect(submit).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    disabled.value = false;
    await flush();
    expect(document.querySelector<HTMLButtonElement>('[data-testid="file-picker-trigger"]')!.disabled).toBe(false);
    expect(document.querySelector<HTMLButtonElement>('.a9-image-picker__add')!.disabled).toBe(false);
    expect(document.querySelector('.ProseMirror')!.getAttribute('contenteditable')).toBe('true');
  });

  it('validates the committed icon field but not popup search drafts', async () => {
    const model = reactive({ icon: 'icon-home' as string | undefined });
    const validator = vi.fn((_value: unknown, callback: () => void) => callback());
    mount(() =>
      h(
        Form,
        { model },
        {
          default: () =>
            h(
              FormItem,
              {
                field: 'icon',
                rules: [{ validator }],
                validateTrigger: 'change',
              },
              {
                default: () =>
                  h(AIconPicker, {
                    'modelValue': model.icon,
                    'allowClear': true,
                    'onUpdate:modelValue': (value: string | undefined) => {
                      model.icon = value;
                    },
                  }),
              }
            ),
        }
      )
    );
    await flush();
    document.querySelector<HTMLButtonElement>('.a9-icon-picker__clear')!.click();
    await flush();
    expect(model.icon).toBeUndefined();
    expect(validator).toHaveBeenCalledOnce();
  });

  it('inherits all Arco input sizes from Form and ConfigProvider without a medium override', async () => {
    const size = ref<Size>('mini');
    mount(() => h(ConfigProvider, { size: size.value }, { default: () => h(AIconPicker) }));
    await flush();
    expect(document.querySelector('.arco-input')!.classList.contains('arco-input-size-mini')).toBe(true);
    size.value = 'large';
    await flush();
    expect(document.querySelector('.arco-input')!.classList.contains('arco-input-size-large')).toBe(true);
  });

  it('applies composer readonly to the native textarea and guards value changes', async () => {
    const readonly = ref(true);
    const update = vi.fn();
    mount(() => h(AChatComposer, { 'modelValue': 'Read this', 'readonly': readonly.value, 'onUpdate:modelValue': update }));
    await flush();
    const textarea = document.querySelector('textarea')!;
    expect(textarea.readOnly).toBe(true);
    textarea.value = 'blocked';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(update).not.toHaveBeenCalled();
    readonly.value = false;
    await flush();
    expect(textarea.readOnly).toBe(false);
  });

  it('validates a rich-text field only after confirmed media changes its document', async () => {
    const model = reactive({ content: '<p>Before</p>' });
    const values: string[] = [];
    const image = { id: 'image', name: 'Image', type: 'image' as const, groupId: null, url: '/image.png' };
    const service = { list: async () => ({ list: [image], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }) };
    mount(() =>
      h(
        Form,
        { model },
        {
          default: () =>
            h(
              FormItem,
              {
                field: 'content',
                validateTrigger: 'change',
                rules: [
                  {
                    validator: (value: string, callback: () => void) => {
                      values.push(value);
                      callback();
                    },
                  },
                ],
              },
              {
                default: () =>
                  h(ATiptapEditor, {
                    'modelValue': model.content,
                    service,
                    'onUpdate:modelValue': (value: string) => {
                      model.content = value;
                    },
                  }),
              }
            ),
        }
      )
    );
    await flush();
    document.querySelector<HTMLButtonElement>('button[aria-label="Insert image"]')!.click();
    await flush();
    document.querySelector<HTMLInputElement>('[data-file-id="image"] input[type="checkbox"]')!.click();
    await flush();
    expect(values).toEqual([]);
    document.querySelector<HTMLButtonElement>('.a9-file-picker__footer-actions .arco-btn-primary')!.click();
    await flush();
    expect(model.content).toContain('<img');
    expect(values).toEqual([model.content]);
  });

  it('closes the editor file dialog when its FormItem becomes disabled', async () => {
    const disabled = ref(false);
    const service = { list: async () => ({ list: [], pagination: { page: 1, pageSize: 24, total: 0, hasMore: false } }) };
    mount(() =>
      h(
        Form,
        { model: {} },
        { default: () => h(FormItem, { disabled: disabled.value }, { default: () => h(ATiptapEditor, { service }) }) }
      )
    );
    await flush();
    document.querySelector<HTMLButtonElement>('button[aria-label="Insert image"]')!.click();
    await flush();
    const dialog = document.querySelector<HTMLElement>('.a9-file-picker-modal')!;
    expect(dialog).not.toBeNull();
    expect(dialog.style.display).not.toBe('none');
    disabled.value = true;
    await flush();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(dialog.isConnected && dialog.style.display !== 'none').toBe(false);
  });

  it('sets editor readonly and invalid ARIA state on its first render', async () => {
    mount(() =>
      h(
        Form,
        { model: { content: '' } },
        {
          default: () =>
            h(FormItem, { field: 'content', validateStatus: 'error' }, { default: () => h(ATiptapEditor, { readonly: true }) }),
        }
      )
    );
    await flush();
    const editor = document.querySelector('.ProseMirror')!;
    expect(editor.getAttribute('aria-readonly')).toBe('true');
    expect(editor.getAttribute('aria-invalid')).toBe('true');
  });

  it('keeps the real Arco painter controls keyboard accessible and paints without losing the text selection', async () => {
    const exposed = ref<InstanceType<typeof ATiptapEditor>>();
    const update = vi.fn();
    mount(() =>
      h(ATiptapEditor, {
        'ref': exposed,
        'modelValue': '<p><strong>Source</strong></p><p><a href="/target">Target</a></p>',
        'onUpdate:modelValue': update,
      })
    );
    await flush();
    const { editor } = exposed.value!.$.setupState as { editor: Editor };
    editor.commands.setTextSelection({ from: 1, to: 7 });
    editor.view.dom.focus();
    const brush = document.querySelector<HTMLButtonElement>('button[aria-label="Format painter"]')!;
    brush.focus();
    brush.click();
    await flush();
    expect(brush.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(editor.view.dom);
    expect(update).not.toHaveBeenCalled();
    editor.commands.setTextSelection({ from: 9, to: 15 });
    const apply = document.querySelector<HTMLButtonElement>('.a9-tiptap-editor__painter button')!;
    apply.focus();
    expect(brush.getAttribute('aria-pressed')).toBe('true');
    apply.click();
    await flush();
    expect(update).toHaveBeenCalledOnce();
    expect(exposed.value!.getHTML()).toContain('href="/target"');
    expect(editor.state.doc.child(1).firstChild!.marks.map((mark) => mark.type.name)).toContain('bold');
    expect(document.activeElement).toBe(editor.view.dom);
  });

  it('does not turn editor disabled/readonly changes into content updates', async () => {
    const state = reactive({ disabled: false, readonly: false });
    const update = vi.fn();
    const change = vi.fn();
    mount(() =>
      h(ATiptapEditor, { ...state, 'modelValue': '<p>Keep this</p>', 'onUpdate:modelValue': update, 'onChange': change })
    );
    await flush();
    state.disabled = true;
    await flush();
    state.disabled = false;
    state.readonly = true;
    await flush();
    expect(update).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    expect(document.querySelector('.ProseMirror')!.getAttribute('aria-readonly')).toBe('true');
  });

  it('keeps size failures blocked on retry and rejects commands while disabled', async () => {
    const upload = vi.fn();
    const exposed = ref<AFileUploaderExposed>();
    const disabled = ref(false);
    mount(() =>
      h(AFileUploader, { ref: exposed, service: { upload }, fileTypes: ['image'], maxFileSize: 1, disabled: disabled.value })
    );
    const result = await exposed.value!.upload([new File(['too large'], 'large.png', { type: 'image/png' })]);
    exposed.value!.retry(result.failed[0].task.id);
    await flush();
    expect(upload).not.toHaveBeenCalled();
    expect(exposed.value!.tasks[0].failureReason).toBe('file-size');
    disabled.value = true;
    await flush();
    await expect(exposed.value!.upload([new File(['a'], 'a.png')])).rejects.toThrow('disabled');
    expect(upload).not.toHaveBeenCalled();
  });

  it('forwards official form submitSuccess once and exposes resetFields to restore initial values', async () => {
    const model = reactive({ name: 'initial' });
    const exposed = ref<AFilterFormExposed>();
    const success = vi.fn();
    const search = vi.fn();
    mount(() =>
      h(
        AFilterForm,
        { ref: exposed, model, onSubmitSuccess: success, onSearch: search },
        {
          default: () => h(FormItem, { field: 'name' }, { default: () => h(Input, { modelValue: model.name }) }),
        }
      )
    );
    model.name = 'changed';
    await flush();
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(success).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledOnce();
    exposed.value!.resetFields();
    await flush();
    expect(model.name).toBe('initial');
  });
  it('selects a whole file card once while native checkboxes and preview remain independent', async () => {
    const file = { id: 'image', name: 'Image.png', type: 'image' as const, groupId: null, url: '/image.png' };
    const selection = vi.fn();
    mount(() =>
      h(AFilePicker, {
        service: { list: async () => ({ list: [file], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }) },
        multiple: true,
        onSelectionChange: selection,
      })
    );
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-trigger"]')!.click();
    await flush();
    document.querySelector<HTMLElement>('.a9-file-item__name')!.click();
    await flush();
    expect(selection).toHaveBeenCalledTimes(1);
    expect(selection).toHaveBeenLastCalledWith([file]);
    document.querySelector<HTMLInputElement>('.a9-file-picker__checkbox input')!.click();
    await flush();
    expect(selection).toHaveBeenCalledTimes(2);
    expect(selection).toHaveBeenLastCalledWith([]);
    document.querySelector<HTMLButtonElement>('[aria-label="Preview Image.png"]')!.click();
    await flush();
    expect(selection).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.arco-image-preview')).not.toBeNull();
    expect(document.querySelector('.a9-file-picker__sidebar')).toBeNull();
    expect(document.querySelector('.a9-file-picker__search button')?.textContent).toBe('Search');
  });

  it.each(['grid', 'list'] as const)('toggles a single %s item off while keeping at most one selected draft', async (view) => {
    const first = { id: 'first', name: 'First.png', type: 'image' as const, groupId: null, url: '/first.png' };
    const second = { ...first, id: 'second', name: 'Second.png', url: '/second.png' };
    const update = vi.fn();
    mount(() =>
      h(AFilePicker, {
        'service': {
          list: async () => ({ list: [first, second], pagination: { page: 1, pageSize: 24, total: 2, hasMore: false } }),
        },
        'defaultView': view,
        'fileTypes': ['image'],
        'onUpdate:modelValue': update,
      })
    );
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-trigger"]')!.click();
    await flush();
    const card = document.querySelector<HTMLElement>('[data-file-id="first"]')!;
    card.click();
    await flush();
    expect(card.classList.contains('is-selected')).toBe(true);
    if (view === 'grid') expect(card.querySelector('.a9-file-picker__selection-order')?.textContent).toBe('1');
    card.click();
    await flush();
    expect(card.classList.contains('is-selected')).toBe(false);
    expect(card.querySelector('.a9-file-picker__selection-order')).toBeNull();
    expect(update).not.toHaveBeenCalled();
    const input = card.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await flush();
    expect(input.checked).toBe(true);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await flush();
    expect(input.checked).toBe(false);
    card.click();
    document.querySelector<HTMLElement>('[data-file-id="second"]')!.click();
    await flush();
    expect(document.querySelectorAll('.a9-file-picker__item.is-selected')).toHaveLength(1);
    expect(card.classList.contains('is-selected')).toBe(false);
    document.querySelector<HTMLButtonElement>('.a9-file-picker__footer-actions button:last-child')!.click();
    await flush();
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(second);
  });

  it('renumbers selected grid cards and appends reselected items to the draft order', async () => {
    const first = { id: 'first', name: 'First.png', type: 'image' as const, groupId: null, url: '/first.png' };
    const second = { ...first, id: 'second', name: 'Second.png' };
    mount(() =>
      h(AFilePicker, {
        multiple: true,
        service: {
          list: async () => ({ list: [first, second], pagination: { page: 1, pageSize: 24, total: 2, hasMore: false } }),
        },
      })
    );
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-trigger"]')!.click();
    await flush();
    const firstCard = document.querySelector<HTMLElement>('[data-file-id="first"]')!;
    const secondCard = document.querySelector<HTMLElement>('[data-file-id="second"]')!;
    firstCard.click();
    secondCard.click();
    await flush();
    expect(firstCard.querySelector('.a9-file-picker__selection-order')?.textContent).toBe('1');
    expect(secondCard.querySelector('.a9-file-picker__selection-order')?.textContent).toBe('2');
    firstCard.click();
    await flush();
    expect(secondCard.querySelector('.a9-file-picker__selection-order')?.textContent).toBe('1');
    firstCard.click();
    await flush();
    expect(firstCard.querySelector('.a9-file-picker__selection-order')?.textContent).toBe('2');
  });

  it.each(['list', 'custom'] as const)(
    'keeps %s selection controls outside thumbnails and independent of item markup',
    async (view) => {
      const file = { id: 'image', name: 'Image.png', type: 'image' as const, groupId: null, url: '/image.png' };
      const selection = vi.fn();
      mount(() =>
        h(
          AFilePicker,
          {
            service: { list: async () => ({ list: [file], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }) },
            defaultView: 'list',
            multiple: true,
            onSelectionChange: selection,
          },
          view === 'custom'
            ? {
                item: ({
                  item,
                  available,
                  selected,
                  view: itemView,
                }: {
                  item: typeof file;
                  available: boolean;
                  selected: boolean;
                  view: string;
                }) => h('div', { class: 'custom-file-item' }, `${item.name}:${available}:${selected}:${itemView}`),
              }
            : {}
        )
      );
      document.querySelector<HTMLButtonElement>('[data-testid="file-picker-trigger"]')!.click();
      await flush();
      const control = document.querySelector<HTMLInputElement>('.a9-file-picker__item input[type="checkbox"]')!;
      expect(control.closest('.a9-file-item__visual')).toBeNull();
      if (view === 'list') expect(control.closest('.a9-file-item__selection')).not.toBeNull();
      else expect(control.closest('.custom-file-item')).toBeNull();
      control.click();
      await flush();
      expect(selection).toHaveBeenCalledOnce();
      expect(selection).toHaveBeenCalledWith([file]);
    }
  );
  it('keeps a passive count on narrow screens and commits card deselection only on confirm', async () => {
    const viewport = new EventTarget() as EventTarget & { matches: boolean };
    viewport.matches = true;
    const originalMatchMedia = window.matchMedia.bind(window);
    vi.stubGlobal('matchMedia', (query: string) => (query === '(max-width: 720px)' ? viewport : originalMatchMedia(query)));
    const update = vi.fn();
    const file = { id: 'narrow', name: 'Narrow.png', type: 'image' as const, groupId: 'work', url: '/narrow.png' };
    mount(() =>
      h(AFilePicker, {
        'service': {
          list: async () => ({ list: [file], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }),
          listGroups: async () => [{ id: 'work', name: 'Work' }],
        },
        'multiple': true,
        'modelValue': [file],
        'onUpdate:modelValue': update,
      })
    );
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-trigger"]')!.click();
    await flush();
    expect(document.querySelector('.a9-file-picker__sidebar')).toBeNull();
    expect(document.querySelector('.a9-file-picker__compact-groups .arco-select')).not.toBeNull();
    const count = document.querySelector<HTMLElement>('.a9-file-picker__selected-count')!;
    expect(count.textContent).toBe('1 selected');
    expect(count.tabIndex).toBe(-1);
    count.click();
    await flush();
    expect(document.querySelector('.a9-file-picker__selection-panel')).toBeNull();
    document.querySelector<HTMLInputElement>('.a9-file-picker-modal input[type="checkbox"]')!.click();
    await flush();
    expect(update).not.toHaveBeenCalled();
    expect(count.textContent).toBe('0 selected');
    viewport.matches = false;
    viewport.dispatchEvent(new Event('change'));
    await flush();
    expect(document.querySelector('.a9-file-picker__compact-groups')).toBeNull();
    expect(document.querySelector('.a9-file-picker__sidebar')).not.toBeNull();
    expect(document.querySelector<HTMLButtonElement>('.a9-file-picker__footer-actions button:last-child')!.disabled).toBe(
      false
    );
    document.querySelector<HTMLButtonElement>('.a9-file-picker__footer-actions button:last-child')!.click();
    await flush();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith([]);
  });
  it('makes image preview controls keyboard accessible and restores the actual trigger', async () => {
    const file = { id: 'preview', name: 'Preview.png', type: 'image' as const, groupId: null, url: '/preview.png' };
    const selection = vi.fn();
    const visibility = vi.fn();
    mount(() =>
      h(AFilePicker, {
        service: { list: async () => ({ list: [file], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } }) },
        multiple: true,
        onSelectionChange: selection,
        onVisibleChange: visibility,
      })
    );
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-trigger"]')!.click();
    await flush();
    const trigger = document.querySelector<HTMLButtonElement>('[aria-label="Preview Preview.png"]')!;
    trigger.focus();
    trigger.click();
    await flush();
    const host = document.querySelector<HTMLElement>('.a9-file-image-preview')!;
    const close = host.querySelector<HTMLElement>('[aria-label="Close preview"]')!;
    expect(document.activeElement).toBe(close);
    const img = host.querySelector<HTMLImageElement>('img')!;
    Object.defineProperty(img, 'naturalWidth', { value: 640 });
    Object.defineProperty(img, 'naturalHeight', { value: 480 });
    img.dispatchEvent(new Event('load'));
    await flush();
    expect(host.querySelectorAll('[role="button"][tabindex="0"]')).toHaveLength(7);
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Fill preview');
    const rotate = host.querySelector<HTMLElement>('[aria-label="Rotate right"]')!;
    rotate.focus();
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await flush();
    expect(img.style.transform).toContain('rotate(90deg)');
    expect(document.activeElement).toBe(rotate);
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await flush();
    expect(img.style.transform).toContain('rotate(180deg)');
    expect(document.activeElement).toBe(rotate);
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Rotate left');
    close.focus();
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await flush();
    expect(document.querySelector('.a9-file-image-preview')).toBeNull();
    expect(document.querySelector('.a9-file-picker-modal')).not.toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(selection).not.toHaveBeenCalled();
    document.documentElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(visibility).toHaveBeenLastCalledWith(false);
  });

  it.each([false, true])(
    'falls back to search when the previewed card disappears (other files remain: %s)',
    async (hasOtherFiles) => {
      const file = { id: 'fallback', name: 'Fallback.png', type: 'image' as const, groupId: null, url: '/fallback.png' };
      const other = { ...file, id: 'other', name: 'Other.png' };
      let files = [file];
      const disabled = ref(false);
      const picker = ref<import('../src').AFilePickerExposed>();
      const visibility = vi.fn();
      const service = {
        list: async () => ({ list: files, pagination: { page: 1, pageSize: 24, total: files.length, hasMore: false } }),
      };
      mount(() => h(AFilePicker, { ref: picker, service, disabled: disabled.value, onVisibleChange: visibility }));
      document.querySelector<HTMLButtonElement>('[data-testid="file-picker-trigger"]')!.click();
      await flush();
      document.querySelector<HTMLButtonElement>('[aria-label="Preview Fallback.png"]')!.click();
      await flush();
      files = hasOtherFiles ? [other] : [];
      await picker.value!.refresh();
      await flush();
      expect(document.querySelector('.a9-file-image-preview')).toBeNull();
      expect(document.activeElement).toBe(document.querySelector('.a9-file-picker__search input'));
      document.documentElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await flush();
      expect(visibility).toHaveBeenLastCalledWith(false);
      picker.value!.open();
      await flush();
      files = [file];
      await picker.value!.refresh();
      await flush();
      document.querySelector<HTMLButtonElement>('[aria-label="Preview Fallback.png"]')!.click();
      await flush();
      disabled.value = true;
      await flush();
      expect(document.querySelector('.a9-file-image-preview')).toBeNull();
      expect(document.activeElement?.closest('.a9-file-image-preview')).toBeNull();
    }
  );

  it('restores the same file selection control when its preview button is rebuilt', async () => {
    const file = { id: 'rebuilt', name: 'Rebuilt.png', type: 'image' as const, url: '/rebuilt.png' };
    const other = { ...file, id: 'other', name: 'Other.png' };
    let files = [file, other];
    const picker = ref<import('../src').AFilePickerExposed>();
    mount(() =>
      h(AFilePicker, {
        ref: picker,
        service: { list: async () => ({ list: files, pagination: { page: 1, pageSize: 24, total: 2, hasMore: false } }) },
      })
    );
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-trigger"]')!.click();
    await flush();
    const group = document.querySelector<HTMLElement>('.a9-file-picker__items')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('File results');
    expect(group.hasAttribute('tabindex')).toBe(false);
    const trigger = document.querySelector<HTMLButtonElement>('[aria-label="Preview Rebuilt.png"]')!;
    trigger.click();
    await flush();
    // The rendered key includes the page index: reordering rebuilds the original card.
    files = [other, file];
    await picker.value!.refresh();
    await flush();
    expect(trigger.isConnected).toBe(false);
    expect(document.querySelector('.a9-file-image-preview')).not.toBeNull();
    document.querySelector<HTMLElement>('[aria-label="Close preview"]')!.click();
    await flush();
    expect(document.activeElement).toBe(document.querySelector('[data-file-id="rebuilt"] input[type="checkbox"]'));
  });
});
