# @admin9-labs/admin9-ui

基于 Vue 3 与 Arco Design Vue 的中后台通用组件库，专门补充 Arco Design Vue 官方未提供、且中后台项目普遍需要的组件。

本包不提供通用 hooks、工具函数、路由、状态管理或其他宿主应用基础设施。

当前版本为 `0.1.0`。本项目遵循语义化版本；在 `0.x` 阶段，次版本可能包含不兼容调整。

## 安装

```bash
pnpm add @admin9-labs/admin9-ui@0.1.0
```

消费应用可以使用自己的包管理器；这里使用 pnpm 只是示例，不要求消费者采用本仓库的开发工具版本。

宿主需要提供以下 peer dependencies：

- Vue `^3.5.0`
- Arco Design Vue `^2.57.0`
- vue-i18n `^9.14.0`

## 使用

全局安装组件并加载样式：

```ts
import { createApp } from 'vue';
import Admin9UI from '@admin9-labs/admin9-ui';
import '@admin9-labs/admin9-ui/styles';

const app = createApp(App);
app.use(Admin9UI, {
  mediaService: mediaServiceAdapter,
});
```

插件第二个参数使用公开类型 `Admin9UIPluginOptions`，对应 `app.use(Admin9UI, options)` 的配置对象。
原有 `Admin9UIOptions` 类型作为兼容别名保留，新代码应使用含义更明确的新名称。

也可以按需导入：

```ts
import { AMediaLibrary, AMediaPicker, AIconPicker, AProTable } from '@admin9-labs/admin9-ui';
import { messages, localePrefix } from '@admin9-labs/admin9-ui/locale';
```

组件库不创建独立的 vue-i18n 实例。消费方应将 `messages` 合并到宿主 i18n 配置中。

## 公开能力

- 默认导出的 `Admin9UI` 插件：全局注册四个组件，并可注入默认 `MediaService`
- [`AMediaPicker`](./docs/components/media-picker.md)：支持图片、视频和音频的表单级轻量素材选择器
- [`AMediaLibrary`](./docs/components/media-library.md)：支持分组、上传、移动和删除的页面级素材管理组件
- `AIconPicker`：Arco 图标选择器
- `AProTable`：通过 fetcher 注入数据源的页面级表格
- `Admin9UIPluginOptions`、`MediaService`、`MediaLibraryService` 及相关数据类型
- `messages`、`localePrefix`、`zhCN`、`enUS` 和 `arcoIconNames`
- `@admin9-labs/admin9-ui/styles`：四个组件的统一样式入口

## 素材组件边界

组件库只定义接口契约和渲染行为，不包含具体 API URL、认证、store、router、权限或应用业务字段。
消费方通过使用点的 `service` prop，或 `app.use(Admin9UI, { mediaService })` 注入 adapter。

- `AMediaPicker` 面向表单中的轻量选择、上传和按分组浏览，不提供分组管理或完整素材管理操作。
- `AMediaLibrary` 面向完整页面管理：单级分组 CRUD、后端分页查询、上传、单项/批量移动和删除，以及跨页/跨组选择。
- 多级目录、排序、标签、版权、审核、版本、转码、审计和业务权限不属于本包。能力开关只控制界面，后端仍需执行授权。

完整的接口定义与边界见 [DESIGN.md](./DESIGN.md#4-service-契约)，使用方式见对应组件文档。

## 开发

仓库开发与 CI 基线为 Node 20、pnpm 10.5.2。该基线用于可重复开发和发布验证，不等同于 npm 包消费者的运行时限制。

```bash
corepack enable
corepack prepare pnpm@10.5.2 --activate
pnpm install --frozen-lockfile
pnpm run type:check
pnpm run lint
pnpm test
pnpm run build
pnpm run pack:check
```

组件库拥有自己的独立测试闭环，不依赖任何业务应用：

```bash
# 组件契约测试
pnpm test

# 启动使用 fake service 的浏览器验收宿主
pnpm run acceptance:dev

# 构建验收宿主
pnpm run acceptance:typecheck
pnpm run acceptance:build

# 构建真实 tarball，并在临时 Vue 消费工程中验证入口、类型、样式和挂载
pnpm run verify:tarball

# 发布前完整门禁（不会发布 package）
pnpm run release:check
```

`dev/` 只服务于组件库开发验收，不属于 package 公共 API，也不会进入 tarball。`tests/consumer-fixture/` 只会被复制到临时目录，并从真实 `.tgz` 安装 `@admin9-labs/admin9-ui`；它不会从 `src/` 回源。

完整设计边界与历史决策见 [DESIGN.md](./DESIGN.md)。

## License

[MIT](./LICENSE)
