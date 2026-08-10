# AMediaPicker

`AMediaPicker` 是表单级轻量素材选择器。它在弹窗中按单一素材类型浏览、搜索、分页和选择素材，并可按需启用上传；删除和其他管理操作不属于 Picker。

## 适用边界

适用于表单中选择图片、视频或音频，以及需要复用宿主后端素材列表和上传能力的场景。

不适用于完整素材管理页、分组增删改、批量移动、多级目录、标签、版权、审核、转码或业务权限管理。这些需求应使用 [`AMediaLibrary`](./media-library.md) 或由消费应用实现。

## 基础示例

```vue
<script setup lang="ts">
  import { ref } from 'vue';
  import { AMediaPicker } from '@admin9-labs/admin9-ui';
  import type { MediaItem, MediaPickerService } from '@admin9-labs/admin9-ui';

  const cover = ref<MediaItem>();
  const mediaService: MediaPickerService = createMediaServiceAdapter();
</script>

<template>
  <a-media-picker
    v-model="cover"
    media-type="image"
    :service="mediaService"
    :can-upload="true"
    @upload-success="onUploadSuccess"
    @upload-error="onUploadError"
  />
</template>
```

也可以通过 `app.use(Admin9UI, { mediaService })` 注入默认 service；使用点的 `service` prop 优先。

## Props

| Prop           | 类型                                                          | 默认值              | 说明                                                     |
| -------------- | ------------------------------------------------------------- | ------------------- | -------------------------------------------------------- |
| `modelValue`   | `MediaItem[] \| MediaItem \| string[] \| string \| undefined` | `undefined`         | 选择结果；具体形态只由 `valueType` 和 `multiple` 决定    |
| `valueType`    | `'item' \| 'url'`                                             | `'item'`            | 明确写回完整素材项或 URL，不按当前值的运行时形态猜测     |
| `mediaType`    | `'image' \| 'video' \| 'audio'`                               | `'image'`           | 单实例只处理一种素材类型                                 |
| `multiple`     | `boolean`                                                     | `false`             | 是否多选                                                 |
| `limit`        | `number`                                                      | `0`                 | 多选上限；`0` 表示不限                                   |
| `pageSize`     | `number`                                                      | `24`                | 请求页容量；运行时变化会回到第 1 页并重新请求            |
| `buttonText`   | `string`                                                      | `''`                | 外部触发按钮文案；空值使用 locale 文案                   |
| `accept`       | `string`                                                      | 按 `mediaType` 推导 | 上传文件选择器的 MIME 过滤提示                           |
| `canUpload`    | `boolean`                                                     | `false`             | 是否显示弹窗内上传入口；开启时 service 必须实现 `upload` |
| `service`      | `MediaPickerService`                                          | 插件注入值          | 最小只要求浏览能力；两处都缺失时组件抛出明确错误         |
| `showFileList` | `boolean`                                                     | `true`              | 是否在触发器旁展示已确认文件列表                         |

## Events

| 事件                | 参数                                                          | 时机                                       |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------ |
| `update:modelValue` | `MediaItem[] \| MediaItem \| string[] \| string \| undefined` | 确认选择或移除外部已选项                   |
| `change`            | `MediaItem[]`                                                 | 选择确认或移除外部已选项                   |
| `selection-change`  | `MediaItem[]`                                                 | 弹窗草稿选择变化；单选和多选均不等同于确认 |
| `select`            | `MediaItem[]`                                                 | `selection-change` 的弃用兼容别名          |
| `visible-change`    | `boolean`                                                     | 选择弹窗打开或关闭                         |
| `upload-success`    | `MediaItem`                                                   | service 上传成功                           |
| `upload-error`      | `unknown`                                                     | service 上传失败                           |

## Slots

| 插槽            | 参数 | 说明                       |
| --------------- | ---- | -------------------------- |
| `trigger`       | 无   | 替换打开选择器的外部触发器 |
| `upload-button` | 无   | `trigger` 的弃用兼容别名   |

## defineExpose

当前不暴露实例方法。打开弹窗由组件自带触发器负责，不应依赖未公开的内部状态或方法。

## Service 契约

Picker 依赖 `MediaPickerService`，默认只要求 `MediaBrowseService`：

| 方法                     | Picker 用途                                                               |
| ------------------------ | ------------------------------------------------------------------------- |
| `list(params)`           | 按 `mediaType`、`groupId`、`keyword`、`page`、`pageSize` 获取后端分页结果 |
| `listGroups?(mediaType)` | 获取单级分组；未实现时隐藏分组导航                                        |
| `upload?(options)`       | 仅 `canUpload=true` 时必需；返回带稳定 `id` 的 `MediaItem`                |

完整类型定义见 [DESIGN 的 Service 契约](../../DESIGN.md#4-service-契约)。adapter 必须完成真实 API URL、认证、响应转换和后端筛选；组件不会对已分页结果再次做前端过滤。

`groupId: undefined` 表示“全部”，`groupId: null` 表示“未分组”。在“全部”或“未分组”视图上传时，组件传递 `groupId: null`。

## 状态与错误

- 分组或关键词变化会回到第 1 页；每次打开弹窗都会从“全部”重新加载。
- 单选和多选都先产生弹窗草稿，只有点击确认才更新 `v-model`；取消后再次打开会从已确认值恢复。
- `valueType="url"` 的临时 URL 项会在列表返回后按 URL 对齐真实素材 ID；真实 ID 不会因为 URL 相同而被其他项替换。
- 暂存结果可跨页、跨分组保留；`mediaType` 或 service 变化会重建当前视图并从受控值恢复。
- 点击素材执行选择；图片只有点击独立预览按钮才打开预览。`pending`、`failed`、URL 为空或类型不匹配的记录保持可见，但不可预览、播放或选择。
- 列表失败会保留可见错误和重试入口，不伪装为空态；较旧的列表、分组或上传完成不会刷新新的 service/类型视图。
- 上传成功会同步刷新列表和分组计数；上传、列表和分组失败会显示 locale 错误反馈。

## 权限与安全

- `canUpload` 只是界面能力开关，后端必须独立执行身份认证、资源归属和操作授权。
- `accept` 只影响文件选择提示。adapter 或后端必须校验真实 MIME、扩展名、大小和内容，并负责恶意文件处理。
- 素材 URL、缩略图和文件名来自 adapter；消费方应只返回可信或经过治理的资源地址，并配置适当的 CSP、跨域和下载策略。
