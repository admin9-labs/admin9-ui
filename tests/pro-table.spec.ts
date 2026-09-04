/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, nextTick, type App, type ComponentPublicInstance } from 'vue';
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
    pagination: { type: Object, default: () => ({}) },
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
          'data-forwarded': attrs['data-contract'],
        },
        [
          h('button', { 'data-testid': 'page-change', 'onClick': () => emit('pageChange', 3) }, 'Page 3'),
          h('button', { 'data-testid': 'page-size-change', 'onClick': () => emit('pageSizeChange', 50) }, '50 per page'),
          h(
            'button',
            {
              'data-testid': 'select-row',
              'onClick': () =>
                (props.rowSelection as { onChange?: (keys: (string | number)[]) => void } | undefined)?.onChange?.([2]),
            },
            'Select'
          ),
          props.data.length === 0 && !props.loading ? h('div', { 'data-testid': 'empty' }, 'Empty') : undefined,
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
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, [slots.icon?.(), slots.default?.()]);
  },
});

const TransparentStub = defineComponent({
  setup(_, { slots }) {
    return () => h('span', slots.default?.());
  },
});

interface ProTableExposed extends ComponentPublicInstance {
  doRequest: (options?: { clearCurrentData?: boolean }) => Promise<void>;
  refresh: () => Promise<void>;
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

  it('passes fetch inputs, table attrs, action columns, and scoped slots without backend assumptions', async () => {
    const request = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const fetcher = vi.fn().mockReturnValue(request.promise);
    mountTable(
      fetcher,
      { 'rowKey': 'key', 'pageSize': 25, 'showAction': true, 'data-contract': 'forwarded' },
      { action: ({ record }) => h('span', { 'data-testid': 'row-action' }, `Open ${record.label}`) }
    );

    await flush();
    const table = document.querySelector('[data-testid="table"]');
    expect(fetcher).toHaveBeenCalledWith({ page: 1, pageSize: 25, keyword: undefined });
    expect(table?.getAttribute('data-loading')).toBe('true');
    expect(table?.getAttribute('data-row-key')).toBe('key');
    expect(table?.getAttribute('data-column-count')).toBe('2');
    expect(table?.getAttribute('data-forwarded')).toBe('forwarded');

    request.resolve({ list: [{ key: 1, label: 'First' }], total: 1 });
    await flush();

    expect(table?.getAttribute('data-loading')).toBe('false');
    expect(document.querySelector('[data-testid="row-action"]')?.textContent).toBe('Open First');
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
    const mounted = mountTable(fetcher);
    await flush();

    const retained = mounted.component()?.refresh();
    await nextTick();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('Current');
    retainedRequest.resolve({ list: [{ id: 2, label: 'Retained result' }], total: 1 });
    await retained;
    await flush();

    const cleared = mounted.component()?.doRequest({ clearCurrentData: true });
    await nextTick();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('');
    clearedRequest.resolve({ list: [{ id: 3, label: 'Cleared result' }], total: 1 });
    await cleared;
    await flush();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('Cleared result');
  });

  it('emits controlled selection and fetches for search and pagination changes', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      list: [
        { key: 1, label: 'First' },
        { key: 2, label: 'Second' },
      ],
      total: 2,
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

  it('renders an empty state and always clears loading after a failed refresh', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ list: [], total: 0 }).mockRejectedValueOnce(new Error('request_failed'));
    const onSelected = vi.fn();
    const onError = vi.fn();
    const mounted = mountTable(fetcher, { 'onUpdate:selectedRowKeys': onSelected, onError });
    await flush();

    expect(document.querySelector('[data-testid="empty"]')).not.toBeNull();
    mounted.component()?.clearSelection();
    expect(onSelected).toHaveBeenCalledWith([]);

    const refresh = mounted.component()?.refresh();
    await nextTick();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-loading')).toBe('true');
    await expect(refresh).rejects.toThrow('request_failed');
    await flush();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-loading')).toBe('false');
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'request_failed' }));
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
    const refreshButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.a9-pro-table__search > button'));
    refreshButtons[0]?.click();
    await flush();

    expect(fetcher).toHaveBeenCalledTimes(errors.length);
    expect(onError.mock.calls.map(([error]) => error)).toEqual(errors);
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-loading')).toBe('false');
  });

  it('keeps data and loading owned by the newest request', async () => {
    const first = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const second = deferred<{ list: Record<string, unknown>[]; total: number }>();
    const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    mountTable(fetcher);
    await flush();

    document.querySelector<HTMLButtonElement>('[data-testid="page-change"]')?.click();
    await flush();

    first.resolve({ list: [{ id: 1, label: 'Stale' }], total: 1 });
    await flush();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-loading')).toBe('true');
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('');

    second.resolve({ list: [{ id: 2, label: 'Current' }], total: 1 });
    await flush();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-loading')).toBe('false');
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-first-label')).toBe('Current');
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

    second.resolve({ list: [{ id: 2, label: 'Current' }], total: 1 });
    await flush();
    expect(document.querySelector('[data-testid="table"]')?.getAttribute('data-loading')).toBe('false');
  });
});
