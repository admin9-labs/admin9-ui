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

组件默认提供 Arco 主题背景、内边距和 `4px` 圆角，字段标题保持左对齐：桌面按自身内容占宽，小屏统一 label 宽度以对齐控件；label 区域与控件间隔 `12px`，可像 `a-card` 一样直接放入列表页，但不包含标题、分隔线、边框或阴影。应用将 `search`、`reset` 与自己的分页和数据请求衔接。

## 自动布局

每个默认插槽中的顶层有效节点占一个字段位置，`cols` 控制每行最多放几个字段。空白文本、注释和 Fragment 包装不计数，因此 `v-if` 与 `v-for` 可以动态改变筛选项数量。

| 字段数量                       | 布局行为                   |
| ------------------------------ | -------------------------- |
| `<= 当前 cols`                 | 单行，操作按钮横向排列     |
| `> 当前 cols` 且 `<= cols × 2` | 多行，操作按钮纵向排列     |
| `> 当前 cols × 2`              | 默认收起为一行，可展开全部 |

查询、重置和展开/收起按钮位于独立操作区，不占用字段列。小屏下操作区移到筛选项下方并允许横向换行。

## 字段宽度权重

`cols` 控制每行字段数量，`fieldFlex` 控制同行字段的宽度比例。配置按直接子项 `a-form-item` 的 `field` 匹配，不需要增加包装组件，也不需要给 `a-form-item` 添加 `flex` 属性。

```vue
<AFilterForm :model="filters" :cols="{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }" :field-flex="{ title: 2, type: 1 }">
  <a-form-item field="title" label="标题">
    <a-input v-model="filters.title" allow-clear />
  </a-form-item>
  <a-form-item field="type" label="内容类型">
    <a-select v-model="filters.type" allow-clear>
      <a-option value="article">文章</a-option>
      <a-option value="video">视频</a-option>
    </a-select>
  </a-form-item>
</AFilterForm>
```

权重针对包含 label 和控件的**完整字段区域**。扣除字段间距后，以上示例在两列时按 `2:1` 分配宽度；桌面端 label 自然占宽，控件填满字段内的剩余空间，控件左边缘随 label 长度变化。`767px` 及以下的小屏端，组件按同一表单中当前可测量的最长 label 统一宽度，让纵向排列的控件左边缘对齐；label 区域与控件仍间隔 `12px`，短 label 后会留有空白。输入或选择的内容不会改变字段宽度。

| 当前 cols | 实际字段权重     | 宽度分配                                                     |
| --------- | ---------------- | ------------------------------------------------------------ |
| `3`       | 未配置，三个字段 | `1:1:1`，保持默认等宽                                        |
| `2`       | `2、1`           | `2:1`                                                        |
| `3`       | `3、4、5`        | `3:4:5`，例如 `:field-flex="{ code: 3, title: 4, type: 5 }"` |
| `3`       | 未配置，两个字段 | `1:1:空位 1`                                                 |
| `3`       | `2、1`，两个字段 | `2:1:空位 1`                                                 |

每行独立分配宽度。最后一行缺少的位置按权重 `1` 留空，因此不保证权重不同的多行之间字段边界一致。响应式降为一列时，每个字段占满字段区域。折叠仍按字段数量和 `cols` 判断，不按权重总和判断。

权重支持正整数和正小数；未配置、无 `field`、零、负数或非有限数值均按 `1` 处理。字段名按完整字符串匹配（例如 `'query.title'`），不解析模型路径，不递归查找包装节点内部的字段；未出现的配置键不影响布局。`fieldFlex` 支持响应式更新，仅接受数值权重，不支持固定宽度、响应式权重或 `span`。

现有页面不配置 `fieldFlex` 即保持原有字段宽度分配；label 在桌面自然占宽、在小屏统一宽度，并保留固定区域间距，是新的默认行为。

## Props

| Prop        | 类型                        | 默认值                                          | 说明                                     |
| ----------- | --------------------------- | ----------------------------------------------- | ---------------------------------------- |
| `model`     | `object`                    | 必填                                            | 传给内部 Arco Form 的筛选模型            |
| `cols`      | `number \| ResponsiveValue` | `{ xs: 1, sm: 1, md: 2, lg: 3, xl: 3, xxl: 3 }` | 每行最多字段数                           |
| `fieldFlex` | `Record<string, number>`    | `{}`                                            | 按字段名设置同行宽度权重，未配置时为 `1` |
| `loading`   | `boolean`                   | `false`                                         | 查询按钮加载状态                         |
| `size`      | `Size`                      | 继承 Arco 配置                                  | 同时控制内部表单／表格与操作区控件       |
| `disabled`  | `boolean`                   | `false`                                         | 禁用表单与查询／重置操作                 |

数字 `cols` 在所有断点保持固定；响应式对象沿用 Arco Grid 的 `xs/sm/md/lg/xl/xxl` 规则。列数必须是正整数。

## Events

| 事件     | 参数                      | 时机                                                             |
| -------- | ------------------------- | ---------------------------------------------------------------- |
| `search` | `Record<string, unknown>` | 点击查询或按 Enter，且 Arco Form 校验成功                        |
| `reset`  | 无                        | 点击重置；组件恢复 FormItem 挂载时初值并清除校验；不自动发起查询 |

筛选项的业务默认值和重置后的查询时机由列表页决定。组件先调用 `resetFields`，再发出 reset；应用可在 reset 回调中应用自己的业务默认值。折叠状态由组件内部管理：字段超过两行时提供展开与收起，提交校验失败时自动展开，确保错误字段可见。

## 插槽

默认插槽只放筛选字段。建议直接放置 `a-form-item`；每个顶层节点按一个字段位置计算，字段内容仍可使用任意 Arco 表单控件。

## Form 集成

`submit`、`submit-success`、`submit-failed` 沿用 Arco Form 载荷；成功时额外发出筛选语义的 `search`，失败时展开隐藏字段。监听官方事件不会覆盖组件内部处理。

透传 Form 的 size/disabled，操作按钮同步响应。layout、labelAlign、labelColProps、wrapperColProps、autoLabelWidth 由筛选布局管理。其他未声明属性交给内部 Form。

实例提供 `validate`、`validateField`、`resetFields`、`clearValidate`、`setFields`、`scrollToField`，签名沿用 Arco Form；类型为 `AFilterFormExposed`。
