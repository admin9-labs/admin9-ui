import type { Size } from '@arco-design/web-vue';
import type { FileItem, FilePickerAdapter, FileType } from '../../services/types';

export type FilePickerValue = FileItem | FileItem[] | undefined;
export type FilePickerView = 'grid' | 'list';
export interface AFilePickerProps {
  modelValue?: FilePickerValue;
  fileTypes?: readonly FileType[];
  multiple?: boolean;
  limit?: number;
  pageSize?: number;
  buttonText?: string;
  accept?: string;
  canUpload?: boolean;
  canCreateGroup?: boolean;
  canDeleteFiles?: boolean;
  canMoveFiles?: boolean;
  /** 单一图片范围固定为网格，此选项仅影响其他文件范围的初始视图。 */
  defaultView?: FilePickerView;
  service?: FilePickerAdapter;
  disabled?: boolean;
  readonly?: boolean;
  size?: Size;
  allowClear?: boolean;
}
export interface AFilePickerExposed {
  open(): void;
  close(): void;
  clear(): void;
  refresh(): Promise<void>;
}
