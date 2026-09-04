import type { TableColumnData, TableData } from '@arco-design/web-vue';

export interface Action<T = TableData> {
  label: string;
  onClick(record: T): void;
  permissions?: string | string[];
}

export interface Slot<T = TableData> {
  record: T;
  column: TableColumnData;
  rowIndex: number;
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

export interface ProTableRequestOptions {
  clearCurrentData?: boolean;
}
