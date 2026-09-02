# AProTable

`AProTable` 是后端无关的页面级表格。它通过 `fetcher` 统一数据请求、加载状态和分页，可选提供关键词搜索、受控多选与行操作列。组件不包含具体 API、查询表单、工具栏、导出或业务行操作。

## 基础示例

```vue
<script setup lang="ts">
  import { ref } from 'vue';
  import type { TableColumnData } from '@arco-design/web-vue';
  import { AProTable } from '@admin9-labs/admin9-ui';
  import { queryRows } from './api';

  interface TableRow {
    id: number;
    name: string;
    status: string;
  }

  interface FetchRowsParams {
    page: number;
    pageSize: number;
    keyword?: string;
  }

  const selectedRowKeys = ref<(string | number)[]>([]);
  const requestError = ref<unknown>();
  const activeRecord = ref<TableRow>();
  const columns: TableColumnData[] = [
    { title: '名称', dataIndex: 'name' },
    { title: '状态', dataIndex: 'status', slotName: 'status' },
  ];

  const fetchRows = async ({ page, pageSize, keyword }: FetchRowsParams): Promise<{ list: TableRow[]; total: number }> => {
    const { list, total } = await queryRows({ page, pageSize, keyword });
    return { list, total };
  };
  const reportError = (error: unknown) => {
    requestError.value = error;
  };
  const openRecord = (record: TableRow) => {
    activeRecord.value = record;
  };
</script>

<template>
  <AProTable
    v-model:selected-row-keys="selectedRowKeys"
    :columns="columns"
    :fetcher="fetchRows"
    searchable
    multiple
    show-action
    @error="reportError"
  >
    <template #status="{ record }">
      <a-tag>{{ record.status }}</a-tag>
    </template>
    <template #action="{ record }">
      <a-button type="text" @click="openRecord(record)">查看</a-button>
    </template>
  </AProTable>
</template>
```

`fetcher` 接收 `{ page, pageSize, keyword? }`，其中页码从 `1` 开始；它必须返回 `Promise<{ list: TableData[]; total: number }>`。组件只调用该函数，不感知请求 URL、认证或响应信封。

## Props

| Prop              | 类型                                                        | 默认值  | 说明                                       |
| ----------------- | ----------------------------------------------------------- | ------- | ------------------------------------------ |
| `columns`         | `TableColumnData[]`                                         | 必填    | Arco Table 列定义                          |
| `fetcher`         | `(params) => Promise<{ list: TableData[]; total: number }>` | 必填    | 分页数据源                                 |
| `rowKey`          | `string`                                                    | `'id'`  | 行唯一标识字段                             |
| `pageSize`        | `number`                                                    | `10`    | 初始分页容量                               |
| `searchable`      | `boolean`                                                   | `false` | 是否显示关键词搜索和刷新区                 |
| `showAction`      | `boolean`                                                   | `false` | 是否在末尾追加由 `action` 插槽渲染的操作列 |
| `multiple`        | `boolean`                                                   | `false` | 是否启用受控行多选                         |
| `selectedRowKeys` | `(string \| number)[]`                                      | `[]`    | `v-model:selected-row-keys` 的当前值       |

未声明的 Arco Table 属性会转发到内部 `a-table`。`columns`、`data`、`loading`、`pagination`、`rowKey`、`rowSelection` 和 `bordered` 由组件管理，不应通过透传属性覆盖。

## Events

| 事件                     | 参数                   | 时机                                            |
| ------------------------ | ---------------------- | ----------------------------------------------- |
| `update:selectedRowKeys` | `(string \| number)[]` | 多选变化，或调用 `clearSelection()`             |
| `select`                 | `TableData[]`          | 多选变化；只包含当前页数据中能匹配选中 key 的行 |
| `error`                  | `unknown`              | 当前有效的 fetcher 请求失败                     |

初始加载、搜索、刷新按钮和分页产生的请求失败会通过 `error` 通知，同时由组件消费 Promise rejection，避免未处理拒绝。旧请求的迟到结果不会覆盖较新请求的数据或加载状态。

## Slots 与实例方法

内部 `a-table` 会透传消费方提供的具名插槽及其作用域参数。启用 `showAction` 时，`action` 插槽用于渲染自动追加的操作列；如果 `columns` 已包含 `slotName: 'action'` 或内部操作列标识，组件不会重复追加。

`defineExpose` 提供：

- `refresh(): Promise<void>`：按当前页码、分页容量和关键词重新请求；请求失败时 Promise 保持 rejected，调用方必须 `await` 并处理错误。
- `clearSelection(): void`：发出空的 `update:selectedRowKeys`，不在组件内直接修改受控值。
