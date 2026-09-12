import type { VNode } from 'vue';

export type ChatComposerSize = 'small' | 'medium' | 'large';

export interface AChatComposerProps {
  modelValue: string;
  size?: ChatComposerSize;
  generating?: boolean;
  disabled?: boolean;
  submitDisabled?: boolean;
  placeholder?: string;
  autoSize?: { minRows?: number; maxRows?: number };
  maxLength?: number;
}

export interface ChatComposerSlot {
  size: ChatComposerSize;
  disabled: boolean;
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
}
