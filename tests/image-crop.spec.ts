import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  cropOutputSize,
  decodeImageSource,
  encodeImageCrop,
  inspectImageSource,
  validateCropOptions,
} from '../src/internal/image-crop';
import type { ImageCropOptions } from '../src/components/image-cropper/types';

const crop: ImageCropOptions = {
  source: { maxBytes: 10 * 1024 ** 2, maxPixels: 20_000_000 },
  output: { format: 'image/png', resize: { mode: 'exact', longEdge: 640 }, maxBytes: 2 * 1024 ** 2 },
};
afterEach(() => vi.restoreAllMocks());

describe('image crop processing', () => {
  it.each([
    [4 / 3, 640, 480],
    [16 / 9, 640, 360],
    [1, 640, 640],
    [3 / 4, 480, 640],
  ])('exports the exact standard size for ratio %s, including small sources', (ratio, width, height) => {
    expect(cropOutputSize(100, 100, ratio, crop.output)).toEqual({ width, height });
    expect(cropOutputSize(1024, 1028, ratio, crop.output)).toEqual({ width, height });
  });
  it('max mode does not upscale the selected source area', () => {
    const output = { ...crop.output, resize: { mode: 'max' as const, longEdge: 1280 } };
    expect(cropOutputSize(400, 300, 4 / 3, output)).toEqual({ width: 400, height: 300 });
    expect(cropOutputSize(2400, 1800, 4 / 3, output)).toEqual({ width: 1280, height: 960 });
  });
  it('rejects malformed settings before decoding or uploading', () => {
    expect(() => validateCropOptions(0, crop)).toThrow('configuration');
    expect(() =>
      validateCropOptions(1, { ...crop, output: { ...crop.output, resize: { mode: 'exact', longEdge: 0 } } })
    ).toThrow('configuration');
  });
  it('checks real image headers and pixel limits', () => {
    const png = new Uint8Array(readFileSync('dev/public/media-tall.png'));
    expect(inspectImageSource(png, 20_000_000).type).toBe('image/png');
    expect(() => inspectImageSource(png, 1)).toThrow('pixels');
    expect(() => inspectImageSource(new TextEncoder().encode('<svg/>'), 20_000_000)).toThrow('format');
    expect(() => inspectImageSource(png.slice(0, 30), 20_000_000)).toThrow('format');
  });
  it('rejects APNG before decoding rather than silently taking its first frame', () => {
    const png = new Uint8Array(readFileSync('dev/public/media-tall.png'));
    const chunk = new Uint8Array(20);
    new DataView(chunk.buffer).setUint32(0, 8);
    chunk.set(new TextEncoder().encode('acTL'), 4);
    const animated = new Uint8Array(png.length + chunk.length);
    animated.set(png.slice(0, 33));
    animated.set(chunk, 33);
    animated.set(png.slice(33), 53);
    expect(() => inspectImageSource(animated, 20_000_000)).toThrow('animated');
  });
  it('rejects oversized originals before requesting a decoder', async () => {
    const original = new File(['large'], 'large.png');
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    await expect(decodeImageSource(original, { maxBytes: 1, maxPixels: 20_000_000 })).rejects.toThrow('sourceSize');
    expect(decode).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('rejects oversized encoded output without silently changing quality or dimensions', async () => {
    const context = { drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const encode = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((done) => done(new Blob(['too large'], { type: 'image/png' })));
    const source = { width: 800, height: 600 } as ImageBitmap;
    await expect(
      encodeImageCrop(source, { x: 0, y: 0, width: 800, height: 600 }, 4 / 3, { ...crop.output, maxBytes: 1 }, 'image.png')
    ).rejects.toThrow('outputSize');
    expect(encode).toHaveBeenCalledTimes(1);
    expect(context.drawImage).toHaveBeenCalledWith(source, 0, 0, 800, 600, 0, 0, 640, 480);
  });
});
