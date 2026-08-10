import type { MediaItem, MediaPickerService, MediaType } from '../../services/types';

export type TiptapImageDisplay = 'block' | 'inline';
export type TiptapMediaAlign = 'left' | 'center' | 'right';
export type TiptapBlockWidth = 'natural' | '25%' | '50%' | '75%' | '100%';
export type TiptapInlineImageSize = '1em' | '1.25em' | '1.5em' | '2em';
export type TiptapAudioWidth = 'compact' | 'standard' | 'full';
export type TiptapMediaOperation = 'insert' | 'replace';
export type TiptapMediaErrorReason = 'invalid-selection' | 'command-failed';

export interface TiptapMediaError {
  operation: TiptapMediaOperation;
  mediaType: MediaType;
  reason: TiptapMediaErrorReason;
  /** 本次选择或命令实际处理的素材。 */
  attemptedItems: MediaItem[];
  /** 最终校验拒绝的素材；命令执行失败时为空。 */
  rejectedItems: MediaItem[];
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
  service?: MediaPickerService;
  canUploadImage?: boolean;
  canUploadVideo?: boolean;
  canUploadAudio?: boolean;
  defaultImageDisplay?: TiptapImageDisplay;
}
