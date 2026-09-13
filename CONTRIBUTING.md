# 参与开发

本仓库维护后端无关的 `@admin9-labs/admin9-ui` Vue 组件包。公共能力应是能够跨应用复用、并补充 Arco Design Vue 通用场景的组件；具体 API、认证、路由、状态、权限和业务字段留在使用组件库的应用中。

## 开发环境

仓库开发与 CI 使用 Node 24 和 pnpm 10.5.2。这是仓库工具链基线，不是 npm 包使用者的运行时限制。

```bash
corepack pnpm@10.5.2 install --frozen-lockfile
```

## 日常检查

开发过程中只运行与改动范围相关的检查，例如：

```bash
corepack pnpm@10.5.2 exec vitest run tests/file-picker.spec.ts
corepack pnpm@10.5.2 run type:check
corepack pnpm@10.5.2 run lint
corepack pnpm@10.5.2 run changelog:check
```

`corepack pnpm@10.5.2 run acceptance:dev` 启动使用 fake service 的浏览器验收应用。它只验证组件交互与样式，不代表真实业务应用或后端验收。

公共 API、可观察行为或升级要求发生变化时，同步更新组件文档和 `CHANGELOG.md` 的 `Unreleased` 章节。纯内部重构、测试和发布流程调整不写入面向使用者的 CHANGELOG。

## 候选验证

提交发布候选前可在改动冻结后运行一次完整门禁以提前发现问题；发布权威证据仍是对应提交的 `main` CI：

```bash
corepack pnpm@10.5.2 run release:check
```

该命令包含 CHANGELOG 校验、类型检查、lint、组件测试、验收应用构建和真实 tarball 隔离消费验证。输入未变化时不要重复执行完整门禁；GitHub Actions 是 pull request、`main` push 和发布的最终质量结论。

发布操作见 [RELEASING.md](./RELEASING.md)。

## 全组件契约验收

启动验收应用后打开 `http://127.0.0.1:4174/?audit=1`。此页面集中覆盖十个组件，可切换 Arco 尺寸、中英文、明暗主题、Form 禁用、只读、窄容器和 fake service 状态。聊天滚动与流式性能场景仍在 `?component=chat`，富文本深度场景在 `?component=tiptap-editor`。

真实 Arco 集成回归位于 `tests/arco-integration.spec.ts`。底层组件测试桩必须使用当前 Arco 的真实 Props/Events 接口；公开类型必须同时在隔离 tarball 夹具中验证。审查台账位于 `docs/reviews/component-library-audit.md`，不包含在发布包中。
