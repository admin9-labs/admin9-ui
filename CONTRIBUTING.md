# 参与开发

本仓库维护后端无关的 `@admin9-labs/admin9-ui` Vue 组件包。公共能力应是能够跨应用复用、并补充 Arco Design Vue 通用场景的组件；具体 API、认证、路由、状态、权限和业务字段留在使用组件库的应用中。

## 开发环境

仓库开发与 CI 使用 Node 24 和 pnpm 10.5.2。这是仓库工具链基线，不是 npm 包使用者的运行时限制。

```bash
corepack enable
corepack prepare pnpm@10.5.2 --activate
pnpm install --frozen-lockfile
```

## 日常检查

开发过程中只运行与改动范围相关的检查，例如：

```bash
pnpm exec vitest run tests/file-picker.spec.ts
pnpm run type:check
pnpm run lint
pnpm run changelog:check
```

`pnpm run acceptance:dev` 启动使用 fake service 的浏览器验收应用。它只验证组件交互与样式，不代表真实业务应用或后端验收。

公共 API、可观察行为或升级要求发生变化时，同步更新组件文档和 `CHANGELOG.md` 的 `Unreleased` 章节。纯内部重构、测试和发布流程调整不写入面向使用者的 CHANGELOG。

## 候选验证

提交发布候选前，在改动冻结后最多运行一次：

```bash
pnpm run release:check
```

该命令包含 CHANGELOG 校验、类型检查、lint、组件测试、验收应用构建和真实 tarball 隔离消费验证。输入未变化时不要重复执行完整门禁；GitHub Actions 是 pull request、`main` push 和发布的最终质量结论。

发布操作见 [RELEASING.md](./RELEASING.md)。
