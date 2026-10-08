# AFileUploader

`AFileUploader` 是后端无关的本地批量上传组件。它基于现有单文件 `FileUploadCapability` 组织队列，统一处理进度、取消、失败重试、部分成功、结果校验和异步生命周期，可独立使用，也由 `AFilePicker` 复用。

当前只支持本地 `File`。组件不提供网络文件、扫码上传，不定义 batch API，也不根据 MIME 或扩展名推断业务 `FileType`。

## 基础示例

```vue
<script setup lang="ts">
  import { AFileUploader } from '@admin9-labs/admin9-ui';
  import type { FileUploadBatchResult, FileUploadCapability } from '@admin9-labs/admin9-ui';

  const uploadService: FileUploadCapability = {
    upload: ({ file, fileTypes, groupId, onProgress, signal }) =>
      api.uploadFile({ file, fileTypes, groupId, onProgress, signal }),
  };

  const onComplete = (result: FileUploadBatchResult) => {
    console.log(result.succeeded);
  };
</script>

<template>
  <AFileUploader
    :service="uploadService"
    :file-types="['image']"
    group-id="design"
    accept="image/*"
    :limit="10"
    :max-file-size="10485760"
    @complete="onComplete"
  />
</template>
```

也可通过 `app.use(Admin9UI, { fileService })` 注入包含 `upload` 的共享 adapter；使用点的 `service` prop 优先。

## Props

| Prop          | 类型                            | 默认值             | 说明                                                             |
| ------------- | ------------------------------- | ------------------ | ---------------------------------------------------------------- |
| `service`     | `Partial<FileUploadCapability>` | 插件 `fileService` | 实际上传时必须提供 `upload`                                      |
| `fileTypes`   | `readonly FileType[]`           | 六种真实类型       | 允许类型集合；显式空数组禁用上传；实际类型由 adapter/后端识别    |
| `groupId`     | `string \| null`                | `null`             | 跨类型的目标分组；`null` 表示未分组                              |
| `accept`      | `string`                        | `undefined`        | 可选的原生文件选择提示；默认不限制格式，不用于业务分类或安全校验 |
| `multiple`    | `boolean`                       | `true`             | 是否允许本地文件选择器一次选择多个文件                           |
| `limit`       | `number`                        | `0`                | 当前队列最多记录数；`0` 表示不限制，清除已完成记录后可释放额度   |
| `maxFileSize` | `number`                        | `0`                | 单文件最大字节数；`0` 表示组件端不限制                           |
| `buttonText`  | `string`                        | locale 文案        | 上传按钮文字                                                     |
| `disabled`    | `boolean`                       | `false`            | 显式禁用文件选择入口；上传中仍可继续选择并追加文件               |
| `size`        | `Size`                          | 继承               | 默认上传按钮尺寸                                                 |

`limit`、`maxFileSize` 和 `accept` 只提供前端交互约束。adapter/后端仍必须校验文件内容、真实 MIME、扩展名、大小、恶意文件、身份、资源归属、具体类型和分组授权。

## Events

| 事件           | 参数                                     | 时机                                                                                     |
| -------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `response`     | `(item: FileItem, task: FileUploadTask)` | adapter Promise 已解析；为 Picker 的 `upload-success` 语义保留，结果可能尚未通过资格校验 |
| `success`      | `(item: FileItem, task: FileUploadTask)` | 返回项通过稳定 ID、类型、ready 状态、URL 和队列重复 ID 校验                              |
| `error`        | `(failure: FileUploadFailure)`           | 请求失败、结果无效、超出数量或大小约束                                                   |
| `complete`     | `(result: FileUploadBatchResult)`        | 当前队列没有 pending/uploading 任务；包含成功、失败和取消三类结果                        |
| `tasks-change` | `(tasks: readonly FileUploadTask[])`     | 任一任务状态、进度或队列结构变化                                                         |

`FileUploadBatchResult.succeeded` 只包含通过资格校验的 `FileItem`。部分失败不会回滚成功项。`response` 不是独立使用时的成功结果来源；新代码应使用 `success` 或 `complete`。

## Slots 与实例方法

| 插槽      | 参数                          | 说明                                          |
| --------- | ----------------------------- | --------------------------------------------- |
| `trigger` | `{ disabled, uploading }`     | 替换上传触发器；文件 input 与队列仍由组件维护 |
| `result`  | `{ succeededCount, dismiss }` | 替换成功提示，供 Picker 补充“勾选后确认”说明  |
| `task`    | `{ task }`                    | 替换单条任务内容与操作区                      |

`defineExpose` 提供：

- `upload(files): Promise<FileUploadBatchResult>`：把本地文件加入当前允许类型集合/分组队列并等待队列稳定；
- `cancel(taskId?)`：取消指定活动任务；省略 ID 时取消全部活动任务；
- `retry(taskId)`：重试 failed 或 cancelled 任务；
- `remove(taskId)`：移除非活动任务记录；
- `clear()`：取消全部活动任务并清空队列；
- `tasks`：当前只读任务快照。

## 队列与生命周期

- 每个本地 `File` 单独调用一次 `upload({ file, fileTypes, groupId, onProgress, signal })`，应用不需要提供 batch 接口。
- adapter 调用 `onProgress` 时显示确定进度；未提供进度时显示不确定进度。
- 每个任务独立成功或失败，可取消、重试或移除；取消依赖 `AbortSignal`，即使 adapter 忽略信号，迟到响应也不会改变已取消任务。
- 队列仍有活动任务时保持面板可见并提供取消入口，文件选择器同时保持可用，新文件追加到当前允许类型集合/分组队列。全部成功后面板自动关闭并清空；存在失败或取消时保留面板供重试或移除。关闭面板后焦点会回到上传触发器。默认成功摘要仅在队列关闭时显示，保留到主动关闭、下一批上传或组件关闭；`result` 插槽仍接收成功数量和关闭方法。
- `fileTypes` 规范集合、`groupId` 或 service 变化时取消并清空旧上下文队列；组件卸载时中止活动请求并屏蔽迟到回调。
- 同一队列绑定一个目标分组和允许类型集合，可以混合上传不同类型；adapter 必须识别真实类型并在持久化前拒绝不允许的文件。组件按返回项的 `type` 校验集合，不通过扩展名替后端分类。

## 与文件组件组合

- `AFilePicker` 在队列完成后刷新当前文件列表，但不把上传结果加入选择草稿；用户需要显式选择文件并确认后才写回 `v-model`。关闭 Picker 会清空并取消活动上传。
- Picker 通过 `upload-success` / `upload-error` 继续提供单项上传结果事件。

队列面板不创建独立 Modal。按钮和任务操作均提供可访问名称；状态摘要使用 `aria-live`，可与 Picker 弹窗连续使用。

## 表单与命令边界

`size?: Size` 控制默认上传按钮，未配置时沿用 Form／Arco 配置；队列布局不随 size 改变。disabled 继承外层 Form，禁止新上传和重试，包括实例 upload/retry 与自定义触发器路径；仍可取消正在进行的任务以释放资源。

limit 是当前队列记录数上限，不是每次打开文件选择器或每次调用 upload 的数量上限：混合结果队列保留的成功、失败、取消记录均占用额度。移除已结束记录或关闭已结束队列后，再选择文件可释放额度；全部成功时队列自动清空。maxFileSize 以字节计；实例 retry 会重新验证两个限制。accept 沿用原生选择提示，不对 File 内容作安全保证。通过验证的返回文件必须有合法 HTTP(S)、相对或 blob URL。

class/style 及未声明的原生属性交给根节点，不透传为 Arco Upload 的网络请求配置。导出 Props、Exposed 和任务／批次类型；公开任务快照不暴露 AbortController 或内部回调。

## 操作提示

组件展示配置的数量与大小限制，未配置时不显示。accept 仅传给原生文件输入，不将 MIME／扩展名参数作为说明文字展示。队列汇总省略零计数，包含上传中、成功、失败和已取消的非零数量。大小使用 B/KB/MB/GB，按 1024 换算。大小、数量失败在队列中优先提供移除，网络失败和已取消任务提供重试；实例 retry 方法仍会重新校验约束。

超出数量时提示先移除已结束记录再重新选择文件；超出大小时提示压缩或更换文件。类型与格式拒绝提示换文件，通用失败提供实际可用的重试入口，不直出服务异常详情。成功提示只说明文件已经上传，不表示消费应用的表单、文章或其他业务记录已保存；应用应根据自己的保存流程提供完成反馈。

`FileUploadOptions.fileTypes` 与任务快照的 `fileTypes` 均为允许集合，不再包含强制分类 `fileType`。详见 [迁移说明](./file-service-migration.md)。

## 受控上传拒绝

adapter 可抛出 `FileUploadRejection`，同步抛出和 Promise 拒绝行为一致：

```ts
export type FileUploadRejection =
  | { code: 'unsupported-file-type' }
  | { code: 'unsupported-file-format'; allowedFormats?: readonly string[] };

throw Object.assign(new Error('Upload rejected'), {
  code: 'unsupported-file-format',
  allowedFormats: ['PNG', 'JPG'],
} satisfies FileUploadRejection);
```

类型拒绝产生 `file-type` 失败原因，提示中的类型取任务允许集合；格式拒绝产生 `file-format`，只展示适配器提供的非空字符串格式列表，去除空白与重复项。没有可靠格式列表时只提示更换文件。组件不展示任意 error.message 或响应正文，原始错误保留在 error/complete 载荷中。

类型和格式拒绝不显示重试，实例 retry 同样不再次请求；更换文件后通过上传入口建立新任务。普通 Error 或未知 code 保持通用失败与重试；返回 FileItem 不合格仍属于 invalid-result。使用失败原因穷举分支的消费方需增加 file-type、file-format。

编辑器的粘贴/拖放直接上传也识别相同拒绝对象，沿用 unsupported-image 事件并保留 cause；占位节点与提示一致，拒绝任务不可重试，但可删除、撤销和重做。未改变保存阻断和节点替换规则。
