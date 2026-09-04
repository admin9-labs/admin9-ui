/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, nextTick, reactive, type App, type ComponentPublicInstance } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AProTable from '../src/components/pro-table/index.vue';

const mountedApps: App[] = [];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const TableStub = defineComponent({
  inheritAttrs: false,
  props: {
    columns: { type: Array, default: () => [] },
    data: { type: Array, default: () => [] },
    loading: Boolean,
    pagination: { type: [Object, Boolean], default: () => ({}) },
    rowKey: String,
    rowSelection: { type: Object, default: undefined },
  },
  emits: ['pageChange', 'pageSizeChange'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'div',
        {
          'data-testid': 'table',
          'data-column-count': String(props.columns.length),
          'data-loading': String(props.loading),
          'data-first-label': String((props.data[0] as Record<string, unknown> | undefined)?.label ?? ''),
          'data-row-key': props.rowKey,
          'data-selected-keys': JSON.stringify(
            (props.rowSelection as { selectedRowKeys?: (string | number)[] } | undefined)?.selectedRowKeys ?? []
          ),
          'data-pagination': String(props.pagination !== false),
          'data-current': String((props.pagination as { current?: number } | false).current ?? ''),
          'data-page-size': String((props.pagination as { pageSize?: number } | false).pageSize ?? ''),
          'data-total': String((props.pagination as { total?: number } | false).total ?? ''),
          'data-show-total': String((props.pagination as { showTotal?: boolean } | false).showTotal ?? ''),
          'data-show-page-size': String((props.pagination as { showPageSize?: boolean } | false).showPageSize ?? ''),
          'data-show-jumper': String((props.pagination as { showJumper?: boolean } | false).showJumper ?? ''),
          'data-simple': String((props.pagination as { simple?: boolean } | false).simple ?? ''),
          'data-page-size-options': JSON.stringify(
            (props.pagination as { pageSizeOptions?: number[] } | false).pageSizeOptions ?? []
          ),
          'data-row-selection': String(Boolean(props.rowSelection)),
          'data-show-checked-all': String(
            (props.rowSelection as { showCheckedAll?: boolean } | undefined)?.showCheckedAll ?? ''
          ),
          'data-only-current': String((props.rowSelection as { onlyCurrent?: boolean } | undefined)?.onlyCurrent ?? ''),
          'data-surface-title-slot': String(Boolean(slots['surface-title'])),
          'data-before-table-slot': String(Boolean(slots['before-table'])),
          'data-forwarded': attrs['data-contract'],
        },
        [
          h('button', { 'data-testid': 'page-change', 'onClick': () => emit('pageChange', 3) }, 'Page 3'),
          h('button', { 'data-testid': 'page-size-change', 'onClick': () => emit('pageSizeChange', 50) }, '50 per page'),
          h(
            'button',
            {
              'data-testid': 'select-row',
              'onClick': () => {
                const record = (props.data[1] ?? props.data[0]) as Record<string, unknown> | undefined;
                const key = (record?.[props.rowKey || 'id'] as string | number | undefined) ?? 2;
                (props.rowSelection as { onChange?: (keys: (string | number)[]) => void } | undefined)?.onChange?.([key]);
              },
            },
            'Select'
          ),
          props.data.length === 0 && !props.loading ? h('div', { 'data-testid': 'empty' }, 'Empty') : undefined,
          slots.title
            ? h(
                'div',
                { 'data-testid': 'column-title-slot' },
                slots.title({ record: props.data[0], rowIndex: 0, column: props.columns[0] })
              )
            : undefined,
          props.data[0] ? slots.action?.({ record: props.data[0], rowIndex: 0, column: props.columns.at(-1) }) : undefined,
        ]
      );
  },
});

const InputSearchStub = defineComponent({
  props: { modelValue: String, placeholder: String },
  emits: ['update:modelValue', 'search'],
  setup(props, { emit }) {
    return () =>
      h('div', [
        h('input', {
          'data-testid': 'table-search',
          'placeholder': props.placeholder,
          'value': props.modelValue,
          'onInput': (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
        }),
        h('button', { 'data-testid': 'submit-search', 'onClick': () => emit('search') }, 'Search'),
      ]);
  },
});

const ButtonStub = defineComponent({
  props: { loading: Boolean, shape: String },
  setup(props, { attrs, slots }) {
    return () =>
      h('button', { ...attrs, 'data-loading': String(props.loading), 'data-shape': props.shape }, [
        slots.icon?.(),
        slots.default?.(),
      ]);
  },
});

const TransparentStub = defineComponent({
  setup(_, { slots }) {
    return () => h('span', slots.default?.());
  },
});

const TooltipStub = defineComponent({
  props: { content: String },
  setup(props, { slots }) {
    return () => h('span', { 'data-tooltip': props.content }, slots.default?.());
  },
});

interface ProTableExposed extends ComponentPublicInstance {
  doRequest: (options?: { clearCurrentData?: boolean }) => Promise<void>;
  refresh: (options?: boolean | { resetPage?: boolean; clearCurrentData?: boolean }) => Promise<void>;
  invalidate: () => void;
  clearSelection: () => void;
}

async function flush() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

function mountTable(
  fetcher: (params: {
    page: number;
    pageSize: number;
    keyword?: string;
  }) => Promise<{ list: Record<string, unknown>[]; total: number }>,
  props: Record<string, unknown> = {},
  slots: Record<string, (scope: { record: Record<string, unknown> }) => unknown> = {}
) {
  let component: ProTableExposed | null = null;
  const Host = defineComponent({
    setup() {
      return () =>
        h(
          AProTable,
          {
            columns: [{ dataIndex: 'label', title: 'Label' }],
            fetcher,
            ref: (value) => {
              component = value as ProTableExposed | null;
            },
            ...props,
          },
          slots
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
          'admin9Ui.proTable.action': 'Action',
          'admin9Ui.proTable.searchPlaceholder': 'Search',
          'admin9Ui.proTable.refresh': 'Refresh',
        },
      },
    })
  );
  app.component('ATable', TableStub);
  app.component('AInputSearch', InputSearchStub);
  app.component('AButton', ButtonStub);
  app.component('ASpace', TransparentStub);
  app.component('ATooltip', TooltipStub);
  app.component('IconRefresh', TransparentStub);
  mountedApps.push(app);
  app.mount('#app');
  return {
    component: () => component,
  };
}

describe('AProTable public contract', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    mountedApps.splice(0).forEach((app) => app.unmount());
  });

  it('renders surface-title ahead of title prop without intercepting a table title slot', async () => {
    mountTable(
      vi.fn().mockResolvedValue({ list: [{ id: 1, label: 'First' }], total: 1 }),
      { title: 'Prop title', columns: [{ dataIndex: 'label', slotName: 'title' }] },
      {
        'surface-title': () => h('span', { 'data-testid': 'surface-title' }, 'Slot title'),
        'toolbar-left': () => h('button', { 'data-testid': 'toolbar-left' }, 'Create'),
        'before-table': () => h('div', { 'data-testid': 'before-table' }, 'Summary'),
        'title': () => h('span', { 'data-testid': 'table-title-slot' }, 'Column title'),
        'footer': () => h('div', { 'data-testid': 'table-footer' }, 'Footer'),
      }
    );
    await flush();

    const root = document.querySelector('.a9-pro-table');
    const heading = root?.querySelector('h2.a9-pro-table__title');
    const ordered = [
      heading,
      root?.querySelector('.a9-pro-table__toolbar'),
      root?.querySelector('.a9-pro-table__before-table'),
      root?.querySelector('[data-testid="table"]'),
      root?.querySelector('[data-testid="table-footer"]'),
    ];

    expect(root?.classList.contains('a9-pro-table--surface')).toBe(false);
    expect(heading?.textContent).toBe('Slot title');
    expect(heading?.textContent).not.toContain('Prop title');
    expect(document.querySelector('[data-testid="table-title-slot"]')?.textContent).toBe('Column title');
    const table = document.querySelector('[data-testid="table"]');
    expect(document.querySelector('[data-testid="column-title-slot"]')).not.toBeNull();
    expect(table?.getAttribute('data-surface-title-slot')).toBe('false');
    expect(table?.getAttribute('data-before-table-slot')).toBe('false');
    expect(ordered.every(Boolean)).toBe(true);
    ordered.slice(0, -1).forEach((element, index) => {
      expect(element?.compareDocumentPosition(ordered[index + 1] as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });
  });

  it('omits absent title markup and keeps an empty before-table container empty', async () => {
    mountTable(vi.fn().mockResolvedValue({ list: [], total: 0 }), {}, { 'before-table': () => undefined });
    await flush();

    const beforeTable = document.querySelector('.a9-pro-table__before-table');
    expect(document.querySelector('.a9-pro-table__title')).toBeNull();
    expect(beforeTable).not.toBeNull();
    expect(beforeTable?.matches(':empty')).toBe(true);
  });

  it('renders a title prop inside the opted-in surface', async () => {
    mountTable(vi.fn().mockResolvedValue({ list: [], total: 0 }), { title: 'Records', surface: true });
    await flush();

    const root = document.querySelector('.a9-pro-table--surface');
    expect(root?.querySelector('h2.a9-pro-table__title')?.textContent).toBe('Records');
  });

  it('does not render an empty toolbar or surface styling by default', async () => {
    mountTable(vi.fn().mockResolvedValue({ list: [], total: 0 }));
    await flush();

    expect(document.querySelector('.a9-pro-table__toolbar')).toBeNull();
    expect(document.querySelector('.a9-pro-table__title')).toBeNull();
    expect(document.querySelector('.a9-pro-table__before-table')).toBeNull();
    expect(document.querySelector('.a9-pro-table')?.classList.contains('a9-pro-table--surface')).toBe(false);
  });

  it('renders toolbar-left, search, refresh, and toolbar-right in public order on a surface', async () => {
    mountTable(
      vi.fn().mockResolvedValue({ list: [], total: 0 }),
      { searchable: true, surface: true },
      {
        'toolbar-left': () => h('button', { 'data-testid': 'toolbar-left' }, 'Create'),
        'toolbar-right': () => h('button', { 'data-testid': 'toolbar-right' }, 'Export'),
      }
    );
    await flush();

    const root = document.querySelector('.a9-pro-table');
    const toolbar = root?.querySelector('.a9-pro-table__toolbar');
    const ordered = [
      toolbar?.querySelector('[data-testid="toolbar-left"]'),
      toolbar?.querySelector('[data-testid="table-search"]'),
      toolbar?.querySelector('.a9-pro-table__refresh'),
      toolbar?.querySelector('[data-testid="toolbar-right"]'),
    ];

    expect(root?.classList.contains('a9-pro-table--surface')).toBe(true);
    expect(ordered.every(Boolean)).toBe(true);
    ordered.slice(0, -1).forEach((element, index) => {
      expect(element?.compareDocumentPosition(ordered[index + 1] as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(toolbar?.querySelector('.a9-pro-table__refresh')?.getAttribute('aria-label')).toBe('Refresh');
    expect(toolbar?.querySelector('[data-tooltip="Refresh"]')).not.toBeNull();
    expect(toolbar?.querySelector('.a9-pro-table__refresh')?.getAttribute('data-shape')).toBe('circle');
  });

  it('supports a loading refresh button without search and keeps the current page', async () => {
    const refreshRequest = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ list: [{ id: 1 }], total: 100 })
      .mockResolvedValueOnce({ list: [{ id: 3 }], total: 100 })
      .mockReturnValueOnce(refreshRequest.promise);
    mountTable(fetcher, { refreshable: true });
    await flush();

    expect(document.querySelector('[data-testid="table-search"]')).toBeNull();
    document.querySelector<HTMLButtonElement>('[data-testid="page-change"]')?.click();
    await flush();
    const refreshButton = document.querySelector<HTMLButtonElement>('.a9-pro-table__refresh');
    refreshButton?.click();
    await nextTick();

    expect(fetcher).toHaveBeenLastCalledWith({ page: 3, pageSize: 10, keyword: undefined });
    expect(refreshButton?.getAttribute('data-loading')).toBe('true');

    refreshRequest.resolve({ list: [{ id: 4 }], total: 100 });
    await flush();
    expect(refreshButton?.getAttribute('data-loading')).toBe('false');
  });

  it('keeps searchable refresh compatibility and allows refreshable=false to disable it', async () => {
    mountTable(vi.fn().mockResolvedValue({ list: [], total: 0 }), { searchable: true, refreshable: false });
    await flush();

    expect(document.querySelector('[data-testid="table-search"]')).not.toBeNull();
    expect(document.querySelector('.a9-pro-table__refresh')).toBeNull();
  });

  it('passes fetch inputs, table attrs, action columns, and scoped slots without backend assumptions', async () => {
    const request = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const fetcher = vi.fn().mockReturnValue(request.promise);
    const onLoadingChange = vi.fn();
    mountTable(
      fetcher,
      {
        'rowKey': 'key',
        'pageSize': 25,
        'showAction': true,
        'data-contract': 'forwarded',
        onLoadingChange,
      },
      { action: ({ record }) => h('span', { 'data-testid': 'row-action' }, `Open ${record.label}`) }
    );

    await flush();
    const table = document.querySelector('[data-testid="table"]');
    expect(fetcher).toHaveBeenCalledWith({ page: 1, pageSize: 25, keyword: undefined });
    expect(table?.getAttribute('data-loading')).toBe('true');
    expect(table?.getAttribute('data-row-key')).toBe('key');
    expect(table?.getAttribute('data-column-count')).toBe('2');
    expect(table?.getAttribute('data-forwarded')).toBe('forwarded');
    expect(onLoadingChange).toHaveBeenCalledWith(true);

    request.resolve({ list: [{ key: 1, label: 'First' }], total: 1 });
    await flush();

    expect(table?.getAttribute('data-loading')).toBe('false');
    expect(document.querySelector('[data-testid="row-action"]')?.textContent).toBe('Open First');
    expect(onLoadingChange.mock.calls.map(([loading]) => loading)).toEqual([true, false]);
  });

  it('disables table pagination and ignores pagination events when pagination is false', async () => {
    const fetcher = vi.fn().mockResolvedValue({ list: [{ id: 1, label: 'First' }], total: 40 });
    const onDataChange = vi.fn();
    const mounted = mountTable(fetcher, {
      pagination: false,
      paginationOptions: { showTotal: false, showJumper: true, current: 99 },
      pageSize: 25,
      onDataChange,
    });
    await flush();

    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-pagination')).toBe('false');
    expect(fetcher).toHaveBeenCalledWith({ page: 1, pageSize: 25, keyword: undefined });
    expect(onDataChange).toHaveBeenCalledWith({
      list: [{ id: 1, label: 'First' }],
      total: 40,
      page: 1,
      pageSize: 25,
    });

    document.querySelector<HTMLButtonElement>('[data-testid="page-change"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-testid="page-size-change"]')?.click();
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);

    await mounted.component()?.refresh(true);
    expect(fetcher).toHaveBeenLastCalledWith({ page: 1, pageSize: 25, keyword: undefined });
  });

  it('keeps pagination display defaults and whitelists paginationOptions', async () => {
    mountTable(vi.fn().mockResolvedValue({ list: [], total: 42 }), {
      pageSize: 20,
      paginationOptions: {
        showTotal: false,
        showPageSize: false,
        showJumper: true,
        simple: true,
        pageSizeOptions: [20, 40],
        current: 99,
        pageSize: 99,
        total: 999,
      },
    });
    await flush();

    const table = document.querySelector('[data-testid="table"]');
    expect(table?.getAttribute('data-current')).toBe('1');
    expect(table?.getAttribute('data-page-size')).toBe('20');
    expect(table?.getAttribute('data-total')).toBe('42');
    expect(table?.getAttribute('data-show-total')).toBe('false');
    expect(table?.getAttribute('data-show-page-size')).toBe('false');
    expect(table?.getAttribute('data-show-jumper')).toBe('true');
    expect(table?.getAttribute('data-simple')).toBe('true');
    expect(table?.getAttribute('data-page-size-options')).toBe('[20,40]');
  });

  it('uses the existing pagination display defaults when paginationOptions is absent', async () => {
    mountTable(vi.fn().mockResolvedValue({ list: [], total: 0 }));
    await flush();

    const table = document.querySelector('[data-testid="table"]');
    expect(table?.getAttribute('data-show-total')).toBe('true');
    expect(table?.getAttribute('data-show-page-size')).toBe('true');
    expect(table?.getAttribute('data-show-jumper')).toBe('');
    expect(table?.getAttribute('data-simple')).toBe('');
    expect(table?.getAttribute('data-page-size-options')).toBe('[]');
  });

  it('keeps the current page on refresh by default and resets it when requested', async () => {
    const fetcher = vi.fn().mockResolvedValue({ list: [{ id: 1, label: 'First' }], total: 100 });
    const mounted = mountTable(fetcher, { pageSize: 20 });
    await flush();

    document.querySelector<HTMLButtonElement>('[data-testid="page-change"]')?.click();
    await flush();
    await mounted.component()?.refresh();
    expect(fetcher).toHaveBeenLastCalledWith({ page: 3, pageSize: 20, keyword: undefined });

    await mounted.component()?.refresh(true);
    expect(fetcher).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, keyword: undefined });
  });

  it('falls back to the last valid page without dropping loading state', async () => {
    const onLoadingChange = vi.fn();
    const onDataChange = vi.fn();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ list: [{ id: 1, label: 'Page 1' }], total: 30 })
      .mockResolvedValueOnce({ list: [], total: 15 })
      .mockResolvedValueOnce({ list: [{ id: 2, label: 'Page 2' }], total: 15 });
    mountTable(fetcher, { pageSize: 10, onLoadingChange, onDataChange });
    await flush();
    onLoadingChange.mockClear();
    onDataChange.mockClear();

    document.querySelector<HTMLButtonElement>('[data-testid="page-change"]')?.click();
    await flush();
    await flush();

    expect(fetcher.mock.calls.slice(1).map(([params]) => params.page)).toEqual([3, 2]);
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-current')).toBe('2');
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('Page 2');
    expect(onLoadingChange.mock.calls.map(([loading]) => loading)).toEqual([true, false]);
    expect(onDataChange).toHaveBeenCalledOnce();
    expect(onDataChange).toHaveBeenCalledWith({
      list: [{ id: 2, label: 'Page 2' }],
      total: 15,
      page: 2,
      pageSize: 10,
    });
  });

  it('renders permitted configured actions before actions and legacy action slots', async () => {
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    const onManage = vi.fn();
    const permission = vi.fn((name: string) => name === 'records.update' || name === 'records.manage');
    mountTable(
      vi.fn().mockResolvedValue({ list: [{ id: 1, label: 'First' }], total: 1 }),
      {
        actions: [
          { label: 'Open', onClick: onOpen },
          { label: 'Edit', permissions: 'records.update', onClick: onEdit },
          { label: 'Delete', permissions: 'records.delete', onClick: vi.fn() },
          { label: 'Manage', permissions: ['records.admin', 'records.manage'], onClick: onManage },
        ],
        permission,
      },
      {
        actions: () => h('span', { 'data-testid': 'actions-slot' }, 'Extra'),
        action: () => h('span', { 'data-testid': 'legacy-action-slot' }, 'Legacy'),
      }
    );
    await flush();

    const actionCell = document.querySelector('[data-testid="actions-slot"]')?.parentElement;
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-column-count')).toBe('2');
    expect(actionCell?.textContent).toBe('OpenEditManageExtraLegacy');
    expect(permission.mock.calls.map(([name]) => name)).toEqual([
      'records.update',
      'records.delete',
      'records.admin',
      'records.manage',
    ]);

    const actionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.a9-pro-table__action'));
    actionButtons.forEach((button) => button.click());
    expect(onOpen).toHaveBeenCalledWith({ id: 1, label: 'First' });
    expect(onEdit).toHaveBeenCalledWith({ id: 1, label: 'First' });
    expect(onManage).toHaveBeenCalledWith({ id: 1, label: 'First' });
  });

  it('renders footer and popover once outside the table', async () => {
    mountTable(
      vi.fn().mockResolvedValue({ list: [{ id: 1, label: 'First' }], total: 3 }),
      {},
      {
        footer: () => h('div', { 'data-testid': 'table-footer' }, 'Footer'),
        popover: () => h('div', { 'data-testid': 'table-popover' }, 'Popover'),
      }
    );
    await flush();

    expect(document.querySelectorAll('[data-testid="table-footer"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-testid="table-popover"]')).toHaveLength(1);
    expect(
      document.querySelector('[data-testid="table"]')?.contains(document.querySelector('[data-testid="table-footer"]'))
    ).toBe(false);
  });

  it('keeps current rows during refresh unless doRequest explicitly clears them', async () => {
    const retainedRequest = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const clearedRequest = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ list: [{ id: 1, label: 'Current' }], total: 1 })
      .mockReturnValueOnce(retainedRequest.promise)
      .mockReturnValueOnce(clearedRequest.promise);
    const onDataChange = vi.fn();
    const mounted = mountTable(fetcher, { onDataChange });
    await flush();
    expect(onDataChange).toHaveBeenCalledOnce();

    const retained = mounted.component()?.refresh();
    await nextTick();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('Current');
    retainedRequest.resolve({ list: [{ id: 2, label: 'Retained result' }], total: 1 });
    await retained;
    await flush();

    const cleared = mounted.component()?.doRequest({ clearCurrentData: true });
    await nextTick();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('');
    expect(onDataChange).toHaveBeenCalledTimes(2);
    clearedRequest.resolve({ list: [{ id: 3, label: 'Cleared result' }], total: 1 });
    await cleared;
    await flush();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('Cleared result');
    expect(onDataChange).toHaveBeenCalledTimes(3);
  });

  it('applies refresh resetPage and clearCurrentData together before one request', async () => {
    const refreshRequest = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ list: [{ id: 1, label: 'Page 1' }], total: 100 })
      .mockResolvedValueOnce({ list: [{ id: 3, label: 'Page 3' }], total: 100 })
      .mockReturnValueOnce(refreshRequest.promise);
    const onSelected = vi.fn();
    const onSelect = vi.fn();
    const mounted = mountTable(fetcher, {
      'multiple': true,
      'selectedRowKeys': [1],
      'selectionOptions': { onlyCurrent: true },
      'onUpdate:selectedRowKeys': onSelected,
      onSelect,
    });
    await flush();

    document.querySelector<HTMLButtonElement>('[data-testid="page-change"]')?.click();
    await flush();
    document.querySelector<HTMLButtonElement>('[data-testid="select-row"]')?.click();
    onSelected.mockClear();
    onSelect.mockClear();

    const refresh = mounted.component()?.refresh({ resetPage: true, clearCurrentData: true });
    await nextTick();
    expect(fetcher).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, keyword: undefined });
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('');
    expect(onSelected).toHaveBeenCalledWith([]);
    expect(onSelect).toHaveBeenCalledWith([]);

    refreshRequest.resolve({ list: [{ id: 1, label: 'Reset result' }], total: 1 });
    await refresh;
    await flush();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('Reset result');
  });

  it('emits controlled selection and fetches for search and pagination changes', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      list: [
        { key: 1, label: 'First' },
        { key: 2, label: 'Second' },
      ],
      total: 100,
    });
    const onSelected = vi.fn();
    const onSelect = vi.fn();
    mountTable(fetcher, {
      'rowKey': 'key',
      'pageSize': 20,
      'searchable': true,
      'multiple': true,
      'selectedRowKeys': [1],
      'onUpdate:selectedRowKeys': onSelected,
      onSelect,
    });
    await flush();

    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-selected-keys')).toBe('[1]');
    const search = document.querySelector<HTMLInputElement>('[data-testid="table-search"]');
    if (!search) throw new Error('Search input was not rendered');
    search.value = 'second';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector<HTMLButtonElement>('[data-testid="submit-search"]')?.click();
    await flush();
    expect(fetcher).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, keyword: 'second' });

    document.querySelector<HTMLButtonElement>('[data-testid="page-change"]')?.click();
    await flush();
    expect(fetcher).toHaveBeenLastCalledWith({ page: 3, pageSize: 20, keyword: 'second' });

    document.querySelector<HTMLButtonElement>('[data-testid="page-size-change"]')?.click();
    await flush();
    expect(fetcher).toHaveBeenLastCalledWith({ page: 1, pageSize: 50, keyword: 'second' });

    document.querySelector<HTMLButtonElement>('[data-testid="select-row"]')?.click();
    expect(onSelected).toHaveBeenCalledWith([2]);
    expect(onSelect).toHaveBeenCalledWith([{ key: 2, label: 'Second' }]);
  });

  it('ignores selectionOptions when multiple is false', async () => {
    const onSelected = vi.fn();
    mountTable(vi.fn().mockResolvedValue({ list: [{ id: 1 }], total: 10 }), {
      'selectedRowKeys': [1],
      'selectionOptions': { showCheckedAll: true, onlyCurrent: true },
      'onUpdate:selectedRowKeys': onSelected,
    });
    await flush();

    const table = document.querySelector('[data-testid="table"]');
    expect(table?.getAttribute('data-row-selection')).toBe('false');
    document.querySelector<HTMLButtonElement>('[data-testid="page-change"]')?.click();
    await flush();
    expect(onSelected).not.toHaveBeenCalled();
  });

  it('whitelists selectionOptions without allowing controlled fields to be overridden', async () => {
    mountTable(vi.fn().mockResolvedValue({ list: [{ id: 1 }], total: 1 }), {
      multiple: true,
      selectedRowKeys: [1],
      selectionOptions: {
        showCheckedAll: false,
        onlyCurrent: false,
        selectedRowKeys: ['injected'],
        onChange: vi.fn(),
      },
    });
    await flush();

    const table = document.querySelector('[data-testid="table"]');
    expect(table?.getAttribute('data-row-selection')).toBe('true');
    expect(table?.getAttribute('data-selected-keys')).toBe('[1]');
    expect(table?.getAttribute('data-show-checked-all')).toBe('false');
    expect(table?.getAttribute('data-only-current')).toBe('false');
  });

  it.each(['page', 'page-size', 'search', 'reset-refresh'])(
    'clears onlyCurrent selection before a %s request',
    async (trigger) => {
      let initialRequest = true;
      const order: string[] = [];
      const fetcher = vi.fn(async () => {
        if (!initialRequest) order.push('request');
        return { list: [{ id: 1, label: 'First' }], total: 100 };
      });
      const onSelected = vi.fn(() => order.push('selection'));
      const onSelect = vi.fn();
      const mounted = mountTable(fetcher, {
        'multiple': true,
        'searchable': true,
        'selectedRowKeys': [1],
        'selectionOptions': { onlyCurrent: true },
        'onUpdate:selectedRowKeys': onSelected,
        onSelect,
      });
      await flush();
      initialRequest = false;
      order.length = 0;
      onSelected.mockClear();
      onSelect.mockClear();

      if (trigger === 'page') document.querySelector<HTMLButtonElement>('[data-testid="page-change"]')?.click();
      if (trigger === 'page-size') document.querySelector<HTMLButtonElement>('[data-testid="page-size-change"]')?.click();
      if (trigger === 'search') document.querySelector<HTMLButtonElement>('[data-testid="submit-search"]')?.click();
      if (trigger === 'reset-refresh') await mounted.component()?.refresh(true);
      await flush();

      expect(order.slice(0, 2)).toEqual(['selection', 'request']);
      expect(onSelected).toHaveBeenCalledOnce();
      expect(onSelected).toHaveBeenCalledWith([]);
      expect(onSelect).toHaveBeenCalledOnce();
      expect(onSelect).toHaveBeenCalledWith([]);
    }
  );

  it('does not clear onlyCurrent selection before a normal refresh', async () => {
    const refreshRequest = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ list: [{ id: 1, label: 'Current' }], total: 1 })
      .mockReturnValueOnce(refreshRequest.promise);
    const onSelected = vi.fn();
    const onSelect = vi.fn();
    const mounted = mountTable(fetcher, {
      'multiple': true,
      'selectedRowKeys': [1],
      'selectionOptions': { onlyCurrent: true },
      'onUpdate:selectedRowKeys': onSelected,
      onSelect,
    });
    await flush();

    const refresh = mounted.component()?.refresh();
    await nextTick();
    expect(onSelected).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();

    refreshRequest.resolve({ list: [{ id: 1, label: 'Current' }], total: 1 });
    await refresh;
    await flush();
    expect(onSelected).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps cross-page keys when onlyCurrent is false', async () => {
    const onSelected = vi.fn();
    const onSelect = vi.fn();
    mountTable(
      vi.fn(async ({ page }) => ({ list: [{ id: page, label: `Page ${page}` }], total: 100 })),
      {
        'multiple': true,
        'selectedRowKeys': [1],
        'selectionOptions': { onlyCurrent: false },
        'onUpdate:selectedRowKeys': onSelected,
        onSelect,
      }
    );
    await flush();

    document.querySelector<HTMLButtonElement>('[data-testid="page-change"]')?.click();
    await flush();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-selected-keys')).toBe('[1]');
    expect(onSelected).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('intersects final onlyCurrent keys once and supports composite string row keys', async () => {
    const fetcher = vi.fn().mockResolvedValue({ list: [{ key: 'tenant:record:2', label: 'Second' }], total: 1 });
    const eventOrder: string[] = [];
    const onSelected = vi.fn(() => eventOrder.push('selection'));
    const onSelect = vi.fn(() => eventOrder.push('select'));
    const onDataChange = vi.fn(() => eventOrder.push('data'));
    const controlledProps = reactive<Record<string, unknown>>({
      rowKey: 'key',
      multiple: true,
      selectedRowKeys: ['tenant:record:1', 'tenant:record:2'],
      selectionOptions: { onlyCurrent: true },
      onSelect,
      onDataChange,
    });
    controlledProps['onUpdate:selectedRowKeys'] = (keys: (string | number)[]) => {
      onSelected(keys);
      controlledProps.selectedRowKeys = keys;
    };
    const mounted = mountTable(fetcher, controlledProps);
    await flush();

    expect(onSelected).toHaveBeenCalledOnce();
    expect(onSelected).toHaveBeenCalledWith(['tenant:record:2']);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith([{ key: 'tenant:record:2', label: 'Second' }]);
    expect(onDataChange).toHaveBeenCalledOnce();
    expect(eventOrder).toEqual(['selection', 'select', 'data']);

    onSelected.mockClear();
    onSelect.mockClear();
    onDataChange.mockClear();
    await mounted.component()?.refresh();
    document.querySelector<HTMLButtonElement>('[data-testid="select-row"]')?.click();
    expect(onSelected).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders an empty state and always clears loading after a failed refresh', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ list: [], total: 0 }).mockRejectedValueOnce(new Error('request_failed'));
    const onSelected = vi.fn();
    const onSelect = vi.fn();
    const onError = vi.fn();
    const onLoadingChange = vi.fn();
    const onDataChange = vi.fn();
    const mounted = mountTable(fetcher, {
      'selectedRowKeys': [1],
      'onUpdate:selectedRowKeys': onSelected,
      onSelect,
      onError,
      onLoadingChange,
      onDataChange,
    });
    await flush();
    onLoadingChange.mockClear();
    onDataChange.mockClear();

    expect(document.querySelector('[data-testid="empty"]')).not.toBeNull();
    mounted.component()?.clearSelection();
    expect(onSelected).toHaveBeenCalledWith([]);
    expect(onSelect).toHaveBeenCalledWith([]);

    const refresh = mounted.component()?.refresh();
    await nextTick();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-loading')).toBe('true');
    await expect(refresh).rejects.toThrow('request_failed');
    await flush();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-loading')).toBe('false');
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'request_failed' }));
    expect(onLoadingChange.mock.calls.map(([loading]) => loading)).toEqual([true, false]);
    expect(onDataChange).not.toHaveBeenCalled();
  });

  it('emits UI request failures without leaving rejected promises unhandled', async () => {
    const errors = [
      new Error('initial_failed'),
      new Error('search_failed'),
      new Error('page_failed'),
      new Error('page_size_failed'),
      new Error('button_failed'),
    ];
    const fetcher = vi.fn();
    errors.forEach((error) => fetcher.mockRejectedValueOnce(error));
    const onError = vi.fn();
    mountTable(fetcher, { searchable: true, onError });

    await flush();
    document.querySelector<HTMLButtonElement>('[data-testid="submit-search"]')?.click();
    await flush();
    document.querySelector<HTMLButtonElement>('[data-testid="page-change"]')?.click();
    await flush();
    document.querySelector<HTMLButtonElement>('[data-testid="page-size-change"]')?.click();
    await flush();
    document.querySelector<HTMLButtonElement>('.a9-pro-table__refresh')?.click();
    await flush();

    expect(fetcher).toHaveBeenCalledTimes(errors.length);
    expect(onError.mock.calls.map(([error]) => error)).toEqual(errors);
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-loading')).toBe('false');
  });

  it('keeps data and loading owned by the newest request', async () => {
    const first = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const second = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const onDataChange = vi.fn();
    mountTable(fetcher, { onDataChange });
    await flush();

    document.querySelector<HTMLButtonElement>('[data-testid="page-change"]')?.click();
    await flush();

    first.resolve({ list: [{ id: 1, label: 'Stale' }], total: 1 });
    await flush();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-loading')).toBe('true');
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('');

    second.resolve({ list: [{ id: 2, label: 'Current' }], total: 100 });
    await flush();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-loading')).toBe('false');
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('Current');
    expect(onDataChange).toHaveBeenCalledOnce();
    expect(onDataChange).toHaveBeenCalledWith({
      list: [{ id: 2, label: 'Current' }],
      total: 100,
      page: 3,
      pageSize: 10,
    });
  });

  it('invalidates pending success, can repeat, and accepts a later refresh generation', async () => {
    const staleRequest = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const freshRequest = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ list: [{ id: 1, label: 'Page 1' }], total: 100 })
      .mockResolvedValueOnce({ list: [{ id: 3, label: 'Page 3' }], total: 100 })
      .mockReturnValueOnce(staleRequest.promise)
      .mockReturnValueOnce(freshRequest.promise);
    const onLoadingChange = vi.fn();
    const onDataChange = vi.fn();
    const onError = vi.fn();
    const mounted = mountTable(fetcher, {
      multiple: true,
      selectedRowKeys: [3],
      onLoadingChange,
      onDataChange,
      onError,
    });
    await flush();
    document.querySelector<HTMLButtonElement>('[data-testid="page-change"]')?.click();
    await flush();
    onLoadingChange.mockClear();
    onDataChange.mockClear();

    const stale = mounted.component()?.doRequest();
    await nextTick();
    mounted.component()?.invalidate();
    mounted.component()?.invalidate();
    expect(onLoadingChange.mock.calls.map(([loading]) => loading)).toEqual([true, false]);
    await nextTick();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-loading')).toBe('false');
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('Page 3');
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-current')).toBe('3');
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-total')).toBe('100');
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-selected-keys')).toBe('[3]');

    const fresh = mounted.component()?.refresh();
    freshRequest.resolve({ list: [{ id: 2, label: 'Fresh' }], total: 100 });
    await fresh;
    await flush();
    staleRequest.resolve({ list: [{ id: 3, label: 'Stale' }], total: 1 });
    await expect(stale).resolves.toBeUndefined();
    await flush();

    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('Fresh');
    expect(onLoadingChange.mock.calls.map(([loading]) => loading)).toEqual([true, false, true, false]);
    expect(onDataChange).toHaveBeenCalledOnce();
    expect(onDataChange).toHaveBeenCalledWith({
      list: [{ id: 2, label: 'Fresh' }],
      total: 100,
      page: 3,
      pageSize: 10,
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('silently resolves an invalidated late failure without error or data-change', async () => {
    const staleRequest = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ list: [{ id: 1, label: 'Current' }], total: 1 })
      .mockReturnValueOnce(staleRequest.promise);
    const onLoadingChange = vi.fn();
    const onDataChange = vi.fn();
    const onError = vi.fn();
    const mounted = mountTable(fetcher, { onLoadingChange, onDataChange, onError });
    await flush();
    onLoadingChange.mockClear();
    onDataChange.mockClear();

    const stale = mounted.component()?.doRequest();
    await nextTick();
    mounted.component()?.invalidate();
    staleRequest.reject(new Error('invalidated_failure'));
    await expect(stale).resolves.toBeUndefined();
    await flush();

    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('Current');
    expect(onLoadingChange.mock.calls.map(([loading]) => loading)).toEqual([true, false]);
    expect(onDataChange).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps direct stale failure rejection when a normal request supersedes it', async () => {
    const staleRequest = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const freshRequest = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ list: [{ id: 1, label: 'Current' }], total: 1 })
      .mockReturnValueOnce(staleRequest.promise)
      .mockReturnValueOnce(freshRequest.promise);
    const onError = vi.fn();
    const mounted = mountTable(fetcher, { onError });
    await flush();

    const stale = mounted.component()?.doRequest();
    const fresh = mounted.component()?.refresh();
    staleRequest.reject(new Error('superseded_failure'));
    await expect(stale).rejects.toThrow('superseded_failure');
    expect(onError).not.toHaveBeenCalled();

    freshRequest.resolve({ list: [{ id: 2, label: 'Fresh' }], total: 1 });
    await fresh;
    await flush();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('Fresh');
  });

  it('does not emit errors or clear loading when a stale request fails', async () => {
    const first = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const second = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const onError = vi.fn();
    mountTable(fetcher, { onError });
    await flush();

    document.querySelector<HTMLButtonElement>('[data-testid="page-change"]')?.click();
    await flush();
    first.reject(new Error('stale_failed'));
    await flush();

    expect(onError).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-loading')).toBe('true');

    second.resolve({ list: [{ id: 2, label: 'Current' }], total: 100 });
    await flush();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-loading')).toBe('false');
  });
});
