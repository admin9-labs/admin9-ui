# AProTable

`AProTable` 是后端无关的页面级表格。它通过 `fetcher` 统一数据请求、加载状态和分页，可选提供关键词搜索、受控多选与权限过滤的行操作列。组件不包含具体 API、查询表单、工具栏或导出。

## 基础示例

```vue
<script setup lang="ts">
  import { ref } from 'vue';
  import type { TableColumnData } from '@arco-design/web-vue';
  import { AProTable, type Action } from '@admin9-labs/admin9-ui';
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
  const actions: Action<TableRow>[] = [
    { label: '查看', onClick: (record) => openRecord(record) },
    { label: '编辑', permissions: 'records.update', onClick: (record) => openRecord(record) },
  ];
  const hasPermission = (permission: string) => permission === 'records.update';
</script>

<template>
  <AProTable
    v-model:selected-row-keys="selectedRowKeys"
    :columns="columns"
    :fetcher="fetchRows"
    :actions="actions"
    :permission="hasPermission"
    searchable
    multiple
    @error="reportError"
  >
    <template #status="{ record }">
      <a-tag>{{ record.status }}</a-tag>
    </template>
    <template #actions="{ record }">
      <a-button type="text" @click="openRecord(record)">更多</a-button>
    </template>
    <template #footer="{ total }">共 {{ total }} 条</template>
    <template #popover><record-popover /></template>
  </AProTable>
</template>
```

`fetcher` 接收 `{ page, pageSize, keyword? }`，其中页码从 `1` 开始；它必须返回 `Promise<{ list: TableData[]; total: number }>`。组件只调用该函数，不感知请求 URL、认证或响应信封。

`Action<T>` 包含 `label`、`onClick(record)` 和可选的 `permissions`。权限数组采用任一匹配语义；未声明权限的操作始终显示，声明权限的操作仅在 `permission` 判断函数通过时显示。未提供判断函数时，带权限要求的操作默认隐藏。

## Props

| Prop              | 类型                                                        | 默认值  | 说明                                                       |
| ----------------- | ----------------------------------------------------------- | ------- | ---------------------------------------------------------- |
| `columns`         | `TableColumnData[]`                                         | 必填    | Arco Table 列定义                                          |
| `fetcher`         | `(params) => Promise<{ list: T[]; total: number }>`         | 必填    | 分页数据源                                                 |
| `rowKey`          | `string`                                                    | `'id'`  | 行唯一标识字段                                             |
| `pageSize`        | `number`                                                    | `10`    | 初始分页容量                                               |
| `searchable`      | `boolean`                                                   | `false` | 是否显示关键词搜索和刷新区                                 |
| `showAction`      | `boolean`                                                   | `false` | 是否显式追加操作列；传入操作配置或操作插槽时也会自动追加   |
| `actions`         | `Action<T>[]`                                               | `[]`    | 配置式行操作                                               |
| `permission`      | `(permission: string) => boolean`                           | -       | 单项权限判断函数                                           |
| `multiple`        | `boolean`                                                   | `false` | 是否启用受控行多选                                         |
| `selectedRowKeys` | `(string \| number)[]`                                      | `[]`    | `v-model:selected-row-keys` 的当前值                       |

未声明的 Arco Table 属性会转发到内部 `a-table`。`columns`、`data`、`loading`、`pagination`、`rowKey`、`rowSelection` 和 `bordered` 由组件管理，不应通过透传属性覆盖。

## Events

| 事件                     | 参数                   | 时机                                            |
| ------------------------ | ---------------------- | ----------------------------------------------- |
| `update:selectedRowKeys` | `(string \| number)[]` | 多选变化，或调用 `clearSelection()`             |
| `select`                 | `TableData[]`          | 多选变化；只包含当前页数据中能匹配选中 key 的行 |
| `error`                  | `unknown`              | 当前有效的 fetcher 请求失败                     |

初始加载、搜索、刷新按钮和分页产生的请求失败会通过 `error` 通知，同时由组件消费 Promise rejection，避免未处理拒绝。旧请求的迟到结果不会覆盖较新请求的数据或加载状态。

## Slots

内部 `a-table` 会透传应用提供的普通具名插槽及其作用域参数。操作列依次渲染 `actions` prop、`actions` 插槽和兼容保留的 `action` 插槽；如果 `columns` 已包含 `slotName: 'action'` 或内部操作列标识，组件不会重复追加。

| 插槽       | 作用域                                  | 说明                                           |
| ---------- | --------------------------------------- | ---------------------------------------------- |
| `actions`  | `Slot<T>`                               | 追加行操作，位于配置式操作之后                 |
| `action`   | `Slot<T>`                               | 旧版行操作插槽，保留向后兼容                   |
| `footer`   | `{ data: T[]; total: number }`          | 表格下方内容                                   |
| `popover`  | -                                       | 全局内容，只渲染一次，不随行重复               |

`Slot<T>` 表示 Arco 操作列插槽作用域，包含 `record`、`column` 和 `rowIndex`。

## 实例方法

`defineExpose` 提供：

- `doRequest(options?: { clearCurrentData?: boolean }): Promise<void>`：按当前页码、分页容量和关键词重新请求。默认保留当前数据，仅当 `clearCurrentData` 为 `true` 时先清空当前行。
- `refresh(): Promise<void>`：兼容方法，等价于 `doRequest()`，刷新期间不清空当前数据。
- `clearSelection(): void`：发出空的 `update:selectedRowKeys`，不在组件内直接修改受控值。

`doRequest()` 和 `refresh()` 请求失败时 Promise 保持 rejected，调用方必须 `await` 并处理错误。组件内部的初始加载、搜索、刷新按钮和分页请求则通过 `error` 事件通知失败。
