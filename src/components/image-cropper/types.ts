/** Input limits apply to the original file, before decoding. Static JPEG/PNG only. */
export interface ImageCropSourceOptions {
  maxBytes: number;
  maxPixels: number;
}

export type ImageCropOutputOptions = {
  /** exact reaches the target (including upscaling); max only downsizes. */
  resize: { mode: 'exact' | 'max'; longEdge: number };
  maxBytes: number;
} & (
  | { format: 'image/jpeg'; quality: number; background: string }
  | { format: 'image/png'; quality?: never; background?: never }
);

export interface ImageCropOptions {
  source: ImageCropSourceOptions;
  output: ImageCropOutputOptions;
}

export interface AImageCropperProps {
  aspectRatio: number;
  crop: ImageCropOptions;
}

export interface AImageCropperExposed {
  /** Opening again cancels the previous request. Cancellation resolves to null. */
  open(file: File): Promise<File | null>;
  cancel(): void;
}
