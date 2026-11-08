/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, nextTick, ref, shallowRef, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ACoverPicker from '../src/components/cover-picker/index.vue';
import type { ACoverPickerExposed, CoverPickerValue } from '../src/components/cover-picker/types';
import type { ImageCropOptions } from '../src/components/image-cropper/types';
import type { FileItem, FilePickerAdapter } from '../src/services/types';
import { messages } from '../src/locale';

const cropMock = vi.hoisted(() => ({ open: vi.fn(), cancel: vi.fn() }));
const library = vi.hoisted((): { confirm(items: FileItem[]): void; canUpload: boolean } => ({
  confirm: () => undefined,
  canUpload: false,
}));
vi.mock('../src/components/image-cropper/index.vue', async () => {
  const vue = await import('vue');
  return {
    default: vue.defineComponent({
      setup(_, { expose }) {
        expose(cropMock);
        return () => null;
      },
    }),
  };
});
vi.mock('../src/components/file-picker/index.vue', async () => {
  const vue = await import('vue');
  return {
    default: vue.defineComponent({
      props: { canUpload: Boolean },
      emits: ['confirm', 'visibleChange'],
      setup(props, { expose, emit }) {
        library.confirm = (items) => {
          emit('confirm', items);
          emit('visibleChange', false);
        };
        expose({ open: () => emit('visibleChange', true), close: () => emit('visibleChange', false), clear: vi.fn() });
        return () => {
          library.canUpload = props.canUpload;
          return null;
        };
      },
    }),
  };
});
const item = (id: string): FileItem => ({
  id,
  name: `${id}.png`,
  type: 'image',
  groupId: null,
  url: `/${id}.png`,
  status: 'ready',
});
const crop: ImageCropOptions = {
  source: { maxBytes: 10 * 1024 ** 2, maxPixels: 20_000_000 },
  output: { format: 'image/png', maxBytes: 2 * 1024 ** 2, resize: { mode: 'exact', longEdge: 640 } },
};
const flush = async () => {
  await nextTick();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  await nextTick();
};
const pending = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let app: App;
function mount(beforeSelect?: (file: FileItem) => Promise<FileItem | null>) {
  const value = ref<CoverPickerValue>({ mode: 'triple', images: [item('a'), item('b'), item('c')] });
  const ratio = ref(4 / 3);
  const disabled = ref(false);
  const service = shallowRef<FilePickerAdapter>({
    list: vi.fn(),
    readOriginal: vi.fn().mockResolvedValue(new File(['original'], 'original.png')),
    upload: vi.fn().mockResolvedValue(item('cropped')),
  });
  const picker = ref<ACoverPickerExposed>();
  const states: boolean[] = [];
  const processingChanges = vi.fn((processing: boolean) => states.push(processing));
  const successes = vi.fn();
  app = createApp({
    setup: () => () =>
      h(ACoverPicker, {
        'ref': picker,
        'modelValue': value.value,
        'aspectRatio': ratio.value,
        'service': service.value,
        'crop': crop,
        'canUpload': true,
        'onUploadSuccess': successes,
        'disabled': disabled.value,
        'beforeSelect': beforeSelect,
        'onUpdate:modelValue': (next: CoverPickerValue) => {
          value.value = next;
        },
        'onProcessingChange': processingChanges,
      }),
  });
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  const pass = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
  ['ARadio', 'ARadioGroup', 'ATooltip', 'AAlert', 'ASpin', 'IconImageClose', 'IconPlus', 'IconEdit', 'IconDelete'].forEach(
    (name) => app.component(name, pass)
  );
  app.component(
    'AButton',
    defineComponent({
      props: { disabled: Boolean },
      setup:
        (props, { attrs, slots }) =>
        () =>
          h('button', { ...attrs, disabled: props.disabled }, slots.default?.()),
    })
  );
  app.mount('#app');
  const select = async (index: number, source = item('source')) => {
    document.querySelector<HTMLButtonElement>(`[data-testid="cover-picker-slot-${index}"]`)?.click();
    await flush();
    library.confirm([source]);
    await flush();
  };
  return { value, ratio, disabled, service, picker, states, successes, processingChanges, select };
}
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  cropMock.open.mockReset();
  cropMock.cancel.mockReset();
});
afterEach(() => app?.unmount());

describe('ACoverPicker native cropping', () => {
  it('has one library entry per slot and keeps material-library uploads available', async () => {
    const host = mount();
    await flush();
    expect(library.canUpload).toBe(true);
    expect(document.querySelector('input[type=file]')).toBeNull();
    expect(document.querySelector('.a9-cover-picker__crop-actions')).toBeNull();
    expect(Object.keys(host.picker.value ?? {})).toEqual(['cancel']);
  });
  it('preserves existing values when the user cancels cropping', async () => {
    cropMock.open.mockResolvedValue(null);
    const host = mount();
    await host.select(0);
    expect(host.value.value.images.map((x) => x?.id)).toEqual(['a', 'b', 'c']);
    expect(host.service.value.upload).not.toHaveBeenCalled();
    expect(host.states.at(-1)).toBe(false);
  });
  it('updates only the selected position after reading, cropping and uploading', async () => {
    const output = new File(['result'], 'result.png');
    cropMock.open.mockResolvedValue(output);
    const host = mount();
    await host.select(1, item('original'));
    expect(host.service.value.readOriginal).toHaveBeenCalledWith({ item: item('original'), signal: expect.any(AbortSignal) });
    expect(host.service.value.upload).toHaveBeenCalledWith(expect.objectContaining({ file: output }));
    expect(host.value.value.images.map((x) => x?.id)).toEqual(['a', 'cropped', 'c']);
    expect(host.successes).toHaveBeenCalledTimes(1);
    expect(host.states).toEqual([false, true, false]);
  });
  it('does not start processing when the processing-change listener cancels synchronously', async () => {
    cropMock.open.mockResolvedValue(new File(['result'], 'result.png'));
    const host = mount();
    host.processingChanges.mockImplementation((processing) => {
      host.states.push(processing);
      if (processing) host.picker.value?.cancel();
      return host.states.length;
    });
    await host.select(1);
    expect(host.service.value.readOriginal).not.toHaveBeenCalled();
    expect(cropMock.open).not.toHaveBeenCalled();
    expect(host.service.value.upload).not.toHaveBeenCalled();
    expect(host.value.value.images.map((image) => image?.id)).toEqual(['a', 'b', 'c']);
    expect(host.states).toEqual([false, true, false]);
  });
  it('does not replace the cover when the upload-success listener cancels synchronously', async () => {
    cropMock.open.mockResolvedValue(new File(['result'], 'result.png'));
    const host = mount();
    host.successes.mockImplementation(() => host.picker.value?.cancel());
    await host.select(1);
    expect(host.successes).toHaveBeenCalledTimes(1);
    expect(host.value.value.images.map((image) => image?.id)).toEqual(['a', 'b', 'c']);
    expect(host.states.at(-1)).toBe(false);
  });
  it('keeps a successful slot when a later slot is cancelled, with no recrop state after ratio changes', async () => {
    cropMock.open.mockResolvedValueOnce(new File(['result'], 'result.png')).mockResolvedValueOnce(null);
    const host = mount();
    await host.select(1);
    await host.select(2);
    host.ratio.value = 1;
    await flush();
    expect(host.value.value.images.map((x) => x?.id)).toEqual(['a', 'cropped', 'c']);
    expect(host.states.at(-1)).toBe(false);
    expect(document.querySelector('.a9-cover-picker__recrop-hint')).toBeNull();
  });
  it('cancels in-flight uploads when the business ratio changes', async () => {
    cropMock.open.mockResolvedValue(new File(['result'], 'result.png'));
    const host = mount();
    const upload = pending<FileItem>();
    host.service.value.upload = vi.fn().mockReturnValue(upload.promise);
    await host.select(0);
    host.ratio.value = 1;
    await flush();
    upload.resolve(item('stale'));
    await flush();
    expect(host.value.value.images[0]?.id).toBe('a');
    expect(host.states.at(-1)).toBe(false);
  });
  it.each(['value', 'disabled', 'service'] as const)('invalidates old original reads on %s change', async (change) => {
    const host = mount();
    const read = pending<File>();
    host.service.value.readOriginal = vi.fn().mockReturnValue(read.promise);
    await host.select(0);
    if (change === 'value') host.value.value = { mode: 'single', images: [item('external')] };
    if (change === 'disabled') host.disabled.value = true;
    if (change === 'service') host.service.value = { ...host.service.value };
    await flush();
    read.resolve(new File(['late'], 'late.png'));
    await flush();
    expect(cropMock.open).not.toHaveBeenCalled();
    expect(host.service.value.upload).not.toHaveBeenCalled();
    expect(host.value.value.images[0]?.id).toBe(change === 'value' ? 'external' : 'a');
  });
  it('keeps the old image on upload failure and retries the same crop', async () => {
    cropMock.open.mockResolvedValue(new File(['result'], 'result.png'));
    const host = mount();
    host.service.value.upload = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(item('ready'));
    await host.select(0);
    expect(host.value.value.images[0]?.id).toBe('a');
    expect(host.states.at(-1)).toBe(true);
    expect(document.querySelector('[data-testid="cover-picker-status-0"]')?.parentElement).toBe(
      document.querySelector('[data-testid="cover-picker-slot-0"]')?.parentElement
    );
    expect(document.querySelector('[data-testid="cover-picker-status-1"]')).toBeNull();
    const retry = [...document.querySelectorAll<HTMLButtonElement>('.a9-cover-picker__crop-status button')].find(
      (b) => b.textContent === 'Retry'
    );
    expect(retry).toBeDefined();
    retry?.click();
    await flush();
    expect(host.value.value.images[0]?.id).toBe('ready');
    expect(cropMock.open).toHaveBeenCalledTimes(1);
    expect(host.states.at(-1)).toBe(false);
    expect(document.querySelector('.a9-cover-picker__crop-status')).toBeNull();
  });
  it('shows progress only inside the target card and restores the old preview on cancel', async () => {
    cropMock.open.mockResolvedValue(new File(['result'], 'result.png'));
    const host = mount();
    const upload = pending<FileItem>();
    host.service.value.upload = vi.fn().mockReturnValue(upload.promise);
    await host.select(2);
    const status = document.querySelector('[data-testid="cover-picker-status-2"]');
    expect(status?.parentElement).toBe(document.querySelector('[data-testid="cover-picker-slot-2"]')?.parentElement);
    expect(status?.textContent).toContain('Uploading');
    expect(document.querySelectorAll('.a9-cover-picker__crop-status')).toHaveLength(1);
    expect(status?.closest('button')).toBeNull();
    status?.querySelector<HTMLButtonElement>('button')?.click();
    await flush();
    expect(document.querySelector('.a9-cover-picker__crop-status')).toBeNull();
    expect(host.value.value.images.map((x) => x?.id)).toEqual(['a', 'b', 'c']);
    upload.resolve(item('late'));
    await flush();
    expect(host.value.value.images[2]?.id).toBe('c');
  });
  it('rejects crop plus legacy hooks before reading or uploading', async () => {
    const hook = vi.fn();
    const host = mount(hook);
    await host.select(0);
    expect(host.service.value.readOriginal).not.toHaveBeenCalled();
    expect(host.service.value.upload).not.toHaveBeenCalled();
    expect(hook).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('configuration');
  });
});
