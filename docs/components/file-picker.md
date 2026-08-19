# AFilePicker

`AFilePicker` 是后端无关的完整文件选择工作流，适合表单、弹窗和附件字段。它负责打开文件库、浏览筛选、维护草稿选择和确认写回，并复用 `AFileUploader` 的上传队列；不提供移动、删除或分组管理。

`AFilePicker` 是图片、视频、音频及其他文件的统一轻量选择器；`ATiptapEditor` 使用它作为媒体资源选择来源。

## 基础示例

```vue
<script setup lang="ts">
  import { ref } from 'vue';
  import { AFilePicker } from '@admin9-labs/admin9-ui';
  import type { FileItem, FilePickerAdapter } from '@admin9-labs/admin9-ui';

  const attachments = ref<FileItem[]>([]);
  const fileService: FilePickerAdapter = {
    list: (params) => api.listFiles(params),
    listGroups: (fileType) => api.listFileGroups(fileType),
    upload: (options) => api.uploadFile(options),
  };
</script>

<template>
  <AFilePicker
    v-model="attachments"
    :service="fileService"
    :file-types="['image', 'document', 'archive']"
    :limit="5"
    multiple
    can-upload
  />
</template>
```

也可通过 `app.use(Admin9UI, { fileService })` 注入与 Manager 共用的默认 service；使用点的 `service` prop 优先。没有 `list` 时组件抛出明确错误。不得新增 `filePickerService` 等第二套注入字段。

## Props

| Prop          | 类型                                  | 默认值             | 说明                                                     |
| ------------- | ------------------------------------- | ------------------ | -------------------------------------------------------- |
| `modelValue`  | `FileItem \| FileItem[] \| undefined` | `undefined`        | 单选写回一项，多选写回数组                               |
| `fileTypes`   | `readonly FileType[]`                 | 六种真实类型       | 允许的业务类型；运行时归一化、去重并安全清理不再允许的值 |
| `multiple`    | `boolean`                             | `false`            | 是否多选                                                 |
| `limit`       | `number`                              | `0`                | 多选上限；`0` 表示不限                                   |
| `pageSize`    | `number`                              | `24`               | 后端分页容量；变化后回到第 1 页                          |
| `buttonText`  | `string`                              | locale 文案        | 默认触发按钮文案                                         |
| `accept`      | `string`                              | `undefined`        | 可选的原生 MIME/扩展名提示；默认不限制可选择格式         |
| `canUpload`   | `boolean`                             | `false`            | 显示上传入口；开启时要求 `upload` capability             |
| `initialView` | `'grid' \| 'list'`                    | `'grid'`           | 弹窗初始视图                                             |
| `service`     | `FilePickerAdapter`                   | 插件 `fileService` | 使用点优先的后端无关 adapter                             |

`fileTypes` 的运行时非法值会被忽略，重复值会去重；`all` 不是 `FileType`。显式空数组表示不允许任何业务类型，组件不调用 `list/listGroups`，禁止选择、确认和上传，并立即清理外部值。`accept` 不能改变这些业务约束。

## Events

| 事件                | 参数                                  | 时机                                            |
| ------------------- | ------------------------------------- | ----------------------------------------------- |
| `update:modelValue` | `FileItem \| FileItem[] \| undefined` | 确认、外层清空，或 props 约束使原值不再合法时   |
| `change`            | `FileItem[]`                          | 已提交值真实变化时；单选也使用数组便于统一处理  |
| `selection-change`  | `FileItem[]`                          | 弹窗草稿真实变化时，不等同于确认                |
| `visible-change`    | `boolean`                             | 弹窗打开或关闭                                  |
| `upload-success`    | `FileItem`                            | 当前视图内 adapter 返回上传结果；不改变选择草稿 |
| `upload-error`      | `unknown`                             | 当前视图内上传失败                              |

TypeScript 声明使用 `selectionChange`、`visibleChange`、`uploadSuccess`、`uploadError`；Vue 模板使用表中的 kebab-case。

重复确认、等值外部回写、不改变草稿的 refresh 以及已达 limit 的上传不会重复发出 value 或 selection 事件。

## Slots 与实例方法

| 插槽      | 参数                                               | 说明                                   |
| --------- | -------------------------------------------------- | -------------------------------------- |
| `trigger` | `{ open, selectedItems, selectedCount, disabled }` | 替换外部触发器                         |
| `item`    | `{ item, available, selected, view }`              | 替换文件展示；选择控件仍由 Picker 维护 |
| `empty`   | `{ constrained }`                                  | 替换普通列表空态                       |

`defineExpose` 提供：

- `open(): void`：打开并从已提交值创建草稿；
- `close(): void`：取消并恢复已提交草稿；
- `clear(): void`：清空已提交值；弹窗关闭时静默同步草稿，弹窗打开时若草稿真实变化则同时发出一次 `selection-change`，且不会关闭弹窗；
- `refresh(): Promise<void>`：刷新当前列表与适用分组。

## 查询契约

`FileListParams` 的聚合与具体类型分支不能混用：

```ts
type FileListParams = FileListParamsBase &
  (
    | { fileType?: undefined; fileTypes?: readonly FileType[]; groupId?: never }
    | { fileType: FileType; fileTypes?: never; groupId?: string | null }
  );
```

- 仅允许一种类型时，Picker 直接查询 `{ fileType }`；如果 adapter 实现 `listGroups`，该真实类型可继续按分组浏览。
- 允许 2-5 种类型时，“全部允许类型”查询显式传 `fileTypes: normalizedAllowedTypes`。
- 六种类型全部允许时，聚合查询省略 `fileTypes`。
- 空数组零请求、零匹配，绝不能退化成全部。
- 聚合查询禁止 `groupId`；具体类型查询禁止 `fileTypes`。
- adapter 必须先在完整数据集上按类型集合、关键词和分组筛选，再分页并返回准确 `pagination.total`。Picker 不过滤当前页冒充准确总数。

类型、分组、搜索和 pageSize 变化都会回到第 1 页。请求代次、service 引用和视图代次共同阻止旧列表、分组和上传完成覆盖新视图。

## 选择与事务边界

Picker value 与 Manager cleanup selection 是两套语义：

- `AFileManager` 在启用删除时可让具备稳定 ID 的 pending、failed 或无 URL 记录进入管理选择，以便清理。
- `AFilePicker` 的业务值必须同时满足：唯一且非空的稳定 `id`、`type` 在允许集合、`status` 为 `ready` 或未提供、`url` 为非空字符串。
- wrong-type、pending、failed、null/空 URL、空 ID 和单次列表响应中的所有重复 ID 行只展示，不可选择或确认；异常行使用可区分的渲染 key，不以 `Map` 静默选中任意一条。
- 外部模型和列表项使用同一资格校验。上传与业务选择完全分离：上传成功、重复 ID 或达到 limit 都不会直接改变草稿。

草稿跨页保留。取消不写回；普通列表刷新和服务端元数据变化只调和草稿，不直接改变已提交 `v-model`。显式确认才提交草稿。唯一例外是 props 业务约束变化（例如 `fileTypes` 变空、移除类型、multiple/limit 收紧）或外部模型本身非法，此时组件立即执行安全校正，并对真实变化只发出一次 `update:modelValue/change`。

外层清空和关闭态调用 `clear()` 只发出已提交值的 `update:modelValue/change`，不会因弹窗是否曾打开而额外发出 `selection-change`。可见态调用暴露的 `clear()` 会同时清空当前草稿和已提交值，草稿真实变化时发出一次 `selection-change`。

## 上传、展示与可访问性

- 上传始终解析为一个真实 `FileType`；聚合“全部”永不把 `undefined` 或 `all` 传给 `upload`。
- 聚合视图同样可以选择并上传文件：目标类型依次使用最近选择的具体类型和允许类型中的第一项，目标分组为 `null`；提示文字会显示实际上传目标。
- 本地多选文件由 `AFileUploader` 分项调用现有单文件 `upload` capability；Picker 不再维护上传请求、进度、取消或重试状态。
- 上传完成后只刷新当前具体类型和分组的列表，不自动选择新文件，也不改变已提交值；用户需要在刷新后的列表中显式选择并确认。
- 上传队列完成后刷新当前具体类型和分组；关闭 Picker 会取消活动上传并屏蔽迟到回调，不创建第二个 Modal 或焦点陷阱。
- `accept` 只提供原生选择提示，不决定 `FileItem.type`。adapter/后端必须验证真实 MIME、扩展名、内容、大小、恶意文件、身份、资源归属和授权。
- 图片使用可用 URL/缩略图预览；视频/音频显示类型和时长；PDF、Office、压缩包与其他文件显示图标和元数据，不承诺在线 Office 预览。
- 文件结果使用语义分组，每张卡片/行使用真正的 checkbox 或 radio 暴露选中与禁用状态，支持 Tab、Space 和 Enter；打开链接是独立命令，点击不会切换选择。
- 文件名、extension 等极长元数据在网格/列表中省略；`720px` 以下类型导航横向滚动、工具栏和 footer 换行，不造成页面横向溢出。

`canUpload` 只是 UI 能力开关，不是后端授权。组件不包含 URL、auth、store、route、具体请求库或业务权限。
