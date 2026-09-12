import type { FormInstance, ResponsiveValue, Size } from '@arco-design/web-vue';

export interface AFilterFormProps {
  disabled?: boolean;
  size?: Size;
  model: object;
  cols?: number | ResponsiveValue;
  fieldFlex?: Record<string, number>;
  loading?: boolean;
}

export type AFilterFormExposed = Pick<
  FormInstance,
  'validate' | 'validateField' | 'resetFields' | 'clearValidate' | 'setFields' | 'scrollToField'
>;
