# ACoordinatePicker

`ACoordinatePicker` 是基于腾讯地图 JavaScript API GL 的表单级坐标选择器。它支持地点搜索、地图点选和经纬度手工输入，只把坐标写入 `v-model`，不会绑定使用本组件库的应用（下称“应用”）中的地址、门店或其他业务字段。

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

`apiKey` 由应用从自己的运行时配置传入。组件不会读取固定环境变量，也不包含 Key、API URL、认证、权限、store、route 或业务字段。腾讯位置服务控制台需为 Key 配置正确的 Web 端来源白名单。

## Props

| Prop          | 类型                           | 默认值      | 说明                           |
| ------------- | ------------------------------ | ----------- | ------------------------------ |
| `modelValue`  | `CoordinateValue \| undefined` | `undefined` | 已提交坐标，纬度在前、经度在后 |
| `apiKey`      | `string`                       | 必填        | 腾讯地图 JavaScript API GL Key |
| `center`      | `CoordinateValue`              | 北京中关村  | 无已选值时的地图中心           |
| `zoom`        | `number`                       | `15`        | 初始缩放级别，限制为 3 到 20   |
| `precision`   | `number`                       | `6`         | 坐标小数位，限制为 0 到 10     |
| `height`      | `number \| string`             | `420`       | 地图高度；数字按 px 处理       |
| `placeholder` | `string`                       | locale 文案 | 外部输入框占位文本             |
| `allowClear`  | `boolean`                      | `false`     | 是否允许清空已提交坐标         |
| `disabled`    | `boolean`                      | `false`     | 禁用组件                       |
| `readonly`    | `boolean`                      | `false`     | 只读显示，不允许打开或清空     |
| `allowSearch` | `boolean`                      | `true`      | 是否显示腾讯地点搜索           |
| `size`        | `Size`                         | 继承        | 输入触发器尺寸                 |

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

- 弹窗使用草稿语义：地图点选、搜索结果和手工输入不会立即修改外部模型，点击“使用此坐标”后才提交；取消会丢弃草稿。
- 同一页面的组件实例共用腾讯地图 SDK 加载结果，避免重复插入脚本；地图实例在关闭或卸载时销毁。
- `apiKey` 是浏览器端 Key，不是服务端密钥。应用仍需按腾讯位置服务要求限制来源和额度，不要把服务端 Secret 放到前端。
- 组件不做坐标系转换；地图展示和搜索沿用腾讯地图 API 的坐标语义。跨地图服务交换坐标时由应用明确转换。

## 插槽与实例方法

`trigger` 插槽提供 `{ open, clear, value, disabled }`，用于替换默认输入框。

`defineExpose` 提供：

- `open(): void`
- `close(): void`
- `clear(): void`

## 表单与实例方法

`size?: Size` 控制输入触发器，未设置时继承 Form／Arco 配置；地图工作区由 height 控制。disabled 同时继承外层 Form，readonly 不允许打开或清空。触发输入支持 Enter／ArrowDown 打开，弹窗关闭后恢复触发器焦点。

公开 `open()`、`close()`、`clear()`、`focus()`、`blur()`，类型为 `ACoordinatePickerExposed`；Props 为 `ACoordinatePickerProps`。确认实际改变坐标时触发字段 change 校验，弹窗搜索和经纬度草稿不触发外层校验。原生输入属性透传到默认 Input，class/style 位于根节点；自定义 trigger 自行接管输入可访问名称。

外部模型替换会关闭当前草稿，避免旧草稿覆盖新值。打开期间 apiKey、allowSearch 或 zoom 变化会重新初始化地图实例；空搜索立即结束加载并使旧响应失效。SDK 在页面级共享，apiKey 用于首次由组件加载 SDK；如果宿主已加载 SDK，则沿用宿主的配置。更换已加载 SDK 的 Key 需要宿主重新载入页面，销毁地图实例不会重置 SDK 凭据。

## 输入提示与失败恢复

搜索区域仅在搜索完成且无结果时显示“暂无匹配地点”，初始状态和仅输入关键词时不显示额外说明。地图可用时，搜索失败保留关键词与已选坐标，提供“重新搜索”，也可直接在地图选点。没有可用地图时提示手动输入经纬度，不在用户界面要求配置 Key；SDK 与搜索失败的原始原因通过 `map-error` / `search-error` 交给应用诊断；缺少 Key 的配置要求见上方 Props 与基础示例。配置修复与额度、来源白名单检查由应用负责。

纬度范围是 -90 至 90，经度范围是 -180 至 180。经纬度均未填写或有效时不显示额外说明，也不重复展示已填坐标。输入不完整或超范围时，界面解释无法确认的原因，保留已输入值和此前有效草稿，不静默把超范围值截成边界坐标。修正后才可确认；0 是有效值，与空输入不同。地图失败、缺少 Key 时仍可完整手动输入并提交坐标。地点的业务含义、坐标系转换与地址校验由应用负责。

仅聚焦并离开经纬度输入框不会改变选择来源，搜索结果的地点名称和地址会保留到 `confirm` 事件；实际修改坐标后才改为手动来源并清除地点元数据。
