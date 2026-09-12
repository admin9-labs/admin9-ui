import type { Size } from '@arco-design/web-vue';
import type { FileItem, FilePickerAdapter } from '../../services/types';

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
  accept?: string;
  disabled?: boolean;
  readonly?: boolean;
}
