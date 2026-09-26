import type { Size } from '@arco-design/web-vue';
import type { FileItem, FilePickerAdapter } from '../../services/types';
import type { FilePickerView } from '../file-picker/types';

export type ImagePickerValue = FileItem | FileItem[] | undefined;

export interface AImagePickerProps {
  modelValue?: ImagePickerValue;
  multiple?: boolean;
  limit?: number;
  showFileList?: boolean;
  service?: FilePickerAdapter;
  canUpload?: boolean;
  accept?: string;
  disabled?: boolean;
  readonly?: boolean;
  size?: Size;
  buttonText?: string;
  pageSize?: number;
  defaultView?: FilePickerView;
}

export interface AImagePickerEmits {
  (e: 'update:modelValue', value: ImagePickerValue): void;
  (e: 'change', value: ImagePickerValue): void;
  (e: 'confirm', items: FileItem[]): void;
  (e: 'clear'): void;
  (e: 'visibleChange', visible: boolean): void;
  (e: 'uploadSuccess', item: FileItem): void;
  (e: 'uploadError', error: unknown): void;
}

export interface AImagePickerSlots {
  trigger?: (props: {
    open: () => void;
    selectedItems: FileItem[];
    selectedCount: number;
    disabled: boolean;
    readonly: boolean;
    limitReached: boolean;
  }) => unknown;
}

export interface AImagePickerExposed {
  open(): void;
  close(): void;
  clear(): void;
  refresh(): Promise<void>;
}
