# AMediaPicker

`AMediaPicker` 是表单级轻量素材选择器。它在弹窗中按单一素材类型浏览、搜索、分页、上传和选择素材，并将结果写回 `v-model`。

## 适用边界

适用于表单中选择图片、视频或音频，以及需要复用宿主后端素材列表和上传能力的场景。

不适用于完整素材管理页、分组增删改、批量移动、多级目录、标签、版权、审核、转码或业务权限管理。这些需求应使用 [`AMediaLibrary`](./media-library.md) 或由消费应用实现。

## 基础示例

```vue
<script setup lang="ts">
  import { ref } from 'vue';
  import { AMediaPicker } from '@admin9-labs/admin9-ui';
  import type { MediaItem, MediaService } from '@admin9-labs/admin9-ui';

  const cover = ref<MediaItem>();
  const mediaService: MediaService = createMediaServiceAdapter();
</script>

<template>
  <a-media-picker
    v-model="cover"
    media-type="image"
    :service="mediaService"
    :can-delete="false"
    @upload-success="onUploadSuccess"
    @upload-error="onUploadError"
  />
</template>
```

也可以通过 `app.use(Admin9UI, { mediaService })` 注入默认 service；使用点的 `service` prop 优先。

## Props

| Prop           | 类型                                              | 默认值              | 说明                                       |
| -------------- | ------------------------------------------------- | ------------------- | ------------------------------------------ |
| `modelValue`   | `MediaItem[] \| MediaItem \| string \| undefined` | `undefined`         | 选择结果。字符串模型在单选时写回素材 URL   |
| `mediaType`    | `'image' \| 'video' \| 'audio'`                   | `'image'`           | 单实例只处理一种素材类型                   |
| `multiple`     | `boolean`                                         | `false`             | 是否多选                                   |
| `limit`        | `number`                                          | `0`                 | 多选上限；`0` 表示不限                     |
| `pageSize`     | `number`                                          | `24`                | 请求页容量                                 |
| `buttonText`   | `string`                                          | `''`                | 外部触发按钮文案；空值使用 locale 文案     |
| `accept`       | `string`                                          | 按 `mediaType` 推导 | 上传文件选择器的 MIME 过滤提示             |
| `canUpload`    | `boolean`                                         | `true`              | 是否显示弹窗内上传入口                     |
| `canDelete`    | `boolean`                                         | `false`             | 是否显示删除入口；不替代后端授权           |
| `service`      | `MediaService`                                    | 插件注入值          | 素材 adapter；两处都缺失时组件抛出明确错误 |
| `showFileList` | `boolean`                                         | `true`              | 是否在触发器旁展示已选文件列表             |

## Events

| 事件                | 参数                                              | 时机                                     |
| ------------------- | ------------------------------------------------- | ---------------------------------------- |
| `update:modelValue` | `MediaItem[] \| MediaItem \| string \| undefined` | 确认选择或移除外部已选项                 |
| `change`            | `MediaItem[]`                                     | 选择确认或移除外部已选项                 |
| `select`            | `MediaItem[]`                                     | 多选弹窗中的暂存选择变化；尚未等同于确认 |
| `upload-success`    | `MediaItem`                                       | service 上传成功                         |
| `upload-error`      | `unknown`                                         | service 上传失败                         |

## Slots

| 插槽            | 参数 | 说明                         |
| --------------- | ---- | ---------------------------- |
| `upload-button` | 无   | 替换打开选择器的外部触发按钮 |

## defineExpose

当前不暴露实例方法。打开弹窗由组件自带触发器负责，不应依赖未公开的内部状态或方法。

## Service 契约

Picker 依赖 `MediaService`：

| 方法                     | Picker 用途                                                               |
| ------------------------ | ------------------------------------------------------------------------- |
| `list(params)`           | 按 `mediaType`、`groupId`、`keyword`、`page`、`pageSize` 获取后端分页结果 |
| `listGroups?(mediaType)` | 获取单级分组；未实现时隐藏分组导航                                        |
| `upload(options)`        | 上传文件，接收进度回调与取消信号，并返回带稳定 `id` 的 `MediaItem`        |
| `remove(ids)`            | 删除素材并返回成功删除的 ID；返回值用于表达部分成功                       |

完整类型定义见 [DESIGN 的 Service 契约](../../DESIGN.md#4-service-契约)。adapter 必须完成真实 API URL、认证、响应转换和后端筛选；组件不会对已分页结果再次做前端过滤。

`groupId: undefined` 表示“全部”，`groupId: null` 表示“未分组”。在“全部”或“未分组”视图上传时，组件传递 `groupId: null`。

## 状态与错误

- 分组或关键词变化会回到第 1 页；每次打开弹窗都会从“全部”重新加载。
- 多选暂存结果可跨页、跨分组保留，确认后才更新 `v-model`；`mediaType` 变化会清理弹窗内暂存选择。
- `pending`、`failed`、URL 为空或类型不匹配的记录保持可见，但不可预览或选择。开启 `canDelete` 后，失败记录可从 Picker 中清理。
- 删除请求只清理 `remove` 返回且属于本次请求的成功 ID；部分成功时保留未成功项的暂存选择并显示 warning，然后刷新列表。
- 列表、分组、上传和删除失败会显示 locale 错误消息；列表失败时清空当前结果。删除失败会清空弹窗暂存选择并重新加载列表。
- 较旧的列表或分组响应不会覆盖较新的筛选请求。

## 权限与安全

- `canUpload`、`canDelete` 只是界面能力开关，后端必须独立执行身份认证、资源归属和操作授权。
- `accept` 只影响文件选择提示。adapter 或后端必须校验真实 MIME、扩展名、大小和内容，并负责恶意文件处理。
- 素材 URL、缩略图和文件名来自 adapter；消费方应只返回可信或经过治理的资源地址，并配置适当的 CSP、跨域和下载策略。
- 删除必须由后端按 ID 校验权限；不要把组件隐藏按钮当作安全边界。
