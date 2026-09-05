import type { TableData } from '@arco-design/web-vue';
import type { VNodeChild } from 'vue';

export type ProTableRowKey = string | number;
export type ProTablePermission = (permission: string) => boolean;

export interface Action<T = TableData> {
  label: string;
  onClick(record: T): void;
  permissions?: string | string[];
}

export interface Slot<T = TableData> {
  record: T;
  column: import('@arco-design/web-vue').TableColumnData;
  rowIndex: number;
}

export interface ProTableFooterSlot<T = TableData> {
  data: T[];
  total: number;
}

export interface ProTableFetcherParams {
  page: number;
  pageSize: number;
  keyword?: string;
}

export interface ProTableFetcherResult<T = TableData> {
  list: T[];
  total: number;
}

export type ProTableFetcher<T = TableData> = (params: ProTableFetcherParams) => Promise<ProTableFetcherResult<T>>;

export interface ProTableRequestOptions {
  clearCurrentData?: boolean;
}

export interface ProTableRefreshOptions {
  resetPage?: boolean;
  clearCurrentData?: boolean;
}

export interface ProTableRefreshContext {
  refresh(options?: boolean | ProTableRefreshOptions): Promise<void>;
}

export type ProTableRefreshHandler = (context: ProTableRefreshContext) => void | Promise<void>;

export interface ProTableSelectionOptions {
  showCheckedAll?: boolean;
  onlyCurrent?: boolean;
}

export interface ProTablePaginationOptions {
  showTotal?: boolean;
  showPageSize?: boolean;
  showJumper?: boolean;
  simple?: boolean;
  pageSizeOptions?: number[];
}

export interface ProTableDataChange<T = TableData> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AProTableProps<T = TableData> {
  columns: import('@arco-design/web-vue').TableColumnData[];
  rowKey?: string;
  fetcher: ProTableFetcher<T>;
  title?: string;
  pageSize?: number;
  pagination?: boolean;
  paginationOptions?: ProTablePaginationOptions;
  searchable?: boolean;
  refreshable?: boolean;
  refreshHandler?: ProTableRefreshHandler;
  surface?: boolean;
  showAction?: boolean;
  actions?: Action<T>[];
  permission?: ProTablePermission;
  multiple?: boolean;
  selectedRowKeys?: ProTableRowKey[];
  selectionOptions?: ProTableSelectionOptions;
}

export interface AProTableEmits<T = TableData> {
  (e: 'update:selectedRowKeys', keys: ProTableRowKey[]): void;
  (e: 'select', rows: T[]): void;
  (e: 'error', error: unknown): void;
  (e: 'loadingChange', loading: boolean): void;
  (e: 'dataChange', payload: ProTableDataChange<T>): void;
}

export interface AProTableSlots<T = TableData> {
  'surface-title'?(): VNodeChild;
  'toolbar-left'?(): VNodeChild;
  'toolbar-right'?(): VNodeChild;
  'before-table'?(): VNodeChild;
  actions?(scope: Slot<T>): VNodeChild;
  action?(scope: Slot<T>): VNodeChild;
  footer?(scope: ProTableFooterSlot<T>): VNodeChild;
  popover?(): VNodeChild;
}

export interface AProTableExposed {
  doRequest(options?: ProTableRequestOptions): Promise<void>;
  refresh(resetPage?: boolean): Promise<void>;
  refresh(options?: ProTableRefreshOptions): Promise<void>;
  invalidate(): void;
  clearSelection(): void;
}
