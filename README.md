# @admin9-labs/admin9-ui

基于 Vue 3 与 Arco Design Vue 的中后台通用组件库，专门补充 Arco Design Vue 官方未提供、且中后台项目普遍需要的组件。

本包不提供通用 hooks、工具函数、路由、状态管理或其他宿主应用基础设施。

当前版本为 `0.4.0`。本项目遵循语义化版本；在 `0.x` 阶段，次版本可能包含不兼容调整。
完整版本记录见 [CHANGELOG.md](./CHANGELOG.md)。

## 安装

```bash
pnpm add @admin9-labs/admin9-ui@0.4.0
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
  fileService: fileServiceAdapter,
});
```

插件第二个参数使用公开类型 `Admin9UIPluginOptions`，对应 `app.use(Admin9UI, options)` 的配置对象。
原有 `Admin9UIOptions` 类型作为兼容别名保留，新代码应使用含义更明确的新名称。

也可以按需导入：

```ts
import {
  AFileManager,
  AFilePicker,
  AMediaLibrary,
  AMediaPicker,
  AIconPicker,
  AProTable,
  ATiptapEditor,
} from '@admin9-labs/admin9-ui';
import { messages, localePrefix } from '@admin9-labs/admin9-ui/locale';
```

组件库不创建独立的 vue-i18n 实例。消费方应将 `messages` 合并到宿主 i18n 配置中。

## 公开能力

- 默认导出的 `Admin9UI` 插件：全局注册七个组件，并可注入默认媒体与文件 adapter
- [`AMediaPicker`](./docs/components/media-picker.md)：支持图片、视频和音频的表单级轻量素材选择器
- [`AMediaLibrary`](./docs/components/media-library.md)：支持分组、上传、移动和删除的页面级素材管理组件
- [`AFileManager`](./docs/components/file-manager.md)：以文件类型优先、类型内单级分组为信息层级的页面级文件管理组件
- [`AFilePicker`](./docs/components/file-picker.md)：支持六类文件、后端准确分页与可选上传的表单级轻量选择器
- [`AIconPicker`](./docs/components/icon-picker.md)：支持分类、搜索、键盘导航和表单状态的 Arco 图标选择器
- `AProTable`：通过 fetcher 注入数据源的页面级表格
- [`ATiptapEditor`](./docs/components/tiptap-editor.md)：基于 Tiptap，支持内部滚动工作区、悬浮媒体工具栏、独占一行/跟随文字图片、可调尺寸视频与三档播放器宽度的表单级 HTML 富文本编辑器
- `Admin9UIPluginOptions`、媒体与文件 browse/upload/management 能力、兼容的完整 service 类型及相关数据类型
- `messages`、`localePrefix`、`zhCN`、`enUS` 和 `arcoIconNames`
- `@admin9-labs/admin9-ui/styles`：七个组件的统一样式入口

## 素材组件边界

组件库只定义接口契约和渲染行为，不包含具体 API URL、认证、store、router、权限或应用业务字段。
消费方通过使用点的 `service` prop，或 `app.use(Admin9UI, { mediaService })` 注入 adapter。

- `AMediaPicker` 面向表单中的轻量选择和按分组浏览，可显式启用上传，不提供删除、分组管理或其他素材管理操作。
- `AMediaLibrary` 面向页面级浏览与管理：基础只读模式仅要求分页查询，分组、上传、移动和删除按 adapter 能力与界面开关启用。
- 多级目录、排序、标签、版权、审核、版本、转码、审计和业务权限不属于本包。能力开关只控制界面，后端仍需执行授权。

完整的接口定义与边界见 [DESIGN.md](./DESIGN.md#4-service-契约)，使用方式见对应组件文档。

## 文件组件边界

`AFileManager` 与 `AFilePicker` 共享文件契约，但职责独立：Manager 是页面级管理表面，Picker 用于表单、弹窗和附件字段中的轻量选择，不提供移动、删除或分组管理。两者支持 `image`、`video`、`audio`、`document`、`archive`、`other` 六种真实 `FileType`；“全部”只是聚合查询筛选，不会写入 `FileItem` 或传给上传、分组、移动能力。

消费方通过使用点的 `service` prop，或 `app.use(Admin9UI, { fileService })` 注入共享文件 service；使用点 prop 优先。Manager 使用 `FileManagerAdapter`，Picker 使用最小的 `FilePickerAdapter`。能力开关只控制界面，不替代后端授权。

`FileListParams` 的聚合查询省略 `fileTypes` 表示六类全部；提供 `fileTypes` 时表示准确的真实类型集合，空数组表示无匹配。adapter 必须在后端对完整集合进行筛选、分页并返回准确 `pagination.total/typeCounts`，禁止仅过滤当前页。具体类型查询才能携带 `groupId`。完整行为见 [`AFileManager` 文档](./docs/components/file-manager.md)与 [`AFilePicker` 文档](./docs/components/file-picker.md)。

## 开发

仓库开发与 CI 基线为 Node 24、pnpm 10.5.2。该基线用于可重复开发和发布验证，不等同于 npm 包消费者的运行时限制。

```bash
corepack enable
corepack prepare pnpm@10.5.2 --activate
pnpm install --frozen-lockfile

# 日常开发只运行与改动相关的测试、类型检查或 lint
pnpm test -- tests/media-picker.spec.ts
pnpm run type:check
pnpm run lint
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

# 提交发布候选前最多运行一次的本地预检（不会发布 package）
pnpm run release:check
```

`dev/` 只服务于组件库开发验收，不属于 package 公共 API，也不会进入 tarball。`tests/consumer-fixture/` 只会被复制到临时目录，并从真实 `.tgz` 安装 `@admin9-labs/admin9-ui`；它不会从 `src/` 回源。

GitHub Actions 是 PR、`main` push 和正式发布的最终质量权威。正式发布的唯一入口是推送与 `package.json` 版本严格一致的 `vX.Y.Z` tag；不要在本地重新打包、执行 `npm publish` 或使用本地 npm 凭据发布。

`.github/workflows/release.yml` 使用全局 concurrency group，确保同一时刻最多只有一个发布 workflow 正在运行，并依次完成：

1. 确认 tag 提交等于 Actions checkout 的提交，且是远程 `main` 的祖先；
2. 运行完整质量门禁，构建真实 tgz，并在隔离消费工程验证该 tgz；
3. 通过 artifact 原样传递该 tgz，使用 npm Trusted Publishing/OIDC 发布；已存在版本仅在 Registry integrity 一致时跳过；
4. 有限重试校验 Registry 包名、版本、`dist.integrity`、`dist-tags.latest`，以及 SLSA provenance 中的仓库、workflow、tag、Git SHA 和 subject digest；
5. 从 `CHANGELOG.md` 提取对应版本章节，创建 GitHub Release、转正式发布完全一致的 draft，或确认已有正式 Release 的正文、tag、附件名称、大小和 SHA-256 完全一致。工作流不会覆盖不一致的正文或附件，也不会接受 prerelease。

### 维护者发版步骤

1. 整理 `CHANGELOG.md` 的 `Unreleased` 内容，将本次变更移入带日期的 `## [X.Y.Z] - YYYY-MM-DD` 章节，并保留新的空 `Unreleased` 章节。
2. 在同一个可审查的发布提交中更新 `package.json` 版本，运行 `pnpm run changelog:check`，确认版本章节与 manifest 一致；不要复用任何已经发布的版本号。
3. 将发布提交推送到 `main` 并等待 CI 通过。首次发版通常在这个计划好的发布提交上创建 annotated tag；ancestor 校验只用于允许 `main` 前进后的安全重跑。
4. 创建规范 tag，例如 `git tag -a v0.4.0 <release-commit> -m "v0.4.0"`，再次确认 tag、package 版本、CHANGELOG 和提交后，单独推送该 tag。一次只能推送一个发布 tag，必须等该 workflow 完成后再推送下一版本；GitHub concurrency 只保留一个 running 和一个 pending，新的 pending 可能替换旧的 pending。
5. 观察 Release workflow 的三个 job 全部通过，再核对 npm package 页、`latest` dist-tag、provenance，以及 GitHub Release 正文与附件。

失败时优先在 GitHub Actions 中重跑同一个 workflow。相同版本和相同 integrity 会安全跳过重复 npm 发布；一致的 GitHub Release 也会跳过。若 Registry integrity、`latest`、provenance 或 Release 附件不一致，工作流会失败，维护者不得通过移动 tag、复用版本或覆盖附件绕过校验。已发布的错误版本应执行 `npm deprecate @admin9-labs/admin9-ui@<bad-version> "<reason>"`，修复后发布新的 patch 版本；除 npm 安全事件和官方策略允许的紧急情况外，不使用 unpublish。

npm 发布使用 Trusted Publishing/OIDC。仓库外必须在 npm package 设置中保持 GitHub Actions Trusted Publisher：组织 `admin9-labs`、仓库 `admin9-ui`、工作流文件 `release.yml`，并允许 `npm publish`。该配置不包含仓库 secret。新 workflow 进入远端 `main` 后，再启用 GitHub Release immutability；从此不得移动或删除已发布 tag。branch protection/ruleset 可按维护者规模配置为要求 `CI` 通过，但不是当前发布脚本的前置条件。

完整设计边界与历史决策见 [DESIGN.md](./DESIGN.md)。

## License

[MIT](./LICENSE)
