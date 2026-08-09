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
    │   └── pro-table/
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
| `Admin9UIPluginOptions`、`MediaService` 及相关公共类型 | 插件配置与素材 adapter 契约     | 消费方实现                 |
| `messages`、`localePrefix`、`zhCN`、`enUS`             | 中英文 locale                   | 宿主 i18n 实例             |
| `arcoIconNames`                                        | 图标名清单                      | Arco 图标全局注册          |
| `@admin9-labs/admin9-ui/styles`                        | 组件统一样式入口                | 无                         |

`Admin9UIPluginOptions` 专指 `app.use(Admin9UI, options)` 的插件配置对象，避免与组件 props 或 service options 混淆。
`Admin9UIOptions` 作为弃用的兼容类型别名保留，避免破坏既有消费者的类型导入。

组件采用 `A` 前缀以保持与 Arco 生态一致。插件安装时会检查同名全局组件并输出冲突警告；若未来 Arco 增加同名组件，再通过新的兼容版本处理命名调整。

## 4. Service 契约

组件库只调用注入的接口，不感知数据来自何处，也不处理应用级认证和响应转换。

### MediaService

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

export interface MediaService {
  list(params: MediaListParams): Promise<MediaListResult>;
  listGroups?(mediaType: MediaType): Promise<MediaGroup[]>;
  upload(options: {
    file: File;
    mediaType: MediaType;
    groupId: string | null;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  }): Promise<MediaItem>;
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

export interface MediaLibraryService extends MediaService {
  listGroups(mediaType: MediaType): Promise<MediaGroup[]>;
  createGroup(options: CreateMediaGroupOptions): Promise<MediaGroup>;
  renameGroup(options: RenameMediaGroupOptions): Promise<MediaGroup>;
  removeGroup(options: RemoveMediaGroupOptions): Promise<void>;
  move(options: MoveMediaOptions): Promise<string[]>;
}
```

`MediaLibraryService` 是页面级管理的窄扩展，不改变 Picker 所依赖的 `MediaService`：

- `listGroups(mediaType)` 在 Library 中为必选能力，返回该类型的后端真实单级分组；
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

- 使用 popover、搜索框和固定网格完成选择。
- 图标清单以字符串形式分发，不把全部图标实现打入包。
- 图标预览依赖消费方注册的 Arco 图标组件。
- 输出合法图标名字符串，支持清空。

### AProTable

- `AProTable` 对外提供可配置 `rowKey`、fetcher、分页和 action 插槽。
- fetcher 失败时发出 `error(error)` 事件；搜索、刷新按钮、分页和 fetcher 变化等 UI 请求入口会消费失败 Promise，避免产生 unhandled rejection。
- `defineExpose` 的 `refresh()` 仍原样返回 fetcher 链的 Promise，调用方主动调用时必须自行 `await` 并处理拒绝；`clearSelection()` 只通知受控选择清空。
- 它不包含查询表单、工具栏、导出或具体行操作等应用业务能力。
- 应用共享的 Grid 家族保持在消费方，不属于本包迁移范围。

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

Vue、Arco Design Vue 和 vue-i18n 是 peer dependencies，并在构建中 external，避免消费方获得重复运行时实例。

每次发布前必须完成：

1. `pnpm install --frozen-lockfile` clean install；
2. typecheck、lint、组件测试和 library build；
3. `pnpm run pack:check` 内容审计；
4. 真实 tarball 的 ESM、CJS、类型、styles、locale 和生产构建验证；
5. 发布后从 registry 重新安装并重复消费者构建。

仓库内测试责任分为三层：

- `tests/*.spec.ts` 使用通用 fake/stub 验证组件输入、事件、插槽和状态契约；
- `dev/` 是使用 fake service 的最小浏览器验收宿主，只验证组件交互与样式，不承担业务应用职责；
- `pnpm run verify:tarball` 构建真实 tarball，在临时最小 Vue 工程中安装并验证 ESM、CJS、类型、locale、styles、peer dependencies、消费构建和组件挂载。

发布前可执行 `pnpm run release:check` 运行完整门禁。该命令只验证本地候选产物，不发布 npm 版本。

tag、GitHub Release 与 npm 产物必须指向同一发布提交。不得在未验证的工作区或不同提交上生成同版本产物。

## 9. 约束与风险

- 库源码只使用相对导入，不依赖消费方 alias 或环境变量。
- service 接口保持数据源无关；新增字段前先证明跨应用复用价值。
- 根入口不导出 hooks、composables 或工具函数；组件内部 helper 不构成兼容性承诺。
- 公开导出在 `0.x` 中仍可能演进，但变更必须通过版本记录说明。
- A 前缀未来可能与 Arco 新组件重名，当前通过安装时检测暴露风险。
- CJS 入口仅在持续消费验证通过时保留；若未来工具链无法可靠产出，应在新版本中明确移除，而不是保留虚假声明。
