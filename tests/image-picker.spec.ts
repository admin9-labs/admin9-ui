/* eslint-disable no-script-url, no-await-in-loop, @typescript-eslint/no-non-null-assertion -- Exercise real Arco controls and asynchronous Vue updates. */
import { createApp, defineComponent, h, nextTick, reactive, ref, shallowRef, toRef, type App, type Component } from 'vue';
import ArcoVue, { Form, FormItem, Message, type FormInstance } from '@arco-design/web-vue';
import * as Icons from '@arco-design/web-vue/es/icon';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '../src/locale';
import Admin9UI, {
  AImagePicker,
  type AImagePickerExposed,
  type AImagePickerProps,
  type ImagePickerValue,
  type FileItem,
  type FilePickerAdapter,
} from '../src';

const apps: App[] = [];
const a: FileItem = {
  id: 'a',
  name: 'A.png',
  type: 'image',
  groupId: null,
  url: '/a.png',
  thumbnail: '/thumb-a.png',
  status: 'ready',
};
const b: FileItem = { ...a, id: 'b', name: 'B.png', url: '/b.png', thumbnail: undefined };
const c: FileItem = { ...b, id: 'c', name: 'C.png', url: '/c.png' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function serviceFor(items = [a, b, c]): FilePickerAdapter {
  return {
    list: vi.fn(async ({ page, pageSize, keyword }) => {
      const filtered = items.filter((item) => !keyword || item.name.includes(keyword));
      return {
        list: filtered.slice((page - 1) * pageSize, page * pageSize),
        pagination: { page, pageSize, total: filtered.length, hasMore: page * pageSize < filtered.length },
      };
    }),
  };
}
async function flush() {
  for (let index = 0; index < 8; index += 1) await nextTick();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  await nextTick();
}
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}
function click(selector: string) {
  element(selector).click();
}
function choose(id: string) {
  click(`[data-file-id="${id}"] input`);
}
async function confirm() {
  await nextTick();
  click('.a9-file-picker__footer-actions .arco-btn-primary');
  await flush();
}
async function cancel() {
  click('.a9-file-picker__footer-actions button:first-child');
  await flush();
}
function cards() {
  return document.querySelectorAll('.a9-image-picker .arco-upload-list-picture');
}
function action(name: string, index = 0) {
  return document.querySelectorAll<HTMLButtonElement>(`.a9-image-picker button[aria-label="${name}"]`)[index];
}
function mount(
  options: {
    value?: ImagePickerValue;
    props?: Partial<AImagePickerProps>;
    service?: FilePickerAdapter;
    echo?: boolean;
    inlineFormModel?: boolean;
    custom?: boolean;
    injected?: boolean;
    validate?: ReturnType<typeof vi.fn>;
    onChange?: (value: ImagePickerValue) => void;
  } = {}
) {
  const form = reactive<{ images: ImagePickerValue }>({ images: options.value });
  const model = toRef(form, 'images');
  const props = reactive<AImagePickerProps>({ ...options.props });
  const service = shallowRef(options.service ?? serviceFor());
  const disabled = ref(false);
  const recordKey = ref(1);
  const exposed = ref<AImagePickerExposed>();
  const formRef = ref<FormInstance>();
  const update = vi.fn((value: ImagePickerValue) => {
    if (options.echo !== false) model.value = value;
  });
  const change = vi.fn(options.onChange);
  const confirmed = vi.fn();
  const cleared = vi.fn();
  const visible = vi.fn();
  const uploaded = vi.fn();
  const uploadError = vi.fn();
  const app = createApp(
    defineComponent({
      render: () =>
        h(
          Form,
          { ref: formRef, model: options.inlineFormModel ? { ...form } : form, disabled: disabled.value, size: 'small' },
          {
            default: () =>
              h(
                FormItem,
                { field: 'images', label: 'Images', rules: options.validate ? [{ validator: options.validate }] : undefined },
                {
                  default: () =>
                    h(
                      AImagePicker,
                      {
                        ...props,
                        'key': recordKey.value,
                        'ref': exposed,
                        'service': options.injected ? undefined : service.value,
                        'modelValue': model.value,
                        'onUpdate:modelValue': update,
                        'onChange': change,
                        'onConfirm': confirmed,
                        'onClear': cleared,
                        'onVisibleChange': visible,
                        'onUploadSuccess': uploaded,
                        'onUploadError': uploadError,
                      },
                      options.custom
                        ? {
                            trigger: ({
                              open,
                              disabled: blocked,
                              limitReached,
                            }: {
                              open: () => void;
                              disabled: boolean;
                              limitReached: boolean;
                            }) =>
                              h(
                                'button',
                                {
                                  'type': 'button',
                                  'data-testid': 'custom-image-trigger',
                                  'data-limit': String(limitReached),
                                  'disabled': blocked,
                                  'onClick': open,
                                },
                                'Custom images'
                              ),
                          }
                        : undefined
                    ),
                }
              ),
          }
        ),
    })
  );
  app.use(ArcoVue);
  Object.entries(Icons).forEach(([name, icon]) => app.component(name, icon as Component));
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  if (options.injected) app.use(Admin9UI, { fileService: service.value });
  const host = document.createElement('div');
  document.body.append(host);
  app.mount(host);
  apps.push(app);
  return {
    app,
    model,
    props,
    service,
    disabled,
    recordKey,
    exposed,
    formRef,
    update,
    change,
    confirmed,
    cleared,
    visible,
    uploaded,
    uploadError,
  };
}
async function openHost(host: ReturnType<typeof mount>) {
  host.exposed.value!.open();
  await flush();
}
async function upload(file = new File(['image'], 'upload.png', { type: 'image/png' })) {
  const input = element<HTMLInputElement>('.a9-file-uploader input[type=file]');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
}

beforeEach(() => {
  vi.spyOn(Message, 'warning').mockReturnValue({ close: () => undefined });
});

afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('AImagePicker with real Arco', () => {
  it.each([
    { pageSize: undefined, expected: 15 },
    { pageSize: 3, expected: 3 },
  ])('uses picker pagination capacity $expected when pageSize is $pageSize', async ({ pageSize, expected }) => {
    const host = mount({ props: { pageSize } });
    await openHost(host);
    expect(host.service.value.list).toHaveBeenCalledOnce();
    expect(host.service.value.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: expected,
      keyword: undefined,
      fileType: 'image',
      groupId: undefined,
    });
  });

  it('renders controlled images without listing, uploading or writing on mount and external display updates', async () => {
    const host = mount({ value: a, injected: true });
    await flush();
    expect(cards()).toHaveLength(1);
    expect(element('img').getAttribute('src')).toBe('/thumb-a.png');
    expect(host.service.value.list).not.toHaveBeenCalled();
    host.model.value = b;
    await flush();
    expect(element('.a9-image-picker img').getAttribute('src')).toBe('/b.png');
    expect(host.update).not.toHaveBeenCalled();
    expect(host.change).not.toHaveBeenCalled();
  });

  it('applies the four display modes and both thumbnail fits without changing the controlled value', async () => {
    const host = mount({ value: a });
    const root = element('.a9-image-picker');
    expect(root.classList.contains('a9-image-picker--square')).toBe(true);
    expect(root.classList.contains('a9-image-picker--fit-contain')).toBe(true);
    const assertDisplay = async (
      displayMode: NonNullable<AImagePickerProps['displayMode']>,
      fit: NonNullable<AImagePickerProps['fit']>
    ) => {
      host.props.displayMode = displayMode;
      host.props.fit = fit;
      await flush();
      expect(root.classList.contains(`a9-image-picker--${displayMode}`)).toBe(true);
      expect(root.classList.contains(`a9-image-picker--fit-${fit}`)).toBe(true);
      expect(cards()).toHaveLength(1);
      expect(host.model.value).toEqual(a);
    };
    await assertDisplay('landscape', 'cover');
    await assertDisplay('portrait', 'cover');
    await assertDisplay('banner', 'cover');
    await assertDisplay('square', 'contain');
    expect(host.update).not.toHaveBeenCalled();
    expect(host.change).not.toHaveBeenCalled();
  });

  it('uses the same display mode for empty entries and every selected card', async () => {
    const host = mount({ value: [], props: { multiple: true, displayMode: 'banner', fit: 'cover' } });
    expect(element('.a9-image-picker').classList.contains('a9-image-picker--banner')).toBe(true);
    expect(document.querySelector('.a9-image-picker__add')).not.toBeNull();
    host.model.value = [a, b];
    await flush();
    expect(cards()).toHaveLength(2);
    expect(element('.a9-image-picker').classList.contains('a9-image-picker--fit-cover')).toBe(true);
    expect(document.querySelector('.a9-image-picker__add')).not.toBeNull();
    expect(host.update).not.toHaveBeenCalled();
  });

  it('cancels a single selection and only commits on confirmation, including same-value confirm', async () => {
    const host = mount({ value: a });
    await openHost(host);
    choose('b');
    await cancel();
    expect(host.model.value).toEqual(a);
    expect(host.change).not.toHaveBeenCalled();
    await openHost(host);
    choose('b');
    await confirm();
    expect(host.model.value).toEqual(b);
    expect(host.change).toHaveBeenCalledOnce();
    expect(host.confirmed).toHaveBeenLastCalledWith([b]);
    await openHost(host);
    await confirm();
    expect(host.change).toHaveBeenCalledOnce();
    expect(host.confirmed).toHaveBeenCalledTimes(2);
  });

  it('does not optimistically mutate cards when the parent declines a committed value', async () => {
    const host = mount({ value: a, echo: false });
    await openHost(host);
    choose('b');
    await confirm();
    expect(host.update).toHaveBeenCalledWith(b);
    expect(element('.a9-image-picker img').getAttribute('src')).toBe('/thumb-a.png');
    await openHost(host);
    expect(element<HTMLInputElement>('[data-file-id="a"] input').checked).toBe(true);
  });

  it('keeps cross-page order and limits while custom triggers remain available at capacity', async () => {
    const host = mount({ value: [], props: { multiple: true, limit: 2, pageSize: 1 }, custom: true });
    await openHost(host);
    choose('a');
    await flush();
    click('.arco-pagination-item-next');
    await flush();
    choose('b');
    await flush();
    click('.arco-pagination-item-next');
    await flush();
    choose('c');
    await confirm();
    expect(host.model.value).toEqual([a, b]);
    expect(element('[data-testid="custom-image-trigger"]').getAttribute('data-limit')).toBe('true');
    click('[data-testid="custom-image-trigger"]');
    await flush();
    choose('a');
    await confirm();
    expect(host.model.value).toEqual([b]);
  });

  it('replaces in place at capacity and rejects duplicate replacements without leaking the inner value', async () => {
    const warn = vi.mocked(Message.warning);
    const host = mount({ value: [a, b], props: { multiple: true, limit: 2 } });
    expect(document.querySelector('.a9-image-picker__add')).toBeNull();
    action('Replace image', 1).click();
    await flush();
    choose('a');
    await confirm();
    expect(host.model.value).toEqual([a, b]);
    expect(host.change).not.toHaveBeenCalled();
    expect(host.confirmed).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('This image is already in the list');
    action('Replace image', 1).click();
    await flush();
    expect(element<HTMLInputElement>('[data-file-id="b"] input').checked).toBe(true);
    choose('c');
    await confirm();
    expect(host.model.value).toEqual([a, c]);
    expect(host.confirmed).toHaveBeenLastCalledWith([a, c]);
  });

  it('keeps the original image if its replacement draft becomes unavailable', async () => {
    const service = serviceFor([{ ...a, status: 'failed' }]);
    const host = mount({ value: a, service });
    action('Replace image').click();
    await flush();
    await confirm();
    expect(host.model.value).toEqual(a);
    expect(host.update).not.toHaveBeenCalled();
    expect(host.confirmed).not.toHaveBeenCalled();
  });

  it('removes and clears references without any service calls and preserves single/array empty shapes', async () => {
    const host = mount({ value: [a, b], props: { multiple: true, limit: 2 } });
    action('Remove image').click();
    await flush();
    expect(host.model.value).toEqual([b]);
    expect(document.querySelector('.a9-image-picker__add')).not.toBeNull();
    host.exposed.value!.clear();
    await flush();
    expect(host.model.value).toEqual([]);
    expect(host.cleared).toHaveBeenCalledOnce();
    expect(host.service.value.list).not.toHaveBeenCalled();
    host.props.multiple = false;
    host.model.value = a;
    await flush();
    action('Remove image').click();
    await flush();
    expect(host.model.value).toBeUndefined();
    expect(host.confirmed).not.toHaveBeenCalled();
  });

  it('keeps different IDs with identical URLs and submits metadata changes', async () => {
    const sameUrl = { ...b, url: a.url };
    const host = mount({
      value: [a, sameUrl],
      props: { multiple: true },
      service: serviceFor([{ ...a, name: 'Updated name' }, sameUrl]),
    });
    expect(cards()).toHaveLength(2);
    await openHost(host);
    await confirm();
    expect(host.change).toHaveBeenCalledWith([{ ...a, name: 'Updated name' }, sameUrl]);
  });

  it('normalizes invalid and excess external values without writing until explicit confirmation', async () => {
    const host = mount({ value: [a, b, c], props: { multiple: true, limit: 1 } });
    expect(cards()).toHaveLength(1);
    expect(host.update).not.toHaveBeenCalled();
    await openHost(host);
    await confirm();
    expect(host.model.value).toEqual([a]);
    await openHost(host);
    await confirm();
    expect(host.update).toHaveBeenCalledOnce();
    host.model.value = [a, { ...a }, { ...b, url: 'javascript:alert(1)' }, c];
    await flush();
    expect(cards()).toHaveLength(1);
    expect(element('.a9-image-picker img').getAttribute('src')).toBe('/c.png');
    host.props.multiple = false;
    await flush();
    expect(cards()).toHaveLength(0);
    host.exposed.value!.clear();
    await flush();
    expect(host.model.value).toBeUndefined();
  });

  it('treats invalid limits as unlimited without changing multiple value shape', async () => {
    const host = mount({ value: [], props: { multiple: true, limit: -1 } });
    await openHost(host);
    choose('a');
    choose('b');
    await confirm();
    expect(host.model.value).toEqual([a, b]);
    host.props.limit = 1;
    await flush();
    await openHost(host);
    await confirm();
    expect(host.model.value).toEqual([a]);
  });

  it('preserves drafts across equal writeback and display-only changes but cancels genuine external changes', async () => {
    const host = mount({ value: a });
    await openHost(host);
    choose('b');
    await flush();
    host.model.value = { ...a };
    host.props.showFileList = false;
    host.props.size = 'large';
    host.props.displayMode = 'landscape';
    host.props.fit = 'cover';
    await flush();
    expect(element<HTMLInputElement>('[data-file-id="b"] input').checked).toBe(true);
    expect(element('.a9-image-picker').classList.contains('a9-image-picker--landscape')).toBe(true);
    expect(element('.a9-image-picker').classList.contains('a9-image-picker--fit-cover')).toBe(true);
    await confirm();
    expect(host.model.value).toEqual(b);
    await openHost(host);
    choose('c');
    host.model.value = a;
    await flush();
    expect(host.visible).toHaveBeenLastCalledWith(false);
    expect(host.change).toHaveBeenCalledOnce();
  });

  it('invalidates queued opens, late list results, service changes and record remounts', async () => {
    const late = deferred<Awaited<ReturnType<FilePickerAdapter['list']>>>();
    const host = mount({ value: a, service: { list: vi.fn(() => late.promise) } });
    host.exposed.value!.open();
    host.exposed.value!.close();
    await flush();
    expect(host.service.value.list).not.toHaveBeenCalled();
    await openHost(host);
    host.service.value = serviceFor();
    await flush();
    late.resolve({ list: [c], pagination: { page: 1, pageSize: 24, total: 1, hasMore: false } });
    await flush();
    expect(host.visible).toHaveBeenLastCalledWith(false);
    expect(host.update).not.toHaveBeenCalled();
    await openHost(host);
    choose('b');
    host.recordKey.value += 1;
    await flush();
    expect(host.model.value).toEqual(a);
    expect(host.update).not.toHaveBeenCalled();
  });

  it('inherits Form disabled, guards exposed and custom commands, and leaves readonly preview available', async () => {
    const host = mount({ value: a, custom: true });
    host.disabled.value = true;
    await flush();
    host.exposed.value!.open();
    host.exposed.value!.clear();
    await flush();
    expect(host.service.value.list).not.toHaveBeenCalled();
    expect(action('Preview image')).toBeUndefined();
    expect(element<HTMLButtonElement>('[data-testid="custom-image-trigger"]').disabled).toBe(true);
    host.disabled.value = false;
    host.props.readonly = true;
    await flush();
    expect(action('Preview image').disabled).toBe(false);
    expect(action('Replace image')).toBeUndefined();
    expect(action('Remove image')).toBeUndefined();
    host.exposed.value!.open();
    host.exposed.value!.clear();
    await flush();
    expect(host.change).not.toHaveBeenCalled();
    host.props.readonly = false;
    await flush();
    await openHost(host);
    host.disabled.value = true;
    await flush();
    expect(host.visible).toHaveBeenLastCalledWith(false);
  });

  it('closes an active image preview on disable without reopening it when enabled again', async () => {
    const host = mount({ value: a });
    action('Preview image').click();
    await flush();
    expect(document.querySelector('.arco-image-preview-wrapper')).not.toBeNull();
    host.disabled.value = true;
    await flush();
    expect(document.querySelector('.arco-image-preview-wrapper')).toBeNull();
    host.disabled.value = false;
    await flush();
    expect(document.querySelector('.arco-image-preview-wrapper')).toBeNull();
  });

  it('closes an invalid preview on collection changes and does not reopen after clear and refill', async () => {
    const host = mount({ value: [a, b], props: { multiple: true } });
    action('Preview image', 1).click();
    await flush();
    expect(element('.arco-image-preview-img').getAttribute('src')).toBe('/b.png');
    host.model.value = [a];
    await flush();
    expect(document.querySelector('.arco-image-preview-wrapper')).toBeNull();
    action('Preview image').click();
    await flush();
    host.exposed.value!.clear();
    await flush();
    expect(document.querySelector('.arco-image-preview-wrapper')).toBeNull();
    host.model.value = [b];
    await flush();
    expect(document.querySelector('.arco-image-preview-wrapper')).toBeNull();
    action('Preview image').click();
    await flush();
    expect(element('.arco-image-preview-img').getAttribute('src')).toBe('/b.png');
  });

  it('preserves previews for equivalent records and metadata, but resets changed source and order', async () => {
    const host = mount({ value: [a, b], props: { multiple: true } });
    action('Preview image', 1).click();
    await flush();
    host.model.value = [{ ...a }, { ...b, name: 'Renamed B.png' }];
    await flush();
    expect(element('.arco-image-preview-img').getAttribute('src')).toBe('/b.png');
    host.model.value = [b, a];
    await flush();
    expect(document.querySelector('.arco-image-preview-wrapper')).toBeNull();
    action('Preview image').click();
    await flush();
    host.model.value = [{ ...b, url: '/updated-b.png' }, a];
    await flush();
    expect(document.querySelector('.arco-image-preview-wrapper')).toBeNull();
  });

  it('falls back from thumbnail to source to an accessible placeholder without changing the field', async () => {
    const host = mount({ value: { ...a, id: 'constructor' } });
    element('.a9-image-picker img').dispatchEvent(new Event('error'));
    await flush();
    expect(element('.a9-image-picker img').getAttribute('src')).toBe('/a.png');
    element('.a9-image-picker img').dispatchEvent(new Event('error'));
    await flush();
    expect(element('.a9-image-picker [role="img"]').getAttribute('aria-label')).toBe('Image unavailable: A.png');
    expect(host.update).not.toHaveBeenCalled();
  });

  it('does not enqueue local files from the outer Upload including native input and drop events', async () => {
    const service = { ...serviceFor(), upload: vi.fn(async () => c) };
    const host = mount({ value: a, service, props: { canUpload: true } });
    const file = new File(['image'], 'outer.png', { type: 'image/png' });
    const input = element<HTMLInputElement>('.a9-image-picker__cards input[type=file]');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file] } });
    input.parentElement!.dispatchEvent(drop);
    await flush();
    expect(cards()).toHaveLength(1);
    expect(service.upload).not.toHaveBeenCalled();
    expect(host.update).not.toHaveBeenCalled();
  });

  it('only uploads inside the picker and requires selection plus confirmation after upload', async () => {
    const items = [a, b];
    const service = {
      ...serviceFor(items),
      upload: vi.fn(async () => {
        items.push(c);
        return c;
      }),
    };
    const host = mount({ value: a, service, props: { canUpload: true } });
    await openHost(host);
    await upload();
    expect(host.uploaded).toHaveBeenCalledWith(c);
    expect(host.change).not.toHaveBeenCalled();
    expect(element<HTMLInputElement>('[data-file-id="a"] input').checked).toBe(true);
    await cancel();
    expect(host.model.value).toEqual(a);
    await openHost(host);
    choose('c');
    await confirm();
    expect(host.model.value).toEqual(c);
    expect(service.upload).toHaveBeenCalledOnce();
  });

  it('reports upload failures without submitting and cancels late uploads when permission is revoked', async () => {
    const failure = new Error('Upload failed');
    const late = deferred<FileItem>();
    const uploadRequest = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce(() => late.promise);
    const host = mount({ value: a, service: { ...serviceFor(), upload: uploadRequest }, props: { canUpload: true } });
    await openHost(host);
    await upload();
    expect(host.uploadError).toHaveBeenCalledWith(failure);
    await upload(new File(['next'], 'next.png', { type: 'image/png' }));
    const signal = uploadRequest.mock.calls[1][0].signal as AbortSignal;
    host.props.canUpload = false;
    await flush();
    expect(signal.aborted).toBe(true);
    late.resolve(c);
    await flush();
    expect(host.uploaded).not.toHaveBeenCalled();
    expect(host.change).not.toHaveBeenCalled();
  });

  it('isolates draft controls and uploads from Form validation and validates one committed change', async () => {
    const validate = vi.fn((_value: unknown, callback: (error?: string) => void) => callback());
    const host = mount({ validate, props: { canUpload: true }, service: { ...serviceFor(), upload: vi.fn(async () => c) } });
    await openHost(host);
    choose('a');
    await flush();
    await upload();
    expect(validate).not.toHaveBeenCalled();
    await cancel();
    expect(validate).not.toHaveBeenCalled();
    await openHost(host);
    choose('b');
    await confirm();
    expect(validate).toHaveBeenCalledOnce();
    expect(validate.mock.calls[0][0]).toEqual(b);
    await openHost(host);
    await confirm();
    expect(validate).toHaveBeenCalledOnce();
  });

  it('validates after the parent replaces its Form model object', async () => {
    const validate = vi.fn((_value: unknown, callback: (error?: string) => void) => callback());
    const host = mount({ validate, inlineFormModel: true });
    await openHost(host);
    choose('a');
    await confirm();
    expect(validate).toHaveBeenCalledOnce();
    expect(validate.mock.calls[0][0]).toEqual(a);
  });

  it('does not validate the initial value after the change listener resets the form', async () => {
    const validate = vi.fn((_value: unknown, callback: (error?: string) => void) => callback('Image required'));
    const host = mount({ validate, onChange: () => host.formRef.value!.resetFields() });
    await openHost(host);
    choose('a');
    await confirm();
    expect(host.model.value).toBeUndefined();
    expect(validate).not.toHaveBeenCalled();
    expect(document.querySelector('.arco-form-item-message')).toBeNull();
  });

  it('respects resetFields even when the reset value equals the emitted empty value', async () => {
    const validate = vi.fn((_value: unknown, callback: (error?: string) => void) => callback('Image required'));
    const host = mount({ validate, onChange: () => host.formRef.value!.resetFields() });
    host.model.value = a;
    await flush();
    host.exposed.value!.clear();
    await flush();
    expect(host.model.value).toBeUndefined();
    expect(validate).not.toHaveBeenCalled();
    expect(document.querySelector('.arco-form-item-message')).toBeNull();
  });

  it('cancels queued validation when a change listener remounts the field with the same value', async () => {
    const validate = vi.fn((_value: unknown, callback: (error?: string) => void) => callback());
    const host = mount({
      validate,
      onChange: () => {
        host.recordKey.value += 1;
      },
    });
    await openHost(host);
    choose('a');
    await confirm();
    expect(host.model.value).toEqual(a);
    expect(host.recordKey.value).toBe(2);
    expect(validate).not.toHaveBeenCalled();
  });

  it('does not validate a commit that the controlled parent declines', async () => {
    const validate = vi.fn((_value: unknown, callback: (error?: string) => void) => callback());
    const host = mount({ value: a, echo: false, validate });
    await openHost(host);
    choose('b');
    await confirm();
    expect(host.model.value).toEqual(a);
    expect(validate).not.toHaveBeenCalled();
  });

  it('falls back to a usable trigger when the original card disappears during selection', async () => {
    const host = mount({ value: [a, b], props: { multiple: true } });
    const trigger = action('Replace image', 1);
    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    trigger.click();
    await flush();
    host.model.value = [a];
    await flush();
    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });
    expect(document.activeElement).toBe(action('Preview image'));
    expect(host.change).not.toHaveBeenCalled();
  });

  it('supports hidden lists and restores focus to the actual replacement trigger', async () => {
    const host = mount({ value: [a, b], props: { multiple: true } });
    const trigger = action('Replace image', 1);
    trigger.focus();
    trigger.click();
    await flush();
    await cancel();
    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });
    expect(document.activeElement).toBe(trigger);
    host.props.showFileList = false;
    await flush();
    expect(cards()).toHaveLength(0);
    expect(element('.a9-image-picker .arco-btn').textContent).toBe('Choose images');
    await openHost(host);
    await cancel();
    expect(host.update).not.toHaveBeenCalled();
  });
});
