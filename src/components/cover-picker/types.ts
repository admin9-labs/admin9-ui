import type { FileItem, FilePickerAdapter } from '../../services/types';

export type CoverMode = 'single' | 'triple' | 'none';
export type CoverPickerSize = 'small' | 'medium' | 'large';

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
}
