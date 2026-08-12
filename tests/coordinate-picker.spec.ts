/* eslint-disable max-classes-per-file, no-use-before-define, class-methods-use-this, @typescript-eslint/no-empty-function */
import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import ArcoVue from '@arco-design/web-vue';
import { IconClose } from '@arco-design/web-vue/es/icon';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ACoordinatePicker from '../src/components/coordinate-picker/index.vue';
import { messages } from '../src/locale';
import type { CoordinateValue } from '../src/components/coordinate-picker/types';
import type { TencentMapNamespace } from '../src/components/coordinate-picker/tencent-map';

class FakeMap {
  static instances: FakeMap[] = [];

  center: unknown;

  listeners = new Map<string, (mapEvent: unknown) => void>();

  constructor(_container: HTMLElement, options: { center: unknown }) {
    this.center = options.center;
    FakeMap.instances.push(this);
  }

  on(eventName: string, listener: (mapEvent: unknown) => void) {
    this.listeners.set(eventName, listener);
  }

  off(eventName: string) {
    this.listeners.delete(eventName);
  }

  getCenter() {
    return this.center;
  }

  setCenter(center: unknown) {
    this.center = center;
  }

  destroy() {
    this.listeners.clear();
  }

  click(latitude: number, longitude: number) {
    this.listeners.get('click')?.({ latLng: new FakeLatLng(latitude, longitude) });
  }
}

class FakeLatLng {
  private latitude: number;

  private longitude: number;

  constructor(latitude: number, longitude: number) {
    this.latitude = latitude;
    this.longitude = longitude;
  }

  getLat() {
    return this.latitude;
  }

  getLng() {
    return this.longitude;
  }
}

class FakeMarker {
  static instances: FakeMarker[] = [];

  geometries: unknown[];

  constructor(options: { geometries: unknown[] }) {
    this.geometries = options.geometries;
    FakeMarker.instances.push(this);
  }

  setGeometries(geometries: unknown[]) {
    this.geometries = geometries;
  }

  setMap() {}
}

const suggestion = {
  getSuggestions: vi.fn(async () => ({
    data: [
      {
        id: 'qionghai',
        title: '邛海国家湿地公园',
        address: '四川省凉山彝族自治州西昌市',
        category: '旅游景点',
        location: new FakeLatLng(27.829318, 102.283088),
      },
    ],
  })),
};

const mountedApps: Array<ReturnType<typeof createApp>> = [];

const installLazyScriptElements = () => {
  const createElement = document.createElement.bind(document);
  return vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
    if (tagName.toLowerCase() !== 'script') return createElement(tagName, options);
    const template = createElement('template');
    template.innerHTML = '<script></script>';
    return template.content.firstElementChild as HTMLScriptElement;
  }) as typeof document.createElement);
};

const createTencentMapNamespace = (includeSuggestion = true) => ({
  LatLng: FakeLatLng,
  Map: FakeMap,
  MarkerStyle: class {},
  MultiMarker: FakeMarker,
  ...(includeSuggestion
    ? {
        service: {
          Suggestion: class {
            getSuggestions = suggestion.getSuggestions;
          },
        },
      }
    : {}),
});

const installTencentMap = (includeSuggestion = true) => {
  FakeMap.instances = [];
  FakeMarker.instances = [];
  window.TMap = createTencentMapNamespace(includeSuggestion) as unknown as TencentMapNamespace;
};

const mountPicker = (props: Record<string, unknown> = {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  const model = ref<CoordinateValue | undefined>(props.modelValue as CoordinateValue | undefined);
  const changes: Array<CoordinateValue | undefined> = [];
  const confirms: unknown[] = [];
  const visibility: boolean[] = [];
  const mapErrors: unknown[] = [];
  const pickerRef = ref<{ clear: () => void }>();
  const Root = defineComponent({
    setup() {
      return () =>
        h(ACoordinatePicker, {
          'apiKey': 'test-key',
          ...props,
          'ref': pickerRef,
          'modelValue': model.value,
          'onUpdate:modelValue': (value: CoordinateValue | undefined) => {
            model.value = value;
          },
          'onChange': (value: CoordinateValue | undefined) => changes.push(value),
          'onConfirm': (value: unknown) => confirms.push(value),
          'onVisibleChange': (value: boolean) => visibility.push(value),
          'onMapError': (error: unknown) => mapErrors.push(error),
        });
    },
  });
  const app = createApp(Root);
  app.use(ArcoVue);
  app.component('IconClose', IconClose);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages }));
  app.mount(host);
  mountedApps.push(app);
  return { app, host, model, changes, confirms, visibility, mapErrors, pickerRef };
};

const click = (element: Element | null) => {
  if (!element) throw new Error('Expected element to exist');
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

const flush = async () => {
  await nextTick();
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
  await nextTick();
};

const waitFor = async (predicate: () => boolean, attempts = 20): Promise<void> => {
  if (predicate()) return;
  if (attempts <= 0) throw new Error('Timed out waiting for component state');
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 10);
  });
  await nextTick();
  await waitFor(predicate, attempts - 1);
};

afterEach(() => {
  mountedApps.splice(0).forEach((app) => app.unmount());
  document.body.innerHTML = '';
  document.head.querySelectorAll('script[src*="map.qq.com/api/gljs"]').forEach((script) => script.remove());
  delete window.TMap;
  suggestion.getSuggestions.mockClear();
});

describe('ACoordinatePicker', () => {
  it('keeps map clicks in a draft until confirmation', async () => {
    installTencentMap();
    const mounted = mountPicker();

    click(mounted.host.querySelector('.a9-coordinate-picker__trigger'));
    await waitFor(() => FakeMap.instances.length === 1 || mounted.mapErrors.length > 0);
    expect(mounted.mapErrors).toEqual([]);
    expect(FakeMap.instances).toHaveLength(1);
    FakeMap.instances[0].click(27.8945042, 102.2644487);
    await nextTick();

    expect(mounted.model.value).toBeUndefined();
    const inputs = [...document.body.querySelectorAll<HTMLInputElement>('.arco-input-number input')];
    expect(inputs.map((input) => input.value)).toEqual(['27.894504', '102.264449']);

    click(document.body.querySelector('.arco-modal-footer .arco-btn-primary'));
    await nextTick();

    expect(mounted.model.value).toEqual({ latitude: 27.894504, longitude: 102.264449 });
    expect(mounted.changes).toEqual([{ latitude: 27.894504, longitude: 102.264449 }]);
    expect(mounted.confirms).toEqual([{ latitude: 27.894504, longitude: 102.264449, source: 'map' }]);
  });

  it('searches places and includes metadata only in the confirm event', async () => {
    installTencentMap();
    const mounted = mountPicker();

    click(mounted.host.querySelector('.a9-coordinate-picker__trigger'));
    await waitFor(() => FakeMap.instances.length === 1 || mounted.mapErrors.length > 0);
    expect(mounted.mapErrors).toEqual([]);
    const modal = document.body.querySelector('.a9-coordinate-picker__modal');
    const search = modal?.querySelector<HTMLInputElement>('.a9-coordinate-picker__search input');
    if (!search) throw new Error('Expected search input');
    search.value = '邛海';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    click(modal?.querySelector('.arco-input-search-btn') || null);
    await flush();

    expect(suggestion.getSuggestions).toHaveBeenCalledWith(expect.objectContaining({ keyword: '邛海' }));
    click(modal?.querySelector('.a9-coordinate-picker__result') || null);
    await nextTick();
    click(modal?.querySelector('.arco-modal-footer .arco-btn-primary') || null);
    await nextTick();

    expect(mounted.model.value).toEqual({ latitude: 27.829318, longitude: 102.283088 });
    expect(mounted.confirms).toEqual([
      {
        latitude: 27.829318,
        longitude: 102.283088,
        source: 'search',
        title: '邛海国家湿地公园',
        address: '四川省凉山彝族自治州西昌市',
      },
    ]);
  });

  it('does not open or clear while readonly', async () => {
    installTencentMap();
    const readonly = mountPicker({
      readonly: true,
      allowClear: true,
      modelValue: { latitude: 1, longitude: 2 },
    });

    click(readonly.host.querySelector('.a9-coordinate-picker__trigger'));
    await nextTick();
    expect(FakeMap.instances).toHaveLength(0);
    expect(readonly.visibility).toEqual([]);
    expect(readonly.changes).toEqual([]);
  });

  it('clears an editable committed value', async () => {
    installTencentMap();
    const mounted = mountPicker({
      allowClear: true,
      modelValue: { latitude: 1, longitude: 2 },
    });

    const clearButton = mounted.host.querySelector('.a9-coordinate-picker__clear');
    expect(clearButton).not.toBeNull();
    click(clearButton);
    await nextTick();

    expect(mounted.model.value).toBeUndefined();
    expect(mounted.changes).toEqual([undefined]);
  });

  it.each(['disabled', 'readonly'] as const)('closes without committing when %s while the modal is open', async (mode) => {
    installTencentMap();
    const pickerProps = reactive({ disabled: false, readonly: false });
    const mounted = mountPicker(pickerProps);

    click(mounted.host.querySelector('.a9-coordinate-picker__trigger'));
    await waitFor(() => FakeMap.instances.length === 1 || mounted.mapErrors.length > 0);
    FakeMap.instances[0].click(27.894504, 102.264449);
    await nextTick();

    pickerProps[mode] = true;
    await nextTick();

    expect(mounted.visibility).toEqual([true, false]);
    expect(mounted.model.value).toBeUndefined();
    expect(mounted.changes).toEqual([]);
    expect(mounted.confirms).toEqual([]);
  });

  it('replaces a failed SDK script before retrying', async () => {
    installLazyScriptElements();
    const mounted = mountPicker();
    click(mounted.host.querySelector('.a9-coordinate-picker__trigger'));
    await waitFor(() => Boolean(document.querySelector('script[src*="map.qq.com/api/gljs"]')));
    const failedScript = document.querySelector<HTMLScriptElement>('script[src*="map.qq.com/api/gljs"]');
    failedScript?.dispatchEvent(new Event('error'));
    await waitFor(() => mounted.mapErrors.length === 1);

    expect(failedScript?.isConnected).toBe(false);
    click(document.body.querySelector('.a9-coordinate-picker__map-state .arco-btn'));
    await waitFor(() => {
      const script = document.querySelector<HTMLScriptElement>('script[src*="map.qq.com/api/gljs"]');
      return Boolean(script && script !== failedScript);
    });
    const retryScript = document.querySelector<HTMLScriptElement>('script[src*="map.qq.com/api/gljs"]');
    expect(retryScript).not.toBe(failedScript);

    installTencentMap();
    retryScript?.dispatchEvent(new Event('load'));
    await waitFor(() => FakeMap.instances.length === 1);
    expect(mounted.mapErrors).toHaveLength(1);
  });

  it('loads the service library when the host SDK lacks place search', async () => {
    installLazyScriptElements();
    installTencentMap(false);
    const coreNamespace = window.TMap;
    const mounted = mountPicker();

    click(mounted.host.querySelector('.a9-coordinate-picker__trigger'));
    await waitFor(() => Boolean(document.querySelector('script[src*="map.qq.com/api/gljs"]')));
    const serviceScript = document.querySelector<HTMLScriptElement>('script[src*="map.qq.com/api/gljs"]');
    expect(serviceScript?.src).toContain('libraries=service');

    if (!coreNamespace) throw new Error('Expected a preloaded Tencent Map namespace');
    coreNamespace.service = createTencentMapNamespace().service;
    serviceScript?.dispatchEvent(new Event('load'));
    await waitFor(() => FakeMap.instances.length === 1 || mounted.mapErrors.length > 0);

    expect(mounted.mapErrors).toEqual([]);
    const search = document.body.querySelector<HTMLInputElement>('.a9-coordinate-picker__search input');
    if (!search) throw new Error('Expected search input');
    search.value = '邛海';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    click(document.body.querySelector('.a9-coordinate-picker__search .arco-input-search-btn'));
    await flush();
    expect(suggestion.getSuggestions).toHaveBeenCalledWith(expect.objectContaining({ keyword: '邛海' }));
  });

  it('shows a configuration error without loading the SDK when apiKey is empty', async () => {
    const mounted = mountPicker({ apiKey: '' });
    click(mounted.host.querySelector('.a9-coordinate-picker__trigger'));
    await nextTick();
    await nextTick();

    expect(document.body.textContent).toContain('请配置腾讯地图 API Key');
    expect(document.querySelector('script[src*="map.qq.com/api/gljs"]')).toBeNull();
  });
});
