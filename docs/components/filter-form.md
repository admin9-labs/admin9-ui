# AFilterForm

`AFilterForm` 是面向列表页的后端无关筛选表单。它根据当前响应式列数和顶层筛选项数量自动形成单行、多行或可折叠布局，不管理请求、分页和业务默认值。

## 基础示例

```vue
<script setup lang="ts">
  import { reactive } from 'vue';
  import { AFilterForm } from '@admin9-labs/admin9-ui';
  import { queryOrders } from './api';

  const initialFilters = () => ({ keyword: '', status: undefined, owner: undefined });
  const filters = reactive(initialFilters());

  const search = (values: Record<string, unknown>) => queryOrders({ page: 1, ...values });
  const reset = () => {
    Object.assign(filters, initialFilters());
    search(filters);
  };
</script>

<template>
  <AFilterForm :model="filters" @search="search" @reset="reset">
    <a-form-item field="keyword" label="关键词">
      <a-input v-model="filters.keyword" allow-clear />
    </a-form-item>
    <a-form-item field="status" label="状态">
      <a-select v-model="filters.status" allow-clear />
    </a-form-item>
    <a-form-item field="owner" label="负责人">
      <a-select v-model="filters.owner" allow-clear />
    </a-form-item>
  </AFilterForm>
</template>
```

组件默认提供 Arco 主题背景、内边距和 `4px` 圆角，可像 `a-card` 一样直接放入列表页，但不包含标题、分隔线、边框或阴影。应用将 `search`、`reset` 与自己的分页和数据请求衔接。

## 自动布局

每个默认插槽中的顶层有效节点占一列。空白文本、注释和 Fragment 包装不计数，因此 `v-if` 与 `v-for` 可以动态改变筛选项数量。

| 字段数量                       | 布局行为                   |
| ------------------------------ | -------------------------- |
| `<= 当前 cols`                 | 单行，操作按钮横向排列     |
| `> 当前 cols` 且 `<= cols × 2` | 多行，操作按钮纵向排列     |
| `> 当前 cols × 2`              | 默认收起为一行，可展开全部 |

查询、重置和展开/收起按钮位于独立操作区，不占用字段列。小屏下操作区移到筛选项下方并允许横向换行。

## Props

| Prop      | 类型                        | 默认值                                          | 说明                          |
| --------- | --------------------------- | ----------------------------------------------- | ----------------------------- |
| `model`   | `object`                    | 必填                                            | 传给内部 Arco Form 的筛选模型 |
| `cols`    | `number \| ResponsiveValue` | `{ xs: 1, sm: 1, md: 2, lg: 3, xl: 3, xxl: 3 }` | 每行字段列数                  |
| `loading` | `boolean`                   | `false`                                         | 查询按钮加载状态              |

数字 `cols` 在所有断点保持固定；响应式对象沿用 Arco Grid 的 `xs/sm/md/lg/xl/xxl` 规则。列数必须是正整数。

## Events

| 事件     | 参数                      | 时机                                                   |
| -------- | ------------------------- | ------------------------------------------------------ |
| `search` | `Record<string, unknown>` | 点击查询或按 Enter，且 Arco Form 校验成功              |
| `reset`  | 无                        | 点击重置；组件清除校验状态，但不修改模型或自动发起查询 |

筛选项的业务默认值和重置后的查询时机由列表页决定。组件不会调用 `resetFields`。折叠状态由组件内部管理：字段超过两行时提供展开与收起，提交校验失败时自动展开，确保错误字段可见。

## 插槽

默认插槽只放筛选字段。建议直接放置 `a-form-item`；每个顶层节点按一列计算，字段内容仍可使用任意 Arco 表单控件。
