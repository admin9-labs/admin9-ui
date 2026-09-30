# AFilePicker

`AFilePicker` 是后端无关的完整文件选择工作流，适合表单、弹窗和附件字段。它负责打开文件库、浏览筛选、维护草稿选择和确认写回，并复用 `AFileUploader` 的上传队列；可按独立开关启用新增分组、删除选中和移至分组。

图片字段需要卡片、预览、更换与移除时，使用组合组件 [AImagePicker](./image-picker.md)。

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
    listGroups: () => api.listFileGroups(),
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

也可通过 `app.use(Admin9UI, { fileService })` 注入默认 service；使用点的 `service` prop 优先。没有 `list` 时组件会抛出明确错误。

## Props

| Prop          | 类型                                  | 默认值             | 说明                                                     |
| ------------- | ------------------------------------- | ------------------ | -------------------------------------------------------- |
| `modelValue`  | `FileItem \| FileItem[] \| undefined` | `undefined`        | 单选写回一项，多选写回数组                               |
| `fileTypes`   | `readonly FileType[]`                 | 六种真实类型       | 允许的业务类型；运行时归一化、去重并安全清理不再允许的值 |
| `multiple`    | `boolean`                             | `false`            | 是否多选                                                 |
| `limit`       | `number`                              | `0`                | 多选上限；`0` 表示不限                                   |
| `pageSize`    | `number`                              | 未设置             | 未设置时按可用空间自动分页；正整数固定每页请求数量       |
| `buttonText`  | `string`                              | locale 文案        | 默认触发按钮文案                                         |
| `accept`      | `string`                              | `undefined`        | 可选的原生 MIME/扩展名提示；默认不限制可选择格式         |
| `canUpload`   | `boolean`                             | `false`            | 显示上传入口；开启时要求 `upload` capability             |
| `canCreateGroup` | `boolean` | `false` | 显示新增分组入口；要求 `listGroups` 和 `createGroup`，独立于上传权限 |
| `canDeleteFiles` | `boolean` | `false` | 显示删除选中；要求 `deleteFiles`，不检查文件是否被业务使用 |
| `canMoveFiles` | `boolean` | `false` | 显示移至分组；要求 `listGroups` 和 `moveFiles` |
| `defaultView` | `'grid' \| 'list'`                    | `'grid'`           | 弹窗初始视图                                             |
| `service`     | `FilePickerAdapter`                   | 插件 `fileService` | 使用点优先的后端无关 adapter                             |
| `disabled`    | `boolean`                             | `false`            | 禁止交互，同时继承 Form 禁用                             |
| `readonly`    | `boolean`                             | `false`            | 只读展示，不打开弹窗或清空                               |
| `size`        | `Size`                                | 继承               | 默认触发按钮尺寸                                         |
| `allowClear`  | `boolean`                             | `true`             | 显示外层清空按钮                                         |

`fileTypes` 的运行时非法值会被忽略，重复值会去重；`all` 不是 `FileType`。显式空数组表示不允许任何业务类型，组件不调用 `list/listGroups`，禁止选择、确认和上传，并以空选择显示；不回写父模型。`accept` 不能改变这些业务约束。

## Events

| 事件                | 参数                                  | 时机                                           |
| ------------------- | ------------------------------------- | ---------------------------------------------- |
| `update:modelValue` | `FileItem \| FileItem[] \| undefined` | 确认或外层清空；不因外部回显或约束变化发出     |
| `change`            | `FileItem \| FileItem[] \| undefined` | 已提交值真实变化时，载荷与 modelValue 相同     |
| `confirm`           | `FileItem[]`                          | 用户显式确认，包含同值确认；媒体插入使用此事件 |
| `clear`             | 无                                    | 用户成功清空非空提交值                         |
| `selection-change`  | `FileItem[]`                          | 弹窗草稿真实变化时，不等同于确认               |
| `visible-change`    | `boolean`                             | 弹窗打开或关闭                                 |
| `upload-success`    | `FileItem`                            | 当前视图内通过校验的上传结果；不改变选择草稿   |
| `upload-error`      | `unknown`                             | 当前视图内上传失败                             |

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
- `refresh(): Promise<void>`：刷新已打开弹窗的列表与适用分组，等待刷新完成；首次布局尚未完成时合并到首屏加载，关闭时不请求。

## 布局与分页

弹窗目标高度为 800px，实际高度不超过 `100dvh - 32px`，最大宽度为 1040px。标题、搜索和操作工具栏、反馈区域、分页及确认按钮保持稳定；搜索、切换分组、加载失败、空结果或末页不足一页均不缩短弹窗。左侧目录列表可独立滚动，分组标题和新增入口保留在顶部。

默认不传 `pageSize` 时，根据当前结果区域自动确定请求数量：桌面网格最多五列、三行；720px 及以下最多两列，极窄时降为一列，矮屏减少行数；列表视图按完整可容纳的行数分页。打开弹窗先完成布局再请求，不先查询固定数量后隐藏放不下的文件。

网格图片和视频缩略图使用 4:3 展示框与 `contain`，宽图、竖图和方图均保持自身比例，允许留白。列表中的图片也完整显示。服务提供的 `thumbnail` 必须是期望展示的完整缩略图；组件无法还原已经裁剪的缩略图，需要时由 adapter 省略 `thumbnail` 以使用原图。大图预览继续使用原图。

- 显式传入正整数 `pageSize` 时按指定数量请求；非法运行时值按未设置处理。固定数量模式切换网格／列表不改变页码、不重新请求。
- 自动模式中，只有布局变化导致目标容量变化时才回到第一页；切换视图但容量未变时保持当前页。重新分页保留筛选和跨页草稿，不提交字段。
- adapter 返回的 `pagination.pageSize` 表示实际分页数量，后续翻页使用它。若服务缩减数量，分页器按实际容量计算；若服务返回数量超过当前展示容量，完整保留列表，仅文件结果区滚动。adapter 必须按其返回的实际容量分页，不能只修改元信息。
- 默认文件列表通过分页浏览。显式较大容量、服务端较大容量、超高自定义 `item` 内容或放大文字无法容纳一行时，仅结果区允许滚动；不会截断文件或自定义内容。视口高度不超过 480px 时，正文启用滚动兜底并为结果区保留 128px，避免横屏下文件区塌缩或首次查询一直等待。标题与底部操作继续固定。
- 上传队列使用独立浮层；反馈和清空提示不改变结果区容量。上传完成仍须勾选并确认，不会直接写入字段。

此前默认每页 24 项。升级后省略 `pageSize` 将启用自动容量；需要保持原数量的调用方显式传入 `:page-size="24"`。`FileListParams.pageSize` 仍为数字，adapter 无需增加新接口。

## 分组与查询契约

左侧展示跨类型分组，支持一级分组与二级子分组，搜索框前通过下拉框筛选文件类型。`listGroups()` 不接受类型参数；分组可同时包含图片、视频、文档等，`count` 是全类型总数，选择器不展示该数量以免与筛选结果混淆。没有 `listGroups` 时隐藏左栏。业务虚拟筛选（我的上传、收藏等）不能当作真实分组。

```ts
type FileListParams = {
  page: number;
  pageSize: number;
  keyword?: string;
  groupId?: string | null;
} & (
  | { fileType?: undefined; fileTypes?: readonly FileType[] }
  | { fileType: FileType; fileTypes?: never }
);
```

- `listGroups()` 仍返回平面数组；一级分组的 `parentId` 省略或为 `null`，二级分组的 `parentId` 指向同一数组中的一级分组。父、子分组都可选择；父分组默认展开，首次选择父分组名称时同时展开子分组，再次点击已选父分组名称切换展开/收起；文件夹图标与实际展开状态一致，桌面也可通过图标独立切换，窄屏显示“父分组 / 子分组”完整路径。服务必须返回完整两级关系，不支持循环或更深层级。
- `groupId` 缺省表示全部分组，`null` 表示仅未分组，字符串表示指定分组的直属文件，不汇总其子分组；均可叠加类型和搜索。上传进入当前选中的实际分组 ID。
- 一种允许类型直接查询 `fileType`；2–5 种类型的“全部”查询携带 `fileTypes`；六类全部允许时省略集合。
- `fileType` 与 `fileTypes` 互斥。空数组零请求、零匹配，绝不能退化成全部。
- adapter 必须先在完整数据集上按类型集合、关键词和分组筛选，再分页并返回准确总数。不能过滤当前页冒充正确分页。
- 切换类型保留分组，切换分组保留类型和搜索；筛选或有效 pageSize 变化回到第一页。类型切换不重新请求分组，迟到列表响应不能覆盖当前筛选。

## 展示与选择

仅允许图片时标题为“选择图片”；类型下拉只在允许多种类型时显示。图片范围的搜索和分组空态明确使用“图片”，不把查询无结果表述为整个素材库为空。

网格不显示常驻选择控件，选中后展示边框和顺序编号；列表保留行首勾选框。单选、多选都支持点击同一项取消，单选最多保留一项；多选取消后重新选中会进入草稿末尾，编号相应更新。自定义 item 内容沿用相同选择规则，不需要配合内部 DOM。单选不展示已选计数，多选保留计数与上限，分页居中、操作靠右。

卡片和行的非操作区域用于选择，图片预览和文件打开使用独立入口。文件名与元信息分行，处理状态不遮挡选择控件。多选时底部以纯文本展示已选数量及上限，不提供折叠清单或已选面板；取消选择通过文件卡片或选择控件完成。正常选满只显示数量；再次尝试新增时显示约 3 秒的局部提示，不改变底部高度。重复尝试延长提示，取消选择、清空、关闭或更改上限会清除提示。

默认单选无值时显示选择按钮，有值时仅显示文件名、替换和一个移除入口；多选保留选择按钮和逐项移除，两项及以上提供文字“清空选择”。移除只更新字段，不删除文件库资产，遵守 `allowClear`、disabled 和 readonly。自定义 `trigger` 插槽完整替换该区域，不重复展示默认清单。

原字段和草稿都为空时禁止确认；空草稿仍可确认清空已有字段或显式清理非法外部值，界面在此场景提示清空结果。搜索空态、类型无匹配和分组空态分别显示；单页、空结果和加载失败不显示分页控件，但保留其布局空间。初始视图由 `defaultView` 决定，之后保留用户在当前实例选择的视图。每次重新打开时，分组、类型、关键词和页码统一恢复初始状态，草稿由已提交值重建。

## 选择与事务边界

Picker value 只表达可以交付给业务字段的文件：

- `AFilePicker` 的业务值必须同时满足：唯一且非空的稳定 `id`、`type` 在允许集合、`status` 为 `ready` 或未提供、`url` 为非空字符串。
- 类型不匹配、pending、failed、URL 为空、ID 为空和单次列表响应中的重复 ID 行只展示，不可选择或确认。
- 外部模型和列表项使用同一资格校验。上传与业务选择完全分离：上传成功、重复 ID 或达到 limit 都不会直接改变草稿。

草稿跨页保留。取消不写回；普通列表刷新和服务端元数据变化只调和草稿，不直接改变已提交 `v-model`。显式确认才提交草稿。props 约束变化或外部输入非法时，仅按规则归一化展示，不写回父模型。之后用户明确确认或调用 clear 时，会提交规范值；即使规范值与当前展示相同，也会完成这次写回，后续无变化的重复操作不再发出 update/change。

外层清空和关闭态调用 `clear()` 只发出已提交值的 `update:modelValue/change`，不会因弹窗是否曾打开而额外发出 `selection-change`。可见态调用暴露的 `clear()` 会同时清空当前草稿和已提交值，草稿真实变化时发出一次 `selection-change`。

## 上传、展示与可访问性

- 上传向 adapter 传递字段的允许类型集合，不沿用当前或上次浏览的类型。真实类型由 adapter/后端识别并在持久化前校验，组件再次校验返回项。
- 指定分组内上传到该分组；全部文件与未分组视图上传到未分组。
- 上传只刷新当前列表，不自动选中，不写回字段。组件显示“已上传 N 个文件，请勾选后确认”；有类型/搜索筛选时提供“清除筛选”，不会主动改动浏览范围。
- 成功提示通过已有 Uploader `result` 插槽展示在底部固定反馈区域，不挤动工具栏或文件列表；结果提示保留到主动关闭、开始下一批或关闭弹窗。上传队列完全成功后仍自动收起。
- 上传期间可搜索、切换类型，分组切换暂时禁用。关闭弹窗或服务/允许类型约束变化时取消旧上传并屏蔽迟到回调。
- `accept` 是原生选择提示，不是类型判断或安全保证；后端负责文件内容、权限和归属验证。
- 图片使用可用 URL/缩略图；视频/音频显示类型和时长，其他文件显示图标和元数据，不承诺在线 Office 预览。
- 文件结果使用语义分组，每张卡片/行使用真正的 checkbox 暴露选中与禁用状态，支持 Tab、Space 和 Enter；打开链接是独立命令，点击不会切换选择。
- 文件名、extension 等极长元数据在网格/列表中省略；`720px` 及以下使用分组下拉，类型下拉框与搜索框同行，删除和移动操作收进“更多”；底部显示多选计数、取消和确认，分页区域另起一行并始终预留。大于 `720px` 使用分组侧栏，不造成页面横向溢出。

窄屏“更多”中的分组级联、更多浮层和文件选择器按层级响应 Escape；删除确认结束后以及提交移动分组后，焦点返回可见的“更多”入口；入口消失时回退到搜索框。切换为桌面布局时关闭不再适用的管理浮层，焦点返回可见入口。

`canUpload` 只是界面能力开关，不代表后端授权。使用本组件库的应用仍需负责 API、认证、状态、路由和业务权限。

## 表单与受控值

`disabled`、`readonly` 默认 false；任一为 true 或外层 Form 禁用时不能打开、清空或提交。`size?: Size` 控制触发按钮，未设置时继承 Form／Arco 配置；不压缩文件浏览工作区。`allowClear` 默认 true，控制默认字段的移除与批量清空。自定义触发器继续保留原有外层清空入口。class/style 及其他原生属性落在组件根节点，不是弹层属性。

回显仅更新归一化后的展示，不触发 update/change/selection-change。弹层草稿与外层字段隔离，只有正式提交才触发 change 校验。单选清空为 undefined，多选清空为 []。`confirm` 始终为数组，适合不需要保存选择值的编辑器插入命令。

导出 `AFilePickerProps`、`AFilePickerExposed`、`FilePickerValue`、`FilePickerView`。defaultView 只决定初始视图。文件预览、下载和选中值只接受 HTTP(S)、相对路径和 blob URL；不渲染可执行协议或 data 文档。

自定义触发区域有多个操作控件时，关闭弹窗优先恢复到本次实际触发控件；控件失效时回退到区域内可用入口。

升级旧文件服务请参阅 [统一分组与上传类型集合迁移](./file-service-migration.md)。

## 文件条目的操作与状态

默认网格将预览/打开放在元信息右侧，列表放在独立操作列；不再覆盖缩略图。图片使用站内预览，其他类型打开安全链接。仅纯精细指针且支持悬停的环境按 hover/focus-within 显示次要操作；触屏、粗指针和混合输入环境常驻。操作区预留空间，Tab 可到达透明的操作并立即显示。

原生 checkbox 提供普通、悬停、聚焦、选中和禁用状态；禁用只阻止选择，不把名称与原因整体淡化。默认字段采用紧凑文件行，名称可收缩，操作不收缩；自定义 trigger/item 插槽继续控制其内容。

桌面与窄屏仅多选展示已选数量，作为状态文本播报，不可展开、不占用 Tab 焦点。

## 创建分组

`canCreateGroup` 默认关闭。启用时 adapter 必须同时提供 `listGroups()` 和 `createGroup(options)`，否则给出开发配置错误；开关由消费方按业务权限传入，与 `canUpload` 无关。桌面入口位于“文件分组”标题右侧，窄屏入口位于分组下拉右侧。禁用、只读、上传中及分组尚未成功加载时不能创建。

```ts
import type { FileGroupCreateOptions, FileGroupCreateCapability } from '@admin9-labs/admin9-ui';

const groupCreation: FileGroupCreateCapability = {
  createGroup: (options: FileGroupCreateOptions) => api.createFileGroup(options),
};
// options: { name: string; parentId?: string | null }
// 返回 FileGroup。parentId 为 null 或省略表示一级分组，二级分组只能引用一级分组。
```

表单默认创建一级分组，可选一级分组作为上级。名称去除首尾空白并检查非空；重名、长度、授权等业务规则由 adapter/后端校验。失败保留输入并显示通用重试提示，不暴露任意异常文本。

成功后选中新分组并展开其上级，清空搜索词并回到第一页，保留类型和文件选择草稿；刷新失败保留已创建项并提供重试。创建和取消不提交字段、不触发外层表单校验。关闭选择器、切换 service、禁用、只读或卸载后，旧响应不再影响新会话。已经创建的分组不会因取消选图而删除。

AImagePicker、ACoverPicker 和 ATiptapEditor 提供同名开关并透传。消费方负责将契约映射到自己的 API 和权限，组件库不包含具体接口或权限标识。

## 删除与移动素材

`canDeleteFiles` 和 `canMoveFiles` 独立于上传和分组创建，默认均关闭。开启对应能力但 adapter 缺少所需方法时抛出开发配置错误。全局开关由消费方传入；每个文件是否有权删除或移动，始终由 adapter/后端校验。未选择文件时操作不可用。

```ts
import type { FileDeleteCapability, FileMoveCapability, FileMoveOptions } from '@admin9-labs/admin9-ui';

const deletion: FileDeleteCapability = {
  deleteFiles: (ids) => api.deleteFiles(ids),
};
const moving: FileMoveCapability = {
  moveFiles: (options: FileMoveOptions) => api.moveFiles(options),
};
// deleteFiles(ids: readonly string[]): Promise<readonly string[]>
// moveFiles({ ids: readonly string[], groupId: string | null }): Promise<readonly string[]>
// 返回实际成功的 ID；请求中未返回的 ID 视为失败。部分成功必须返回成功 ID，不能整体抛错丢失结果。
```

操作针对当前完整选择草稿，包含跨页选择。删除需要确认，成功后从当前列表与草稿移除成功项，失败项保留供重试；无关或重复的响应 ID 不会影响其他文件。移动可选一级、二级分组或未分组（`null`），不允许“全部文件”作为目标；每次提交完整的选中 ID，不依据字段中可能过期的 `groupId` 跳过文件。adapter/后端应幂等处理已在目标分组的项，并将确认已处于目标分组的 ID 计入成功结果。成功移动保留选中顺序，只更新草稿中对应项的 `groupId`，不改 ID 或 URL，当前浏览分组不跳转。操作后刷新列表和分组，末页被清空时回退到有效页。

**素材管理与字段引用各管各的。** 删除不检查文件是否正在使用，也不自动移除表单、封面或编辑器中的引用；移动不会修改已提交的字段对象。两种操作均不触发字段的 `update:modelValue`、`change`、`confirm` 或表单校验，草稿变化仍可触发 `selectionChange`。用户之后点击确认时，才按当时的草稿正常提交字段；取消选图不撤销已经成功的删除或移动。

请求进行时锁定选择、筛选、上传和重复操作；删除确认框在提交期间不可再次提交或取消。组件关闭、服务/记录切换、权限收回、禁用或卸载后忽略旧响应，但不会撤销已经发送到服务端的操作。不显示任意后端异常文本；成功、全部失败和部分失败使用组件统一反馈。

AImagePicker、ACoverPicker、ATiptapEditor 提供同名开关。Web 的删除可映射既有 `removeFiles([...ids])`；移动需要消费方提供真实接口后才能启用。本仓库 fake service 的演示不代表 Web/后端已经接入。

图片预览保留 Arco 缩放、旋转和鼠标行为，由内部包装补充独立控件语义与键盘操作。打开聚焦关闭按钮；Tab/Shift+Tab 循环，Enter/Space 激活当前控件，Escape 只关闭预览。关闭后返回原按钮；按钮失效时回到卡片选择控件、结果区域或搜索入口。Picker 同时关闭时交给外部触发器恢复，不抢回焦点。
