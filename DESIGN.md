# @admin9-labs/admin9-ui 设计文档

> 状态：独立公开 package 设计基线 v2
>
> 更新日期：2026-08-09

## 1. 定位

`@admin9-labs/admin9-ui` 是基于 Vue 3 与 Arco Design Vue 的中后台通用组件库，专门补充 Arco Design Vue 官方未提供、且中后台项目普遍需要的组件。
它以独立 Git 仓库和公开 npm package 维护，消费方只通过 package exports 使用构建产物。

组件库负责：

- 可跨应用复用的组件、交互和类型契约；
- 后端无关的 service 接口；
- 可合并到宿主 vue-i18n 实例的 locale messages；
- ESM、CJS、TypeScript declarations 和单一样式入口。

组件库不负责：

- 具体网络端点、请求封装或响应信封；
- 应用身份、状态管理、导航和权限体系；
- 具体业务字段或应用 service adapter；
- 通用 hooks、工具函数或宿主应用基础设施；
- Admin9 应用共享层的 `Grid`、`GridToolbar` 和 `GridTable`。

组件内部可以使用私有状态 helper，但这些实现不属于 package 公共 API。

## 2. 仓库与包结构

```text
admin9-ui/
├── .github/workflows/ci.yml
├── .node-version
├── docs/components/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.lib.ts
├── tests/
└── src/
    ├── index.ts
    ├── components/
    │   ├── icon-picker/
    │   ├── media-library/
    │   ├── media-picker/
    │   ├── pro-table/
    │   └── tiptap-editor/
    ├── internal/
    ├── hooks/
    ├── locale/
    ├── services/
    └── styles/
```

包名固定为 `@admin9-labs/admin9-ui`。版本 `0.1.0` 是公开首发版本，当前版本为 `0.2.0`；在 `0.x` 阶段继续遵循语义化版本，但不承诺 1.0 级别的兼容稳定性。

## 3. 公开能力

| 导出                                                   | 定位                            | 数据依赖                   |
| ------------------------------------------------------ | ------------------------------- | -------------------------- |
| default `Admin9UI`                                     | 全局组件注册与默认 service 注入 | 可选 `MediaService`        |
| `AMediaPicker`                                         | 素材选择、上传与删除交互        | `MediaService` 注入        |
| `AMediaLibrary`                                        | 页面级素材与单级分组管理        | `MediaLibraryService` 注入 |
| `AIconPicker`                                          | Arco 图标搜索与选择             | 无                         |
| `AProTable`                                            | fetcher 驱动的页面级表格        | fetcher prop 注入          |
| `ATiptapEditor`                                        | Tiptap 驱动的 HTML 富文本编辑器 | 可选 `MediaService`        |
| `Admin9UIPluginOptions`、`MediaService` 及相关公共类型 | 插件配置与素材 adapter 契约     | 消费方实现                 |
| `messages`、`localePrefix`、`zhCN`、`enUS`             | 中英文 locale                   | 宿主 i18n 实例             |
| `arcoIconNames`                                        | 图标名清单                      | Arco 图标全局注册          |
| `@admin9-labs/admin9-ui/styles`                        | 组件统一样式入口                | 无                         |

`Admin9UIPluginOptions` 专指 `app.use(Admin9UI, options)` 的插件配置对象，避免与组件 props 或 service options 混淆。
`Admin9UIOptions` 作为弃用的兼容类型别名保留，避免破坏既有消费者的类型导入。

组件采用 `A` 前缀以保持与 Arco 生态一致。插件安装时会检查同名全局组件并输出冲突警告；若未来 Arco 增加同名组件，再通过新的兼容版本处理命名调整。

## 4. Service 契约

组件库只调用注入的接口，不感知数据来自何处，也不处理应用级认证和响应转换。

### Media capability contracts

```ts
export type MediaType = 'image' | 'video' | 'audio';

export interface MediaGroup {
  id: string;
  name: string;
  count?: number;
}

export interface MediaItem {
  id: string;
  name: string;
  type: MediaType;
  groupId: string | null;
  url: string | null;
  path?: string;
  status?: 'pending' | 'ready' | 'failed';
  size?: number;
  mime?: string;
  extension?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  duration?: number;
  createdAt?: string;
}

export interface MediaListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  mediaType: MediaType;
  groupId?: string | null;
}

export interface MediaListResult {
  list: MediaItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
}

export interface MediaBrowseService {
  list(params: MediaListParams): Promise<MediaListResult>;
  listGroups?(mediaType: MediaType): Promise<MediaGroup[]>;
}

export interface MediaUploadCapability {
  upload(options: {
    file: File;
    mediaType: MediaType;
    groupId: string | null;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  }): Promise<MediaItem>;
}

export interface MediaRemoveCapability {
  remove(ids: string[]): Promise<string[]>;
}

export interface CreateMediaGroupOptions {
  mediaType: MediaType;
  name: string;
}

export interface RenameMediaGroupOptions extends CreateMediaGroupOptions {
  groupId: string;
}

export interface RemoveMediaGroupOptions {
  mediaType: MediaType;
  groupId: string;
}

export interface MoveMediaOptions {
  mediaType: MediaType;
  ids: string[];
  groupId: string | null;
}

export interface MediaGroupCapability {
  listGroups(mediaType: MediaType): Promise<MediaGroup[]>;
  createGroup(options: CreateMediaGroupOptions): Promise<MediaGroup>;
  renameGroup(options: RenameMediaGroupOptions): Promise<MediaGroup>;
  removeGroup(options: RemoveMediaGroupOptions): Promise<void>;
}

export interface MediaMoveCapability {
  move(options: MoveMediaOptions): Promise<string[]>;
}

export type MediaPickerService = MediaBrowseService & Partial<MediaUploadCapability>;
export type MediaLibraryAdapter = MediaBrowseService &
  Partial<MediaUploadCapability> &
  Partial<MediaRemoveCapability> &
  Partial<MediaGroupCapability> &
  Partial<MediaMoveCapability>;

export interface MediaService extends MediaBrowseService, MediaUploadCapability, MediaRemoveCapability {}
export type MediaLibraryService = MediaService & MediaGroupCapability & MediaMoveCapability;
```

能力接口按副作用拆分，组件只在相应功能开启时要求对应方法：

- `MediaBrowseService` 是只读选择与管理表面的最小依赖；`listGroups` 未实现时可隐藏分组导航；
- `MediaUploadCapability`、`MediaRemoveCapability` 和 `MediaMoveCapability` 分别承载上传、删除和移动副作用；
- `MediaGroupCapability` 负责分组浏览与增删改，不把业务权限或非空分组策略放进组件；
- `MediaPickerService` 与 `MediaLibraryAdapter` 是按需能力组合；
- `MediaService`、`MediaLibraryService` 继续保留为完整能力兼容接口，已有 adapter 仍可直接赋值；
- `listGroups(mediaType)` 返回该类型的后端真实单级分组；
- `createGroup`、`renameGroup` 和 `removeGroup` 都使用对象参数并显式携带 `mediaType`；
- `removeGroup` 仅删除分组，不得隐式删除组内素材；非空分组的处理或拒绝由 adapter 明确实现；
- `move` 使用 `groupId: null` 表示移动到未分组，返回成功移动的 ID，以支持部分成功反馈；
- 继承的 `remove(ids)` 同样返回成功删除的 ID；组件只清理已成功 ID 的选择状态。

消费方可以在组件使用点传入 `service`，也可以在插件安装时提供默认 service：

```ts
app.use(Admin9UI, {
  mediaService,
});
```

使用点传入的 service 优先于插件默认值。缺少必需 service 时，组件应给出明确错误，而不是自行猜测网络行为。

## 5. 组件设计

### AMediaPicker

- 表单级轻量选择表面；单个实例只处理一种 `MediaType`，并支持单选或带上限的多选。
- 列表筛选、分页、分组和上传均通过 `MediaService` 交给 adapter，不在分页结果上做前端筛选。
- `listGroups` 保持可选；未实现时 Picker 仍可作为无分组选择器使用。
- 组件只暴露选择、上传和可选删除，不吸收分组管理、批量移动或应用业务能力。
- 能力开关只控制界面；删除默认关闭，后端授权始终由消费方负责。

Props、Events、Slots、状态行为和示例见 [AMediaPicker 使用文档](./docs/components/media-picker.md)。

### AMediaLibrary

`AMediaLibrary` 与 `AMediaPicker` 并存。Picker 服务于表单轻量选择；Library 是后端无关的完整素材管理页面组件，不包含路由、store、鉴权或具体 API。

- 页面级管理表面；在 `MediaService` 之上仅增加单级分组 CRUD 和素材移动所需的 `MediaLibraryService` 窄扩展。
- 后端负责分页、筛选、权限和部分成功结果；组件维护跨页选择，并只清理 service 确认成功的 ID。
- 分组只有一级，`removeGroup` 不得隐式删除素材；更复杂的 DAM 策略留在消费应用。
- 组件可复用包内私有媒体展示实现，但不把 helper、状态或管理逻辑导出为通用 API。
- `refresh()` 与 `clearSelection()` 仅作为组件实例方法暴露，不属于独立 hooks 或工具。

Props、Events、Slots、状态行为和示例见 [AMediaLibrary 使用文档](./docs/components/media-library.md)。

### AIconPicker

- 使用 popover、搜索框、Arco 官方七类分类和固定网格完成选择；“全部”仅为组件内的聚合视图。
- 分类筛选保留当前分类，搜索始终跨全部图标；清空搜索后恢复原分类。
- 图标清单以字符串形式分发，不把全部图标实现打入包。
- 分类属于组件内部元数据，不改变公开 `arcoIconNames` 的数组结构，也不新增分类相关 prop。
- 图标预览依赖消费方注册的 Arco 图标组件。
- `disabled` 与 `readonly` 都阻止打开、选择和清除；`readonly` 保持表单字段可聚焦，`disabled` 使用原生禁用语义。
- 表单属性转发到真实输入；触发器和图标网格支持完整键盘操作，清除是独立的具名按钮。
- 默认渲染继续依赖宿主注册 Arco 图标；`icon` 插槽允许消费方提供按需图标渲染，不把图标注册职责移入组件。
- 输出合法图标名字符串，支持清空。

Props、Events、Slots 和键盘行为见 [AIconPicker 使用文档](./docs/components/icon-picker.md)。

### AProTable

- `AProTable` 对外提供可配置 `rowKey`、fetcher、分页和 action 插槽。
- fetcher 失败时发出 `error(error)` 事件；搜索、刷新按钮、分页和 fetcher 变化等 UI 请求入口会消费失败 Promise，避免产生 unhandled rejection。
- `defineExpose` 的 `refresh()` 仍原样返回 fetcher 链的 Promise，调用方主动调用时必须自行 `await` 并处理拒绝；`clearSelection()` 只通知受控选择清空。
- 它不包含查询表单、工具栏、导出或具体行操作等应用业务能力。
- 应用共享的 Grid 家族保持在消费方，不属于本包迁移范围。

### ATiptapEditor

- 以 HTML 字符串作为 `v-model`，提供标题、基础行内格式、列表、引用、链接、对齐、撤销重做和字符限制。
- 媒体 schema 由 `blockImage`、`inlineImage`、`video`、`audio` 四个 atom 节点组成；图片显示形态只由 `defaultImageDisplay` 或显式转换决定，不根据素材宽高推断。
- 块级图片和视频使用正文容器百分比宽度与左中右对齐；桌面节点视图提供等比拖动且最大不超过正文宽度。块级图片默认按素材自身宽度显示，小图不放大、大图等比收进编辑区；用户调整后可通过独立操作重置为默认规则。行内图片继续使用受控 em 级别并按文字基线排列。音频独立使用 `compact`（约 320px）、`standard`（约 480px）、`full` 三档容器宽度和左中右对齐，默认 `standard + left`，移动端强制通栏，不提供高度或自由拖动调整。
- 上述节点名、百分比、em 和像素值仅属于 schema 与样式实现。界面 locale 使用“独占一行 / 跟随文字”“小 / 中 / 大 / 铺满”“重置大小”“小播放器 / 标准播放器 / 铺满编辑区”等操作结果名称，并为图标按钮提供 Tooltip、`aria-label` 和可选择操作的 `aria-pressed` 状态。
- 主工具栏与媒体上下文栏的普通操作使用 Arco 中性文字和填充变量；只有实际生效的格式、尺寸和对齐状态使用品牌主色，危险删除保留 danger 状态。颜色不是唯一状态信号，切换型按钮同时暴露 `aria-pressed`。
- 媒体节点只持久化校验后的 `data-display`、`data-width`、`data-size`、`data-align` 等属性，不接受任意 `style`。URL 只允许 HTTP(S) 或相对地址；音视频固定输出 `controls` 与 `preload="metadata"`，不保留 `autoplay`。
- 图片、视频和音频通过已有 `MediaService` 与对应类型的 `AMediaPicker` 插入或替换；picker 仅监听 `change`，没有外部选择状态。没有 service 时编辑器保持可用但不显示素材入口。
- 块媒体插入后使用 Gap Cursor 继续输入，并关闭 StarterKit 的 trailing node，不把辅助空段落写入最终 HTML。
- 可编辑节点选中后通过 Tiptap BubbleMenu 显示尺寸、对齐、图片替代文字、显示方式、替换和删除操作；图片替代文字按需在 Popover 中编辑。只读和禁用状态不显示编辑控件，但仍保留音视频播放能力。
- 正文在 `minHeight` 与响应式 `maxHeight` 之间自动增高，达到上限后由正文容器内部滚动；主工具栏和字数统计保持在滚动区外。BubbleMenu portal 到页面浮层层级，不参与编辑器布局，也不主动修改页面或正文滚动位置。
- BubbleMenu 以选中媒体和正文滚动视口的可见交集作为虚拟锚点，使用 Floating UI 自动翻转、边缘位移与尺寸约束；媒体完全离开正文视口时隐藏，重新进入后恢复。
- 移动端媒体上下文栏使用受正文宽度约束的紧凑单行滚动分组，全部操作仍可访问，不压缩正文可视高度。
- 支持禁用和只读状态，并暴露 `focus()`、`clear()` 与 `getHTML()` 实例方法。
- 不内置业务模板、附件、表格、代码高亮、协同编辑或服务端 HTML 清洗；公开展示保存结果前仍由消费方执行可信 HTML 清洗。

## 6. 国际化

组件库不创建独立 vue-i18n 实例，以避免 locale 状态分裂。

- messages 使用 `admin9Ui.<component>.<key>` 前缀；
- `@admin9-labs/admin9-ui/locale` 同时提供 ESM、CJS 和类型入口；
- 消费方将 messages 合并到自己的 vue-i18n 配置；
- 组件内部通过宿主提供的 i18n 实例读取当前语言。

## 7. 样式

- 组件使用 scoped Less 和 Arco CSS variables；
- 不依赖 Tailwind 或消费方源码路径；
- 公共样式通过 `@admin9-labs/admin9-ui/styles` 导入；
- `sideEffects` 明确保留 CSS、Less 和 Vue 文件的样式副作用；
- 暗色外观跟随 Arco theme variables。

## 8. 构建与发布

仓库开发与 CI 使用 Node 20、pnpm 10.5.2，并以 `pnpm-lock.yaml` 固定开发依赖。该工具链基线只约束仓库构建和候选产物验证，不通过 repository-only `packageManager` pin 限制 npm 包消费者。

| 入口                 | 产物                     |
| -------------------- | ------------------------ |
| package main import  | `dist/index.js`          |
| package main require | `dist/index.cjs`         |
| package types        | `dist/index.d.ts`        |
| `./styles`           | `dist/style.css`         |
| `./locale` import    | `dist/locale/index.js`   |
| `./locale` require   | `dist/locale/index.cjs`  |
| `./locale` types     | `dist/locale/index.d.ts` |

Vue、Arco Design Vue 和 vue-i18n 是 peer dependencies，并在构建中 external。Tiptap 是 package 的运行时依赖，同样 external，由消费方依赖树统一解析，避免重复打包编辑器运行时。

发布候选必须完成：

1. `pnpm install --frozen-lockfile` clean install；
2. typecheck、lint、组件测试和验收宿主 typecheck/build；
3. library build 与真实 tarball 内容审计；
4. 同一个真实 tarball 的 ESM、CJS、类型、styles、locale 和生产构建验证。

仓库内测试责任分为三层：

- `tests/*.spec.ts` 使用通用 fake/stub 验证组件输入、事件、插槽和状态契约；
- `dev/` 是使用 fake service 的最小浏览器验收宿主，只验证组件交互与样式，不承担业务应用职责；
- `pnpm run verify:tarball` 构建真实 tarball，在临时最小 Vue 工程中安装并验证 ESM、CJS、类型、locale、styles、peer dependencies、消费构建和组件挂载。

提交发布候选前最多在本地执行一次 `pnpm run release:check`。它只组合一次 typecheck、验收 typecheck、lint、测试、验收 build 和 `verify:tarball`；library build 与 `npm pack` 仅由 `verify:tarball` 执行一次。日常开发只运行与改动相关的检查，GitHub Actions 才是 PR、`main` push 和发布的最终质量结论。

正式发布由语义版本 tag 触发 GitHub Actions。工作流要求 tag 与 package 版本一致且位于远程 `main` 的准确 HEAD，并通过 npm Trusted Publishing/OIDC 发布隔离验证过的同一个 tgz；npm 成功后才创建 GitHub Release。tag、GitHub Release 与 npm 产物必须指向同一发布提交，不得在未验证的工作区或不同提交上生成同版本产物。

## 9. 约束与风险

- 库源码只使用相对导入，不依赖消费方 alias 或环境变量。
- service 接口保持数据源无关；新增字段前先证明跨应用复用价值。
- 根入口不导出 hooks、composables 或工具函数；组件内部 helper 不构成兼容性承诺。
- 公开导出在 `0.x` 中仍可能演进，但变更必须通过版本记录说明。
- A 前缀未来可能与 Arco 新组件重名，当前通过安装时检测暴露风险。
- CJS 入口仅在持续消费验证通过时保留；若未来工具链无法可靠产出，应在新版本中明确移除，而不是保留虚假声明。
