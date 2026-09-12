import type { Size } from '@arco-design/web-vue';

export interface AIconPickerProps {
  /** 图标名（kebab: 'icon-dashboard' 或 Pascal: 'IconDashboard'） */
  modelValue?: string;
  allowClear?: boolean;
  placeholder?: string;
  size?: Size;
  disabled?: boolean;
  readonly?: boolean;
}

export interface AIconPickerExposed {
  focus(): void;
  blur(): void;
}
