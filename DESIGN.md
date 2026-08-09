# @admin9-labs/admin9-ui 设计文档

> 状态：独立公开 package 设计基线 v2
>
> 更新日期：2026-08-09

## 1. 定位

`@admin9-labs/admin9-ui` 是基于 Vue 3 与 Arco Design Vue 的中后台增强组件库。
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
- Admin9 应用共享层的 `Grid`、`GridToolbar` 和 `GridTable`。

`useLoading` 与 `useVisible` 保留既有能力和公开导出，不因仓库拆分而迁移或改写。

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
    │   ├── data-table/
    │   ├── icon-picker/
    │   ├── media-picker/
    │   ├── pro-table/
    │   └── user-picker/
    ├── composables/
    ├── hooks/
    ├── locale/
    ├── services/
    └── styles/
```

包名固定为 `@admin9-labs/admin9-ui`。版本 `0.1.0` 是公开首发版本；在 `0.x` 阶段继续遵循语义化版本，但不承诺 1.0 级别的兼容稳定性。

## 3. 公开能力

| 导出 | 定位 | 数据依赖 |
|---|---|---|
| `AMediaPicker` | 素材选择、上传与删除交互 | `MediaService` 注入 |
| `AIconPicker` | Arco 图标搜索与选择 | 无 |
| `AUserPicker` | 分页用户选择 | `UserService` 注入 |
| `AProTable` | fetcher 驱动的页面级表格 | fetcher prop 注入 |
| `useModal` | 命令式确认与删除确认 | 无 |
| `useLoading` | loading 状态 hook | 无 |
| `useVisible` | visible 状态 hook | 无 |
| `messages`、`localePrefix` | 中英文 locale | 宿主 i18n 实例 |
| `arcoIconNames` | 图标名清单 | Arco 图标全局注册 |

`ADataTable` 是 picker 内部复用零件，不全局注册，也不作为稳定公开组件承诺。

组件采用 `A` 前缀以保持与 Arco 生态一致。插件安装时会检查同名全局组件并输出冲突警告；若未来 Arco 增加同名组件，再通过新的兼容版本处理命名调整。

## 4. Service 契约

组件库只调用注入的接口，不感知数据来自何处，也不处理应用级认证和响应转换。

### MediaService

```ts
export interface MediaItem {
  id: string;
  name: string;
  url: string | null;
  path?: string;
  status?: 'pending' | 'ready' | 'failed';
  size?: number;
  mime?: string;
  extension?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  createdAt?: string;
}

export interface MediaListParams {
  page: number;
  pageSize: number;
  keyword?: string;
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
  upload(options: {
    file: File;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  }): Promise<MediaItem>;
  remove(ids: string[]): Promise<string[]>;
}
```

### UserService

```ts
export interface UserItem {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  [key: string]: unknown;
}

export interface UserListParams {
  page: number;
  pageSize: number;
  keyword?: string;
}

export interface UserService {
  list(params: UserListParams): Promise<{
    list: UserItem[];
    pagination: MediaPagination;
  }>;
}
```

消费方可以在组件使用点传入 `service`，也可以在插件安装时提供默认 service：

```ts
app.use(Admin9UI, {
  mediaService,
  userService,
});
```

使用点传入的 service 优先于插件默认值。缺少必需 service 时，组件应给出明确错误，而不是自行猜测网络行为。

## 5. 组件设计

### AMediaPicker

- `multiple=false` 时使用单选流程；`multiple=true` 时允许批量选择并确认。
- `limit` 只约束多选数量，不隐式决定数据类型。
- 上传使用 `customRequest` 调用注入 service，并支持进度与取消信号。
- 对外始终使用 `MediaItem.id`，保留可选 path 和状态字段。
- 删除前要求显式确认；部分删除失败后刷新列表并清理陈旧选择。
- `canUpload` 与 `canDelete` 分别控制能力，调用方无需暴露其权限模型。

### AIconPicker

- 使用 popover、搜索框和固定网格完成选择。
- 图标清单以字符串形式分发，不把全部图标实现打入包。
- 图标预览依赖消费方注册的 Arco 图标组件。
- 输出合法图标名字符串，支持清空。

### AUserPicker

- 复用 service 注入和分页选择模式。
- 单选流程选择后关闭，多选流程显式确认。
- 只依赖 `UserItem` 与 `UserService`，不扩展消费方业务字段。

### useModal

- 基于 Arco Modal 能力提供通用确认和删除确认。
- 异步确认期间启用 loading，防止重复提交。
- 保留调用方提供标题、正文、按钮文案和回调的能力。

### ADataTable 与 AProTable

- `ADataTable` 负责 picker 内部的 fetcher、分页、loading、搜索和选择状态。
- `AProTable` 对外提供可配置 `rowKey`、fetcher、分页和 action 插槽。
- 两者不包含查询表单、工具栏、导出或具体行操作等应用业务能力。
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

| 入口 | 产物 |
|---|---|
| package main import | `dist/index.js` |
| package main require | `dist/index.cjs` |
| package types | `dist/index.d.ts` |
| `./styles` | `dist/style.css` |
| `./locale` import | `dist/locale/index.js` |
| `./locale` require | `dist/locale/index.cjs` |
| `./locale` types | `dist/locale/index.d.ts` |

Vue、Arco Design Vue、vue-i18n 和 VueUse 是 peer dependencies，并在构建中 external，避免消费方获得重复运行时实例。

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
- 公开导出在 `0.x` 中仍可能演进，但变更必须通过版本记录说明。
- A 前缀未来可能与 Arco 新组件重名，当前通过安装时检测暴露风险。
- CJS 入口仅在持续消费验证通过时保留；若未来工具链无法可靠产出，应在新版本中明确移除，而不是保留虚假声明。
