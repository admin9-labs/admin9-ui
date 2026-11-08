/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, inject, nextTick, provide, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuditAcceptance from '../dev/audit-acceptance.vue';
import { messages } from '../src/locale';

// Exercise the real acceptance page and CoverPicker, isolating unrelated demos and the file library transport.
vi.mock('../src', async () => {
  const vue = await import('vue');
  const { default: ACoverPicker } = await import('../src/components/cover-picker/index.vue');
  const empty = vue.defineComponent({ render: () => null });
  return {
    ACoverPicker,
    AIconPicker: empty,
    ACoordinatePicker: empty,
    AFilePicker: empty,
    AImagePicker: empty,
    AFileUploader: empty,
    AFilterForm: empty,
    AProTable: empty,
    ATiptapEditor: empty,
    AChatComposer: empty,
    AChatMessageList: empty,
  };
});

vi.mock('../src/components/file-picker/index.vue', async () => {
  const vue = await import('vue');
  return {
    default: vue.defineComponent({
      emits: ['confirm', 'visibleChange'],
      setup(_, { emit, expose }) {
        const visible = vue.ref(false);
        const setVisible = (value: boolean) => {
          visible.value = value;
          emit('visibleChange', value);
        };
        expose({ open: () => setVisible(true), close: () => setVisible(false), clear: () => undefined });
        return () =>
          visible.value
            ? vue.h(
                'button',
                {
                  'data-testid': 'choose-source',
                  'onClick': () => {
                    emit('confirm', [{ id: 'source', name: 'source.png', type: 'image', url: '/source.png', status: 'ready' }]);
                    setVisible(false);
                  },
                },
                'Choose source'
              )
            : null;
      },
    }),
  };
});

const Transparent = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.());
  },
});
const Button = defineComponent({
  props: { disabled: Boolean },
  setup(props, { slots }) {
    return () => h('button', { disabled: props.disabled }, slots.default?.());
  },
});
const groupKey = Symbol('radio');
const RadioGroup = defineComponent({
  props: { disabled: Boolean },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    provide(groupKey, (value: string) => {
      if (!props.disabled) emit('update:modelValue', value);
    });
    return () => h('div', slots.default?.());
  },
});
const Radio = defineComponent({
  props: { value: { type: String, default: '' }, disabled: Boolean },
  setup(props, { slots }) {
    const update = inject<(value: string) => void>(groupKey, () => undefined);
    return () =>
      h(
        'button',
        { 'disabled': props.disabled, 'data-ratio': props.value, 'onClick': () => update(props.value) },
        slots.default?.()
      );
  },
});
const Modal = defineComponent({
  props: { visible: Boolean },
  emits: ['cancel'],
  setup(props, { slots, emit }) {
    return () =>
      props.visible
        ? h('div', { 'data-testid': 'crop-modal' }, [
            slots.default?.(),
            slots.footer?.(),
            h('button', { 'data-testid': 'crop-close', 'onClick': () => emit('cancel') }, 'Close'),
          ])
        : null;
  },
});

let app: App | undefined;
let urlSequence = 0;
const revoked = vi.fn();

async function flush() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}
function requiredElement<T extends Element>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}
function click(selector: string) {
  requiredElement<HTMLButtonElement>(selector).click();
}
const hasWarning = () => Boolean(document.querySelector('.crop-scenario__warning'));
const preview = (index: number) => requiredElement<HTMLImageElement>(`[data-testid="cover-picker-preview-${index}"]`);
async function beginCrop(index: number) {
  click(`[data-testid="cover-picker-slot-${index}"]`);
  await flush();
  click('[data-testid="choose-source"]');
  await flush();
  const image = requiredElement<HTMLImageElement>('.crop-stage__image');
  Object.defineProperties(image, { naturalWidth: { value: 100 }, naturalHeight: { value: 200 } });
  image.dispatchEvent(new Event('load'));
  await flush();
}
async function confirmCrop() {
  click('.crop-dialog__actions button:last-child');
  await flush();
}
async function fillCover(index: number) {
  await beginCrop(index);
  await confirmCrop();
}
async function changeRatio(ratio: string) {
  click(`.crop-scenario [data-ratio="${ratio}"]`);
  await flush();
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  urlSequence = 0;
  revoked.mockClear();
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    urlSequence += 1;
    return `blob:crop-${urlSequence}`;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoked);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['crop'])));
  // Layout and first-scroll visibility are verified in the browser, not happy-dom.
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  app = createApp(AuditAcceptance);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages }));
  [
    'AConfigProvider',
    'AForm',
    'AFormItem',
    'ATooltip',
    'AInput',
    'IconPlus',
    'IconEdit',
    'IconDelete',
    'IconImageClose',
  ].forEach((name) => app.component(name, Transparent));
  app.component('AButton', Button);
  app.component('ARadioGroup', RadioGroup);
  app.component('ARadio', Radio);
  app.component('AModal', Modal);
  app.mount('#app');
});
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = '';
});

describe('acceptance cover cropping', () => {
  it('keeps the old cover and warning on cancel, then clears only after a replacement commits', async () => {
    await fillCover(0);
    const original = preview(0).src;
    expect(revoked).not.toHaveBeenCalledWith(original);
    await changeRatio('16:9');
    expect(hasWarning()).toBe(true);
    await beginCrop(0);
    click('.crop-dialog__actions button:first-child');
    await flush();
    expect(preview(0).src).toBe(original);
    expect(hasWarning()).toBe(true);
    expect(revoked).not.toHaveBeenCalledWith(original);
    await fillCover(0);
    expect(preview(0).src).not.toBe(original);
    expect(hasWarning()).toBe(false);
    expect(revoked).toHaveBeenCalledWith(original);
    expect(revoked).not.toHaveBeenCalledWith(preview(0).src);
  });

  it('keeps triple-cover warnings until every old image has been recropped', async () => {
    click('[data-testid="cover-picker-mode-triple"]');
    await flush();
    await fillCover(0);
    await fillCover(1);
    await fillCover(2);
    await changeRatio('3:4');
    expect(hasWarning()).toBe(true);
    await fillCover(0);
    expect(hasWarning()).toBe(true);
    await fillCover(1);
    expect(hasWarning()).toBe(true);
    await fillCover(2);
    expect(hasWarning()).toBe(false);
    [0, 1, 2].forEach((index) => expect(revoked).not.toHaveBeenCalledWith(preview(index).src));
  });

  it('preserves the warning when a pending image moves from triple to single, and clears it on removal', async () => {
    click('[data-testid="cover-picker-mode-triple"]');
    await flush();
    await fillCover(2);
    await changeRatio('1:1');
    const original = preview(2).src;
    click('[data-testid="cover-picker-mode-single"]');
    await flush();
    expect(preview(0).src).toBe(original);
    expect(hasWarning()).toBe(true);
    expect(revoked).not.toHaveBeenCalledWith(original);
    click('[data-testid="cover-picker-remove-0"]');
    await flush();
    expect(hasWarning()).toBe(false);
    expect(revoked).toHaveBeenCalledWith(original);
  });

  it('keeps the old warning when CoverPicker discards a crop completed after readonly is enabled', async () => {
    await fillCover(0);
    await changeRatio('16:9');
    const original = preview(0).src;
    await beginCrop(0);
    const readonly = [...document.querySelectorAll('label')].find((label) => label.textContent?.includes('Readonly'));
    if (!readonly) throw new Error('Missing Readonly control');
    requiredElement<HTMLInputElement>('input', readonly).click();
    await flush();
    await confirmCrop();
    expect(preview(0).src).toBe(original);
    expect(hasWarning()).toBe(true);
    expect(revoked).toHaveBeenCalledWith('blob:crop-2');
    expect(revoked).not.toHaveBeenCalledWith(original);
  });

  it('ignores a late canvas result after cancelling and opening another crop', async () => {
    await fillCover(0);
    await changeRatio('16:9');
    const original = preview(0).src;
    let completeEncoding: BlobCallback = () => undefined;
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) => {
      completeEncoding = callback;
    });
    await beginCrop(0);
    click('.crop-dialog__actions button:last-child');
    await flush();
    click('[data-testid="crop-close"]');
    await flush();
    await beginCrop(0);
    completeEncoding(new Blob(['late crop']));
    await flush();
    expect(preview(0).src).toBe(original);
    expect(hasWarning()).toBe(true);
    expect(document.querySelector('[data-testid="crop-modal"]')).not.toBeNull();
    expect(revoked).toHaveBeenCalledWith('blob:crop-2');
    await confirmCrop();
    expect(hasWarning()).toBe(false);
    expect(preview(0).src).toBe('blob:crop-3');
  });

  it('releases active and late-created crop URLs when the page unmounts', async () => {
    await fillCover(0);
    const original = preview(0).src;
    let completeEncoding: BlobCallback = () => undefined;
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) => {
      completeEncoding = callback;
    });
    await beginCrop(0);
    click('.crop-dialog__actions button:last-child');
    await flush();
    app?.unmount();
    app = undefined;
    expect(revoked).toHaveBeenCalledWith(original);
    completeEncoding(new Blob(['late crop']));
    await flush();
    expect(revoked).toHaveBeenCalledWith('blob:crop-2');
  });

  it.each([
    ['4:3', 640, 480],
    ['16:9', 640, 360],
    ['1:1', 640, 640],
    ['3:4', 480, 640],
  ])('upscales a small source to the standard %s output', async (ratio, width, height) => {
    await changeRatio(String(ratio));
    await fillCover(0);
    expect(requiredElement('#audit-result').textContent).toBe(`裁剪完成：${width}×${height}`);
    const canvas = vi.mocked(HTMLCanvasElement.prototype.toBlob).mock.instances[0];
    expect([canvas.width, canvas.height]).toEqual([width, height]);
  });
});
