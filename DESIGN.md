# @admin9-labs/admin9-ui 设计文档

> 状态：内部 package 实施基线 v1
> 日期：2026-06-27
> 作者：基于代码逐行精读产出

## 0. 决策摘要（已锁定）

| 维度 | 决策 | 依据 |
|---|---|---|
| 仓库结构 | 轻量 monorepo，`packages/admin9-ui/` 作 npm workspace 包 | 根项目支持 npm 11，锁文件与 CI 以 11.12.1 为基准 |
| 包名 | `@admin9-labs/admin9-ui` | GitHub 组织 admin9-labs，scope 名正言顺 |
| 组件前缀 | `A`（如 `AMediaPicker`） | 用户决策。贴 Arco 家族。当前清单与 Arco 原生无撞名（见 §3 风险） |
| composable 前缀 | 无（`useModal`） | 业界惯例，靠 import 路径区分 |
| 组件清单 | `AMediaPicker`、`AIconPicker`、`AUserPicker` + `useModal` | 4 个，其余删减见下 |
| 素材范围 | 类型无关的 `MediaPicker`，App 现在只注入图片 service | 库只认 `MediaService` 接口，类型由注入决定 |
| i18n | 库导出 messages 对象，App 合并进宿主 vue-i18n | 不建独立实例，避免 locale 割裂 |
| 样式 | scoped less + Arco CSS 变量，**不用 Tailwind** | 避免 App 维护 Tailwind content 路径的耦合 |
| 构建工具链 | 库用 vite5 + ts5 + vite-plugin-dts | App 的 vite3/ts4.9 对 dts 插件太旧；库独立构建不影响 App 运行时 |
| 当前阶段 | 内部 package，先服务实际项目并接入真实 API | 正式发布后完成稳定验证，再评估 npm 发布 |

### 删减决策（避免伪封装）

| 组件 | 删除理由 |
|---|---|
| ~~ColorPicker~~ | Arco 原生 `<a-color-picker>` 能力完备（v-model/预设/历史/popover/格式）。封装多余且会与原生撞名。项目已在 `control-group.vue:254` 用原生 |
| ~~CodeEditor~~ | 项目当前**无代码编辑需求**（仅 1 处只读 JSON 用 `<pre>` 展示）。属"为未来造"。等真实需求出现再评估 CodeMirror 6 |

---

## 1. 目标与范围

把中后台反复出现的"选择类"组件沉淀成内部 package `@admin9-labs/admin9-ui`。当前先服务实际项目、接入真实 API 并验证组件契约；宿主正式发布且 package 完成稳定验证后，再评估发布 npm。点一下触发弹窗 → 选一个/多个 → 回填表单字段。核心解决三个真实痛点：

1. **素材选择**：现有 `image-gallery` 与后端强耦合、丢弃选中项 id、上传绕过 axios。升级为后端无关的 `AMediaPicker`。
2. **菜单图标**：`EditMenuModal` 的图标字段是纯文本 `<a-input>`，用户手敲 `icon-settings` 字符串。改为可视化 `AIconPicker`。
3. **选人**：项目无"弹窗分页选人"组件。新增 `AUserPicker`，复用 MediaPicker 的 service 注入模式。

附加：`useModal` 收敛项目 4 处高度重复的删除确认（缺防重复提交、i18n 不一致）。

---

## 2. 仓库结构（monorepo 脚手架）

```
admin9-web/                       仓库根
├─ package.json                   根，声明 workspaces: ['packages/*'] 并装公共 dev 工具
├─ package-lock.json              npm workspace 统一锁文件
├─ src/                           App，基本不动
└─ packages/
   └─ admin9-ui/                  新库
      ├─ package.json             name=@admin9-labs/admin9-ui, peerDeps, exports
      ├─ tsconfig.json            库独立（bundler resolution, declaration）
      ├─ vite.config.lib.ts       lib mode: ESM+CJS+d.ts, peer deps external
      ├─ README.md
      └─ src/
         ├─ index.ts              install 插件 + 命名导出
         ├─ components/
         │  ├─ media-picker/index.vue
         │  ├─ icon-picker/index.vue
         │  ├─ user-picker/index.vue
         │  └─ data-table/index.vue     # 内部复用，不对外注册
         ├─ composables/
         │  └─ use-modal.ts
         ├─ hooks/                # useVisible/useLoading 自带副本（零依赖）
         │  ├─ visible.ts
         │  └─ loading.ts
         ├─ services/
         │  └─ types.ts           # MediaService 等接口定义
         ├─ locale/
         │  ├─ zh-CN.ts
         │  └─ en-US.ts
         └─ styles/
            └─ index.less         # Arco 变量引用（不 @import App 的 breakpoint）
```

### package.json workspaces（仓库根）

```json
{
  "workspaces": ["packages/*"]
}
```

### packages/admin9-ui/package.json

```jsonc
{
  "name": "@admin9-labs/admin9-ui",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./styles": "./dist/style.css",
    "./locale": {
      "types": "./dist/locale.d.ts",
      "import": "./dist/locale.js"
    }
  },
  "sideEffects": ["**/*.less", "**/*.css", "*.vue"],
  "peerDependencies": {
    "vue": "^3.5.0",
    "@arco-design/web-vue": "^2.57.0",
    "vue-i18n": "^9.14.0",
    "@vueuse/core": "^9.13.0"
  },
  "devDependencies": {
    "less": "^4.5.1",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vite-plugin-dts": "^3.9.0",
    "@vitejs/plugin-vue": "^5.0.0",
    "@vitejs/plugin-vue-jsx": "^3.1.0",
    "vue-tsc": "^2.0.0"
  },
  "scripts": {
    "build": "vue-tsc --noEmit -p tsconfig.json && vite build --config vite.config.lib.ts",
    "dev": "vite build --watch --config vite.config.lib.ts"
  }
}
```

要点：
- `peerDependencies` 精确对齐 App 版本，库不重复打包 vue/arco/vue-i18n/vueuse。
- `sideEffects` 必含 `*.less/*.css/*.vue`，否则消费者 tree-shaking 误删样式。
- devDeps 升到 vite5/ts5（App 的 vite3/ts4.9 太旧，vite-plugin-dts 生态要求 ≥vite4）。库只产出产物，不影响 App 运行时。

### vite.config.lib.ts 要点

```ts
build: {
  lib: { entry: resolve(__dirname, 'src/index.ts'), name: 'Admin9UI',
         formats: ['es', 'cjs'], fileName: (f) => f === 'es' ? 'index.js' : 'index.cjs' },
  cssCodeSplit: false,            // 合并单一 style.css
  rollupOptions: {
    external: ['vue', '@arco-design/web-vue', 'vue-i18n', '@vueuse/core'],
    output: { assetFileNames: 'style.css', globals: { vue: 'Vue' } },
  },
}
```

### App 侧引用（开发期直接消费源码）

- App `package.json` devDependencies：`"@admin9-labs/admin9-ui": "0.1.0"`，npm 按同名同版本自动链接本地 workspace
- App `src/main.ts`（在 `app.use(i18n)` 之后）：
  ```ts
  import Admin9UI from '@admin9-labs/admin9-ui';
  import '@admin9-labs/admin9-ui/styles';
  app.use(Admin9UI);
  ```
- App `tsconfig.json` 的 `include` 追加 `"packages/admin9-ui/src/**/*"`（否则 vue-tsc 报错）
- App `vite.config.base.ts` 的 `optimizeDeps.exclude` 加 `@admin9-labs/admin9-ui`（让 App vite 直接编译库源码，热更新生效）
- 发布期：库 `exports` 指向 dist；当前版本约束已使用标准 semver，npm workspace 在开发期自动链接本地包

---

## 3. 组件清单与优先级

| 组件 | 优先级 | 形态 | 后端依赖 | 说明 |
|---|---|---|---|---|
| `AMediaPicker` | P0 | 弹窗（modal） | MediaService（App 注入） | image-gallery 升级，类型无关 |
| `AIconPicker` | P0 | popover | 无（Arco 图标名清单） | 替换菜单管理的手敲 input |
| `AUserPicker` | P1 | 弹窗（modal） | UserService（App 注入） | 复用 MediaPicker 模式 |
| `AProTable` | P1 | 页面级表格 | fetcher prop 注入 | 精简版页面表格，收敛 fetcher+分页+loading |
| `useModal` | P1 | composable | 无 | 收敛 4 处删除确认 |
| `ADataTable` | 内部 | — | fetcher prop | picker 内部分页列表复用，不对外注册 |

### 撞名风险记录（A 前缀）

当前清单 `AMediaPicker`/`AIconPicker`/`AUserPicker` 与 Arco 原生组件（`AColorPicker`/`ATimePicker`/`ATreeSelect`/`ASelect`/`ACascader`）**无重名**。`ADataTable` 为内部组件不全局注册，不撞。

**风险**：Arco 在 picker/select 命名域活跃，未来某版新增 `AUserPicker`/`AMediaPicker` 概率不低。一旦发生，库在 Arco 之后 `app.use` 会触发 "registered multiple times" 警告并覆盖原生。缓解：库 `install` 时做名称冲突检测（启动时 `console.warn` 若检测到重名），便于及早发现。长期若撞名严重，可回头切 `A9`/`Pro`（届时仅改库内一处前缀常量 + 重新发包）。

---

## 4. 核心契约：MediaService 接口

库不直接调任何后端。所有"列表/上传/删除"能力由 App 通过 `MediaService` 接口注入。

```ts
// packages/admin9-ui/src/services/types.ts

export interface MediaItem {
  id: string;
  name: string;
  url: string;          // 完整可访问 URL
  path?: string;        // 后端相对路径（引用/删除用）
  size?: number;        // 字节数（可选）
  mime?: string;        // image/jpeg 等（可选）
  thumbnail?: string;   // 缩略图 URL，缺省时库回退用 url
  width?: number;
  height?: number;
  createdAt?: string;   // ISO 时间（可选）
}

export interface MediaListParams {
  page: number;          // 1-based
  pageSize: number;
  keyword?: string;      // 搜索（后端不支持则 App adapter 忽略）
}

export interface MediaPagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface MediaListResult {
  list: MediaItem[];
  pagination: MediaPagination;
}

export interface MediaUploadOptions {
  file: File;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export interface MediaService {
  list(params: MediaListParams): Promise<MediaListResult>;
  upload(options: MediaUploadOptions): Promise<MediaItem>;  // 必须返回新记录（修正现有丢弃 id 的 bug）
  remove(ids: string[]): Promise<string[]>;
}
```

### 职责边界（重要）

库**只定义 `MediaService` 接口契约 + 渲染 UI**，**不包含任何具体后端接口的实现**。把接口落到具体后端（调哪个 URL、字段叫什么、怎么解响应、怎么鉴权）是**消费方 App 的职责**，由 App 写 adapter 实现这个接口再注入给库。

```
┌─────────────────────────────┐         ┌──────────────────────────────────┐
│  库 @admin9-labs/admin9-ui  │         │  消费方 App（业务）              │
│  ─────────────────────────  │         │  ──────────────────────────────  │
│  AMediaPicker (渲染/交互)   │◄────────│  mediaService 实现 MediaService │
│  MediaService 接口契约      │  注入   │   ↳ 调 /api/file/images          │
│                             │         │   ↳ 调 /api/upload/image         │
│  不含任何具体 URL / 字段    │         │   ↳ 调 /api/files                │
└─────────────────────────────┘         │   ↳ 拼 token、转 page_size、解响应│
                                       └──────────────────────────────────┘
```

这样库可以被任意后端复用：换了后端，App 只需重写 adapter，库代码不动。

### App 侧 adapter（示例，属于 App 不进库）

App 在 `src/services/mediaService.ts` 写一个实现 `MediaService` 的对象，注入给 `<AMediaPicker :service="mediaService">`。具体接哪些后端 URL、字段怎么映射，是 App 的事——本项目 adapter 会对接现有的 `/api/file/images` 等（迁移指引见 §9，含 image-gallery 的耦合点 file:line），但**这些细节不出现在库代码里**。

注入也可以全局化（避免每个使用点传 service）：App 在 `main.ts` 调 `app.use(Admin9UI, { mediaService })`，库内部通过 `provide/inject` 取默认 service。两种方式库都支持，使用点传 `:service` 优先。

**关键修正**：现有 `image-gallery` 上传走 `<a-upload :action>` 绕过 axios（`index.vue:31,243-244`），导致 token 硬编码 + 丢弃服务端返回的新文件记录（只能整页重拉）。App adapter 改走自身 axios 后，鉴权统一、能拿到新文件 id，不再丢失。

---

## 5. 组件设计

### 5.1 AMediaPicker（P0，image-gallery 升级）

基于 `src/components/image-gallery/index.vue` 逐行精读改造。

**Props**
```ts
interface AMediaPickerProps {
  modelValue?: MediaItem[] | MediaItem | string | undefined;
  multiple?: boolean;          // 显式取代现有靠 attrs.limit + modelValue 类型的隐式推断
  limit?: number;              // 0=不限；配合 multiple
  pageSize?: number;           // 默认 24（现 index.vue:41）
  buttonText?: string;         // 外层触发按钮文案
  accept?: string;             // 默认 'image/png,image/jpeg,image/gif'（现 index.vue:246）
  service?: MediaService;      // 显式传入优先；缺省回退插件全局注入
  showFileList?: boolean;      // 外层是否展示已选列表（现透传给外层 a-upload）
  // 不再有 token / baseURL / action props —— 鉴权由 service 内部处理
}
```

**Emits**
```ts
type Emits = {
  'update:modelValue': [MediaItem[] | MediaItem | string | undefined];
  'change': [MediaItem[]];
  'select': [MediaItem[]];          // 用户勾选变化（实时）
  'upload-success': [MediaItem];
  'upload-error': [error: unknown];
}
```

**关键改造点（逐行对应现有 image-gallery）**

| 现行号 | 现耦合 | 改为 |
|---|---|---|
| `:5` `import { getToken }` | `@/utils/auth` | 删除；鉴权移入 service.upload |
| `:6` `import { FileRecord, deleteFiles, queryFiles }` | `@/api/file` | 删除；改用 `props.service` |
| `:30` `const token = getToken()` | localStorage 直读 | 删除 |
| `:31` `action = ${VITE_API_BASE_URL}/api/upload/image` | env + 硬编码 URL | 删除 |
| `:50-63` `fetchData` 调 `queryFiles` | 直调 API | `props.service.list({ page: current, pageSize })` |
| `:75-84` `onDeleteItems` 调 `deleteFiles` | 直调 API | `props.service.remove(selectKeys)` |
| `:240-257` 内层 `<a-upload :action :headers name>` | action URL + 手动 Authorization | 改 `:custom-request` → 内部调 `props.service.upload({file})`，移除 `:action`/`:headers` |
| `:160-169` `uploadSuccess` 解 `response.response` | 假设后端信封 + 绕过拦截器 | customRequest resolve 返回 `MediaItem`，直接 push |
| `:110` `{ uid: item.id, name, url }` | uid/id 混用 + 丢 path | 统一 emit `MediaItem`（保留 id、可选 path） |
| `:187` `item.id` 反构 onMounted | 与 emit 的 uid 不一致 bug | emit 与反构都用 `id`，对齐 |
| `:196` `fileLimit=1`（字符串模式） | 隐式单选 | `multiple=false` 显式 |
| `:228/235/254/259/283/284` `t('common.imageGallery.*')` | vue-i18n 全局 key | 库内置 locale + 统一前缀 `admin9Ui.mediaPicker.*` |
| `:2` `useAttrs` 透传 limit | 隐式 | 显式 `props.limit` + `props.multiple` |

**修两个现有 bug**：
1. uid/id 字段不一致导致 modelValue round-trip 失效（`:110` emit 用 uid vs `:187` onMounted 读 id）。
2. 上传走 a-upload action 绕过 axios，token 硬编码 + 丢弃新文件记录（`:243-244`）。

**单选/多选交互**：现有 UI 永远多选 checkbox，靠 `fileLimit` 确认时截断（`:113-130`），用户可勾多张后被静默丢弃。改为：`multiple=false` 时单选即选即关（参考 QQMapSelect `:152-157` 模式）；`multiple=true` 时 row-selection + 底部确认按钮。

**调用方迁移**：`src/components/tiptap/control-group.vue:258` 改为 `<AMediaPicker :service="mediaService" :show-file-list="false" @change="onInsertImage">`；`onInsertImage`（`:76-91`）现读 `image.url` 不变。

### 5.2 AIconPicker（P0，菜单图标）

替换 `EditMenuModal.vue:36-38` 的纯文本 `<a-input>`。

**Props**
```ts
interface AIconPickerProps {
  modelValue?: string;          // 图标名字符串（kebab: 'icon-dashboard' 或 Pascal: 'IconDashboard'）
  allowClear?: boolean;
  placeholder?: string;
  size?: 'small' | 'medium' | 'large';
}
emit: { 'update:modelValue': [string | undefined] }
```

**形态**：`a-popover` + 网格（非弹窗）。表单内轻量交互，popover 附着输入框体验最连贯。

- 触发器：只读 `a-input`，左侧前缀渲染当前选中图标（`<component :is="modelValue">`），右侧 clear。
- popover 内容：顶部搜索框 + 下方网格（287 个图标，简单 grid + 滚动，无需虚拟列表）。
- 每个 cell：`<component :is="name">` 预览 + hover tooltip 显示名字，点击 emit + 关闭。
- 搜索：去 `icon-` 前缀后小写匹配（`'settings'` 命中 `'IconSettings'`）。

**图标清单来源**：Arco 图标可程序化枚举（`node_modules/@arco-design/web-vue/es/icon/index.js` 共 287 个具名导出）。但 `import * as ArcoIcons` 会把 287 个 SVG 打进库 bundle——**构建期跑一次 `Object.keys` 生成纯字符串名清单 JSON 随库分发**，运行时只持字符串数组，渲染用 `<component :is="name">` 依赖宿主已 `app.use(ArcoVueIcon)` 注册的全局组件。库本身不打包任何 SVG。

**渲染机制**：cell 与触发器预览都用 `<component :is="iconName">`，依赖宿主 `main.ts:19 app.use(ArcoVueIcon)` 已注册的全局组件。库不打包 SVG。

**集成（最小改动）**：`EditMenuModal.vue:36-38` 替换为：
```vue
<a-form-item v-if="formData.type !== 3" :label="$t('system.menu.editModal.icon')" field="icon">
  <AIconPicker v-model="formData.icon" allow-clear :placeholder="$t('system.menu.editModal.icon.placeholder')" />
</a-form-item>
```
- `:134` `icon: formData.icon || undefined`、`:192` 回填 `formData.icon = record.icon || ''` 不动。
- 产出值用 kebab（`icon-dashboard`）兼容现有数据与 placeholder 文案。

**渲染侧不改**：
- `src/views/system/menu/index.vue:26` `<component :is="record.icon">`
- `src/components/menu/index.vue:93` `h(compile(`<${meta.icon}/>`))`

两者基于"字符串名 → 全局组件"工作，AIconPicker 只替换录入方式，产出仍是合法图标名字符串，机制已通。

### 5.3 AUserPicker（P1，弹窗选人）

复用 AMediaPicker 的弹窗 + service 注入模式，内嵌分页表格选人。

**Props**
```ts
interface AUserPickerProps {
  modelValue?: UserItem[] | UserItem | undefined;
  multiple?: boolean;
  service?: UserService;         // 显式传入优先；缺省回退插件全局注入
  pageSize?: number;
  buttonText?: string;
}
```

`UserService` 接口由 App 注入（库只定义 `list(params) => UserListResult` 抽象契约，不关心具体后端）。App 侧 adapter 对接用户列表接口即可。注：本项目 `src/api/system/user.ts:46` 有泛型 bug（现 `<UserRecord[]>` 实际返回 `HttpResponse<UserRecord[]>`，缺 meta），App adapter 写时规避——这是 App 的代码问题，与库无关。

**交互**：
- 单选：行内"选择"按钮即选即关（QQMapSelect `:152-157` 模式，`footer=false`）。
- 多选：row-selection + 底部"确定（带已选数量）/取消"（沿用 EditUserModal 的 `@before-ok` + `done(closed)` 异步模式 `EditUserModal.vue:2,61-77`）。

**内部用 ADataTable**（见 5.5）承载分页列表，避免重复写 pagination/loading/fetchData 样板。

### 5.4 useModal（P1，收敛删除确认）

对标 Arco `Modal.open`，加项目惯例：统一 i18n 文案、防重复提交（okLoading）、统一错误提示。

```ts
interface UseModalReturn {
  // 删除确认（最常用，4 处删除模式高度统一）
  confirmDelete: (config: {
    title?: string;            // 默认 t('common.confirm.delete.title')
    content?: string;          // 默认 t('common.confirm.delete.content')
    onDelete: () => Promise<void>;
    successMsg?: string;
    onSuccess?: () => void;
  }) => void;
  // 通用确认
  confirm: (config: {
    title: string; content: string;
    onOk: () => Promise<void> | void;
    okText?: string;          // 默认 t('common.action.confirm')
    cancelText?: string;      // 默认 t('common.action.cancel')
    type?: 'warning' | 'info';
    hideCancel?: boolean;
  }) => void;
  // 透传 Arco ModalConfig（不丢原生能力）
  open: (config: ModalConfig) => ModalReturn;
}
```

**迁移落地点**：
- `src/views/system/role/index.vue:99` Modal.warning（删除角色）→ `confirmDelete`
- `src/views/system/menu/index.vue:156` Modal.warning（删除菜单）→ `confirmDelete`
- `src/views/system/dict/index.vue:211` Modal.warning（删除字典类型）→ `confirmDelete`
- `src/views/system/dict/index.vue:234` Modal.warning（删除字典项）→ `confirmDelete`
- `src/api/interceptor.ts:71` Modal.error（401 登出，硬编码英文）→ `confirm` 并修 i18n

### 5.5 ADataTable（内部，picker 复用）

参考 GridTable 的"attrs 透传 + 暴露实例"思想，但去掉 action 列，加 fetcher。

**Props**
```ts
interface ADataTableProps {
  columns: TableColumn[];
  rowKey?: string;              // 不硬编码（GridTable 硬编码 'id'，与素材表可能冲突）
  fetcher: (params: { page: number; pageSize: number; keyword?: string }) =>
    Promise<{ list: any[]; total: number }>;
  searchable?: boolean;
  multiple?: boolean;
}
// expose: refresh(), clearSelection()
```

内部自管 `pagination`/`loading`/`keyword`/`selectedRowKeys`，避免每个 picker 重写（现 `user/index.vue:75-131` 和 `qq-map-select:131-150` 的样板）。透传 a-table 的 `v-bind="$attrs"` 和具名插槽。

**不搬 Grid/GridToolbar 进库**：Grid 是页面级 a-card 容器，弹窗内再套是双重卡片；GridToolbar 的创建/刷新按钮对 picker 无意义。

### 5.6 AProTable（P1，精简版页面表格）

**定位区分（重要）**：`ADataTable` 是 picker 内部私有零件（不注册）；`AProTable` 是**对外注册的页面级业务表格**。两者职责不重叠：
- `ADataTable` = picker 的"搜索+分页表格片段"，无 toolbar/action
- `AProTable` = 页面级，收敛 fetcher + 分页 + loading + 可选 action 列

**与现有 GridTable 的关系**：升级而非平行。现 `GridTable` 硬伤：`row-key` 硬编码 `'id'`、action 列写死编辑/删除、数据全靠父透传无请求收敛。`AProTable` 用 fetcher 注入自管请求，`rowKey` 可配，action 列可配/可插槽。长期页面逐步从 GridTable 迁到 AProTable。

**精简原则**：只收敛 fetcher+分页+loading（复用 ADataTable 内核），**不做** query 表单/工具栏/批量操作/导出那套重的——这些让页面用插槽自行扩展。避免过度设计。

**Props**
```ts
interface AProTableProps {
  columns: TableColumn[];
  rowKey?: string;                    // 默认 'id'，不硬编码
  fetcher: (params: { page: number; pageSize: number; keyword?: string }) =>
    Promise<{ list: any[]; total: number }>;
  pageSize?: number;                  // 默认 10
  searchable?: boolean;               // 默认 false，需搜索时开
  showAction?: boolean;               // 默认 false，按需开 action 列
  // action 列内容通过 #action 插槽自定义，无内置编辑/删除（避免 GridTable 的写死问题）
}
// expose: refresh(), clearSelection()
```

**实现**：内部复用 ADataTable 内核（fetcher/pagination/loading 逻辑），外层套 a-table 透传 + 可选 action 插槽。`rowKey` 透传不硬编码。

**全局注册**：`app.component('AProTable', AProTable)`（与 AMediaPicker 等同列）。

**撞名检查**：Arco 无 `ProTable`/`AProTable` 原生组件，安全。

---

## 6. i18n 策略

库**不建独立 vue-i18n 实例**（否则 locale 状态与 App 割裂、切换不同步）。

- 库 `src/locale/{zh-CN,en-US}.ts` 导出 messages 对象，统一前缀 `admin9Ui.<component>.<key>`。
- 库内组件用 `useI18n()`（依赖 App 已 `app.use(i18n)`）。
- App `src/locale/index.ts:33-34` 合并：
  ```ts
  import { messages as uiMsg } from '@admin9-labs/admin9-ui/locale';
  'zh-CN': { ...loadLocaleMessages('zh-CN'), ...uiMsg['zh-CN'] },
  'en-US': { ...loadLocaleMessages('en-US'), ...uiMsg['en-US'] },
  ```

key 前缀统一 `admin9Ui.*`（现 image-gallery 散在 `common.imageGallery.*`，迁移时统一）。

---

## 7. 样式策略

库组件统一 `<style lang="less" scoped>` + Arco CSS 变量（`var(--color-text-1)`、`var(--color-fill-2)` 等），Arco 自带暗色联动（`[arco-theme="dark"]`），**不用 Tailwind**。

理由：
1. 避免 App `tailwind.config.js` content 数组维护库路径的耦合。
2. 消费者未装 Tailwind 也能用。
3. 与 Arco 主题切换无缝。
4. 现库源码若用 Tailwind class，App 的 `content`（现 `tailwind.config.js:3` 仅 `./src/**`）purge 会删掉库用到的 utility。

breakpoint：库 `styles/index.less` 自带一份，不 `@import` App 的 `src/assets/style/breakpoint.less`（那是 App 专属，base.ts:38 的 modifyVars hack）。

---

## 8. 构建与发布阶段

| 项 | 方案 |
|---|---|
| 产物 | ESM (`dist/index.js`) + CJS (`dist/index.cjs`) + d.ts (`dist/index.d.ts`) + 单一 `dist/style.css` |
| external | vue / @arco-design/web-vue / vue-i18n / @vueuse/core |
| dts | vite-plugin-dts，entryRoot=src，insertTypesEntry |
| cssCodeSplit | false（合并单一 style.css） |
| 当前交付 | 作为 workspace 内部 package 服务本项目，优先完成真实 API 接入与正式发布验证 |
| npm 发布 | 宿主正式发布且 package 稳定验证完成后再评估；当前不以发包为目标，不提前收缩公共 API |

---

## 9. App 侧集成与迁移点（逐 file:line）

### 9.1 库脚手架（新增）
- 根 `package.json` 的 `workspaces` 与 `package-lock.json`
- `packages/admin9-ui/`（全新）

### 9.2 App 配置改动
- `package.json`：devDependencies 加 `"@admin9-labs/admin9-ui": "0.1.0"`
- `src/main.ts`：`app.use(i18n)` 后加 `import Admin9UI` + `app.use(Admin9UI)` + `import styles`
- `tsconfig.json`：`include` 加 `"packages/admin9-ui/src/**/*"`
- `vite.config.base.ts`：`optimizeDeps.exclude` 加 `@admin9-labs/admin9-ui`
- `src/locale/index.ts:33-34`：合并库 messages

### 9.3 组件迁移
- `src/components/image-gallery/index.vue` → 迁入库 `components/media-picker/index.vue`，按 §5.1 改造
- `src/components/index.ts:6,17`：删除 ImageGallery 注册（库接管）
- `src/components/tiptap/control-group.vue:258`：改用 `<AMediaPicker :service="mediaService">`
- `src/views/system/menu/components/EditMenuModal.vue:36-38`：`<a-input>` → `<AIconPicker>`
- 新增 `src/services/mediaService.ts`（App adapter）

### 9.4 useModal 迁移
- `src/views/system/role/index.vue:99`
- `src/views/system/menu/index.vue:156`
- `src/views/system/dict/index.vue:211`
- `src/views/system/dict/index.vue:234`
- `src/api/interceptor.ts:71`

---

## 10. 实施步骤

1. **脚手架**：在根 `package.json` 声明 npm workspaces，并建立 `packages/admin9-ui/` 全套（package.json/tsconfig/vite.config.lib.ts/index.ts 骨架/hooks 副本）。`npm ci` 验证 workspace 自动链接。
2. **AMediaPicker**：迁 image-gallery 进库，按 §5.1 改造（service 注入、修 uid/id bug、上传走 service）。建 `src/services/mediaService.ts` adapter。接 tiptap 调用方验证。
3. **AIconPicker**：构建期生成 Arco 图标名清单 JSON，实现 popover 网格 + 搜索。接 EditMenuModal 验证渲染侧不动。
4. **ADataTable**：提取 picker 内部公共分页列表。
5. **AUserPicker**：复用 ADataTable + service 注入。
6. **useModal**：实现 + 迁移 5 处。
7. **i18n 迁移**：image-gallery 文案统一到 `admin9Ui.mediaPicker.*`，App 合并库 messages。
8. **验证**：`npm run dev` 跑 App，验证素材选择/菜单图标/删除确认全链路；`npm run type:check`；`npm run build`（App + 库各构建一次）。

---

## 11. 风险与待决

1. **[已查明] `/api/upload/image` 响应结构无文档**：Apifox 默认模块(project 7843160)只有 auth/me/admin-users/admin-roles/admin-permissions 接口，**无任何素材接口定义**，schemas 为空。且 Apifox 路径是 `/me`、`/admin/users`（无 `/api/` 前缀），与代码里的 `/api/me`、`/api/system/users` 不一致——后端文档与实现系统性脱节。
   - **合理推断**：现有 image-gallery 上传成功后靠 `watch(uploadFiles)` 队列清空时**整页重拉列表**(`:178-182`)，而非用上传返回的记录——强烈暗示**上传响应里没有稳定 id**（若有，原代码不会选择整页重拉）。
   - **对 AMediaPicker 的影响**：`service.upload()` 不假设返回有 id；adapter 在 id 缺失时返回部分填充的 MediaItem，组件内上传完成后强制 `refresh()` 列表取最新数据。删除依赖列表项的 id，不依赖上传返回值。**需向后端确认 `/api/upload/image` 是否返回 id**，确认后可优化为"上传返回记录直接 push"。
2. **[待决] 头像上传是否统一进 MediaService**：建议**不统一**。头像语义是"绑定用户 profile 的私有资源"（`/api/me/avatar` 上传后触发后端更新 user.avatar），与素材库（公共资源池）不同。头像应走独立 `AvatarUploader`（内部可复用 AMediaPicker "从素材库选一张当头像"，但上传通道分开）。但应顺手收敛 `ProfilePanel.vue:100` 的 `/api/user/upload-avatar`（绕过 axios、无 5MB 校验、响应字段 `data.url` 与 `/api/me/avatar` 的 `data.avatar_url` 不一致，是技术债）→ 改走 `userStore.updateAvatar`。
3. **[风险] A 前缀未来撞名**：见 §3。缓解：install 时名称冲突检测 + console.warn。长期若撞名严重切 A9/Pro。
4. **[风险] 库 dev 消费源码时 App vite3 兼容性**：App vite 3.2.11 较旧，处理 `node_modules` 内 `.vue` 需 `optimizeDeps.exclude`。优先用构建产物 + watch 模式更稳。
5. **[约束] 库内禁用 `@/` 别名**：库源码只能相对导入。现 image-gallery 的 `@/utils/auth`、`@/api/file` 必须替换为 service 注入。
6. **[约束] 库不依赖 `import.meta.env`**：现 image-gallery 的 `VITE_API_BASE_URL`（`:31`）耦合移入 App adapter。
7. **[已知 bug] `system/user.ts:46` 泛型错误**：`queryUserList` 写 `<UserRecord[]>`，实际返回 `HttpResponse<UserRecord[]>`，缺 meta 分页。AUserPicker 的 adapter 要规避（直接用 axios 拿 meta）。
8. **[可选优化] `components/menu/index.vue:93` 的 `compile()`**：依赖运行时模板编译器，可顺势迁到 `<component :is>`（更安全，可去掉运行时编译器依赖）。非本次范围。
