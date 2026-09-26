/* eslint-disable no-await-in-loop, @typescript-eslint/no-non-null-assertion -- Await Vue flushes and assert mounted fixture elements. */
import { createApp, defineComponent, h, nextTick, reactive, ref, type App, type Component } from 'vue';
import ArcoVue, { ConfigProvider, Form, FormItem, Input, type Size } from '@arco-design/web-vue';
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
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  document.body.innerHTML = '';
});

describe('real Arco 2.57 component contracts', () => {
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
    document.querySelector<HTMLInputElement>('[data-file-id="image"] input[type="radio"]')!.click();
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
      h(AFileUploader, { ref: exposed, service: { upload }, fileType: 'image', maxFileSize: 1, disabled: disabled.value })
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
});
