import type { ImageCropOptions, ImageCropOutputOptions, ImageCropSourceOptions } from '../components/image-cropper/types';

export class ImageCropError extends Error {
  constructor(
    public readonly code: 'format' | 'animated' | 'sourceSize' | 'pixels' | 'decode' | 'outputSize' | 'configuration'
  ) {
    super(code);
  }
}

// TIFF offsets are relative to this metadata payload, never the surrounding image.
function readTiffOrientation(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = (): never => {
    throw new ImageCropError('format');
  };
  if (bytes.length < 8) return fail();
  const little = view.getUint16(0) === 0x4949;
  if (!little && view.getUint16(0) !== 0x4d4d) return fail();
  if (view.getUint16(2, little) !== 42) return fail();
  const ifd = view.getUint32(4, little);
  if (ifd < 8 || ifd + 2 > bytes.length) return fail();
  const count = view.getUint16(ifd, little);
  if (ifd + 2 + count * 12 > bytes.length) return fail();
  let orientation = 1;
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (view.getUint16(entry, little) === 0x112) {
      if (view.getUint16(entry + 2, little) !== 3 || view.getUint32(entry + 4, little) !== 1) return fail();
      orientation = view.getUint16(entry + 8, little);
      if (orientation < 1 || orientation > 8) return fail();
    }
  }
  return orientation;
}

// Inspect bounded source bytes before allocating a decoded bitmap. PNG chunks are
// scanned through IEND so APNG cannot silently become a still cover.
export function inspectImageSource(bytes: Uint8Array, maxPixels: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = (): never => {
    throw new ImageCropError('format');
  };
  const dimensions = (width: number, height: number) => {
    if (!width || !height || width * height > maxPixels) throw new ImageCropError('pixels');
    return { width, height };
  };
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) {
    let size: { width: number; height: number } | undefined;
    let ended = false;
    let orientation = 1;
    for (let offset = 8; offset + 12 <= bytes.length; ) {
      const length = view.getUint32(offset);
      if (offset + 12 + length > bytes.length) return fail();
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') throw new ImageCropError('animated');
      if (offset === 8 && (type !== 'IHDR' || length !== 13)) return fail();
      if (type === 'IHDR') size = dimensions(view.getUint32(offset + 8), view.getUint32(offset + 12));
      if (type === 'eXIf') orientation = readTiffOrientation(bytes.subarray(offset + 8, offset + 8 + length));
      offset += 12 + length;
      if (type === 'IEND') {
        ended = offset === bytes.length && length === 0;
        break;
      }
    }
    if (!size || !ended) return fail();
    return { ...size, orientation, type: 'image/png' };
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return fail();
  let size: { width: number; height: number } | undefined;
  let orientation = 1;
  for (let offset = 2; offset + 4 <= bytes.length; ) {
    if (bytes[offset] !== 0xff) return fail();
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xda || marker === 0xd9) break;
    const length = view.getUint16(offset);
    const end = offset + length;
    if (length < 2 || end > bytes.length) return fail();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8 || size) return fail();
      size = dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
    }
    if (marker === 0xe1 && length >= 8 && String.fromCharCode(...bytes.subarray(offset + 2, offset + 8)) === 'Exif\0\0') {
      orientation = readTiffOrientation(bytes.subarray(offset + 8, end));
    }
    offset = end;
  }
  if (!size) return fail();
  return { ...size, orientation, type: 'image/jpeg' };
}

export async function decodeImageSource(file: File, limits: ImageCropSourceOptions): Promise<ImageBitmap> {
  if (!file.size || file.size > limits.maxBytes) throw new ImageCropError('sourceSize');
  const metadata = inspectImageSource(new Uint8Array(await file.arrayBuffer()), limits.maxPixels);
  try {
    // The browser applies all eight EXIF orientations before crop coordinates are used.
    const bitmap = await createImageBitmap(file);
    const rotated = metadata.orientation >= 5;
    if (
      bitmap.width !== (rotated ? metadata.height : metadata.width) ||
      bitmap.height !== (rotated ? metadata.width : metadata.height)
    ) {
      bitmap.close();
      throw new ImageCropError('decode');
    }
    return bitmap;
  } catch {
    throw new ImageCropError('decode');
  }
}

export function validateCropOptions(ratio: number, options: ImageCropOptions) {
  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const { source, output } = options;
  if (
    !positive(ratio) ||
    !positive(source.maxBytes) ||
    !positive(source.maxPixels) ||
    !positive(output.maxBytes) ||
    !Number.isSafeInteger(output.resize.longEdge) ||
    output.resize.longEdge < 1 ||
    !['exact', 'max'].includes(output.resize.mode) ||
    !['image/jpeg', 'image/png'].includes(output.format) ||
    (output.format === 'image/jpeg' &&
      (!Number.isFinite(output.quality) || output.quality < 0 || output.quality > 1 || !output.background.trim()))
  )
    throw new ImageCropError('configuration');
}

export interface ImageCropRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Round the short edge to the nearest pixel; the configured long edge stays exact. */
export function cropOutputSize(width: number, height: number, ratio: number, output: ImageCropOutputOptions) {
  const target = output.resize.longEdge;
  const sourceEdge = ratio >= 1 ? Math.min(width, height * ratio) : Math.min(height, width / ratio);
  const edge = output.resize.mode === 'exact' ? target : Math.min(target, Math.floor(sourceEdge));
  if (edge < 1) throw new ImageCropError('pixels');
  return ratio >= 1
    ? { width: edge, height: Math.max(1, Math.round(edge / ratio)) }
    : { width: Math.max(1, Math.round(edge * ratio)), height: edge };
}

export async function encodeImageCrop(
  source: ImageBitmap,
  rectangle: ImageCropRectangle,
  ratio: number,
  output: ImageCropOutputOptions,
  name: string
) {
  const { x, y, width, height } = rectangle;
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > source.width + 0.001 ||
    y + height > source.height + 0.001
  )
    throw new ImageCropError('pixels');
  const size = cropOutputSize(width, height, ratio, output);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new ImageCropError('decode');
    if (output.format === 'image/jpeg') {
      if (!CSS.supports('color', output.background)) throw new ImageCropError('configuration');
      context.fillStyle = output.background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(source, x, y, width, height, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, output.format, output.quality);
    });
    if (!blob || blob.type !== output.format || !blob.size) throw new ImageCropError('decode');
    if (blob.size > output.maxBytes) throw new ImageCropError('outputSize');
    const extension = output.format === 'image/jpeg' ? 'jpg' : 'png';
    return new File([blob], `${name.replace(/\.[^.]*$/, '') || 'image'}-crop.${extension}`, { type: blob.type });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
