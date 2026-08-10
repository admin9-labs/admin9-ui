# AIconPicker

`AIconPicker` 是表单级 Arco 图标选择器，提供官方分类、全局搜索、受控值、清除和键盘导航。

## 宿主要求

默认图标预览依赖宿主注册 `@arco-design/web-vue/es/icon`。组件只分发图标名和分类元数据，不打包全部 SVG。

```ts
import ArcoVueIcon from '@arco-design/web-vue/es/icon';

app.use(ArcoVueIcon);
```

不希望全量注册时，可使用 `icon` 插槽按名称渲染宿主已有的图标组件。

## Props

| Prop          | 类型                             | 默认值      | 说明                                            |
| ------------- | -------------------------------- | ----------- | ----------------------------------------------- |
| `modelValue`  | `string \| undefined`            | `''`        | 接受 kebab 或 PascalCase，选择后输出 kebab 名称 |
| `allowClear`  | `boolean`                        | `false`     | 是否显示清除按钮                                |
| `placeholder` | `string`                         | locale 文案 | 空值提示                                        |
| `size`        | `'small' \| 'medium' \| 'large'` | `'medium'`  | 输入框尺寸                                      |
| `disabled`    | `boolean`                        | `false`     | 原生禁用，不可聚焦、打开、选择或清除            |
| `readonly`    | `boolean`                        | `false`     | 值可聚焦查看，但不可打开、选择或清除            |

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
