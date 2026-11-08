import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AImageCropper from '../src/components/image-cropper/index.vue';
import type { AImageCropperExposed, ImageCropOptions } from '../src/components/image-cropper/types';
import { messages } from '../src/locale';

const engine = vi.hoisted(() => ({ decode: vi.fn(), encode: vi.fn() }));
vi.mock('../src/internal/image-crop', async () => ({
  ...(await vi.importActual<object>('../src/internal/image-crop')),
  decodeImageSource: engine.decode,
  encodeImageCrop: engine.encode,
}));
vi.mock('../src/internal/modal.vue', async () => {
  const vue = await import('vue');
  return {
    default: vue.defineComponent({
      props: { visible: Boolean },
      setup:
        (props, { slots }) =>
        () =>
          props.visible ? vue.h('div', [slots.default?.(), slots.footer?.()]) : null,
    }),
  };
});
const crop: ImageCropOptions = {
  source: { maxBytes: 1e6, maxPixels: 1e6 },
  output: { format: 'image/png', resize: { mode: 'max', longEdge: 640 }, maxBytes: 1e6 },
};
const source = new File(['source'], 'source.png');
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const tick = async () => {
  await nextTick();
  await new Promise((done) => {
    setTimeout(done, 0);
  });
  await nextTick();
};
let app: App;
function mount() {
  const exposed = ref<AImageCropperExposed>();
  app = createApp({ setup: () => () => h(AImageCropper, { ref: exposed, crop, aspectRatio: 1 }) });
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
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
  app.component(
    'AAlert',
    defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('div', slots.default?.()),
    })
  );
  app.mount('#app');
  if (!exposed.value) throw new Error('Cropper did not mount');
  return exposed.value;
}
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  engine.decode.mockReset();
  engine.encode.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  app?.unmount();
  vi.restoreAllMocks();
});
describe('AImageCropper lifecycle', () => {
  it('closes a late decoded bitmap after cancellation without opening stale content', async () => {
    const decoding = deferred<ImageBitmap>();
    engine.decode.mockReturnValue(decoding.promise);
    const api = mount();
    const result = api.open(source);
    api.cancel();
    const close = vi.fn();
    decoding.resolve({ width: 200, height: 200, close } as unknown as ImageBitmap);
    await tick();
    expect(await result).toBeNull();
    expect(close).toHaveBeenCalledOnce();
    expect(document.querySelector('canvas')).toBeNull();
  });
  it('keeps an unexportable sub-pixel max crop controlled and cancellable', async () => {
    engine.decode.mockResolvedValue({ width: 1, height: 1, close: vi.fn() });
    const api = mount();
    const result = api.open(source);
    await tick();
    const confirm = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Confirm'));
    expect(confirm?.disabled).toBe(true);
    expect(document.querySelector('[role=alert]')).not.toBeNull();
    api.cancel();
    expect(await result).toBeNull();
    expect(engine.encode).not.toHaveBeenCalled();
  });
  it('ignores a late encoded file after a second open', async () => {
    engine.decode.mockResolvedValue({ width: 200, height: 200, close: vi.fn() });
    const encoding = deferred<File>();
    engine.encode.mockReturnValue(encoding.promise);
    const api = mount();
    const first = api.open(source);
    await tick();
    [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Confirm'))?.click();
    await tick();
    const second = api.open(source);
    expect(await first).toBeNull();
    encoding.resolve(new File(['late'], 'late.png'));
    await tick();
    expect(document.querySelector('canvas')).not.toBeNull();
    api.cancel();
    expect(await second).toBeNull();
  });
});
