import type { Size } from '@arco-design/web-vue';
import type { ImageCropOptions } from '../image-cropper/types';
import type { FileBeforeSelect, FileBeforeUpload, FileItem, FilePickerAdapter } from '../../services/types';

export type CoverMode = 'single' | 'triple' | 'none';
export type CoverPickerSize = Size;

export type CoverPickerValue =
  | { mode: 'none'; images: [] }
  | { mode: 'single'; images: [FileItem | null] }
  | { mode: 'triple'; images: [FileItem | null, FileItem | null, FileItem | null] };

export interface ACoverPickerProps {
  modelValue?: CoverPickerValue;
  size?: CoverPickerSize;
  service?: FilePickerAdapter;
  canUpload?: boolean;
  canCreateGroup?: boolean;
  canDeleteFiles?: boolean;
  canMoveFiles?: boolean;
  accept?: string;
  aspectRatio?: number | string;
  disabled?: boolean;
  readonly?: boolean;
  /** Native crop workflow; mutually exclusive with beforeUpload/beforeSelect. */
  crop?: ImageCropOptions;
  beforeUpload?: FileBeforeUpload;
  beforeSelect?: FileBeforeSelect;
}

export interface ACoverPickerExposed {
  cancel(): void;
}
