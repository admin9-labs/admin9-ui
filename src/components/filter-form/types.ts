import type { ResponsiveValue } from '@arco-design/web-vue';

export interface AFilterFormProps {
  model: object;
  cols?: number | ResponsiveValue;
  fieldFlex?: Record<string, number>;
  loading?: boolean;
}
