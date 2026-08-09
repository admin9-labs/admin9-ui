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
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.lib.ts
├── tests/
└── src/
    ├── index.ts
    ├── components/
    │   ├── icon-picker/
    │   ├── media-picker/
    │   └── pro-table/
    ├── internal/
    ├── hooks/
    ├── locale/
    ├── services/
    └── styles/
```

包名固定为 `@admin9-labs/admin9-ui`。版本 `0.1.0` 是公开首发版本；在 `0.x` 阶段继续遵循语义化版本，但不承诺 1.0 级别的兼容稳定性。

## 3. 公开能力

| 导出                                         | 定位                            | 数据依赖            |
| -------------------------------------------- | ------------------------------- | ------------------- |
| default `Admin9UI`                           | 全局组件注册与默认 service 注入 | 可选 `MediaService` |
| `AMediaPicker`                               | 素材选择、上传与删除交互        | `MediaService` 注入 |
| `AIconPicker`                                | Arco 图标搜索与选择             | 无                  |
| `AProTable`                                  | fetcher 驱动的页面级表格        | fetcher prop 注入   |
| `Admin9UIOptions`、`MediaService` 及相关类型 | 插件配置与素材 adapter 契约     | 消费方实现          |
| `messages`、`localePrefix`、`zhCN`、`enUS`   | 中英文 locale                   | 宿主 i18n 实例      |
| `arcoIconNames`                              | 图标名清单                      | Arco 图标全局注册   |
| `@admin9-labs/admin9-ui/styles`              | 组件统一样式入口                | 无                  |

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
```

消费方可以在组件使用点传入 `service`，也可以在插件安装时提供默认 service：

```ts
app.use(Admin9UI, {
  mediaService,
});
```

使用点传入的 service 优先于插件默认值。缺少必需 service 时，组件应给出明确错误，而不是自行猜测网络行为。

## 5. 组件设计

### AMediaPicker

- `mediaType` 支持 `image`、`video` 和 `audio`，默认 `image`；单个实例不混合素材类型。
- `multiple=false` 时使用单选流程；`multiple=true` 时允许批量选择并确认。
- `limit` 只约束多选数量，不隐式决定数据类型。
- 上传使用 `customRequest` 调用注入 service，并支持进度与取消信号。
- 类型、分组和关键词都通过 `MediaService.list` 交给后端统一筛选，组件不在分页结果上做前端过滤。
- 分组按素材类型隔离，采用单级、单归属模型；`undefined` 表示全部，`null` 表示未分组，字符串表示后端真实分组。
- “全部”和“未分组”是组件内置视图，不属于 `MediaGroup`；`listGroups` 未实现时隐藏分组导航。
- 切换分组重置到第 1 页，多选结果在同一次弹窗会话中跨分组、跨分页保留。
- 具体分组内上传进入当前分组；全部或未分组视图上传进入未分组。
- 图片使用缩略图网格与图片预览，视频展示封面、播放标识、时长和可用播放控件，音频展示文件信息、时长和可用试听控件。
- `pending`、`failed`、缺少有效 URL 或与实例类型不匹配的素材保持可见但不可选择。
- 对外始终使用 `MediaItem.id`，保留 path、groupId、duration 和状态字段。
- 删除前要求显式确认；部分删除失败后刷新列表并清理陈旧选择。
- `canUpload` 与 `canDelete` 分别控制能力，调用方无需暴露其权限模型；`canDelete` 安全默认值为 `false`。
- 桌面端使用分组导航与素材区，窄屏改用紧凑分组选择控件。
- Picker 不提供分组新建、改名、排序、删除、批量移动、多级目录或标签。

### AMediaLibrary（后续阶段）

`AMediaLibrary` 是已确认的页面级素材管理组件需求，会与 `AMediaPicker` 同时存在。Picker 服务于表单轻量选择；Library 面向后续三个融媒体项目的完整素材管理页面。

Library 可复用公开的 `MediaType`、`MediaGroup`、`MediaItem`、`MediaService` 基础契约，以及包内私有的媒体展示实现。下一阶段仍需独立设计分组 CRUD、素材批量移动、完整管理工具栏、页面级查询与批量操作；这些能力不得反向塞入 Picker，也不应通过新增公共 hooks 或工具 API 暴露。

### AIconPicker

- 使用 popover、搜索框和固定网格完成选择。
- 图标清单以字符串形式分发，不把全部图标实现打入包。
- 图标预览依赖消费方注册的 Arco 图标组件。
- 输出合法图标名字符串，支持清空。

### AProTable

- `AProTable` 对外提供可配置 `rowKey`、fetcher、分页和 action 插槽。
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

1. clean install；
2. typecheck、lint、组件测试和 library build；
3. `npm pack --dry-run` 内容审计；
4. 真实 tarball 的 ESM、CJS、类型、styles、locale 和生产构建验证；
5. 发布后从 registry 重新安装并重复消费者构建。

tag、GitHub Release 与 npm 产物必须指向同一发布提交。不得在未验证的工作区或不同提交上生成同版本产物。

## 9. 约束与风险

- 库源码只使用相对导入，不依赖消费方 alias 或环境变量。
- service 接口保持数据源无关；新增字段前先证明跨应用复用价值。
- 根入口不导出 hooks、composables 或工具函数；组件内部 helper 不构成兼容性承诺。
- 公开导出在 `0.x` 中仍可能演进，但变更必须通过版本记录说明。
- A 前缀未来可能与 Arco 新组件重名，当前通过安装时检测暴露风险。
- CJS 入口仅在持续消费验证通过时保留；若未来工具链无法可靠产出，应在新版本中明确移除，而不是保留虚假声明。
