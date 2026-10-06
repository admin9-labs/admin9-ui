# AIconPicker

`AIconPicker` 是表单级 Arco 图标选择器，提供官方分类、全局搜索、受控值、清除和键盘导航。

## 接入要求

默认图标预览依赖应用注册 `@arco-design/web-vue/es/icon`。组件只分发图标名和分类元数据，不打包全部 SVG。

```ts
import ArcoVueIcon from '@arco-design/web-vue/es/icon';

app.use(ArcoVueIcon);
```

不希望全量注册时，可使用 `icon` 插槽按名称渲染应用已有的图标组件。

## 搜索与无结果恢复

搜索匹配图标的英文名称，支持 `search`、`icon-search` 和 `IconSearch` 等既有形式；输入关键词时跨分类搜索，不提供中文语义或中文别名检索。选择后仍输出原 kebab 名称，不改变存储值。

无匹配结果时提示更换英文关键词或切换分类，也可点击“清除搜索，查看全部图标”恢复全部结果并聚焦搜索框。这些浏览操作不会提交表单字段。

## Props

| Prop          | 类型                                       | 默认值      | 说明                                            |
| ------------- | ------------------------------------------ | ----------- | ----------------------------------------------- |
| `modelValue`  | `string \| undefined`                      | `''`        | 接受 kebab 或 PascalCase，选择后输出 kebab 名称 |
| `allowClear`  | `boolean`                                  | `false`     | 是否显示清除按钮                                |
| `placeholder` | `string`                                   | locale 文案 | 空值提示                                        |
| `size`        | `'mini' \| 'small' \| 'medium' \| 'large'` | 继承        | 输入框尺寸                                      |
| `disabled`    | `boolean`                                  | `false`     | 原生禁用，不可聚焦、打开、选择或清除            |
| `readonly`    | `boolean`                                  | `false`     | 值可聚焦查看，但不可打开、选择或清除            |

未声明为 prop 的 `id`、`name`、`aria-*`、`autocomplete` 和 `data-*` 会转发到真实输入；`class` 与 `style` 保留在组件根元素。

## Events

| 事件                | 参数                  | 时机           |
| ------------------- | --------------------- | -------------- |
| `update:modelValue` | `string \| undefined` | 选择或清除     |
| `change`            | `string \| undefined` | 已提交的新值   |
| `clear`             | 无                    | 用户清除当前值 |

## Slots

| 插槽   | 参数                                    | 说明                         |
| ------ | --------------------------------------- | ---------------------------- |
| `icon` | `{ iconName, componentName, selected }` | 替换触发器预览和网格图标渲染 |

## 键盘

- 输入获得焦点后，`Enter`、`Space` 或 `ArrowDown` 打开弹层并聚焦搜索。
- 搜索框按 `ArrowDown` 进入图标网格。
- 图标网格使用方向键移动，`Home`、`End` 跳到首尾，`Enter` 或 `Space` 选择。
- `Escape` 关闭弹层并把焦点还给输入。
- 清除按钮是独立焦点目标；键盘清除不会打开选择弹层。

## 表单与实例方法

size 采用 Arco `Size`（mini/small/medium/large），不设置独立默认值，依次由显式参数、Form 和底层 Input 的 ConfigProvider 决定。Form 禁用同时阻止弹层和清空；readonly 允许读取但不改变选择。

用户实际改变图标或清空后触发外层字段 change 校验；搜索和分类等草稿操作不触发该校验。同一图标的 kebab/Pascal 表示不会被视为不同选择。模型回显不发出 change。

实例提供 `focus()`、`blur()`，作用于触发输入框。导出 `AIconPickerProps`、`AIconPickerExposed`。class/style 作用于根节点，其余原生输入属性透传到 Input 的 inputAttrs。
