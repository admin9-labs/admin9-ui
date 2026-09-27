# 统一分组与上传类型集合迁移

这是一次文件服务契约的破坏性调整。先迁移 adapter 并验证业务页面，再升级应用依赖；组件库不会回退到旧的按类型分组或单类型上传契约。

## 分组与查询

- `listGroups(fileType)` 改为 `listGroups()`。返回跨类型的真实分组平面数组；通过可选 `FileGroup.parentId` 表达二级关系，一级省略或为 `null`，子分组指向同一列表中的一级分组。一个文件仍只有一个 `groupId`。旧平面分组无需新增字段；库不增加目录管理，也不支持更深层级。
- `FileGroup.count` 如果提供，必须是分组内所有文件类型的总数。类型筛选不会改变分组列表。
- `FileListParams.groupId` 缺省为全部分组，`null` 为仅未分组，字符串为具体分组的直属文件（不汇总子分组）；三种情况均可组合 `keyword` 与类型条件。
- `fileType` 和 `fileTypes` 仍互斥。未提供类型表示全部；类型集合必须由后端先筛选再分页，空集合表示零结果。不能请求全量页再在前端过滤，也不能忽略 `null` 后当作全部文件。
- “我的上传”“已收藏”属于应用业务筛选，不是实际分组，不能把它们作为上传目标。保留在应用文件管理页面或应用自定义筛选流程中。

## 上传

```ts
const service: FilePickerAdapter = {
  list: (params) => api.listFiles(params),
  listGroups: () => api.listGroups(),
  upload: ({ file, fileTypes, groupId, onProgress, signal }) =>
    api.uploadFile({ file, allowedTypes: fileTypes, groupId, onProgress, signal }),
};
```

示例中的 `api` 是应用自己的封装，参数名不是组件库规定的 HTTP 字段。

- `FileUploadOptions.fileType` 改为必传的 `fileTypes: readonly FileType[]`。上传 adapter/后端识别文件的真实类型，并在持久化前验证是否属于该允许集合；`FileItem.type` 返回识别结果。
- Uploader 的 `file-type="image"` 改为 `:file-types="['image']"`。省略允许集合表示六种已知类型；显式 `[]` 禁用上传。任务快照同样改用 `fileTypes`。
- 原生 `accept` 只辅助选择文件，不能替代内容、MIME、扩展名、大小、权限与资源归属校验。不要把集合第一项或当前浏览类型写成上传文件的实际分类。
- 队列可以混合类型，但只绑定一个分组。服务、允许类型集合或目标分组变化会清空并取消旧队列；上传进行中 Picker 暂停分组切换。
- 上传成功仍不自动选中或提交。Picker 会刷新当前列表并显示“请勾选后确认”；类型和搜索筛选不会自动清除。
- 独立 Uploader 新增 `result` 插槽，参数为 `{ succeededCount, dismiss }`，可按所在流程调整成功提示。默认组件已有成功摘要，不必依赖父页面事件日志。

## 字段展示与事件

默认 Picker 触发区域增加文件清单和逐项移除。单选有值后仅保留替换与移除，多选两项以上提供批量清空。需要自定义字段外观时使用原有 `trigger` 插槽；图片、封面和编辑器组合继续由自己的触发区域负责展示。

移除只改变选择值，不删除素材。上传与草稿选择仍不触发字段 `change` 校验；显式确认、外层清空或外层逐项移除才更新已提交值。取消仍恢复之前的选择。

## Admin9 Web / Laravel 接入检查清单

当前 Laravel 文件目录模型已经支持混合类型，上传接口也自行识别类型，不需要为此把现有目录重新分组。本轮仅调整组件库与模拟验收宿主，以下项目尚未在真实应用实施：

1. Web adapter 移除按类型查询分组，以及 `mine/starred` 等虚拟分组映射；使用真实目录 ID。
2. Laravel 文件列表补齐多个允许类型与“仅未分组”查询，保持真实总数和分页；同步 OpenAPI 声明及使用该声明的客户端。
3. Web 上传 adapter 改为验证实际文件类型属于允许集合，并保留后端内容校验。API 接入方应明确如何在持久化前执行允许集合约束。
4. 应用和组件库的文件类型分类需显式映射，例如归档类型是否归入 `archive` 或 `other`，不能隐式放宽允许集合。
5. 验证附件、图片、封面、视频/音频及编辑器的上传、选用、替换和取消，尤其是受限类型字段中的跨类型分组。

本地 fake service 通过不代表生产服务已完成升级，也不构成发布或部署结果。

## 类型与格式拒绝

adapter 可以选择实现新的 FileUploadRejection 约定：unsupported-file-type 表示业务类型不在允许集合内；unsupported-file-format 表示同类文件的格式不支持，可附带 allowedFormats。不可通过英文错误消息猜测类别。普通异常依旧兼容，只有明确识别的拒绝才禁止重试。

AFileUploader 的失败原因新增 file-type 和 file-format，穷举处理需要补充分支；编辑器粘贴/拖放沿用已有 unsupported-image 事件，无需新增公开事件。真实应用需自行映射后端拒绝信息，组件库不会直接解析 HTTP 响应。
