# Changelog

本文件记录 `@admin9-labs/admin9-ui` 的公开版本变更。GitHub Release Notes 直接取自对应版本章节。

## [Unreleased]

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
