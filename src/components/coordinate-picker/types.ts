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
