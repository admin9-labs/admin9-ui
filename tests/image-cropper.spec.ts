import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AImageCropper from '../src/components/image-cropper/index.vue';
import type { AImageCropperExposed, AImageCropperProps, ImageCropOptions } from '../src/components/image-cropper/types';
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
function mount(
  onVisibleChange?: (visible: boolean) => void,
  cropperProps: Partial<AImageCropperProps> & { onCommitPendingChange?: (pending: boolean) => void } = {}
) {
  const exposed = ref<AImageCropperExposed>();
  app = createApp({
    setup: () => () => h(AImageCropper, { ref: exposed, crop, aspectRatio: 1, onVisibleChange, ...cropperProps }),
  });
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
  it('settles when an opening listener cancels synchronously without decoding', async () => {
    const api = mount((visible) => {
      if (visible) api.cancel();
    });
    const settled = vi.fn();
    api.open(source).then(settled);
    await tick();
    expect(settled).toHaveBeenCalledWith(null);
    expect(engine.decode).not.toHaveBeenCalled();
    expect(document.querySelector('canvas')).toBeNull();
  });
  it('starts only the replacement when an opening listener opens another file', async () => {
    engine.decode.mockResolvedValue({ width: 200, height: 200, close: vi.fn() });
    const nextSource = new File(['replacement'], 'replacement.png');
    let replacement: Promise<File | null> | undefined;
    let replaceOnOpen = true;
    const api = mount((visible) => {
      if (visible && replaceOnOpen) {
        replaceOnOpen = false;
        replacement = api.open(nextSource);
      }
    });
    const settled = vi.fn();
    api.open(source).then(settled);
    await tick();
    expect(settled).toHaveBeenCalledWith(null);
    expect(engine.decode).toHaveBeenCalledOnce();
    expect(engine.decode).toHaveBeenCalledWith(nextSource, crop.source);
    api.cancel();
    expect(await replacement).toBeNull();
  });
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

describe('AImageCropper ratios and commit state', () => {
  const confirm = () =>
    [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Confirm'))?.click();
  it.each([
    [undefined, undefined, undefined],
    [undefined, 'free', undefined],
    [undefined, 'original', 2],
    [1, 'original', 1],
  ] as const)('uses ratio %s with mode %s', async (aspectRatio, aspectRatioMode, expected) => {
    engine.decode.mockResolvedValue({ width: 400, height: 200, close: vi.fn() });
    engine.encode.mockResolvedValue(new File(['crop'], 'crop.png'));
    const api = mount(undefined, { aspectRatio, aspectRatioMode });
    const result = api.open(source);
    await tick();
    const box = document.querySelector<HTMLElement>('.a9-image-cropper-stage__box');
    if (!box?.parentElement) throw new Error('Crop box did not render');
    const stage = box.parentElement;
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({ width: 400, height: 200 } as DOMRect);
    const handle = box.querySelector<HTMLElement>('[data-crop-handle="bottom-right"]');
    if (!handle) throw new Error('Resize handle did not render');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await nextTick();
    const expectedWidth = new Map([
      [undefined, '99%'],
      [2, '79%'],
      [1, '49%'],
    ]).get(expected);
    expect(box.style.width).toBe(expectedWidth);
    const expectedHeight = new Map([
      [undefined, '100%'],
      [2, '79%'],
      [1, '98%'],
    ]).get(expected);
    expect(box.style.height).toBe(expectedHeight);
    confirm();
    await tick();
    expect(engine.encode.mock.calls[0][2]).toBe(expected);
    expect(await result).toBeInstanceOf(File);
  });
  it.each(['finish', 'failure', 'cancel'] as const)('emits pending synchronously and clears on %s', async (outcome) => {
    engine.decode.mockResolvedValue({ width: 200, height: 200, close: vi.fn() });
    const pending = vi.fn();
    const encoding = deferred<File>();
    engine.encode.mockImplementation(() => {
      expect(pending).toHaveBeenLastCalledWith(true);
      return outcome === 'failure' ? Promise.reject(new Error('encode')) : encoding.promise;
    });
    const api = mount(undefined, { onCommitPendingChange: pending });
    const result = api.open(source);
    await tick();
    pending.mockClear();
    confirm();
    expect(pending).toHaveBeenLastCalledWith(true);
    if (outcome === 'cancel') api.cancel();
    encoding.resolve(new File(['crop'], 'crop.png'));
    await tick();
    expect(pending.mock.calls).toEqual([[true], [false]]);
    if (outcome === 'failure') api.cancel();
    expect(await result).toEqual(outcome === 'finish' ? expect.any(File) : null);
  });
  it('allows a pending listener to cancel before encoding starts', async () => {
    engine.decode.mockResolvedValue({ width: 200, height: 200, close: vi.fn() });
    const api = mount(undefined, {
      onCommitPendingChange: (pending) => {
        if (pending) api.cancel();
      },
    });
    const result = api.open(source);
    await tick();
    confirm();
    expect(engine.encode).not.toHaveBeenCalled();
    expect(await result).toBeNull();
  });
});

describe('AImageCropper viewport adaptation', () => {
  it.each([undefined, 1])('scrolls to the initial crop without changing source coordinates (ratio %s)', async (aspectRatio) => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function getHeight(this: HTMLElement) {
      return this.classList.contains('a9-image-cropper-stage') ? 12000 : 480;
    });
    engine.decode.mockResolvedValue({ width: 200, height: 10000, close: vi.fn() });
    engine.encode.mockResolvedValue(new File(['crop'], 'crop.png'));
    const api = mount(undefined, { aspectRatio });
    const result = api.open(source);
    await tick();
    const viewport = document.querySelector<HTMLElement>('.a9-image-cropper__viewport');
    if (!viewport) throw new Error('Crop viewport did not render');
    expect(viewport.scrollTop).toBeCloseTo(aspectRatio === undefined ? 0 : 5904);
    viewport.scrollTop = 9000;
    viewport.dispatchEvent(new Event('scroll'));
    [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Confirm'))?.click();
    await tick();
    expect(engine.encode.mock.calls[0][1]).toEqual(
      aspectRatio === undefined ? { x: 0, y: 0, width: 200, height: 10000 } : { x: 20, y: 4920, width: 160, height: 160 }
    );
    expect(await result).toBeInstanceOf(File);
  });

  it.each([180, 360])('preserves the source crop in a %spx tall viewport', async (viewportHeight) => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    engine.decode.mockResolvedValue({ width: 200, height: 2000, close: vi.fn() });
    engine.encode.mockResolvedValue(new File(['crop'], 'crop.png'));
    const api = mount(undefined, { aspectRatio: 0.1 });
    const result = api.open(source);
    await tick();
    const viewport = document.querySelector<HTMLElement>('.a9-image-cropper__viewport');
    const stage = document.querySelector<HTMLElement>('.a9-image-cropper-stage');
    const box = document.querySelector<HTMLElement>('.a9-image-cropper-stage__box');
    if (!viewport || !stage || !box) throw new Error('Crop preview did not render');
    vi.spyOn(viewport, 'clientHeight', 'get').mockReturnValue(viewportHeight);
    vi.spyOn(stage, 'clientHeight', 'get').mockReturnValue(2000);
    vi.spyOn(box, 'offsetHeight', 'get').mockReturnValue(1600);
    frames.splice(0).forEach((callback) => callback(0));
    await nextTick();
    expect(box.style.width).toBe('80%');
    expect(box.style.height).toBe('80%');
    [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Confirm'))?.click();
    await tick();
    expect(engine.encode.mock.calls[0][1]).toEqual({ x: 20, y: 200, width: 160, height: 1600 });
    expect(await result).toBeInstanceOf(File);
  });
});

describe('AImageCropper scaled preview coordinates', () => {
  it.each([
    [200, 2000],
    [200, 10000],
    [2000, 200],
  ])('starts free cropping with the entire %s × %s source', async (width, height) => {
    engine.decode.mockResolvedValue({ width, height, close: vi.fn() });
    engine.encode.mockResolvedValue(new File(['crop'], 'crop.png'));
    const api = mount(undefined, { aspectRatio: undefined });
    const result = api.open(source);
    await tick();
    const box = document.querySelector<HTMLElement>('.a9-image-cropper-stage__box');
    if (!box) throw new Error('Crop box did not render');
    expect([box.style.left, box.style.top, box.style.width, box.style.height]).toEqual(['0%', '0%', '100%', '100%']);
    const viewport = document.querySelector<HTMLElement>('.a9-image-cropper__viewport');
    if (!viewport) throw new Error('Crop viewport did not render');
    viewport.scrollTop = 500;
    viewport.dispatchEvent(new Event('scroll'));
    await nextTick();
    [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Confirm'))?.click();
    await tick();
    expect(engine.encode.mock.calls[0][1]).toEqual({ x: 0, y: 0, width, height });
    expect(await result).toBeInstanceOf(File);
  });
  it.each([undefined, 0.1])('maps dragging on a scaled preview back to source pixels with ratio %s', async (aspectRatio) => {
    engine.decode.mockResolvedValue({ width: 200, height: 2000, close: vi.fn() });
    engine.encode.mockResolvedValue(new File(['crop'], 'crop.png'));
    const api = mount(undefined, { aspectRatio });
    const result = api.open(source);
    await tick();
    const box = document.querySelector<HTMLElement>('.a9-image-cropper-stage__box');
    if (!box?.parentElement) throw new Error('Crop box did not render');
    vi.spyOn(box.parentElement, 'getBoundingClientRect').mockReturnValue({ width: 40, height: 400 } as DOMRect);
    const handle = box.querySelector<HTMLElement>('[data-crop-handle="bottom-right"]');
    if (!handle) throw new Error('Resize handle did not render');
    handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 40, clientY: 400, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 36, clientY: 400 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    await nextTick();
    expect(box.style.width).toBe(aspectRatio === undefined ? '90%' : '70%');
    expect(box.style.height).toBe(aspectRatio === undefined ? '100%' : '70%');
    box.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 4, clientY: 40 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    await nextTick();
    [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Confirm'))?.click();
    await tick();
    expect(engine.encode.mock.calls[0][1]).toEqual(
      aspectRatio === undefined ? { x: 20, y: 0, width: 180, height: 2000 } : { x: 40, y: 400, width: 140, height: 1400 }
    );
    expect(await result).toBeInstanceOf(File);
  });
});

describe('AImageCropper corner controls', () => {
  it.each([
    ['top-left', 'ArrowRight', { x: 2, y: 0, width: 198, height: 200 }],
    ['top-right', 'ArrowLeft', { x: 0, y: 0, width: 198, height: 200 }],
    ['bottom-left', 'ArrowRight', { x: 2, y: 0, width: 198, height: 200 }],
    ['bottom-right', 'ArrowLeft', { x: 0, y: 0, width: 198, height: 200 }],
  ] as const)('names and keyboard-resizes the %s corner without moving the opposite edge', async (corner, key, bounds) => {
    engine.decode.mockResolvedValue({ width: 200, height: 200, close: vi.fn() });
    engine.encode.mockResolvedValue(new File(['crop'], 'crop.png'));
    const api = mount(undefined, { aspectRatio: undefined });
    const result = api.open(source);
    await tick();
    const handles = [...document.querySelectorAll<HTMLButtonElement>('[data-crop-handle]')];
    expect(handles).toHaveLength(4);
    expect(new Set(handles.map((handle) => handle.getAttribute('aria-label'))).size).toBe(4);
    const handle = handles.find((item) => item.dataset.cropHandle === corner);
    const stage = document.querySelector<HTMLElement>('.a9-image-cropper-stage');
    if (!handle || !stage) throw new Error('Crop corner did not render');
    expect(handle.tagName).toBe('BUTTON');
    expect(handle.getAttribute('aria-label')).toBe(`Resize ${corner} crop corner`);
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 100 } as DOMRect);
    handle.focus();
    handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await nextTick();
    expect(document.activeElement).toBe(handle);
    [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Confirm'))?.click();
    await tick();
    expect(engine.encode.mock.calls[0][1]).toEqual(bounds);
    expect(await result).toBeInstanceOf(File);
  });

  it('focuses and resizes the corner when its transparent hit area is pressed', async () => {
    engine.decode.mockResolvedValue({ width: 200, height: 200, close: vi.fn() });
    engine.encode.mockResolvedValue(new File(['crop'], 'crop.png'));
    const api = mount(undefined, { aspectRatio: undefined });
    const result = api.open(source);
    await tick();
    const handle = document.querySelector<HTMLButtonElement>('[data-crop-handle="top-left"]');
    const stage = document.querySelector<HTMLElement>('.a9-image-cropper-stage');
    if (!handle || !stage) throw new Error('Crop corner did not render');
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({ width: 200, height: 200 } as DOMRect);
    handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 20, clientY: 20, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 30, clientY: 40 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    await nextTick();
    expect(document.activeElement).toBe(handle);
    [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Confirm'))?.click();
    await tick();
    expect(engine.encode.mock.calls[0][1]).toEqual({ x: 10, y: 20, width: 190, height: 180 });
    expect(await result).toBeInstanceOf(File);
  });
});
