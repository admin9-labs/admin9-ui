# AFileUploader

`AFileUploader` 是后端无关的本地批量上传组件。它基于现有单文件 `FileUploadCapability` 组织队列，统一处理进度、取消、失败重试、部分成功、结果校验和异步生命周期，可独立使用，也由 `AFilePicker` 复用。

第一阶段只支持本地 `File`。组件不提供网络文件、扫码上传，不定义 batch API，也不根据 MIME 或扩展名推断业务 `FileType`。

## 基础示例

```vue
<script setup lang="ts">
  import { AFileUploader } from '@admin9-labs/admin9-ui';
  import type { FileUploadBatchResult, FileUploadCapability } from '@admin9-labs/admin9-ui';

  const uploadService: FileUploadCapability = {
    upload: ({ file, fileType, groupId, onProgress, signal }) =>
      api.uploadFile({ file, fileType, groupId, onProgress, signal }),
  };

  const onComplete = (result: FileUploadBatchResult) => {
    console.log(result.succeeded);
  };
</script>

<template>
  <AFileUploader
    :service="uploadService"
    file-type="image"
    group-id="design"
    accept="image/*"
    :max-files="10"
    :max-file-size="10485760"
    @complete="onComplete"
  />
</template>
```

也可通过 `app.use(Admin9UI, { fileService })` 注入包含 `upload` 的共享 adapter；使用点的 `service` prop 优先。

## Props

| Prop          | 类型                            | 默认值             | 说明                                                               |
| ------------- | ------------------------------- | ------------------ | ------------------------------------------------------------------ |
| `service`     | `Partial<FileUploadCapability>` | 插件 `fileService` | 实际上传时必须提供 `upload`                                        |
| `fileType`    | `FileType \| undefined`         | `undefined`        | 队列绑定的具体真实类型；缺省时入口禁用，程序调用 `upload()` 会拒绝 |
| `groupId`     | `string \| null`                | `null`             | 当前真实类型下的目标分组；`null` 表示未分组                        |
| `accept`      | `string`                        | `undefined`        | 可选的原生文件选择提示；默认不限制格式，不用于业务分类或安全校验   |
| `multiple`    | `boolean`                       | `true`             | 是否允许本地文件选择器一次选择多个文件                             |
| `maxFiles`    | `number`                        | `0`                | 当前队列最多记录数；`0` 表示不限制，清除已完成记录后可释放额度     |
| `maxFileSize` | `number`                        | `0`                | 单文件最大字节数；`0` 表示组件端不限制                             |
| `buttonText`  | `string`                        | locale 文案        | 上传按钮文字                                                       |
| `disabled`    | `boolean`                       | `false`            | 显式禁用文件选择入口；上传中仍可继续选择并追加文件                 |

`maxFiles`、`maxFileSize` 和 `accept` 只提供前端交互约束。adapter/后端仍必须校验文件内容、真实 MIME、扩展名、大小、恶意文件、身份、资源归属、具体类型和分组授权。

## Events

| 事件           | 参数                                     | 时机                                                                                             |
| -------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `response`     | `(item: FileItem, task: FileUploadTask)` | adapter Promise 已解析；为 Picker 的 `upload-success` 语义保留，结果可能尚未通过资格校验        |
| `success`      | `(item: FileItem, task: FileUploadTask)` | 返回项通过稳定 ID、类型、ready 状态、URL 和队列重复 ID 校验                                      |
| `error`        | `(failure: FileUploadFailure)`           | 请求失败、结果无效、超出数量或大小约束                                                           |
| `complete`     | `(result: FileUploadBatchResult)`        | 当前队列没有 pending/uploading 任务；包含成功、失败和取消三类结果                                |
| `tasks-change` | `(tasks: readonly FileUploadTask[])`     | 任一任务状态、进度或队列结构变化                                                                 |

`FileUploadBatchResult.succeeded` 只包含通过资格校验的 `FileItem`。部分失败不会回滚成功项。`response` 不是独立使用时的成功结果来源；新代码应使用 `success` 或 `complete`。

## Slots 与实例方法

| 插槽      | 参数                      | 说明                                          |
| --------- | ------------------------- | --------------------------------------------- |
| `trigger` | `{ disabled, uploading }` | 替换上传触发器；文件 input 与队列仍由组件维护 |
| `task`    | `{ task }`                | 替换单条任务内容与操作区                      |

`defineExpose` 提供：

- `upload(files): Promise<FileUploadBatchResult>`：把本地文件加入当前具体类型/分组队列并等待队列稳定；
- `cancel(taskId?)`：取消指定活动任务；省略 ID 时取消全部活动任务；
- `retry(taskId)`：重试 failed 或 cancelled 任务；
- `remove(taskId)`：移除非活动任务记录；
- `clear()`：取消全部活动任务并清空队列；
- `tasks`：当前只读任务快照。

## 队列与生命周期

- 每个本地 `File` 单独调用一次 `upload({ file, fileType, groupId, onProgress, signal })`，没有隐藏的 batch 合同。
- adapter 调用 `onProgress` 时显示确定进度；未提供进度时显示不确定进度。
- 每个任务独立成功或失败，可取消、重试或移除；取消依赖 `AbortSignal`，即使 adapter 忽略信号，迟到响应也不会改变已取消任务。
- 队列仍有活动任务时保持面板可见并提供取消入口，文件选择器同时保持可用，新文件追加到当前具体类型/分组队列。全部成功后面板自动关闭并清空；若焦点位于即将移除的队列操作中，则恢复到上传触发器。存在失败或取消时保留面板供重试或移除，手动关闭会清空队列并恢复焦点。
- `fileType`、`groupId` 或 service 变化时取消并清空旧上下文队列；组件卸载时中止活动请求并屏蔽迟到回调。
- 同一队列只能绑定一个 concrete `FileType` 和其下的 `groupId/null`。多选表示同一上下文选择多个文件，不表示混合业务类型。

## 与文件组件组合

- `AFilePicker` 在队列完成后刷新当前文件列表，但不把上传结果加入选择草稿；用户需要显式选择文件并确认后才写回 `v-model`。关闭 Picker 会清空并取消活动上传。
- Picker 继续保留原有单项 `upload-success` / `upload-error` 事件兼容层，但不再维护自己的上传请求和进度状态。

队列面板不创建 Modal 或其他焦点陷阱。按钮和任务操作均提供可访问名称；状态摘要使用 `aria-live`，可与 Picker Modal 连续使用。
