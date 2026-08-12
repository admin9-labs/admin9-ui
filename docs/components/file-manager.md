# AFileManager

`AFileManager` 是后端无关的页面级文件管理组件。信息层级固定为“文件类型优先，其次是当前类型内单级分组”，支持上传、后端分页搜索、跨页选择、移动、删除、分组管理和网格/列表视图。

FileManager 覆盖 `image`、`video`、`audio`、`document`、`archive`、`other` 六种真实文件类型。“全部”只是聚合筛选，不属于 `FileType`，不能写入 `FileItem`。

## 基础示例

默认是合理的只读模式，只需实现 `list`：

```vue
<script setup lang="ts">
  import { AFileManager } from '@admin9-labs/admin9-ui';
  import type { FileManagerAdapter } from '@admin9-labs/admin9-ui';

  const fileService: FileManagerAdapter = {
    list: (params) => api.listFiles(params),
  };
</script>

<template>
  <AFileManager :service="fileService" />
</template>
```

也可通过 `app.use(Admin9UI, { fileService })` 注入共享默认 service；使用点的 `service` prop 优先。

完整管理模式必须显式开启能力：

```vue
<AFileManager
  :service="fileService"
  :can-upload="true"
  :can-delete="true"
  :can-move="true"
  :can-manage-groups="true"
  @upload-success="onUploadSuccess"
  @delete-success="onDeleteSuccess"
  @move-success="onMoveSuccess"
/>
```

## Props

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `initialFileType` | `FileType \| undefined` | `undefined` | 首次进入的真实类型；省略表示“全部” |
| `initialView` | `'grid' \| 'list'` | `'grid'` | 初始内容视图 |
| `pageSize` | `number` | `24` | 后端分页容量；变化时回到第 1 页 |
| `accept` | `string` | 按真实类型推导 | 上传选择器提示；不会用于组件端分类 |
| `canUpload` | `boolean` | `false` | 显示上传入口并要求 `FileUploadCapability` |
| `canDelete` | `boolean` | `false` | 显示单项/批量删除并要求 `FileRemoveCapability` |
| `canMove` | `boolean` | `false` | 显示单项/批量移动并要求 `FileMoveCapability` |
| `canManageGroups` | `boolean` | `false` | 显示分组增删改并要求完整 `FileGroupCapability` |
| `service` | `FileManagerAdapter` | 插件 `fileService` | 后端无关、按能力组合的 adapter |

能力开关只控制界面，不替代后端身份、资源归属、类型、分组和操作授权。

## Events

| 事件 | 参数 | 时机 |
| --- | --- | --- |
| `upload-success` | `(item: FileItem)` | 当前类型内上传完成 |
| `upload-error` | `(error: unknown)` | 当前类型内上传失败 |
| `delete-success` | `(ids: string[])` | 删除请求完成；只包含 service 确认成功的请求 ID |
| `move-success` | `(ids: string[], groupId: string \| null)` | 移动请求完成；只包含成功 ID |
| `file-type-change` | `(fileType: FileType \| undefined)` | 用户切换类型；`undefined` 表示“全部” |
| `selection-change` | `(items: FileItem[])` | 跨页选择变化 |

Vue 模板使用 kebab-case；TypeScript 声明事件名为 `uploadSuccess`、`uploadError`、`deleteSuccess`、`moveSuccess`、`fileTypeChange`、`selectionChange`。

## Slots 与实例方法

| 插槽 | 参数 | 说明 |
| --- | --- | --- |
| `toolbar-extra` | `{ refresh, loading }` | 扩展工具栏命令 |
| `item` | `{ item, available, selected, view }` | 替换文件展示；管理控制仍由组件维护 |
| `empty` | 无 | 替换空态 |

`refresh(): Promise<void>` 刷新当前列表与适用的类型分组；`clearSelection(): void` 清空跨页选择。

## 查询契约

`FileListParams` 是判别联合：

```ts
type FileListParams = FileListParamsBase &
  (
    | { fileType?: undefined; fileTypes?: readonly FileType[]; groupId?: never }
    | { fileType: FileType; fileTypes?: never; groupId?: string | null }
  );
```

- 聚合分支省略 `fileTypes` 表示六类全部；`AFileManager` 的“全部”使用此形态并完全省略 `fileTypes/groupId`。
- 聚合分支提供 `fileTypes` 表示只查询这些真实类型；空数组明确表示无匹配，不能退化为全部。
- adapter 必须在后端或完整数据源上先执行集合筛选，再分页并返回准确 `pagination.total/typeCounts`；禁止只过滤当前页。
- 具体类型分支必须显式提供 `fileType`，只有该分支可带 `groupId`：`undefined` 为该类型全部分组，`null` 为未分组，字符串为真实分组。
- `listGroups(fileType)`、上传、分组变更和移动都只接受真实 `FileType`，从不接受 `undefined` 或“全部”。

## 类型与操作行为

- 切入或切出任何类型都会清空当前分组、跨页选择、移动目标、分组编辑弹窗、旧列表和旧类型计数，并用请求代次阻止旧响应覆盖新视图。
- “全部”不显示分组。上传入口和移动目标保持可见但禁用，并提示先进入具体类型；组件不会按扩展名或 MIME 擅自分类。
- “全部”允许混合类型选择和批量删除。批量移动必须进入具体类型，组件不会把混合 ID 传给同一个类型分组。
- 具体类型视图中的移动始终传该真实 `fileType`。同类型且 ID 稳定的 pending、failed 或无 URL 记录始终不可移动/打开；启用 `canDelete` 时可选择，并可单项或批量删除清理。wrong-type、无 ID 或重复 ID 记录仍不可选择。
- `remove` 和 `move` 返回成功 ID。组件只清理实际成功项；部分失败项保持选择并显示警告。
- 列表和分组失败显示持久重试状态；上传、移动、删除和分组变更失败使用 mutation 反馈。
- 删除当前活动分组只删除分组，不隐式删除组内文件，并清空分组范围内选择/移动目标。

## 展示与响应式

- 图片使用缩略图并仅在 ready 且 URL 有效时允许预览；视频/音频显示时长或处理状态。
- PDF、Office、压缩包与其他文件显示类型图标、扩展名和大小等元数据；文件 URL 只提供宿主策略允许的打开/下载入口，不承诺在线 Office 预览。
- `720px` 以下类型导航横向滚动，分组改为紧凑选择器，同时保留 loading、失败重试、新建、重命名和删除操作；底部选择反馈、批量操作与分页换行排列，不产生横向溢出。

## 权限与安全

- adapter/后端必须校验真实 MIME、扩展名、内容、大小、恶意文件、身份、资源归属和授权；`accept` 只是浏览器文件选择提示。
- 文件名、URL、缩略图和元数据来自 adapter。消费方应只返回可信或已治理地址，并配置 CSP、跨域、下载与内容处置策略。
- `removeGroup` 不得隐式级联删除文件；非空分组的拒绝或迁移策略由业务后端明确实现。
