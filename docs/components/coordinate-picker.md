# ACoordinatePicker

`ACoordinatePicker` 是基于腾讯地图 JavaScript API GL 的表单级坐标选择器。它支持地点搜索、地图点选和经纬度手工输入，只把坐标写入 `v-model`，不会绑定消费应用的地址、门店或其他业务字段。

## 基础示例

```vue
<script setup lang="ts">
  import { ref } from 'vue';
  import { ACoordinatePicker } from '@admin9-labs/admin9-ui';
  import type { CoordinateSelection, CoordinateValue } from '@admin9-labs/admin9-ui';

  const coordinate = ref<CoordinateValue>();
  const handleConfirm = (selection: CoordinateSelection) => {
    console.log(selection.title, selection.address);
  };
</script>

<template>
  <ACoordinatePicker
    v-model="coordinate"
    :api-key="tencentMapApiKey"
    :center="{ latitude: 27.8945, longitude: 102.2644 }"
    allow-clear
    @confirm="handleConfirm"
  />
</template>
```

`apiKey` 必须由消费应用从自己的运行时配置传入。组件不会读取固定环境变量，也不包含 Key、API URL、认证、权限、store、route 或业务字段。腾讯位置服务控制台需为 Key 配置正确的 Web 端来源白名单。

## Props

| Prop            | 类型                           | 默认值      | 说明                           |
| --------------- | ------------------------------ | ----------- | ------------------------------ |
| `modelValue`    | `CoordinateValue \| undefined` | `undefined` | 已提交坐标，纬度在前、经度在后 |
| `apiKey`        | `string`                       | 必填        | 腾讯地图 JavaScript API GL Key |
| `center`        | `CoordinateValue`              | 北京中关村  | 无已选值时的地图中心           |
| `zoom`          | `number`                       | `15`        | 初始缩放级别，限制为 3 到 20   |
| `precision`     | `number`                       | `6`         | 坐标小数位，限制为 0 到 10     |
| `height`        | `number \| string`             | `420`       | 地图高度；数字按 px 处理       |
| `placeholder`   | `string`                       | locale 文案 | 外部输入框占位文本             |
| `allowClear`    | `boolean`                      | `false`     | 是否允许清空已提交坐标         |
| `disabled`      | `boolean`                      | `false`     | 禁用组件                       |
| `readonly`      | `boolean`                      | `false`     | 只读显示，不允许打开或清空     |
| `searchEnabled` | `boolean`                      | `true`      | 是否显示腾讯地点搜索           |

## Events

| 事件                | 参数                           | 时机                                                |
| ------------------- | ------------------------------ | --------------------------------------------------- |
| `update:modelValue` | `CoordinateValue \| undefined` | 确认新坐标或清空时                                  |
| `change`            | `CoordinateValue \| undefined` | 已提交坐标真实变化时                                |
| `confirm`           | `CoordinateSelection`          | 每次确认有效草稿时，额外包含 `source/title/address` |
| `clear`             | 无                             | 清空已有坐标时                                      |
| `visible-change`    | `boolean`                      | 弹窗打开或关闭时                                    |
| `map-error`         | `unknown`                      | 地图 SDK 加载或初始化失败时                         |
| `search-error`      | `unknown`                      | 地点搜索失败时                                      |

地点搜索只在 `confirm` 事件中回传标题和地址，`v-model` 始终保持 `{ latitude, longitude }`。地图点选或手工输入没有反向地理编码，因此不会伪造地址信息。

## 交互与安全边界

- 弹窗使用草稿语义：地图点选、搜索结果和手工输入不会立即修改外部模型，点击确定后才提交；取消会丢弃草稿。
- 同一页面的组件实例复用腾讯地图 SDK 加载 Promise，避免重复插入脚本；地图实例在关闭或卸载时销毁。
- `apiKey` 是浏览器端 Key，不是服务端密钥。消费方仍需按腾讯位置服务要求限制来源和额度，不要把服务端 Secret 放到前端。
- 组件不做坐标系转换；地图展示和搜索沿用腾讯地图 API 的坐标语义。跨地图服务交换坐标时由消费应用明确转换。

## 插槽与实例方法

`trigger` 插槽提供 `{ open, clear, value, disabled }`，用于替换默认输入框。

`defineExpose` 提供：

- `open(): void`
- `close(): void`
- `clear(): void`
