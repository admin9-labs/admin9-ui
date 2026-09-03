# @admin9-labs/admin9-ui 设计文档

本文记录组件库当前的架构边界和公共设计原则。组件的具体 Props、Events、Slots 与可观察行为以对应组件文档和源码为准。

## 1. 定位

`@admin9-labs/admin9-ui` 是基于 Vue 3 与 Arco Design Vue 的中后台通用组件库，补充可跨应用复用的组件能力。

组件库负责：

- 可跨应用复用的组件、交互和类型契约；
- 后端无关的 service 接口；
- 可合并到应用 vue-i18n 实例的 locale messages；
- ESM、CommonJS、TypeScript declarations 和统一样式入口。

组件库不负责：

- 具体网络端点、请求封装和响应格式；
- 应用身份、状态管理、导航和权限体系；
- 具体业务字段及应用 service adapter；
- 通用 hooks、工具函数和应用基础设施；
- Admin9 应用共享层的 `Grid`、`GridToolbar` 和 `GridTable`。

组件内部可以使用私有 helper，但这些实现不属于公共 API。

## 2. 公共能力

| 导出                                       | 定位                            | 数据依赖                 |
| ------------------------------------------ | ------------------------------- | ------------------------ |
| default `Admin9UI`                         | 全局组件注册与默认 service 注入 | 可选文件 adapter         |
| `ACoordinatePicker`                        | 腾讯地图坐标搜索与点选          | 应用提供腾讯地图 API Key |
| `AFilePicker`                              | 表单级文件浏览与选择            | `FilePickerAdapter`      |
| `AFileUploader`                            | 本地批量上传队列                | `FileUploadCapability`   |
| `AFilterForm`                              | 列表页自适应筛选表单            | 无                       |
| `AIconPicker`                              | Arco 图标搜索与选择             | 应用注册或渲染 Arco 图标 |
| `AProTable`                                | fetcher 驱动的页面级表格        | fetcher prop             |
| `ATiptapEditor`                            | HTML 富文本编辑器               | 可选 `FilePickerAdapter` |
| `Admin9UIPluginOptions` 及相关公共类型     | 插件配置与文件 adapter 契约     | 应用实现                 |
| `messages`、`localePrefix`、`zhCN`、`enUS` | 中英文 locale                   | 应用 i18n 实例           |
| `arcoIconNames`                            | 图标名清单                      | Arco 图标                |
| `@admin9-labs/admin9-ui/styles`            | 组件统一样式入口                | 无                       |

`Admin9UIPluginOptions` 专指 `app.use(Admin9UI, options)` 的插件配置对象。`Admin9UIOptions` 是弃用的兼容别名。

组件采用 `A` 前缀以保持与 Arco 生态一致。全局安装检测到同名组件时会提示冲突；需要隔离时，应用可以按需导入并使用本地别名。

## 3. Service 契约

组件只调用注入的接口，不感知数据来源，也不处理应用级认证和响应转换。

```ts
export type FileType = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';

export interface FileBrowseCapability {
  list(params: FileListParams): Promise<FileListResult>;
  listGroups?(fileType: FileType): Promise<FileGroup[]>;
}

export interface FileUploadCapability {
  upload(options: FileUploadOptions & { fileType: FileType }): Promise<FileItem>;
}

export type FilePickerAdapter = FileBrowseCapability & Partial<FileUploadCapability>;
```

应用可以在组件使用点传入 `service`，也可以在安装插件时提供默认值：

```ts
app.use(Admin9UI, {
  fileService,
});
```

使用点的 `service` prop 优先。缺少必需能力时，组件会给出明确错误，不会自行发起或猜测网络请求。

文件契约遵循以下原则：

- 聚合查询省略 `fileTypes` 表示全部六种类型，显式空数组表示无匹配结果；
- adapter 必须先在完整数据集上筛选，再分页并返回准确的 `pagination.total`；
- 只有具体 `fileType` 查询可以携带 `groupId`，上传和 `listGroups` 始终使用具体类型；
- 多个本地文件通过现有单文件 `upload` 能力逐项处理，不增加 batch service；
- 删除、移动、分组管理及其权限属于应用，不进入公共 service 契约。

完整字段和行为见 [AFilePicker](./docs/components/file-picker.md) 与 [AFileUploader](./docs/components/file-uploader.md)。

## 4. 组件边界

- [ACoordinatePicker](./docs/components/coordinate-picker.md) 只提交坐标和确认来源，不绑定地址、门店等业务字段，也不负责坐标系转换。
- [AFilePicker](./docs/components/file-picker.md) 负责浏览、筛选、选择草稿与确认写回；上传完成只刷新列表，不自动选择文件。
- [AFileUploader](./docs/components/file-uploader.md) 负责本地文件队列、进度、取消、重试和部分成功，不提供网络文件或扫码上传。
- [AFilterForm](./docs/components/filter-form.md) 默认提供可直接放入列表页的卡片式表面，负责响应式筛选布局与表单事件，不管理标题、分页、请求和业务默认值。
- [AIconPicker](./docs/components/icon-picker.md) 分发图标名和分类元数据，不将全部 SVG 实现打入包。
- [AProTable](./docs/components/pro-table.md) 收敛 fetcher、加载状态和分页，不包含查询表单、工具栏、导出和业务行操作。
- [ATiptapEditor](./docs/components/tiptap-editor.md) 负责编辑器 schema、交互和安全序列化，不提供业务模板、协同编辑或服务端 HTML 清洗。

这些边界用于判断新能力是否属于组件库：只有能够跨应用复用、且确实补充 Arco Design Vue 通用场景的组件能力才进入公共 API。

## 5. 国际化与样式

组件库不创建独立 vue-i18n 实例：

- messages 使用 `admin9Ui.<component>.<key>` 前缀；
- `@admin9-labs/admin9-ui/locale` 提供 ESM、CommonJS 和类型入口；
- 应用将 messages 合并到自己的 i18n 配置；
- 组件通过应用提供的 i18n 实例读取当前语言。

样式遵循以下原则：

- 使用 scoped Less 和 Arco CSS variables；
- 不依赖 Tailwind、应用源码路径、alias 或环境变量；
- 公共样式通过 `@admin9-labs/admin9-ui/styles` 导入；
- `sideEffects` 保留 CSS、Less 和 Vue 文件的样式副作用；
- 暗色外观跟随 Arco theme variables。

## 6. 包交付契约

| 入口                 | 产物                     |
| -------------------- | ------------------------ |
| package main import  | `dist/index.js`          |
| package main require | `dist/index.cjs`         |
| package types        | `dist/index.d.ts`        |
| `./styles`           | `dist/style.css`         |
| `./locale` import    | `dist/locale/index.js`   |
| `./locale` require   | `dist/locale/index.cjs`  |
| `./locale` types     | `dist/locale/index.d.ts` |

Vue、Arco Design Vue 和 vue-i18n 是 peer dependencies。Tiptap 是运行时依赖并与 peer dependencies 一样从 library bundle external，由应用依赖树统一解析。

发布包包含构建产物、README、CHANGELOG、License 和组件使用文档，不包含源码、测试、验收应用、维护手册或历史决策记录。

## 7. 约束与风险

- service 接口保持数据源无关，新增字段前需要证明跨应用复用价值；
- 根入口不导出 hooks、composables 或工具函数；
- `0.x` 阶段的公共导出仍可能演进，不兼容调整必须记录在 CHANGELOG；
- `A` 前缀可能与 Arco 后续组件重名，当前通过安装时检测提示风险；
- CommonJS 入口仅在持续消费验证通过时保留，无法可靠交付时应通过新版本明确移除。
