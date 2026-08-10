# AMediaLibrary

`AMediaLibrary` 是页面级素材浏览与管理组件。只读模式仅依赖分页查询；按需启用后，可提供单级分组、上传、单项或批量移动与删除，以及跨页、跨分组选择。

## 适用边界

适用于消费应用已有素材后端，需要快速组成完整图片、视频或音频管理页的场景。组件不绑定路由、store、认证或具体请求库。

不适用于表单内轻量选择，也不承担多级目录、排序、标签、版权、审核、版本、转码、审计或业务权限模型。表单选择请使用 [`AMediaPicker`](./media-picker.md)，更复杂的 DAM 能力应由消费应用实现。

## 基础示例

```vue
<script setup lang="ts">
  import { AMediaLibrary } from '@admin9-labs/admin9-ui';
  import type { MediaLibraryAdapter } from '@admin9-labs/admin9-ui';

  const mediaLibraryService: MediaLibraryAdapter = createMediaLibraryServiceAdapter();
</script>

<template>
  <a-media-library
    media-type="image"
    :service="mediaLibraryService"
    :page-size="24"
    @upload-success="onUploadSuccess"
    @upload-error="onUploadError"
    @delete-success="onDeleteSuccess"
    @move-success="onMoveSuccess"
  >
    <template #toolbar-extra="{ refresh, loading }">
      <a-button :disabled="loading" @click="refresh">同步</a-button>
    </template>
  </a-media-library>
</template>
```

也可以通过 `app.use(Admin9UI, { mediaService: mediaLibraryService })` 注入兼容的默认 service；使用点的 `service` prop 优先。

## Props

| Prop              | 类型                            | 默认值              | 说明                                         |
| ----------------- | ------------------------------- | ------------------- | -------------------------------------------- |
| `mediaType`       | `'image' \| 'video' \| 'audio'` | `'image'`           | 单实例只管理一种素材类型                     |
| `pageSize`        | `number`                        | `24`                | 请求页容量；变化时回到第 1 页                |
| `accept`          | `string`                        | 按 `mediaType` 推导 | 上传文件选择器的 MIME 过滤提示               |
| `canUpload`       | `boolean`                       | `true`              | 是否显示上传入口                             |
| `canDelete`       | `boolean`                       | `true`              | 是否显示单项和批量删除入口                   |
| `canMove`         | `boolean`                       | `true`              | 是否显示单项和批量移动入口                   |
| `canManageGroups` | `boolean`                       | `true`              | 是否显示分组新建、重命名和删除入口           |
| `service`         | `MediaLibraryAdapter`           | 插件注入值          | 按界面开关提供相应能力的 adapter              |

以上能力开关只控制界面，不替代后端授权。

## Events

| 事件             | 参数                                       | 时机                                                         |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `upload-success` | `(item: MediaItem)`                        | 上传成功且当前素材类型未变化                                 |
| `upload-error`   | `(error: unknown)`                         | 上传失败且当前素材类型未变化                                 |
| `delete-success` | `(ids: string[])`                          | 删除请求完成；参数只包含 service 返回且属于本次请求的成功 ID |
| `move-success`   | `(ids: string[], groupId: string \| null)` | 移动请求完成；参数只包含成功 ID 和目标分组                   |

Vue 模板使用上表的 kebab-case 监听名；TypeScript 声明中的事件名为 `uploadSuccess`、`uploadError`、`deleteSuccess`、`moveSuccess`。

## Slots

| 插槽            | 参数                            | 说明                                             |
| --------------- | ------------------------------- | ------------------------------------------------ |
| `toolbar-extra` | `{ refresh, loading }`          | 在刷新与上传操作之间扩展工具栏                   |
| `item`          | `{ item, available, selected }` | 替换素材展示区；选择、移动和删除控制仍由组件维护 |
| `empty`         | 无                              | 替换列表空态                                     |

## defineExpose

| 方法               | 返回值          | 说明                   |
| ------------------ | --------------- | ---------------------- |
| `refresh()`        | `Promise<void>` | 并行刷新当前列表与分组 |
| `clearSelection()` | `void`          | 清空跨页、跨分组选择   |

## Service 契约

Library 始终只要求 `MediaBrowseService.list`。其余方法按界面能力开关和分组导航需要提供：

| 条件                   | 必需方法                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| 基础浏览               | `list(params)`                                                   |
| 提供分组导航           | `listGroups(mediaType)`；未提供时隐藏分组导航                    |
| `canUpload=true`       | `upload(options)`                                                |
| `canDelete=true`       | `remove(ids)`                                                    |
| `canMove=true`         | `move({ mediaType, ids, groupId })`                              |
| `canManageGroups=true` | 完整 `MediaGroupCapability`：`listGroups/createGroup/renameGroup/removeGroup` |

完整 `MediaLibraryService` 仍作为兼容类型保留，已有完整 adapter 无需修改。只读页面可传 `{ list }`，同时关闭 `canUpload`、`canDelete`、`canMove` 和 `canManageGroups`。启用 `canMove` 但不提供 `listGroups` 时，组件只提供移动到“未分组”。完整字段与签名见 [DESIGN 的 Service 契约](../../DESIGN.md#4-service-契约)。

adapter 必须明确处理非空分组的拒绝或迁移策略。`groupId: undefined` 仅表示查询“全部”，`groupId: null` 表示“未分组”或移动、上传到未分组；字符串才是后端真实分组 ID。

## 状态与错误

- 分组、关键词、`mediaType` 或 `pageSize` 变化会回到第 1 页；类型变化还会清空分组缓存、忙碌状态和批量选择。
- `720px` 以下使用紧凑分组选择器，但仍保留新建分组；选中后端真实分组时仍可重命名或删除，“全部”和“未分组”不显示这两项操作。
- 选择按稳定 `MediaItem.id` 跨页、跨分组保留。移动或删除后只移除 service 确认成功的 ID，部分失败项继续保持选中并显示警告。
- 单项移动先选择目标，再通过独立确认操作提交；选择下拉项本身不产生移动副作用。
- 移动端卡片将目标选择与执行按钮分行，避免压缩目标名称或造成操作区横向溢出。
- 操作结束后刷新列表和分组统计；删除当前页最后一项导致页码越界时，会回退到最后一个有效页。
- `pending`、`failed`、URL 为空或类型不匹配的记录保持可见，但不能预览、选择或移动；同类型记录仍可删除以便清理。
- 列表和分组加载失败会显示持久、可重试错误态；上传、移动、删除和分组变更失败会显示 locale 消息。分组保存失败时弹窗保持打开。
- 请求序号和视图代次会阻止旧响应覆盖新的类型、service 或筛选结果，同一素材执行变更时禁止重复提交。

## 权限与安全

- `canUpload`、`canDelete`、`canMove`、`canManageGroups` 不是授权系统。后端必须逐项校验身份、资源归属、素材类型和目标分组权限。
- `accept` 只影响文件选择提示。adapter 或后端必须校验真实 MIME、扩展名、大小和内容，并负责恶意文件处理。
- `removeGroup` 不得隐式级联删除素材；非空分组策略必须由业务后端显式定义并返回清晰错误。
- `move` 和 `remove` 的返回 ID 会驱动部分成功状态。adapter 不应回传未实际成功或不属于本次请求的 ID。
- 素材 URL、缩略图和文件名来自 adapter；消费方应只提供可信或经过治理的资源地址，并配置适当的 CSP、跨域和下载策略。
