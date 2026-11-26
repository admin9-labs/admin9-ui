import { readFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';
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
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Solid 40×24 images. Each test inserts its own metadata into the same source pixels.
const jpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAYACgBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAA/AJ/AAAAB/9k=',
  'base64'
);
const pngBase = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAYCAAAAACt7+AcAAAAEUlEQVR42mNgGAWjYBQMNwAAA9gAAa4p3LEAAAAASUVORK5CYII=',
  'base64'
);

function orientationTiff(orientation: number, littleEndian = false) {
  // TIFF header, one IFD entry (Orientation, SHORT, count 1), then no further IFD.
  const tiff = Buffer.alloc(26);
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.length);
  tiff.write(littleEndian ? 'II' : 'MM');
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, 8, littleEndian);
  view.setUint16(8, 1, littleEndian);
  view.setUint16(10, 0x0112, littleEndian);
  view.setUint16(12, 3, littleEndian);
  view.setUint32(14, 1, littleEndian);
  view.setUint16(18, orientation, littleEndian);
  return tiff;
}

function pngWithExif(tiff: Buffer) {
  const chunk = Buffer.alloc(12 + tiff.length);
  chunk.writeUInt32BE(tiff.length, 0);
  chunk.write('eXIf', 4);
  tiff.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return Buffer.concat([pngBase.subarray(0, 33), chunk, pngBase.subarray(33)]); // after IHDR
}

describe('image crop orientation', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('reads JPEG orientation %i and preserves the encoded dimensions', (orientation) => {
    const tiff = orientationTiff(orientation);
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, 8 + tiff.length]), Buffer.from('Exif\0\0'), tiff]);
    const source = Buffer.concat([jpeg.subarray(0, 20), app1, jpeg.subarray(20)]); // after JFIF APP0
    expect(inspectImageSource(source, crop.source.maxPixels)).toEqual({
      orientation,
      width: 40,
      height: 24,
      type: 'image/jpeg',
    });
  });

  it.each([
    { orientation: 4, width: 40, height: 24 },
    { orientation: 5, width: 24, height: 40 },
  ])('checks PNG bitmap dimensions and ownership for orientation $orientation', async ({ orientation, width, height }) => {
    const source = new File([pngWithExif(orientationTiff(orientation))], 'photo.png', { type: 'image/png' });
    const accepted = { width, height, close: vi.fn() };
    const rejected = { width: height, height: width, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValueOnce(accepted).mockResolvedValueOnce(rejected));

    await expect(decodeImageSource(source, crop.source)).resolves.toBe(accepted);
    expect(accepted.close).not.toHaveBeenCalled();
    await expect(decodeImageSource(source, crop.source)).rejects.toMatchObject({ code: 'decode' });
    expect(rejected.close).toHaveBeenCalledTimes(1);
  });

  it.each(['little', 'big'])('reads PNG eXIf orientation in %s-endian order', (order) => {
    const source = pngWithExif(orientationTiff(6, order === 'little'));
    expect(inspectImageSource(source, crop.source.maxPixels).orientation).toBe(6);
  });

  it('rejects a truncated TIFF header inside a complete PNG', () => {
    const source = pngWithExif(orientationTiff(6).subarray(0, 7));
    expect(() => inspectImageSource(source, crop.source.maxPixels)).toThrow(expect.objectContaining({ code: 'format' }));
  });

  it.each([
    { field: 'IFD offset outside eXIf', offset: 4, bytes: '00000020' },
    { field: 'entry count exceeding eXIf length', offset: 8, bytes: '0002' },
    { field: 'orientation type other than SHORT', offset: 12, bytes: '0004' },
    { field: 'orientation count other than one', offset: 14, bytes: '00000002' },
    { field: 'orientation value above eight', offset: 18, bytes: '0009' },
  ])('rejects PNG metadata with $field', ({ offset, bytes }) => {
    const tiff = orientationTiff(6);
    tiff.write(bytes, offset, 'hex');
    const source = pngWithExif(tiff);
    expect(() => inspectImageSource(source, crop.source.maxPixels)).toThrow(expect.objectContaining({ code: 'format' }));
  });
});

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
  it('derives free output dimensions from the selected rectangle', () => {
    validateCropOptions(undefined, crop);
    expect(cropOutputSize(300, 200, undefined, crop.output)).toEqual({ width: 640, height: 427 });
    expect(cropOutputSize(200, 400, undefined, crop.output)).toEqual({ width: 320, height: 640 });
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
    expect(() => inspectImageSource(new TextEncoder().encode('GIF89a'), 20_000_000)).toThrow('format');
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
