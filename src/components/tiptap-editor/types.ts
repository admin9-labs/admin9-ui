import type { FileItem, FilePickerAdapter, FileType } from '../../services/types';

export type TiptapImageDisplay = 'block' | 'inline';
export type TiptapMediaAlign = 'left' | 'center' | 'right';
export type TiptapBlockWidth = 'natural' | '25%' | '50%' | '75%' | '100%';
export type TiptapInlineImageSize = '1em' | '1.25em' | '1.5em' | '2em';
export type TiptapAudioWidth = 'compact' | 'standard' | 'full';
export type TiptapMediaOperation = 'insert' | 'replace';
export type TiptapMediaErrorReason = 'invalid-selection' | 'command-failed';

export interface TiptapMediaError {
  operation: TiptapMediaOperation;
  mediaType: Extract<FileType, 'image' | 'video' | 'audio'>;
  reason: TiptapMediaErrorReason;
  /** 本次选择或命令实际处理的素材。 */
  attemptedItems: FileItem[];
  /** 最终校验拒绝的素材；命令执行失败时为空。 */
  rejectedItems: FileItem[];
  cause?: unknown;
}

export interface ATiptapEditorProps {
  modelValue?: string;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  minHeight?: number | string;
  maxHeight?: number | string;
  maxLength?: number;
  showWordCount?: boolean;
  service?: FilePickerAdapter;
  /** Enable image upload in the picker. Defaults to false and requires upload capability when enabled. */
  canUploadImage?: boolean;
  /** Enable video upload in the picker. Defaults to false and requires upload capability when enabled. */
  canUploadVideo?: boolean;
  /** Enable audio upload in the picker. Defaults to false and requires upload capability when enabled. */
  canUploadAudio?: boolean;
  defaultImageDisplay?: TiptapImageDisplay;
}
