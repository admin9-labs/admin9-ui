# Changelog

本文件记录 `@admin9-labs/admin9-ui` 的公开版本变更。GitHub Release Notes 直接取自对应版本章节。

## [Unreleased]

### Changed

- AFilePicker 与 AImagePicker 未设置 `pageSize` 时根据可用空间自动分页，默认网格最多五列、三行；显式正整数保留固定数量，需要原默认容量的调用方可传入 `24`。服务端实际分页容量用于后续翻页，跨页选择草稿保持不变。
- 文件选择弹窗采用受视口限制的稳定高度，标题、工具栏、反馈与底部操作在翻页和筛选时保持位置；分组目录独立滚动，窄屏删除与移动收进“更多”。显式大容量、自定义超高内容等情况下仅文件结果区滚动。
- 文件库网格缩略图改为 4:3 展示框与 `contain`，完整展示服务提供的图片，避免组件对图片边缘进行裁剪；AImagePicker 字段外层的展示模式与填充选项保持独立。

### Fixed

- 修复手机横屏时文件区塌缩导致无法选图或首次查询一直等待的问题，矮屏正文启用滚动兜底；修复窄屏移动分组后焦点离开弹窗的问题。
- 文件选择器显式引入 Arco Pagination，使按需样式消费构建包含分页样式，避免底栏增高和自动分页容量变化。

## [0.26.0] - 2026-09-29

### Added

- 文件选择器新增独立的 `canDeleteFiles`、`canMoveFiles` 开关及可选服务能力，支持确认删除、一级／二级分组与未分组移动、跨页选择及部分成功反馈；素材操作不检查业务使用情况，也不自动修改字段或编辑器内容。

- AFilePicker 支持可选 `createGroup` 服务能力和独立的 `canCreateGroup` 开关，在桌面与窄屏创建一级、二级分组；AImagePicker、ACoverPicker 和 ATiptapEditor 透传该开关。

### Changed

- 文件选择工具栏将搜索、删除、移动、视图和上传合并排列；空间足够时保持一行，搜索框自动分配剩余宽度，窄屏按需换行。

- 文件网格通过整卡点击切换选择，单选也可再次点击取消；仅选中时显示边框与顺序编号，列表保留行首勾选框。单选隐藏已选计数，图片范围使用图片标题与空态；上传不再显示原始 accept 参数，队列汇总省略零计数并包含已取消任务。

### Fixed

- 修复跨页选择携带旧分组信息时移动被跳过的问题，移动统一提交选中 ID，由服务幂等处理；修复 320px 英文界面的删除／移动操作组横向溢出。

- 图片预览先通过受控状态关闭再卸载，修复关闭预览后 Escape 无法继续关闭文件选择器的问题。

- 修复 AFilePicker 弹窗布局覆盖与 Arco 默认居中机制冲突产生额外滚动区域、导致标题和关闭按钮被卷出屏幕的问题；恢复默认居中，长内容仅在正文区域滚动。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.25.0...v0.26.0

## [0.25.0] - 2026-09-28

### Changed

- 文件选择器分组入口统一使用黄色文件夹图标，包括全部文件、未分组及各级分组；父分组使用打开/关闭文件夹切换展开状态，合并原箭头和重复图标；选中的无子分组目录显示打开形态；父分组默认展开，首次选择时展开，再次点击名称切换展开/收起，图标同步反映实际展开状态。

- AFilePicker 支持 `FileGroup.parentId` 表达二级分组；桌面可展开子分组，窄屏显示完整路径。验收示例覆盖父子分组、混合类型、空子分组及子分组上传。

- 文件条目的预览/打开移到信息区，支持鼠标悬停、键盘聚焦和触屏常驻，统一选择与不可用状态；字段回显采用紧凑文件行，底部仅以纯文本展示已选数量及上限，不再提供折叠清单或窄屏已选面板。
- 新增 FileUploadRejection 类型及 file-type/file-format 失败原因；受控类型/格式拒绝显示明确提示并禁止无效重试，编辑器粘贴/拖放同步使用 unsupported-image 语义。

- **Breaking**：文件分组改为跨类型分组；`listGroups()` 不再接收类型，`FileListParams.groupId` 可与单类型、类型集合及全部类型查询组合。`AFileUploader`、`FileUploadOptions` 和任务快照改用 `fileTypes` 允许集合，移除强制单类型 `fileType`；adapter/后端负责识别真实类型。消费方须按迁移说明更新。
- AFilePicker 改为左侧分组、搜索框前的类型下拉筛选，支持整卡/整行选择、独立预览、已选数量及默认字段文件回显。上传只入库，显式确认才写回字段。
- 文件选择与上传组件直接提供成功摘要、选择上限、可读大小限制和空态提示；类型/搜索切换保留上传，上传期间锁定目标分组，空结果与加载失败隐藏分页。

### Fixed

- 修复文件卡片选中与聚焦时出现双层外框的问题，键盘焦点提示改为作用于实际选择控件。

- 修复图片预览的键盘访问与关闭焦点恢复，支持 Tab 循环、Enter/Space 连续操作时保持当前控件焦点，以及 Escape 仅关闭最上层预览。

- AFilePicker 重新打开时统一重置分组、类型、搜索和页码；空字段的空选择禁止确认，保留显式清空及非法值规范化提交。上传成功反馈移至工具栏下方，默认单选操作去重，尝试超限时才短暂提示，隐藏分组数量与单页分页。
- AFilePicker 窄屏改为分组下拉，底部保留已选数量、取消和确认；列表行更紧凑。

- 修复 AImagePicker 的 Upload 依赖未被 Arco 按需样式插件识别，导致生产构建中默认上传入口未隐藏、空态出现额外加号的问题。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.24.1...v0.25.0

## [0.24.1] - 2026-09-26

### Fixed

- 修复 AImagePicker 在自然收缩的 flex、grid 或 fieldset 容器中按按钮文字收窄，导致空态和图片卡片未保持展示模式参考宽度的问题；明确窄容器仍通过 max-width 安全收缩。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.24.0...v0.24.1

## [0.24.0] - 2026-09-26

### Added

- AImagePicker 新增 square、landscape、portrait、banner 四种语义展示模式及 contain、cover 缩略图填充方式；模式切换仅改变外观，不影响受控值或选图草稿。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.23.0...v0.24.0

## [0.23.0] - 2026-09-26

### Added

- 新增 AImagePicker，提供受控单图／多图卡片、预览、更换、移除、数量上限、自定义入口和隐藏列表；复用 AFilePicker 弹窗内已有上传能力，上传成功后仍需选择并确认。

### Fixed

- AFilePicker 关闭后优先恢复到本次实际触发控件，支持包含多张图片操作的自定义入口；失效控件回退到可用入口。
- AProTable 工具栏始终先渲染业务操作，再渲染内置刷新按钮。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.22.0...v0.23.0

## [0.22.0] - 2026-09-13

### Added

- ATiptapEditor 新增单次文字格式刷，支持鼠标、键盘和触摸选择后应用；覆盖目标文字外观并保留链接与文档结构，支持独立撤销。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.21.0...v0.22.0

## [0.21.0] - 2026-09-13

### Changed

- **Breaking:** AProTable 使用官方 `selectedKeys`、`selection-change` 和 `(keys, key, record)` 的 `select` 契约；操作插槽仅保留 `actions`，refresh 仅接受选项对象，公共 Action/Slot 改为 ProTableAction/ProTableActionSlot；删除 Admin9UIOptions 兼容别名。
- **Breaking:** AFileUploader 的 maxFiles 改为 limit；AFilePicker 的 initialView 改为 defaultView，change 与 modelValue 同形，新增 confirm 数组事件；ACoordinatePicker 的 searchEnabled 改为 allowSearch。
- **Breaking:** FilePicker/CoverPicker 的外部值回显不再自动回写或发出 change；FilterForm 重置恢复 FormItem 初值，并转发官方提交事件和公开 Form 方法。
- 自定义表单控件衔接 Arco 禁用、尺寸和提交校验；补充官方 mini 尺寸、readonly、组件公共类型及 ChatComposer 原生 textarea 属性/事件。

### Fixed

- 文件及封面选择器在外部值需要归一化时，用户明确确认／清空会提交规范值，同时保持回显不写回和重复操作去重。
- 富文本内部文件选择不再提前校验旧正文，初次渲染正确提供 ARIA 状态；公开 focus/clear 方法类型与实际返回值一致。
- 负数 maxLength 先归一化为 0，避免聊天输入被底层 Textarea 截断；非字符串文件 URL 按无效 adapter 结果处理。

- ChatComposer 的 maxLength 小于等于 0 时按无限制处理，autoSize 支持 Arco 的 boolean 形式。

- 修复 ProTable 真实勾选未通知父组件、pageSize 更新不生效，以及表格/文件请求卸载后仍回写的问题。
- 修复上传重试绕过文件限制、禁用时仍可通过命令上传、未验证响应被报告为上传成功的问题；文件预览和下载拒绝不安全 URL 协议。
- 修复聊天输入框和编辑器在 FormItem 中未填满字段、原生 readonly 未生效，以及编辑器英文字号菜单文字重叠。
- 修复文件、坐标和表格搜索未处理 Enter 的问题。
- 修复地图空搜索加载状态残留、SDK 配置变更未重新初始化，以及 Tiptap 切换禁用状态产生伪内容变更的问题。

### Added

- 新增 `ACoverPicker`，支持单图、三图和无封面模式、`mini / small / medium / large` 四档尺寸（未继承 Form 尺寸时默认 `medium`），以固定位置选择、替换及移除图片，并复用 `AFilePicker` 的浏览与上传流程。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.20.0...v0.21.0

## [0.20.0] - 2026-09-13

### Added

- `AChatComposer` 新增 `size="small | medium | large"`，统一控制 Card 密度和默认操作按钮，并通过所有作用域插槽共享当前尺寸。

### Changed

- `AChatComposer` 将文本区和底部工具栏融合进同一外框，使用无内框输入区与圆形发送／停止按钮，减少嵌套表单感。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.19.0...v0.20.0

## [0.19.0] - 2026-09-12

### Added

- `AChatComposer` 支持 `autoSize`、`maxLength` 和受提交守卫保护的 `action` 插槽，可定制输入行数、长度及发送／停止按钮。
- `maxLength` 的输入截断与提交校验统一按 Unicode 码点计数，保留完整 Emoji 等补充字符。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.18.0...v0.19.0

## [0.18.0] - 2026-09-12

### Added

- 新增 `AChatMessageList`，支持受控消息、默认角色头像、助手 Markdown、生成状态、历史阅读位置保持及流式滚动跟随；提供正文、引用和操作插槽。
- 新增 `AChatComposer`，支持受控多行输入、中文输入法、发送／停止事件及附件操作插槽；`submitDisabled` 仅限制发送，不影响停止生成。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.17.0...v0.18.0

## [0.17.0] - 2026-09-10

### Added

- `ATiptapEditor` 支持粘贴和拖拽 PNG、JPEG、GIF、WebP 图片，提供原位上传进度、失败重试、删除取消，以及图片上传状态事件和提交前检查方法。
- 新增附件链接插入、链接显示文字编辑、清除文字格式、TSV 表格数据粘贴和表格单元格合并／拆分操作；图文粘贴跳过不可访问图片时提供提示事件。
- 新增文字颜色、背景高亮和预设字号，支持 HTML／JSON 保存回填；显式文字颜色保持原色，默认色跟随主题。

### Changed

- `canUploadImage` 同时控制图片选择器上传、剪贴板图片上传和外部图片文件拖入；默认仍为 `false`。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.16.0...v0.17.0

## [0.16.0] - 2026-09-10

### Added

- `ATiptapEditor` 新增 `valueFormat="json"`，支持结构化文档的初始化、编辑输出和回填；默认 HTML 用法保持兼容。
- `ATiptapEditor` 新增 `getJSON()`、`content-error` 事件及对应公开类型，JSON 输入会校验文档结构并规范化媒体、链接和表格属性。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.15.0...v0.16.0

## [0.15.0] - 2026-09-10

### Added

- `ATiptapEditor` 支持 HTML 表格载入、编辑和输出，提供增删行列、切换表头、删除表格及列宽拖动操作。
- 表格插入使用 8 行 × 10 列的尺寸选择网格，支持实时预览、方向键选择、Enter 插入和 Esc 关闭；默认使用普通单元格，小屏保留完整选择范围。
- 表格支持局部横向滚动及主题色选区高亮；初始只读或禁用后切回编辑仍可拖动列宽。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.14.0...v0.15.0

## [0.14.0] - 2026-09-10

### Added

- `AFilterForm` 新增 `fieldFlex`，按字段名设置同行宽度权重；`cols` 继续控制每行字段数量，不完整行保留默认权重的空位。

### Changed

- `AFilterForm` 的 label 保持左对齐：桌面按自身内容占宽，`767px` 及以下的小屏统一 label 宽度以对齐控件；label 区域与控件固定间隔 `12px`。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.13.1...v0.14.0

## [0.13.1] - 2026-09-06

### Changed

- `AFilterForm` 字段标题默认左对齐，统一多列筛选场景下的标签起点。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.13.0...v0.13.1

## [0.13.0] - 2026-09-05

### Added

- `AProTable` 新增 `refreshHandler` 复合刷新入口；内置刷新按钮可在统一 loading 与防重复点击状态下刷新附属数据，并通过 context `refresh()` 按需刷新表格。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.12.0...v0.13.0

## [0.12.0] - 2026-09-05

### Added

- `AProTable` 新增可选 `title`、`surface-title` 与 `before-table` 内容区域，以及最终有效结果的 `data-change` 事件。
- 新增白名单化的 `selectionOptions`、`paginationOptions`，并提供 `invalidate()` 主动失效请求和对象形式的 `refresh()` 参数。

### Changed

- 当前页多选模式会在页面条件变化前清选，并在最终数据接受后修正失效 key；请求失效不会清空现有数据、分页或选择。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.11.0...v0.12.0

## [0.11.0] - 2026-09-05

### Added

- `AProTable` 新增按需渲染的轻量左右工具栏、独立 `refreshable` 控制、可选无标题数据工作台表面，以及 `toolbar-left`、`toolbar-right` 公共插槽。

### Changed

- 关键词搜索仍默认附带内置刷新按钮；消费方可以显式关闭刷新，并继续通过插槽拥有新增、导入、导出和批量操作等业务命令。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.10.1...v0.11.0

## [0.10.1] - 2026-09-05

### Fixed

- 补齐 `AProTable` 的无分页模式、可选重置页码刷新、`loading-change` 事件和页码越界回退，并从包根入口导出完整公共类型。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.10.0...v0.10.1

## [0.10.0] - 2026-09-05

### Added

- `AProTable` 新增泛型 `Action`、`Slot` 类型、权限过滤的配置式行操作，以及 `actions`、`footer` 和全局 `popover` 插槽。

### Changed

- `AProTable` 刷新时默认保留当前数据；调用方可通过 `doRequest({ clearCurrentData: true })` 显式清空后再请求。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.9.1...v0.10.0

## [0.9.1] - 2026-09-03

### Changed

- `AFilterForm` 默认提供 Arco 主题背景、响应式内边距和 `4px` 圆角，可直接作为列表页筛选容器使用。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.9.0...v0.9.1

## [0.9.0] - 2026-09-03

### Removed

- 移除页面级 `AFileManager`、对应组件文档与仅供其使用的删除、移动、分组管理 service 公共契约。
- 移除未被其余文件组件消费的 `FileListResult.typeCounts`。

### Changed

- `Admin9UIPluginOptions.fileService` 收窄为 `FilePickerAdapter`，继续供 `AFilePicker`、`AFileUploader` 和 `ATiptapEditor` 复用浏览与可选上传能力。

### Fixed

- 修正全局组件重名警告，移除对未随 npm package 发布的设计文档引用，并提供可执行的本地别名建议。

### Upgrade notes

- 文件管理页面属于消费应用；需要删除、移动或分组管理时，由应用使用 Arco Design Vue 与自身 API、权限和业务字段组合实现。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.8.0...v0.9.0

## [0.8.0] - 2026-09-03

### Added

- 新增公开组件 `AFilterForm`，根据响应式列数和字段数量自动提供单行、多行与首行折叠筛选布局。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.7.0...v0.8.0

## [0.7.0] - 2026-08-20

### Added

- 新增公开组件 `AFileUploader`，基于现有单文件上传能力提供本地批量队列、进度、取消、重试、部分成功和结果校验。

### Changed

- `AFilePicker` 与 `AFileManager` 复用统一上传队列；聚合视图和上传进行中仍可继续选择文件，默认不限制本地文件格式，Picker 上传后不再自动改变选择草稿。

### Fixed

- 修复 `ATiptapEditor` 图片、视频、音频插入按钮和选中媒体后的替换按钮无法打开 `AFilePicker` 的问题。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.6.1...v0.7.0

## [0.6.1] - 2026-08-14

### Fixed

- 修复 `ATiptapEditor` 无法通过退格删除独占图片、视频或音频前首个空段落的问题。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.6.0...v0.6.1

## [0.6.0] - 2026-08-13

### Removed

- 移除独立的 `AMediaPicker`、`AMediaLibrary` 及全部 Media service 公共契约。

### Changed

- `ATiptapEditor` 的图片、视频和音频选择改用 `AFilePicker`、`FilePickerAdapter` 与 `fileService`。

### Upgrade notes

- 消费方将 `mediaService` 迁移为 `fileService`，并将 `MediaItem` 适配为 `FileItem`；编辑器的 `service` prop 也改为 `FilePickerAdapter`。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.5.0...v0.6.0

## [0.5.0] - 2026-08-13

### Added

- 新增腾讯地图 `ACoordinatePicker`，支持地点搜索、地图点选、经纬度输入、清空与确认，并保持消费方密钥和业务字段边界。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.4.0...v0.5.0

## [0.4.0] - 2026-08-12

### Added

- 新增页面级 `AFileManager`，支持六类文件的准确分页浏览、类型内单级分组、上传、移动和删除，并按 adapter 能力启用管理操作。
- 新增表单级 `AFilePicker`，支持单选或多选、跨页选择、文件类型限制、可选上传和响应式弹窗交互。
- 新增共享文件 service 契约与 `fileService` 插件注入，包括 `FileItem`、`FileType`、浏览、上传、分组、移动和删除能力类型。

### Upgrade notes

- 文件组件不包含具体 API、认证或权限逻辑；消费方必须提供满足准确服务端筛选、分页及文件安全校验要求的 adapter。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.3.1...v0.4.0

## [0.3.1] - 2026-08-11

### Fixed

- 编辑器边框只在正文实际获得焦点时显示主色，避免悬停状态被误认为正在编辑。
- 点击原生音频控件时会选中对应媒体节点，同时保留播放、暂停、进度和音量操作。

### Changed

- 仓库开发、CI 和发布验证工具链统一使用 Node 24；这不改变 npm 包的消费方运行时要求。

### Upgrade notes

- 本版本不包含公共组件、类型或运行时 API 变更。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.3.0...v0.3.1

## [0.3.0] - 2026-08-10

### Added

- 新增 `ATiptapEditor`，提供常用富文本格式、字符限制，以及图片、视频和音频的插入、替换、尺寸与对齐编辑。
- `AIconPicker` 补齐官方分类、全局搜索、键盘导航、只读/禁用状态和表单属性转发。

### Changed

- 素材 service 按能力拆分为 `MediaBrowseService`、`MediaUploadCapability`、`MediaRemoveCapability`、`MediaGroupCapability`、`MediaMoveCapability`、`MediaPickerService` 和 `MediaLibraryAdapter`；完整 service 类型继续作为兼容组合保留。
- `AMediaPicker` 使用显式 `valueType` 决定模型返回完整 `MediaItem` 还是 URL，并新增 `selection-change` 表达弹窗中的草稿选择；`select` 保留为弃用兼容别名。
- `AMediaLibrary` 会根据能力开关校验 adapter，仅在移动或删除能够消费选择时显示选择界面。

### Fixed

- 素材选择、媒体插入与悬浮媒体工具栏在重复确认、部分无效素材、连续块媒体和窄视口下保持一致行为。

### Upgrade notes

- `AMediaPicker.canUpload` 默认值由 `true` 改为 `false`；需要上传时必须显式开启并提供 `MediaUploadCapability`。
- 使用 URL 模型的消费方应显式设置 `valueType="url"`；监听草稿选择的新代码应改用 `selection-change`。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.2.0...v0.3.0

## [0.2.0] - 2026-08-10

### Added

- 新增页面级 `AMediaLibrary`，支持素材浏览、单级分组、上传、单项或批量移动与删除，以及跨页选择。
- 素材契约新增 `MediaType`、`MediaGroup`、分组管理和素材移动相关类型。
- 建立真实 npm tarball 构建与隔离 Vue 消费工程验证，覆盖入口、类型、样式和组件挂载。

### Changed

- `MediaItem` 增加必需的 `type`、`groupId` 字段；列表和上传参数增加 `mediaType`、`groupId`，消费方 adapter 需要完成相应映射。
- npm tarball 开始包含组件使用文档，并完善 locale 的 TypeScript 4.9 解析映射。
- GitHub Actions 成为 CI 与 npm Trusted Publishing 的发布权威。

### Removed

- 从公共 API 移除 `AUserPicker`、`useModal`、`useLoading`、`useVisible` 及用户 service 相关类型；应用基础设施与业务实体选择器留在消费应用。

### Upgrade notes

- 从 `0.1.0` 升级时，需要移除上述已删除导入，并让素材 adapter 返回带稳定 `id`、`type`、`groupId` 的 `MediaItem`。

**Full Changelog**: https://github.com/admin9-labs/admin9-ui/compare/v0.1.0...v0.2.0

## [0.1.0] - 2026-08-09

### Added

- 首次公开发布基于 Vue 3 和 Arco Design Vue 的 `@admin9-labs/admin9-ui`。
- 提供 ESM、CommonJS、TypeScript 声明、统一样式和中英文 locale 入口。
- 初始公共组件包括 `AMediaPicker`、`AIconPicker`、`AUserPicker` 和 `AProTable`，并包含当时的 `useModal`、`useLoading`、`useVisible` 导出。
