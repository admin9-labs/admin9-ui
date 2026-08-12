interface TencentLatLngLike {
  lat?: number;
  lng?: number;
  getLat?: () => number;
  getLng?: () => number;
}

interface TencentMarkerGeometry {
  id: string;
  styleId: string;
  position: TencentLatLngLike;
}

interface TencentMapLike {
  on(eventName: 'click', listener: (mapEvent: { latLng: TencentLatLngLike }) => void): void;
  off?(eventName: 'click', listener: (mapEvent: { latLng: TencentLatLngLike }) => void): void;
  getCenter(): TencentLatLngLike;
  setCenter(center: TencentLatLngLike): void;
  destroy?(): void;
}

interface TencentMultiMarkerLike {
  setGeometries(geometries: TencentMarkerGeometry[]): void;
  setMap?(map: TencentMapLike | null): void;
}

interface TencentSuggestionResult {
  id?: string;
  title?: string;
  address?: string;
  category?: string;
  location?: TencentLatLngLike;
}

interface TencentSuggestionLike {
  getSuggestions(options: { keyword: string; location?: TencentLatLngLike }): Promise<{ data?: TencentSuggestionResult[] }>;
}

export interface TencentMapNamespace {
  LatLng: new (latitude: number, longitude: number) => TencentLatLngLike;
  Map: new (container: HTMLElement, options: { center: TencentLatLngLike; zoom: number; viewMode?: '2D' }) => TencentMapLike;
  MarkerStyle: new (options: { width: number; height: number; anchor: { x: number; y: number }; src: string }) => unknown;
  MultiMarker: new (options: {
    map: TencentMapLike;
    styles: Record<string, unknown>;
    geometries: TencentMarkerGeometry[];
  }) => TencentMultiMarkerLike;
  service?: {
    Suggestion?: new (options: { pageSize: number; regionFix?: boolean }) => TencentSuggestionLike;
  };
}

declare global {
  interface Window {
    TMap?: TencentMapNamespace;
  }
}

let coreSdkPromise: Promise<TencentMapNamespace> | undefined;
let suggestionSdkPromise: Promise<TencentMapNamespace> | undefined;

interface TencentMapLoadOptions {
  requireSuggestion?: boolean;
}

const hasRequiredCapabilities = (namespace: TencentMapNamespace | undefined, requireSuggestion: boolean) =>
  Boolean(namespace && (!requireSuggestion || namespace.service?.Suggestion));

const includesServiceLibrary = (script: HTMLScriptElement) => {
  try {
    return new URL(script.src, document.baseURI).searchParams.get('libraries')?.split(',').includes('service') ?? false;
  } catch {
    return false;
  }
};

const waitForTencentMap = (script: HTMLScriptElement, requireSuggestion: boolean): Promise<TencentMapNamespace> =>
  new Promise((resolve, reject) => {
    let attempts = 0;
    let timer: number | undefined;
    let settled = false;

    const settle = (namespace?: TencentMapNamespace) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) window.clearInterval(timer);
      if (hasRequiredCapabilities(namespace, requireSuggestion)) resolve(namespace as TencentMapNamespace);
      else reject(new Error('Tencent Map JavaScript API failed to load.'));
    };
    const check = () => {
      if (hasRequiredCapabilities(window.TMap, requireSuggestion)) {
        settle(window.TMap);
        return;
      }
      attempts += 1;
      if (attempts >= 300) settle();
    };

    script.addEventListener('load', check, { once: true });
    script.addEventListener('error', () => settle(), { once: true });
    timer = window.setInterval(check, 50);
    check();
  });

export const loadTencentMap = (apiKey: string, options: TencentMapLoadOptions = {}): Promise<TencentMapNamespace> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Tencent Map JavaScript API requires a browser environment.'));
  }
  const requireSuggestion = options.requireSuggestion ?? false;
  if (hasRequiredCapabilities(window.TMap, requireSuggestion)) return Promise.resolve(window.TMap as TencentMapNamespace);
  const pendingPromise = requireSuggestion ? suggestionSdkPromise : suggestionSdkPromise || coreSdkPromise;
  if (pendingPromise) return pendingPromise;

  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src*="map.qq.com/api/gljs"]'));
  const existing = requireSuggestion ? scripts.find(includesServiceLibrary) : scripts[0];
  const script = existing || document.createElement('script');
  if (!existing) {
    script.id = 'admin9-ui-tencent-map-sdk';
    script.src = `https://map.qq.com/api/gljs?v=1.exp&libraries=service&key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    document.head.appendChild(script);
  }

  const promise = waitForTencentMap(script, requireSuggestion)
    .catch((error) => {
      if (!hasRequiredCapabilities(window.TMap, requireSuggestion)) script.remove();
      throw error;
    })
    .finally(() => {
      if (coreSdkPromise === promise) coreSdkPromise = undefined;
      if (suggestionSdkPromise === promise) suggestionSdkPromise = undefined;
    });
  if (requireSuggestion) suggestionSdkPromise = promise;
  else coreSdkPromise = promise;
  return promise;
};

export const readTencentLatLng = (value: TencentLatLngLike) => ({
  latitude: typeof value.getLat === 'function' ? value.getLat() : Number(value.lat),
  longitude: typeof value.getLng === 'function' ? value.getLng() : Number(value.lng),
});

export type { TencentLatLngLike, TencentMapLike, TencentMultiMarkerLike, TencentSuggestionLike, TencentSuggestionResult };
