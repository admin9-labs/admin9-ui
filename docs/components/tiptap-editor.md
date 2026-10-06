# ATiptapEditor

`ATiptapEditor` 是基于 Tiptap 的表单级富文本编辑器，支持 HTML 和结构化 JSON 模型。它提供中后台常用的内容格式和表格编辑，并在存在 `FilePickerAdapter` 时复用 `AFilePicker` 插入或替换图片、视频和音频。

素材选择与更换弹窗沿用 [AFilePicker 的稳定高度与响应式分页](./file-picker.md#布局与分页)，按可用空间自动确定每页数量；文件库中的 4:3 图片框完整显示展示源，不影响插入正文后的图片尺寸或媒体布局。

## 使用

```vue
<script setup lang="ts">
  import { ref } from 'vue';
  import { ATiptapEditor } from '@admin9-labs/admin9-ui';

  const content = ref('<p>初始内容</p>');
</script>

<template>
  <ATiptapEditor
    v-model="content"
    placeholder="请输入正文"
    :max-length="10000"
    :max-height="560"
    default-image-display="block"
  />
</template>
```

若应用已经通过 `app.use(Admin9UI, { fileService })` 注入文件服务，编辑器会自动显示图片、视频和音频按钮；也可在使用点通过 `service` prop 覆盖。未提供服务时只隐藏三个文件按钮，不影响其他编辑能力。

文件服务默认只需实现 `list()`。若需要在某一类 Picker 中上传，显式开启对应的 `canUploadImage`、`canUploadVideo` 或 `canUploadAudio`，并为 service 提供 `upload()`。

## 图片粘贴与拖拽

设置 `canUploadImage=true` 且文件服务实现 `upload()` 后，可粘贴截图或从文件管理器拖入 PNG、JPEG、GIF、WebP 图片。默认仍关闭上传。HTML 和 JSON 模式使用相同流程，上传完成的图片可继续调整大小、对齐和替代文字。

图片先在插入位置显示预览，最多并发上传三张；提供进度的服务显示百分比，否则显示加载状态。普通失败可原位重试或删除；adapter 明确拒绝图片类型或格式时不可重试，应删除后更换图片。多图按输入顺序排列。删除或撤销未完成图片会取消上传，晚到响应不会将其重新插入；重做已成功图片使用正式地址，不再次上传。只读／禁用切换会取消在途请求，恢复编辑后可以重试或删除未完成项。

上传沿用 `FileUploadOptions`，图片使用 `fileTypes: ['image']`、`groupId: null`，并传入进度回调和 `AbortSignal`。adapter/后端识别真实类型并校验允许集合，不再读取旧的 `fileType` 参数；迁移要求见[文件服务迁移](./file-service-migration.md)。结果须有非空 ID、正确图片类型、就绪状态和 HTTP(S) 或相对 URL。`blob:`、base64、上传任务 ID 和本地文件对象不会写入公开 HTML／JSON。本组件当前采用即时上传，不提供保存时提交 base64 的模式。

adapter 抛出 `FileUploadRejection` 中的 `unsupported-file-type` 或 `unsupported-file-format` 时，编辑器沿用 `image-upload-error` 的 `unsupported-image` 原因并保留原始 `cause`；节点提示和 toast 均指引删除后更换图片，撤销、重做不会重新请求该拒绝任务。未知错误仍按普通上传失败处理。

消费方应监听 `image-upload-state-change`，并在提交时再次调用 `getImageUploadState()`。`pending`、`uploading`、`failed` 任一非零时，`canSave=false`；用户等待、重试或删除未完成图片后才能保存。`canSave` 只表示图片任务是否完成，不代替业务表单校验。`getHTML()`、`getJSON()` 与模型事件仍可读取已完成内容，消费方不能以拿到内容代替状态检查。

```vue
<ATiptapEditor
  ref="editor"
  v-model="content"
  :service="fileService"
  :can-upload-image="true"
  @image-upload-state-change="uploadState = $event"
/>
<a-button :disabled="!uploadState.canSave" @click="save">保存</a-button>
```

`save()` 中先检查 `editor.getImageUploadState().canSave`，再读取内容提交。初始化也会发送状态事件。真正的外部文档替换、清空和卸载会取消任务；相同内容的模型回写不会中断上传。

清空或替换正文后，撤销可恢复已取消图片的占位，并通过重试重新上传。为支持撤销，当前编辑器会保留对应本地文件任务；占位离开正文时释放临时预览地址，卸载时清理全部任务。只读／禁用期间不可重试或删除，恢复编辑后操作重新可用。

## 外部内容、链接和附件

图文粘贴优先使用剪贴板 HTML，保留支持的段落、列表、表格与安全图片地址，不将剪贴板文件重复追加。安全的网页图片保留外链，不自动转存；`file:`、不可访问的 `blob:`、base64 及 Word 本地图片引用会跳过并报告一次 `paste-warning`。其余内容保留。不解析 RTF 图片，也不承诺 Word／网页像素级还原。

Excel 提供的 HTML 表格可直接粘贴；已有表格中的单元格粘贴沿用 Tiptap 行为。纯文本制表符不会自动转换成表格。需要 TSV 时，在插入表格面板选择“粘贴表格数据”，粘贴制表符分列、换行分行的数据，确认行列数后插入。空单元格会保留，公式作为普通文字。

表格插入被字符限制等规则拒绝时，弹窗和输入草稿会保留，并提示重试；不会把未插入的内容视为成功。

链接面板支持显示文字、地址、打开和移除；无选区时也能插入链接。选中文字后粘贴 URL 可直接设置链接。正文中的“插入附件”复用文件选择器，接受 `document / archive / other`，以文件名作为普通链接插入，可多选；不包含附件卡片、鉴权下载或预览服务。`canUploadAttachment` 默认 `false`，仅控制附件弹窗上传。

## 工具栏与操作提示

默认工具保留完整，按段落、文字格式、列表／链接与格式操作、媒体／表格、对齐和撤销／重做分组。窄幅时分组和组内控件自然换行，保持键盘可达，不隐藏默认工具。

格式刷显示简短状态“已复制格式。选择目标文字后应用。”，并保留“应用格式”和“取消格式刷”。“格式刷操作帮助”可通过鼠标、触摸或键盘展开：鼠标选完目标文字自动应用，键盘选完按 `Enter`，触摸选完点“应用格式”；`Esc` 取消并返回正文。展开帮助不会应用格式或更改内容。

粘贴表格弹层说明可复制 Excel 等表格的单元格内容，以换行分行、制表符分列；不表示支持上传工作簿。宿主语言同步、业务保存状态及错误映射要求见[体验接入要求](./experience-integration.md)。

## 文字格式与表格操作

工具栏提供文字色、高亮预设以及默认／12／14／16／18／20／24／28／32px 字号。选区存在多个值时显示混合格式；无选区时作用于后续输入。恢复默认会移除显式值，默认文字色继承主题；显式色在暗色主题下仍保持原色。安全的非预设导入色可保留并显示当前值，但不提供任意色值输入；非预设字号回落为继承值。任意 CSS 样式不在保存契约内。

“清除文字格式”移除基础文字标记、行内代码、颜色、高亮和字号，保留链接、图片、表格及列表结构；支持撤销。系统纯文本粘贴快捷键保留换行而不带入富文本格式。

表格内选中可合并的矩形单元格区域可执行合并；有跨行／跨列的单元格可拆分。操作不可用时禁用，内容和有效列宽按 Tiptap 表格规则保留；支持撤销和 HTML／JSON 回填。

## JSON 模型使用

`value-format` 同时约定 `v-model` 的输入与输出格式，默认 `html`，现有 HTML 用法无需修改。

```vue
<script setup lang="ts">
  import { ref } from 'vue';
  import { ATiptapEditor, type TiptapDocument } from '@admin9-labs/admin9-ui';

  const content = ref<TiptapDocument>({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '初始内容' }] }],
  });
</script>

<template>
  <ATiptapEditor v-model="content" value-format="json" />
</template>
```

JSON 模式接收完整的 Tiptap 文档对象，不接收字符串化 JSON 或节点数组。可用 `{ type: 'doc', content: [] }` 初始化空内容；省略模型也会初始化为空编辑器，且不会主动触发模型更新。清空后输出编辑器原生空文档对象，不输出 `''` 或 `null`。

保存时可将对象交给应用的数据层；如果存储为字符串，回填前先 `JSON.parse()`。外部更新应整体替换模型对象，不支持直接修改其深层字段。相同文档的副本不会重置选区或撤销记录；外部回填不触发 `update:modelValue` 和 `change`。组件不会修改输入对象，事件与 `getJSON()` 返回独立快照。

`valueFormat` 在实例创建时确定。需要更换格式时，先用 `getHTML()` 或 `getJSON()` 获取目标格式内容，再同时更新模型、格式和组件 `key`，以重建实例。重建会重置选区和撤销历史。

JSON 使用本组件当前 Tiptap schema，支持现有文字标记、表格以及 `blockImage`、`inlineImage`、`video`、`audio` 媒体节点。有效表格的合并单元格与列宽、媒体尺寸与对齐会在保存和回填时保留。这不是跨编辑器通用 JSON 格式；其他编辑器的数据或未注册的扩展节点不能直接回填。JSON 输入直接按 schema 处理，不通过 HTML 中转。

包入口导出 `TiptapValueFormat`、`TiptapDocument`、`TiptapContentError`。`ATiptapEditorProps` 默认对应 HTML，可用 `ATiptapEditorProps<'json'>` 描述 JSON 模式，此时必须提供 `valueFormat: 'json'`；组件事件参数随格式推断。使用 `h()` 编写 JSON 组件时，可显式指定 `h(ATiptapEditor<'json'>, { valueFormat: 'json', modelValue: content })`。实例 ref 继续支持 `ref<InstanceType<typeof ATiptapEditor>>()`，可调用 `focus()`、`clear()`、`getHTML()` 和 `getJSON()`。

## Props

| 属性                  | 类型                       | 默认值              | 说明                                               |
| --------------------- | -------------------------- | ------------------- | -------------------------------------------------- |
| `valueFormat`         | `'html' \| 'json'`         | `'html'`            | 模型输入和输出格式；实例创建时确定                 |
| `modelValue`          | `string \| TiptapDocument` | 空编辑器            | HTML 模式为字符串；JSON 模式为文档对象             |
| `placeholder`         | `string`                   | locale 文案         | 空内容占位符                                       |
| `disabled`            | `boolean`                  | `false`             | 禁用编辑和工具栏                                   |
| `readonly`            | `boolean`                  | `false`             | 只读展示并隐藏工具栏                               |
| `minHeight`           | `number \| string`         | `240`               | 正文滚动区最小高度；数字按 px 处理                 |
| `maxHeight`           | `number \| string`         | `min(640px, 60dvh)` | 正文滚动区最大高度；数字按 px 处理                 |
| `maxLength`           | `number`                   | `0`                 | 最大字符数，`0` 表示不限                           |
| `showWordCount`       | `boolean`                  | `true`              | 是否显示字符统计                                   |
| `service`             | `FilePickerAdapter`        | 插件注入值          | 图片、视频和音频文件浏览服务；启用上传时需上传能力 |
| `canUploadImage`      | `boolean`                  | `false`             | 图片素材弹窗是否允许上传                           |
| `canUploadVideo`      | `boolean`                  | `false`             | 视频素材弹窗是否允许上传                           |
| `canUploadAudio`      | `boolean`                  | `false`             | 音频素材弹窗是否允许上传                           |
| `canUploadAttachment` | `boolean`                  | `false`             | 附件弹窗是否允许上传                               |
| `canCreateGroup` | `boolean` | `false` | 在所有素材选择／更换弹窗开启一级／二级分组创建；要求 listGroups 和 createGroup，独立于上传开关 |
| `canDeleteFiles` | `boolean` | `false` | 在素材弹窗启用删除选中；要求 deleteFiles，不自动删除正文节点或检查引用 |
| `canMoveFiles` | `boolean` | `false` | 在素材弹窗启用移至分组；要求 listGroups 和 moveFiles，不修改正文 |
| `defaultImageDisplay` | `'block' \| 'inline'`      | `'block'`           | 新图片默认独占一行或跟随文字，不按素材尺寸推断     |

`maxLength` 可动态调整。降低限制时不会截断已有内容，但会阻止内容继续增长；提高限制或改为 `0` 后，新的限制会从下一次编辑立即生效。

正文会在 `minHeight` 与 `maxHeight` 之间自动增高，达到上限后改为内部滚动。主格式工具栏和字符统计位于滚动区外。选中媒体时，操作栏通过 Tiptap BubbleMenu 悬浮在当前可见媒体附近，不占据编辑器布局空间，也不会修改页面或正文滚动位置；顶部空间不足时会自动翻转，左右贴边时会自动收进正文可视边界。

主工具栏和媒体操作栏的普通操作使用中性颜色，Hover 使用浅灰背景；只有当前生效的格式、尺寸和对齐状态使用品牌色。禁用操作会弱化显示，删除保持危险色，切换型按钮仍通过 `aria-pressed` 暴露状态。

表格按钮打开 8 行 × 10 列的尺寸选择网格，初始为 1 行 × 1 列。悬停或方向键选择时实时预览尺寸，点击或按 Enter 插入，Esc 关闭。新表格默认使用普通单元格；光标位于表格内时，可在当前行列前后插入、删除当前行列、切换首行表头或删除整表。已有 HTML 中的 `table`、`thead`、`tbody`、`tr`、`th` 和 `td` 会解析为可编辑表格，并保留 Tiptap 支持的 `colspan`、`rowspan` 与列宽信息。表格在窄屏正文区内横向滚动。

## 清除文字格式与格式刷

“清除文字格式”移除选中文字的粗体、斜体、下划线、删除线、行内代码、颜色、字号和高亮，保留链接、标题、列表、引用、对齐、表格和媒体。只有光标时，仅清除后续输入继承的文字格式，不修改原有文字或整段结构。

“格式刷”位于清除按钮旁。将光标放入来源文字或选中格式一致的文字，点击格式刷，再选择目标文字。鼠标选择完成后自动应用一次；键盘选择后按 Enter；触摸选择后点击提示区“应用格式”。所有方式均可通过“应用格式”显式完成。按 Esc、再次点击格式刷或点击“取消”退出。

格式刷覆盖粗体、斜体、下划线、删除线、文字颜色、字号和背景高亮，来源未设置的格式会从目标移除。默认格式文字也可作为来源。复制的是显式文字格式，标题的默认大小等段落样式不会被复制；目标链接地址、标题级别、列表、引用、对齐、表格结构和媒体属性保持原样。

混合格式来源会提示重新选择；链接地址或段落类型不同不属于文字格式混合。行内代码和代码块不能作为来源或目标，涉及代码时整次操作不应用。空段落、媒体节点和矩形单元格选区不能作为来源；目标需选择实际文字，支持跨段落及单元格内的普通文字选择。无效目标允许重新选择。

每次格式应用可独立撤销、重做。激活、取消和应用相同格式不产生内容更新。格式刷仅在当前实例内有效；离开组件、窗口失焦、使用其他编辑工具、输入或文档变化（包括图片上传完成）、清空、切换禁用／只读、组件停用或卸载时会取消。组件内部焦点转移、选区移动和滚动不取消。第一版不提供连续刷或跨编辑器复制。

HTML 与 JSON 模型均支持格式刷，继续使用原有内容更新事件及保存回填方式，无需额外配置或数据迁移。

## 媒体节点

- 独占一行的图片：新插入时按素材自身宽度显示，小图不会主动放大，大图会等比例收进编辑区；提供小、中、大、铺满快捷项，桌面仍可等比拖动微调。调整尺寸后可通过独立的“重置大小”恢复默认显示规则；同时支持左中右对齐、图片替代文字、改为跟随文字、替换和删除。
- 跟随文字的图片：用于表情或小图标，提供小图标、标准图标、大图标、超大图标快捷项并按文字基线排列；支持改为独占一行、图片替代文字、替换和删除。
- 视频：提供小、中、大、铺满快捷项，桌面仍可等比拖动微调；调整后可重置为默认铺满，并支持左中右对齐、替换和删除。
- 音频：在可编辑状态下操作原生播放器会同时选中音频并打开悬浮操作栏，不取消或替代播放、暂停、进度和音量等原生行为。悬浮栏提供小播放器、标准播放器、铺满编辑区三档宽度，以及左中右对齐、替换和删除；默认标准播放器并左对齐。音频不提供高度或自由缩放，移动端会自动铺满编辑区，避免播放控件被压缩。

媒体始终插入当前选区。编辑器显式要求 `AFilePicker` 返回完整 `FileItem`，并在写入 Tiptap 前逐项复核类型与 URL：混合选择中的有效项仍会插入，被拒项通过界面反馈和 `media-error` 事件报告；全部无效时不执行插入命令。替换只接受一个完全有效且与当前节点同类型的文件。独占一行的媒体之后使用 Gap Cursor 保持可继续输入，连续插入不会覆盖上一个节点，也不会为此向 HTML 写入尾随空段落。文档开头的空段落紧邻独占图片、视频或音频时，可在该空段落中按退格删除空行并将媒体上提；包含空格或其他字符的段落仍按普通内容删除。超高媒体以媒体 DOM 与正文滚动视口的可见交集作为 BubbleMenu 锚点，完全滚出时隐藏、重新进入时恢复。图片替代文字通过 Popover 按需编辑。移动端隐藏拖动柄，以尺寸预设作为主要调整方式；悬浮操作栏使用受正文宽度约束的单行分组，可横向访问全部操作。

界面只显示上述操作结果名称，不向普通用户展示 CSS 尺寸或节点术语。图片和视频始终保持比例且不超过编辑区宽度；拖动和外部 HTML 中的超限尺寸都会收敛到 100% 以内。内部序列化契约保持稳定：独占一行的图片使用 `data-display="block"`、`data-width`、`data-align`；跟随文字的图片使用 `data-display="inline"`、`data-size`；视频使用百分比 `data-width` 和 `data-align`；音频使用 `compact | standard | full` 的 `data-width` 与 `data-align`。重新解析 HTML 会恢复布局，输入中的任意 `style`、无效枚举值和不安全 URL 不会进入规范化输出。

## Events

| 事件                        | 参数                         | 说明                                 |
| --------------------------- | ---------------------------- | ------------------------------------ |
| `update:modelValue`         | `string` 或 `TiptapDocument` | 内容变化；参数与 `valueFormat` 对应  |
| `change`                    | `string` 或 `TiptapDocument` | 内容变化；参数与 `valueFormat` 对应  |
| `focus`                     | 无                           | 编辑区获得焦点                       |
| `blur`                      | 无                           | 编辑区失去焦点                       |
| `media-error`               | `TiptapMediaError`           | 素材校验拒绝或编辑器命令失败         |
| `content-error`             | `TiptapContentError`         | 模型格式不匹配或 JSON 文档结构非法   |
| `image-upload-state-change` | `TiptapImageUploadState`     | 图片排队、上传、失败数量及 `canSave` |
| `image-upload-error`        | `TiptapImageUploadError`     | 图片来源、文件、原因及可选底层错误   |
| `paste-warning`             | `TiptapPasteWarning`         | 跳过图片的原因及数量                 |

`TiptapMediaError` 包含 `operation`、`mediaType`、`reason`、`attemptedItems` 和 `rejectedItems`；底层命令抛错时还包含 `cause`。`invalid-selection` 可能伴随部分成功，应用应以 `rejectedItems` 判断被跳过的素材；`command-failed` 表示本次有效素材未能写入或替换。

`TiptapContentError` 包含 `phase: 'initial' | 'update'`、`reason: 'format-mismatch' | 'invalid-document'` 及可选的 `cause`。格式不匹配、未知节点或非法文档结构会拒绝整次输入：初始化失败保持空编辑器，外部更新失败保留原内容；均不回写空值，不自动弹提示。属性按现有允许值规范化，不安全媒体节点剔除，不安全链接移除标记并保留文字。应用可监听事件提供自己的错误反馈。

## 实例方法

| 方法                    | 返回                     | 说明                              |
| ----------------------- | ------------------------ | --------------------------------- |
| `focus()`               | `boolean \| undefined`   | 聚焦编辑区                        |
| `clear()`               | `boolean \| undefined`   | 清空内容并触发模型更新            |
| `getHTML()`             | `string`                 | 获取当前 HTML；空文档返回空字符串 |
| `getJSON()`             | `TiptapDocument`         | 获取当前文档的独立 JSON 快照      |
| `getImageUploadState()` | `TiptapImageUploadState` | 获取独立的图片任务状态快照        |

两种模式均可调用 `getHTML()` 和 `getJSON()`。`clear()` 的事件参数遵循当前模型格式。

## 安全边界

全部媒体节点只接受 HTTP(S) 或相对 URL。视频和音频序列化时固定输出 `controls` 和 `preload="metadata"`，不会保留 `autoplay`。类型不匹配、URL 为空或协议不安全的素材不会插入或替换正文。

编辑器会按 Tiptap schema 解析输入，但不代替服务端内容安全策略。HTML 和 JSON 都需要服务端校验；应用在公开页面渲染保存或转换得到的 HTML 前，仍需按自身允许标签、属性和 URL 协议执行可信 HTML 清洗。

新增文字格式需要消费方清洗和渲染端允许相应的 `span`、`mark` 以及白名单颜色／字号属性。组件侧回填通过不等于消费方最终页面样式已验证。

## 表单与公开实例契约

disabled 继承 Arco Form，readonly 保留阅读及媒体播放；编辑、上传、工具栏和媒体操作共享同一禁用边界。外层字段的 input/change/focus/blur 校验与编辑操作衔接，状态切换本身不发出模型更新或 change。

公开类型 `ATiptapEditorExposed` 包含 focus、clear、getHTML、getJSON、getImageUploadState。valueFormat 是实例创建时的文档格式，切换 HTML／JSON 格式需重建实例；普通模型回显不重建编辑器。组件使用 minHeight/maxHeight 定义画布，不提供整体 size。class/style 和原生根属性附在编辑器根节点。

focus/clear 返回 Tiptap 命令的布尔结果；编辑器尚未就绪时返回 undefined。内部工具栏和文件选择控件不提前触发正文的 change 校验，只有正文实际更新才校验该字段；首次渲染即提供 readonly/disabled/invalid 的 ARIA 状态。
