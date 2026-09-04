# AProTable

`AProTable` 是后端无关的页面级表格。它通过 `fetcher` 统一拥有数据请求、失效代际、加载状态、分页和受控多选配置，可选提供标题、表格前置内容、关键词搜索、刷新、轻量工具栏布局与权限过滤的行操作列。组件不包含具体 API、复杂筛选或新增、导入、导出、批量操作等业务命令，也不接受外部 `data`、`loading`、`current`、`total` 接管。

## 基础示例

```vue
<script setup lang="ts">
  import { ref } from 'vue';
  import type { TableColumnData } from '@arco-design/web-vue';
  import { AProTable, type Action, type ProTableDataChange } from '@admin9-labs/admin9-ui';
  import { queryRows } from './api';
  import { createRecord, exportRows } from './commands';

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
  const tableLoading = ref(false);
  const requestError = ref<unknown>();
  const activeRecord = ref<TableRow>();
  const acceptedResult = ref<ProTableDataChange<TableRow>>();
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
    :pagination-options="{ showJumper: true, pageSizeOptions: [10, 20, 50] }"
    :selection-options="{ showCheckedAll: true, onlyCurrent: true }"
    title="记录列表"
    searchable
    surface
    multiple
    @error="reportError"
    @data-change="acceptedResult = $event"
    @loading-change="tableLoading = $event"
  >
    <template #toolbar-left>
      <a-button type="primary" @click="createRecord">新增</a-button>
    </template>
    <template #toolbar-right>
      <a-button @click="exportRows">导出</a-button>
    </template>
    <template #before-table>
      <a-alert v-if="acceptedResult" type="info">当前页 {{ acceptedResult.page }}，共 {{ acceptedResult.total }} 条</a-alert>
    </template>
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

内容顺序固定为标题、工具栏、`before-table`、表格、footer。`surface-title` 插槽优先于 `title` prop，两者都统一渲染为组件内的 `h2`；专用名称不会截获传给 Arco Table 的列插槽 `title`。没有对应内容时不生成标题或前置容器，空的 `before-table` 插槽也不会产生可见间距。

工具栏固定按 `toolbar-left`、搜索框、内置刷新按钮、`toolbar-right` 的顺序排列；没有任何工具内容时不渲染工具栏。搜索会回到第 1 页后请求，普通刷新保留当前页。复杂筛选继续放在组件外部，例如使用 `AFilterForm` 管理筛选条件后将其闭包注入 `fetcher`。

`surface` 默认为 `false`，适合嵌入消费方已有容器；传 `surface` 时使用 Arco 主题背景、`20px` 内边距和 `4px` 圆角呈现数据工作台，不会嵌套 `a-card`。标题、工具栏和前置内容存在时，各自与下一块保持 `12px` 间距。工具栏在窄屏自动换行，搜索框占满可用行宽；表格横向滚动仍由消费方通过 Arco `scroll` 属性控制。

`Action<T>` 包含 `label`、`onClick(record)` 和可选的 `permissions`。权限数组采用任一匹配语义；未声明权限的操作始终显示，声明权限的操作仅在 `permission` 判断函数通过时显示。未提供判断函数时，带权限要求的操作默认隐藏。

请求结果的 `total` 使当前页超出最后有效页时，组件会回退到最后有效页并自动重新请求；两次请求共享同一个 loading 周期。设置 `:pagination="false"` 时不显示分页并固定请求第一页。

`paginationOptions` 只接受 `showTotal`、`showPageSize`、`showJumper`、`simple` 和 `pageSizeOptions`；`current`、`pageSize`、`total` 与分页事件始终由组件管理。缺省时 `showTotal` 和 `showPageSize` 均为 `true`。

`selectionOptions` 只接受 `showCheckedAll` 和 `onlyCurrent`，仅在 `multiple` 开启时生效。`onlyCurrent: false` 保留跨页 keys；设为 `true` 时，翻页、修改页容量、搜索和重置页码刷新会在请求前清选，普通刷新不会预清。最终数据接受后还会将 keys 与当前页行 key 取交集；只有 keys 实际变化才同时触发 `update:selectedRowKeys` 和 `select`。

每次最新请求的最终结果被接受后触发一次 `data-change`。页码越界回退的中间结果、迟到结果、失败、失效请求和 `clearCurrentData` 的临时空数据均不会触发。

## Props

| Prop                | 类型                                                | 默认值  | 说明                                                      |
| ------------------- | --------------------------------------------------- | ------- | --------------------------------------------------------- |
| `columns`           | `TableColumnData[]`                                 | 必填    | Arco Table 列定义                                         |
| `fetcher`           | `(params) => Promise<{ list: T[]; total: number }>` | 必填    | 分页数据源                                                |
| `title`             | `string`                                            | -       | 可选标题；`surface-title` 插槽优先                        |
| `rowKey`            | `string`                                            | `'id'`  | 行唯一标识字段                                            |
| `pageSize`          | `number`                                            | `10`    | 初始分页容量                                              |
| `pagination`        | `boolean`                                           | `true`  | 传 `false` 时关闭分页并固定请求第一页                     |
| `paginationOptions` | `ProTablePaginationOptions`                         | -       | 分页展示白名单配置                                        |
| `searchable`        | `boolean`                                           | `false` | 是否显示关键词搜索                                        |
| `refreshable`       | `boolean`                                           | 见说明  | 是否显示内置刷新按钮；未传时跟随 `searchable`，可显式关闭 |
| `surface`           | `boolean`                                           | `false` | 是否启用数据工作台表面                                    |
| `showAction`        | `boolean`                                           | `false` | 是否显式追加操作列；传入操作配置或操作插槽时也会自动追加  |
| `actions`           | `Action<T>[]`                                       | `[]`    | 配置式行操作                                              |
| `permission`        | `(permission: string) => boolean`                   | -       | 单项权限判断函数                                          |
| `multiple`          | `boolean`                                           | `false` | 是否启用受控行多选                                        |
| `selectedRowKeys`   | `(string \| number)[]`                              | `[]`    | `v-model:selected-row-keys` 的当前值                      |
| `selectionOptions`  | `ProTableSelectionOptions`                          | -       | 多选展示与当前页选择行为                                  |

未声明的 Arco Table 属性会转发到内部 `a-table`。`columns`、`data`、`loading`、`pagination`、`rowKey`、`rowSelection` 和 `bordered` 由组件管理，不应通过透传属性覆盖。

## Events

| 事件                     | 参数                    | 时机                                            |
| ------------------------ | ----------------------- | ----------------------------------------------- |
| `update:selectedRowKeys` | `(string \| number)[]`  | 多选变化，或调用 `clearSelection()`             |
| `select`                 | `TableData[]`           | 多选变化；只包含当前页数据中能匹配选中 key 的行 |
| `error`                  | `unknown`               | 当前有效的 fetcher 请求失败                     |
| `loading-change`         | `boolean`               | 有效请求周期的加载状态变化                      |
| `data-change`            | `ProTableDataChange<T>` | 最新请求的最终结果被接受                        |

初始加载、搜索、刷新按钮和分页产生的请求失败会通过 `error` 通知，同时由组件消费 Promise rejection，避免未处理拒绝。旧请求的迟到结果不会覆盖较新请求的数据或加载状态。

## Slots

内部 `a-table` 会透传应用提供的普通具名插槽及其作用域参数。操作列依次渲染 `actions` prop、`actions` 插槽和兼容保留的 `action` 插槽；如果 `columns` 已包含 `slotName: 'action'` 或内部操作列标识，组件不会重复追加。

| 插槽            | 作用域                         | 说明                                       |
| --------------- | ------------------------------ | ------------------------------------------ |
| `surface-title` | -                              | 覆盖 `title` prop 的表面标题               |
| `toolbar-left`  | -                              | 新增、导入、保存、批量操作等消费方业务命令 |
| `toolbar-right` | -                              | 导出、列设置等消费方自定义工具             |
| `before-table`  | -                              | 表格前通用内容；空内容不占间距             |
| `actions`       | `Slot<T>`                      | 追加行操作，位于配置式操作之后             |
| `action`        | `Slot<T>`                      | 旧版行操作插槽，保留向后兼容               |
| `footer`        | `{ data: T[]; total: number }` | 表格下方内容                               |
| `popover`       | -                              | 全局内容，只渲染一次，不随行重复           |

`Slot<T>` 表示 Arco 操作列插槽作用域，包含 `record`、`column` 和 `rowIndex`。

## 实例方法

`defineExpose` 提供：

- `doRequest(options?: { clearCurrentData?: boolean }): Promise<void>`：按当前页码、分页容量和关键词重新请求。默认保留当前数据，仅当 `clearCurrentData` 为 `true` 时先清空当前行。
- `refresh(resetPage?: boolean): Promise<void>`：保留原 boolean 签名；传 `true` 时先回到第一页。
- `refresh(options?: { resetPage?: boolean; clearCurrentData?: boolean }): Promise<void>`：在同一次请求前应用页码重置与可选临时清空。
- `invalidate(): void`：失效当前及更早请求并立即结束 loading，保留数据、分页和选择；被失效 Promise 静默完成，之后可以正常刷新。
- `clearSelection(): void`：keys 实际变化时同时发出空的 `update:selectedRowKeys` 和 `select`，不直接接管受控 prop。

`doRequest()` 和 `refresh()` 的有效请求失败时 Promise 保持 rejected，调用方必须 `await` 并处理错误。组件内部的初始加载、搜索、刷新按钮和分页请求则通过 `error` 事件通知失败。普通新请求替代的旧 Promise 保持原有行为；只有显式 `invalidate()` 覆盖的旧成功或失败会静默完成。

## 公共类型

包根入口导出 `Action`、`Slot`、`AProTableProps`、`AProTableEmits`、`AProTableSlots`、`AProTableExposed`、`ProTableFetcher`、`ProTableFetcherParams`、`ProTableFetcherResult`、`ProTableFooterSlot`、`ProTableDataChange`、`ProTablePaginationOptions`、`ProTablePermission`、`ProTableRefreshOptions`、`ProTableRequestOptions`、`ProTableRowKey` 和 `ProTableSelectionOptions`。
