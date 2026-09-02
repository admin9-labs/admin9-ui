/* eslint-disable vue/one-component-per-file */
import { Fragment, createApp, defineComponent, h, nextTick, reactive, ref, type App, type Component } from 'vue';
import { FormItem, Input } from '@arco-design/web-vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AFilterForm from '../src/components/filter-form/index.vue';

const mountedApps: App[] = [];
const mediaQueries: Array<{
  media: string;
  readonly matches: boolean;
  listeners: Set<(event: { matches: boolean }) => void>;
}> = [];

const matchesQuery = (query: string, width: number) => {
  const min = query.match(/min-width:\s*(\d+)px/);
  const max = query.match(/max-width:\s*(\d+)px/);
  return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
};

const setViewport = (width: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  mediaQueries.forEach((query) => query.listeners.forEach((listener) => listener({ matches: query.matches })));
  window.dispatchEvent(new Event('resize'));
};

const installMatchMedia = () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      const entry = {
        media: query,
        get matches() {
          return matchesQuery(query, window.innerWidth);
        },
        listeners: new Set<(event: { matches: boolean }) => void>(),
        addEventListener(_event: string, listener: (event: { matches: boolean }) => void) {
          this.listeners.add(listener);
        },
        removeEventListener(_event: string, listener: (event: { matches: boolean }) => void) {
          this.listeners.delete(listener);
        },
        addListener(listener: (event: { matches: boolean }) => void) {
          this.listeners.add(listener);
        },
        removeListener(listener: (event: { matches: boolean }) => void) {
          this.listeners.delete(listener);
        },
      };
      mediaQueries.push(entry);
      return entry;
    })
  );
};

const IconStub = defineComponent({
  setup() {
    return () => h('span', { 'aria-hidden': 'true' });
  },
});

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
};

interface MountOptions {
  count?: number;
  cols?: number;
  loading?: boolean;
}

const mountFilterForm = (options: MountOptions = {}) => {
  const count = ref(options.count ?? 3);
  const model = reactive<Record<string, unknown>>({ keyword: 'kept' });
  const onSearch = vi.fn();
  const onReset = vi.fn();
  const Host = defineComponent({
    setup() {
      return () =>
        h(
          AFilterForm,
          {
            model,
            ...(options.cols === undefined ? {} : { cols: options.cols }),
            loading: options.loading,
            onSearch,
            onReset,
          },
          {
            default: () =>
              h(
                Fragment,
                null,
                Array.from({ length: count.value }, (_, index) =>
                  h('div', { 'data-testid': `field-${index + 1}`, 'key': index }, `Field ${index + 1}`)
                )
              ),
          }
        );
    },
  });
  const app = createApp(Host);
  app.use(
    createI18n({
      legacy: false,
      locale: 'en-US',
      messages: {
        'en-US': {
          admin9Ui: {
            filterForm: { search: 'Search', reset: 'Reset', expand: 'Expand', collapse: 'Collapse' },
          },
        },
      },
    })
  );
  ['IconSearch', 'IconRefresh', 'IconDown', 'IconUp'].forEach((name) => app.component(name, IconStub as Component));
  mountedApps.push(app);
  app.mount('#app');
  return { count, model, onSearch, onReset };
};

const visibleFieldCount = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.a9-filter-form__field')).filter((field) => field.style.display !== 'none')
    .length;

describe('AFilterForm public contract', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    mediaQueries.splice(0);
    setViewport(1280);
    installMatchMedia();
  });

  afterEach(() => {
    mountedApps.splice(0).forEach((app) => app.unmount());
    vi.unstubAllGlobals();
  });

  it.each([
    [3, 'single'],
    [4, 'multiple'],
    [6, 'multiple'],
  ])('uses the non-collapsible layout for %i fields', async (count, layout) => {
    mountFilterForm({ count, cols: 3 });
    await flush();

    expect(document.querySelector('.a9-filter-form')?.getAttribute('data-layout')).toBe(layout);
    expect(document.querySelector('.a9-filter-form__toggle')).toBeNull();
    expect(visibleFieldCount()).toBe(count);
  });

  it('enables collapse after two rows and collapses fields to the first row', async () => {
    mountFilterForm({ count: 7, cols: 3 });
    await flush();

    const form = document.querySelector('.a9-filter-form');
    let toggle = document.querySelector<HTMLButtonElement>('.a9-filter-form__toggle');
    expect(form?.getAttribute('data-field-count')).toBe('7');
    expect(form?.getAttribute('data-layout')).toBe('collapsible-collapsed');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.textContent).toContain('Expand');
    expect(visibleFieldCount()).toBe(3);

    toggle?.click();
    await flush();
    toggle = document.querySelector<HTMLButtonElement>('.a9-filter-form__toggle');
    expect(form?.getAttribute('data-layout')).toBe('collapsible-expanded');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.textContent).toContain('Collapse');
    expect(visibleFieldCount()).toBe(7);

    toggle?.click();
    await flush();
    expect(visibleFieldCount()).toBe(3);
  });

  it('applies the configured column count to the collapse boundary', async () => {
    mountFilterForm({ count: 5, cols: 2 });
    await flush();

    expect(document.querySelector('.a9-filter-form')?.getAttribute('data-active-cols')).toBe('2');
    expect(document.querySelector('.a9-filter-form__toggle')).not.toBeNull();
    expect(visibleFieldCount()).toBe(2);
  });

  it('counts fragment and v-for fields reactively and resets to collapsed after overflow disappears', async () => {
    const { count } = mountFilterForm({ count: 7, cols: 3 });
    await flush();
    document.querySelector<HTMLButtonElement>('.a9-filter-form__toggle')?.click();
    await flush();
    expect(visibleFieldCount()).toBe(7);

    count.value = 3;
    await flush();
    expect(document.querySelector('.a9-filter-form')?.getAttribute('data-layout')).toBe('single');
    expect(document.querySelector('.a9-filter-form__toggle')).toBeNull();

    count.value = 7;
    await flush();
    expect(document.querySelector('.a9-filter-form')?.getAttribute('data-layout')).toBe('collapsible-collapsed');
    expect(document.querySelector('.a9-filter-form__toggle')?.getAttribute('aria-expanded')).toBe('false');
    expect(visibleFieldCount()).toBe(3);
  });

  it('uses the active responsive column count for the two-row boundary', async () => {
    mountFilterForm({ count: 7 });
    await flush();
    expect(document.querySelector('.a9-filter-form')?.getAttribute('data-active-cols')).toBe('3');
    expect(visibleFieldCount()).toBe(3);

    setViewport(800);
    await flush();
    expect(document.querySelector('.a9-filter-form')?.getAttribute('data-active-cols')).toBe('2');
    expect(visibleFieldCount()).toBe(2);

    setViewport(500);
    await flush();
    expect(document.querySelector('.a9-filter-form')?.getAttribute('data-active-cols')).toBe('1');
    expect(visibleFieldCount()).toBe(1);
  });

  it('expands the form when a hidden field fails validation', async () => {
    const model = reactive<Record<string, unknown>>({ hiddenRequired: '' });
    const onSearch = vi.fn();
    const Host = defineComponent({
      setup() {
        return () =>
          h(
            AFilterForm,
            { model, cols: 3, onSearch },
            {
              default: () => [
                ...Array.from({ length: 6 }, (_, index) => h('div', { key: index }, `Field ${index + 1}`)),
                h(
                  FormItem,
                  {
                    key: 'hidden-required',
                    field: 'hiddenRequired',
                    rules: [{ required: true, message: 'Hidden required' }],
                  },
                  { default: () => h(Input, { modelValue: model.hiddenRequired as string }) }
                ),
              ],
            }
          );
      },
    });
    const app = createApp(Host);
    app.use(
      createI18n({
        legacy: false,
        locale: 'en-US',
        messages: {
          'en-US': {
            admin9Ui: {
              filterForm: { search: 'Search', reset: 'Reset', expand: 'Expand', collapse: 'Collapse' },
            },
          },
        },
      })
    );
    ['IconSearch', 'IconRefresh', 'IconDown', 'IconUp'].forEach((name) => app.component(name, IconStub as Component));
    mountedApps.push(app);
    app.mount('#app');
    await flush();

    expect(visibleFieldCount()).toBe(3);
    document.querySelector<HTMLButtonElement>('.a9-filter-form__search')?.click();
    await flush();

    expect(onSearch).not.toHaveBeenCalled();
    expect(document.querySelector('.a9-filter-form')?.getAttribute('data-layout')).toBe('collapsible-expanded');
    expect(visibleFieldCount()).toBe(7);
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Hidden required');
  });

  it('emits valid searches, leaves reset ownership to the host, and reflects loading', async () => {
    const model = reactive<Record<string, unknown>>({ keyword: '' });
    const loading = ref(true);
    const onSearch = vi.fn();
    const onReset = vi.fn();
    const Host = defineComponent({
      setup() {
        return () =>
          h(
            AFilterForm,
            { model, loading: loading.value, cols: 3, onSearch, onReset },
            {
              default: () =>
                h(
                  FormItem,
                  { field: 'keyword', rules: [{ required: true, message: 'Required' }] },
                  { default: () => h(Input, { modelValue: model.keyword as string }) }
                ),
            }
          );
      },
    });
    const app = createApp(Host);
    app.use(
      createI18n({
        legacy: false,
        locale: 'en-US',
        messages: {
          'en-US': {
            admin9Ui: {
              filterForm: { search: 'Search', reset: 'Reset', expand: 'Expand', collapse: 'Collapse' },
            },
          },
        },
      })
    );
    ['IconSearch', 'IconRefresh', 'IconDown', 'IconUp'].forEach((name) => app.component(name, IconStub as Component));
    mountedApps.push(app);
    app.mount('#app');
    await flush();

    const search = document.querySelector<HTMLButtonElement>('.a9-filter-form__search');
    const reset = document.querySelector<HTMLButtonElement>('.a9-filter-form__reset');
    expect(search?.classList.contains('arco-btn-loading')).toBe(true);
    loading.value = false;
    await nextTick();
    search?.click();
    await flush();
    expect(onSearch).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Required');

    reset?.click();
    await flush();
    expect(onReset).toHaveBeenCalledOnce();
    expect(model.keyword).toBe('');
    expect(document.querySelector('[role="alert"]')).toBeNull();

    model.keyword = 'contract';
    await nextTick();
    search?.click();
    await flush();
    expect(onSearch).toHaveBeenCalledWith({ keyword: 'contract' });
  });
});
