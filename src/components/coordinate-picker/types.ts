import type { Size } from '@arco-design/web-vue';

export interface CoordinateValue {
  latitude: number;
  longitude: number;
}

export type CoordinateSelectionSource = 'map' | 'search' | 'manual' | 'model';

export interface CoordinateSelection extends CoordinateValue {
  source: CoordinateSelectionSource;
  title?: string;
  address?: string;
}

export interface TencentMapSuggestion {
  id?: string;
  title: string;
  address?: string;
  category?: string;
  location: CoordinateValue;
}

export interface ACoordinatePickerProps {
  modelValue?: CoordinateValue;
  apiKey: string;
  center?: CoordinateValue;
  zoom?: number;
  precision?: number;
  height?: number | string;
  placeholder?: string;
  allowClear?: boolean;
  size?: Size;
  disabled?: boolean;
  readonly?: boolean;
  allowSearch?: boolean;
}

export interface ACoordinatePickerExposed {
  focus(): void;
  blur(): void;
  open(): void;
  close(): void;
  clear(): void;
}
