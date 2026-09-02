# @admin9-labs/admin9-ui 设计文档

> 状态：独立公开 package 设计基线 v2
>
> 更新日期：2026-09-03

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
    │   ├── file-picker/
    │   ├── filter-form/
    │   ├── pro-table/
    │   └── tiptap-editor/
    ├── internal/
    ├── hooks/
    ├── locale/
    ├── services/
    └── styles/
```

包名固定为 `@admin9-labs/admin9-ui`。版本 `0.1.0` 是公开首发版本，当前版本为 `0.8.0`；在 `0.x` 阶段继续遵循语义化版本，但不承诺 1.0 级别的兼容稳定性。

## 3. 公开能力

| 导出                                       | 定位                            | 数据依赖                    |
| ------------------------------------------ | ------------------------------- | --------------------------- |
| default `Admin9UI`                         | 全局组件注册与默认 service 注入 | 可选文件 adapter            |
| `AFilePicker`                              | 表单级文件浏览与选择            | `FilePickerAdapter` 注入    |
| `AFileUploader`                            | 本地批量上传队列与事务状态      | `FileUploadCapability` 注入 |
| `AFilterForm`                              | 列表页自适应筛选表单            | 无                          |
| `AIconPicker`                              | Arco 图标搜索与选择             | 无                          |
| `AProTable`                                | fetcher 驱动的页面级表格        | fetcher prop 注入           |
| `ATiptapEditor`                            | Tiptap 驱动的 HTML 富文本编辑器 | 可选 `FilePickerAdapter`    |
| `ACoordinatePicker`                        | 腾讯地图坐标搜索与点选          | 消费方提供腾讯地图 API Key  |
| `Admin9UIPluginOptions` 及相关公共类型     | 插件配置与文件 adapter 契约     | 消费方实现                  |
| `messages`、`localePrefix`、`zhCN`、`enUS` | 中英文 locale                   | 宿主 i18n 实例              |
| `arcoIconNames`                            | 图标名清单                      | Arco 图标全局注册           |
| `@admin9-labs/admin9-ui/styles`            | 组件统一样式入口                | 无                          |

`Admin9UIPluginOptions` 专指 `app.use(Admin9UI, options)` 的插件配置对象，避免与组件 props 或 service options 混淆。
`Admin9UIOptions` 作为弃用的兼容类型别名保留，避免破坏既有消费者的类型导入。

组件采用 `A` 前缀以保持与 Arco 生态一致。插件安装时会检查同名全局组件并输出冲突警告；若未来 Arco 增加同名组件，再通过新的兼容版本处理命名调整。

## 4. Service 契约

组件库只调用注入的接口，不感知数据来自何处，也不处理应用级认证和响应转换。

### File capability contracts

```ts
/* File capability combinations are defined by the public source types. */
export type FilePickerAdapter = FileBrowseCapability & Partial<FileUploadCapability>;
```

`FileBrowseCapability` 与 `FileUploadCapability` 是文件选择和上传需要的最小能力。完整字段定义以 `src/services/types.ts` 的公共类型为准；编辑器和 Picker 都只依赖 `FilePickerAdapter`。

消费方可以在组件使用点传入 `service`，也可以在插件安装时提供默认 service：

```ts
app.use(Admin9UI, {
  fileService,
});
```

使用点传入的 service 优先于插件默认值。缺少必需 service 时，组件应给出明确错误，而不是自行猜测网络行为。

删除、移动、分组管理及其权限属于消费应用，不进入公共 service 契约。

`AFileUploader` 不新增 batch service。它把同一具体 `FileType` 和 `groupId/null` 上下文中的多个本地 `File` 分项交给现有 `upload(options)`，并统一队列、进度、取消、重试、部分成功、结果校验和异步生命周期。网络文件与扫码上传不属于当前公共能力。

```ts
export type FileType = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';

export interface FileItem {
  id: string;
  name: string;
  type: FileType;
  groupId: string | null;
  url: string | null;
  status?: 'pending' | 'ready' | 'failed';
  size?: number;
  mime?: string;
  extension?: string;
  thumbnail?: string;
  duration?: number;
  createdAt?: string;
}

type FileListParams = FileListParamsBase &
  (
    | { fileType?: undefined; fileTypes?: readonly FileType[]; groupId?: never }
    | { fileType: FileType; fileTypes?: never; groupId?: string | null }
  );

export interface FileBrowseCapability {
  list(params: FileListParams): Promise<FileListResult>;
  listGroups?(fileType: FileType): Promise<FileGroup[]>;
}

export interface FileUploadCapability {
  upload(options: FileUploadOptions & { fileType: FileType }): Promise<FileItem>;
}

export type FilePickerAdapter = FileBrowseCapability & Partial<FileUploadCapability>;
```

- 聚合查询省略 `fileTypes` 表示六类全部；提供 `fileTypes` 表示后端准确筛选该真实类型集合，空数组表示无匹配结果，不能退化为全部；
- adapter 必须先在完整数据集上按 `fileTypes` 筛选，再执行分页并返回准确 `pagination.total`，不得对当前页做客户端过滤；
- 只有具体 `fileType` 查询可以携带 `groupId`；上传与 `listGroups` 始终要求真实 `FileType`；
- 插件注入字段统一为 `fileService`，供文件浏览和上传表面复用；使用点的 `service` prop 优先；
- `FilePickerAdapter` 只组合浏览与可选上传。

## 5. 组件设计

### AFileUploader

`AFileUploader` 是后端无关的本地批量上传队列组件，不是 `a-upload` 的薄包装。

- 每个队列绑定一个具体 `FileType` 和该类型下的 `groupId/null`，多选不表示混合业务类型；
- 对多个本地 `File` 分项调用 `FileUploadCapability.upload`，统一 pending/uploading/succeeded/failed/cancelled 状态、确定或不确定进度、取消、重试和部分成功；
- 完成结果只包含具备稳定 ID、匹配类型、ready 状态和可用 URL 的 `FileItem`，并拒绝队列内重复 ID；
- service、类型或分组变化及组件卸载都会中止活动任务并屏蔽迟到回调；
- 队列面板不创建第二个 Modal 或焦点陷阱，可由 Picker 和消费应用独立复用；
- 网络文件、扫码上传和批量后端 API 不属于第一阶段公共契约。

完整 Props、Events、Slots、实例方法和安全边界见 [AFileUploader 使用文档](./docs/components/file-uploader.md)。

### AFilePicker

`AFilePicker` 是表单、弹窗与附件字段中的完整文件选择工作流。

- `modelValue` 只使用共享 `FileItem`：单选为 `FileItem | undefined`，多选为 `FileItem[]`；
- `fileTypes` 归一化为六种真实类型并去重：单类型直接具体查询，2-5 类的聚合页传准确子集，六类聚合省略集合，空数组零请求；
- 选择草稿可跨页保留，取消不写回；普通列表刷新只调和草稿，只有确认、外部清空或 props 约束安全校正才改变已提交值；
- Picker value 必须同时具备唯一非空 ID、允许类型、`ready` 或未提供状态、非空 URL；
- 上传只在真实类型视图启用，`accept` 仅传给原生选择提示，不参与类型推断或安全校验；
- 上传队列、进度、取消和重试复用 `AFileUploader`；上传完成只刷新当前列表，不自动改变 Picker 草稿或已提交值；
- 复用包内私有 FileItem 展示，但不公开通用 hook/helper，也不提供移动、删除或分组管理。

完整契约见 [AFilePicker 使用文档](./docs/components/file-picker.md)。

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

### AFilterForm

- `AFilterForm` 使用 Arco Form 与 Grid 组织列表页筛选字段，不包含卡片、标题、分页、请求、路由、权限或业务字段。
- 默认插槽中的每个顶层有效节点占一列；空白、注释和 Fragment 包装不计数，支持消费方通过 `v-if`、`v-for` 动态组合字段。
- 当前字段不超过一行时使用单行操作区，不超过两行时直接展示多行；超过两行后默认只显示第一行并提供展开/收起。
- `cols` 沿用 Arco Grid 的数字或响应式对象语义，默认在 `xs/sm/md/lg/xl/xxl` 下分别使用 `1/1/2/3/3/3` 列。
- 查询在 Arco Form 校验成功后发出 `search(values)`，失败时展开全部字段以显示错误；重置清除校验状态后发出 `reset()`，模型默认值和重新查询由消费方负责。
- 折叠状态由组件内部管理，不公开 `mode`、`collapsible`、`collapsedRows` 或折叠状态模型。

### ATiptapEditor

- 以 HTML 字符串作为 `v-model`，提供标题、基础行内格式、列表、引用、链接、对齐、撤销重做和字符限制。
- 媒体 schema 由 `blockImage`、`inlineImage`、`video`、`audio` 四个 atom 节点组成；图片显示形态只由 `defaultImageDisplay` 或显式转换决定，不根据素材宽高推断。
- 块级图片和视频使用正文容器百分比宽度与左中右对齐；桌面节点视图提供等比拖动且最大不超过正文宽度。块级图片默认按素材自身宽度显示，小图不放大、大图等比收进编辑区；用户调整后可通过独立操作重置为默认规则。行内图片继续使用受控 em 级别并按文字基线排列。音频独立使用 `compact`（约 320px）、`standard`（约 480px）、`full` 三档容器宽度和左中右对齐，默认 `standard + left`，移动端强制通栏，不提供高度或自由拖动调整。
- 上述节点名、百分比、em 和像素值仅属于 schema 与样式实现。界面 locale 使用“独占一行 / 跟随文字”“小 / 中 / 大 / 铺满”“重置大小”“小播放器 / 标准播放器 / 铺满编辑区”等操作结果名称，并为图标按钮提供 Tooltip、`aria-label` 和可选择操作的 `aria-pressed` 状态。
- 主工具栏与媒体上下文栏的普通操作使用 Arco 中性文字和填充变量；只有实际生效的格式、尺寸和对齐状态使用品牌主色，危险删除保留 danger 状态。颜色不是唯一状态信号，切换型按钮同时暴露 `aria-pressed`。
- 媒体节点只持久化校验后的 `data-display`、`data-width`、`data-size`、`data-align` 等属性，不接受任意 `style`。URL 只允许 HTTP(S) 或相对地址；音视频固定输出 `controls` 与 `preload="metadata"`，不保留 `autoplay`。
- 图片、视频和音频通过 `FilePickerAdapter` 与对应类型的 `AFilePicker` 插入或替换；插入前逐项复核类型和安全 URL，有效项保持部分成功，被拒项通过 locale 消息与结构化 `media-error` 报告；替换保持单项全有或全无。没有 service 时编辑器保持可用但不显示素材入口。
- 块媒体插入后使用 Gap Cursor 继续输入，并关闭 StarterKit 的 trailing node，不把辅助空段落写入最终 HTML。
- 可编辑节点选中后通过 Tiptap BubbleMenu 显示尺寸、对齐、图片替代文字、显示方式、替换和删除操作；图片替代文字按需在 Popover 中编辑。操作原生音频播放器会同时选中对应节点并显示 BubbleMenu，不取消播放、暂停、进度或音量等原生行为。只读和禁用状态不显示编辑控件，但仍保留音视频播放能力。
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

仓库开发与 CI 使用 Node 24、pnpm 10.5.2，并以 `pnpm-lock.yaml` 固定开发依赖。该工具链基线只约束仓库构建和候选产物验证，不通过 repository-only `packageManager` pin 限制 npm 包消费者。

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

正式发布由语义版本 tag 触发 GitHub Actions，且单一 concurrency group 确保同一时刻最多只有一个发布 workflow 正在运行，避免并发修改 npm `latest`。GitHub concurrency 只保留一个 running 和一个 pending，新的 pending 可能替换旧的 pending，因此维护者必须一次只推送一个发布 tag，并等待其 workflow 完成后再推送下一版本。工作流要求 tag 与 package 版本一致、Actions 事件提交等于 checkout HEAD，并通过 Git ancestry 证明 tag 提交已进入远程 `main`。这里不再要求 tag 等于执行时的 `main` HEAD，因此 `main` 前进后仍可安全重跑旧的发布提交；在 npm 发布和 GitHub Release 操作前还会分别重新读取远端 tag，要求其最终 peeled commit 仍严格等于 Actions 事件提交。

Release workflow 按权限拆为三个 job：

1. `verify` 只有 `contents: read`，运行完整门禁并保留通过隔离消费验证的真实 tgz；
2. `publish` 只有 `contents: read` 和 `id-token: write`，下载该 artifact，核对已存在版本的 integrity，并通过 Trusted Publishing/OIDC 发布；
3. `github-release` 只有 `contents: write`，仅在 npm 发布后创建或核验 GitHub Release。

发布后校验不是可选提示。Registry 必须返回同一包名、版本和 tgz SHA-512 integrity，`dist-tags.latest` 必须指向本次稳定版本；npm SLSA provenance 的 subject digest、GitHub 仓库、`.github/workflows/release.yml`、tag ref 和 Git commit 必须全部匹配。GitHub Release 已存在时，tag、唯一同名附件、文件大小和 SHA-256 必须一致；完全一致的 draft 会转为正式 Release，prerelease 或任何附件冲突都会失败。不存在时由 gh CLI 通过临时 draft 上传同一 artifact、发布并再次核验，失败时由 gh CLI 清理临时 draft，禁止 `--clobber`。

维护者应先提交版本变更并等待 `main` CI 通过，再在计划的发布提交上创建并推送 `vX.Y.Z` annotated tag。发布失败时重跑同一 Actions workflow，不移动或复用 tag。已发布错误版本通过 npm deprecate 标记，并发布新的 patch 版本；不得重新打包同版本或覆盖 Release 附件。新 workflow 进入远端 `main` 后应启用 GitHub Release immutability，npm Trusted Publisher 的组织、仓库和 workflow 字段仍是必须单独维护的仓库外配置。

## 9. 约束与风险

- 库源码只使用相对导入，不依赖消费方 alias 或环境变量。
- service 接口保持数据源无关；新增字段前先证明跨应用复用价值。
- 根入口不导出 hooks、composables 或工具函数；组件内部 helper 不构成兼容性承诺。
- 公开导出在 `0.x` 中仍可能演进，但变更必须通过版本记录说明。
- A 前缀未来可能与 Arco 新组件重名，当前通过安装时检测暴露风险。
- CJS 入口仅在持续消费验证通过时保留；若未来工具链无法可靠产出，应在新版本中明确移除，而不是保留虚假声明。
