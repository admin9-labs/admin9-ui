import type { VNode } from 'vue';

export type ChatMessageStatus = 'pending' | 'streaming' | 'complete' | 'error' | 'stopped';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: ChatMessageStatus;
}

export interface AChatMessageListProps {
  messages: ChatMessage[];
  autoScroll?: boolean;
}

export interface ChatMessageSlot {
  message: ChatMessage;
  index: number;
}

export interface AChatMessageListSlots {
  empty?: () => VNode[];
  avatar?: (scope: ChatMessageSlot) => VNode[];
  content?: (scope: ChatMessageSlot) => VNode[];
  footer?: (scope: ChatMessageSlot) => VNode[];
  actions?: (scope: ChatMessageSlot) => VNode[];
}

export interface AChatMessageListExposed {
  scrollToBottom: () => void;
}
