import type { VNode } from 'vue';

export interface AChatComposerProps {
  modelValue: string;
  generating?: boolean;
  disabled?: boolean;
  submitDisabled?: boolean;
  placeholder?: string;
}

export interface ChatComposerSlot {
  disabled: boolean;
  submitDisabled: boolean;
  generating: boolean;
}

export interface AChatComposerSlots {
  header?: (scope: ChatComposerSlot) => VNode[];
  attachments?: (scope: ChatComposerSlot) => VNode[];
  toolbar?: (scope: ChatComposerSlot) => VNode[];
}

export interface AChatComposerExposed {
  focus: () => void;
}
