/* eslint-disable vue/one-component-per-file */
import {
  Comment,
  Fragment,
  Text,
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
  type App,
  type Component,
  type VNode,
} from 'vue';
import { FormItem, Input, type ResponsiveValue } from '@arco-design/web-vue';
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
  cols?: number | ResponsiveValue;
  fieldFlex?: Record<string, number>;
  nodes?: () => VNode[];
  loading?: boolean;
}

const mountFilterForm = (options: MountOptions = {}) => {
  const count = ref(options.count ?? 3);
  const cols = ref(options.cols);
  const fieldFlex = ref(options.fieldFlex);
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
            ...(cols.value === undefined ? {} : { cols: cols.value }),
            fieldFlex: fieldFlex.value,
            loading: options.loading,
            onSearch,
            onReset,
          },
          {
            default: () =>
              h(
                Fragment,
                null,
                options.nodes?.() ??
                  Array.from({ length: count.value }, (_, index) =>
                    h(
                      FormItem,
                      { key: index, field: `field-${index + 1}`, label: `Field ${index + 1}` },
                      { default: () => h(Input, { 'data-testid': `field-${index + 1}` }) }
                    )
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
  return { count, cols, fieldFlex, model, onSearch, onReset };
};

const visibleFieldCount = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.a9-filter-form__field')).filter((field) => field.style.display !== 'none')
    .length;

// happy-dom has no layout engine; resolve the emitted basis at a known container width.
// Browser acceptance separately checks actual wrapping and geometry.
const fieldWidths = (containerWidth = 1008) =>
  Array.from(document.querySelectorAll<HTMLElement>('.a9-filter-form__field')).map((field) => {
    const match = field.style.flexBasis.match(/^calc\(([\d.]+)% - ([\d.]+)px\)$/);
    expect(match).not.toBeNull();
    return (Number(match?.[1]) * containerWidth) / 100 - Number(match?.[2]);
  });

const expectWidths = (expected: number[]) => {
  const actual = fieldWidths();
  expect(actual).toHaveLength(expected.length);
  expected.forEach((width, index) => expect(actual[index]).toBeCloseTo(width));
};

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

  it('left-aligns field labels', async () => {
    mountFilterForm({ count: 1 });
    await flush();

    const label = document.querySelector<HTMLElement>('.arco-form-item-label-col');
    expect(label?.classList.contains('arco-form-item-label-col-left')).toBe(true);
    expect(label?.style.flex).toBe('0 0 auto');
    expect(document.querySelector('.arco-form-auto-label-width')).toBeNull();
    expect(document.querySelector<HTMLElement>('.arco-form-item-wrapper-col')?.style.flex).toBe('1 1 0%');
  });

  it('shares label widths on mobile and restores natural widths above the mobile breakpoint', async () => {
    setViewport(390);
    mountFilterForm({ count: 2 });
    await flush();
    const form = document.querySelector('.a9-filter-form');
    const input = form?.querySelector('input');
    expect(form?.classList.contains('arco-form-auto-label-width')).toBe(true);

    setViewport(768);
    await flush();
    expect(form?.classList.contains('arco-form-auto-label-width')).toBe(false);
    expect(form?.querySelector<HTMLElement>('.arco-form-item-label-col')?.style.flex).toBe('0 0 auto');

    setViewport(767);
    await flush();
    expect(form?.classList.contains('arco-form-auto-label-width')).toBe(true);
    expect(form?.querySelector('input')).toBe(input);
  });

  it.each([2, 3, 4])('preserves equal columns and empty positions for %i unweighted fields', async (count) => {
    mountFilterForm({ count, cols: 3 });
    await flush();
    expectWidths(Array.from({ length: count }, () => 320));
  });

  it.each([
    [2, 2, { 'field-1': 2 }, [656, 328]],
    [3, 3, { 'field-1': 3, 'field-2': 4, 'field-3': 5 }, [240, 320, 400]],
    [2, 2, { 'field-1': 0.5, 'field-2': 0.25 }, [656, 328]],
    [2, 3, { 'field-1': 2 }, [480, 240]],
    [5, 3, { 'field-1': 3, 'field-2': 4, 'field-3': 5, 'field-4': 2 }, [240, 320, 400, 480, 240]],
  ])('distributes %i fields across %i columns by row weight', async (count, cols, fieldFlex, widths) => {
    mountFilterForm({ count, cols, fieldFlex });
    await flush();
    expectWidths(widths);
  });

  it.each([0, -1, NaN, Infinity, -Infinity, '2'])('defaults invalid weight %s to one', async (weight) => {
    mountFilterForm({ count: 2, cols: 2, fieldFlex: { 'field-1': weight as number, 'absent': 9 } });
    await flush();
    expectWidths([492, 492]);
  });

  it('matches exact top-level field names, ignores wrappers, and reacts to conditional slots', async () => {
    const showFirst = ref(true);
    mountFilterForm({
      cols: 3,
      fieldFlex: { 'query.title': 2, 'title': 9, 'nested': 9 },
      nodes: () => [
        h(Text, null, '  '),
        showFirst.value ? h(FormItem, { key: 'title', field: 'query.title', label: 'Title' }) : h(Comment),
        h(Fragment, null, [h('div', { key: 'wrapper' }, [h(FormItem, { field: 'nested' })])]),
        h(FormItem, { key: 'unnamed', label: 'Unnamed' }),
      ],
    });
    await flush();
    expectWidths([480, 240, 240]);
    showFirst.value = false;
    await flush();
    expectWidths([320, 320]);
    expect(document.querySelector('.a9-filter-form')?.getAttribute('data-field-count')).toBe('2');
  });

  it('keeps controls mounted through weight changes, responsive regrouping, and collapse', async () => {
    const { fieldFlex, cols } = mountFilterForm({ count: 7, fieldFlex: { 'field-1': 2 } });
    await flush();
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('.a9-filter-form input'));
    const first = inputs[0];
    first.value = 'kept while regrouping';
    first.dispatchEvent(new Event('input', { bubbles: true }));
    first.focus();
    await flush();

    fieldFlex.value = { 'field-1': 3 };
    await flush();
    expect(fieldWidths()[0]).toBeCloseTo(576);
    setViewport(800);
    await flush();
    expect(fieldWidths()[0]).toBeCloseTo(738);
    expect(document.activeElement).toBe(first);
    setViewport(390);
    await flush();
    expectWidths(Array.from({ length: 7 }, () => 1008));
    cols.value = 2;
    await flush();
    expect(visibleFieldCount()).toBe(2);
    document.querySelector<HTMLButtonElement>('.a9-filter-form__toggle')?.click();
    await flush();
    expect(visibleFieldCount()).toBe(7);
    document.querySelector<HTMLButtonElement>('.a9-filter-form__toggle')?.click();
    await flush();
    expect(visibleFieldCount()).toBe(2);
    const currentInputs = Array.from(document.querySelectorAll('.a9-filter-form input'));
    inputs.forEach((input, index) => expect(currentInputs[index]).toBe(input));
    expect(first.value).toBe('kept while regrouping');
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
