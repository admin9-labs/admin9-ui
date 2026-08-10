import type { MediaService } from '../../services/types';

export type TiptapImageDisplay = 'block' | 'inline';
export type TiptapMediaAlign = 'left' | 'center' | 'right';
export type TiptapBlockWidth = 'natural' | '25%' | '50%' | '75%' | '100%';
export type TiptapInlineImageSize = '1em' | '1.25em' | '1.5em' | '2em';
export type TiptapAudioWidth = 'compact' | 'standard' | 'full';

export interface ATiptapEditorProps {
  modelValue?: string;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  minHeight?: number | string;
  maxHeight?: number | string;
  maxLength?: number;
  showWordCount?: boolean;
  service?: MediaService;
  canUploadImage?: boolean;
  canUploadVideo?: boolean;
  canUploadAudio?: boolean;
  defaultImageDisplay?: TiptapImageDisplay;
}
