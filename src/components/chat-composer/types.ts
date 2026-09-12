import type { Size } from '@arco-design/web-vue';
import type { TextareaHTMLAttributes, VNode } from 'vue';

export type ChatComposerSize = Size;

export interface AChatComposerProps {
  modelValue: string;
  size?: ChatComposerSize;
  generating?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  textareaAttrs?: TextareaHTMLAttributes;
  submitDisabled?: boolean;
  placeholder?: string;
  autoSize?: boolean | { minRows?: number; maxRows?: number };
  maxLength?: number;
}

export interface ChatComposerSlot {
  size: ChatComposerSize;
  disabled: boolean;
  readonly: boolean;
  submitDisabled: boolean;
  generating: boolean;
}

export interface AChatComposerSlots {
  header?: (scope: ChatComposerSlot) => VNode[];
  attachments?: (scope: ChatComposerSlot) => VNode[];
  toolbar?: (scope: ChatComposerSlot) => VNode[];
  action?: (scope: ChatComposerSlot & { canSubmit: boolean; activate: () => void }) => VNode[];
}

export interface AChatComposerExposed {
  focus: () => void;
  blur: () => void;
}
