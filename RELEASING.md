# 发布维护手册

正式版本通过语义版本 tag 触发 `.github/workflows/release.yml`，并由 GitHub Actions 使用 npm Trusted Publishing/OIDC 发布。不要在本地执行 `npm publish`，也不要使用本地 npm 凭据代替发布工作流。

## 发布前提

- `CHANGELOG.md` 是 GitHub Release Notes 的唯一来源；
- `package.json` 版本、CHANGELOG 版本章节和 tag 必须一致；
- 待发布的真实 tarball 必须通过隔离消费验证；
- 发布提交必须已经进入远程 `main` 并通过对应 CI；
- 一次只推送一个发布 tag，等待其 workflow 完成后再开始下一个版本。

## 发布步骤

1. 将本次内容从 `Unreleased` 移入带日期的 `## [X.Y.Z] - YYYY-MM-DD` 章节，并保留新的空 `Unreleased` 章节。
2. 在同一个可审查的提交中更新 `package.json` 版本，运行 `pnpm run changelog:check`，确认版本章节与 manifest 一致。
3. 运行 `npm view @admin9-labs/admin9-ui@X.Y.Z version` 查询目标版本。只有明确返回 E404 才表示尚未发布；返回版本号时停止并选择新版本，其他错误不得视为可用。
4. 改动冻结后运行一次 `pnpm run release:check`，确认真实 tarball 及隔离消费工程通过。
5. 将发布提交推送到 `main`，等待该提交对应的 CI 通过。
6. 在计划的发布提交上创建 annotated tag，例如 `git tag -a v0.9.0 <release-commit> -m "v0.9.0"`。
7. 再次核对 tag、package 版本、CHANGELOG 和提交后，单独推送该 tag。
8. 等待 Release workflow 的 `verify`、`publish` 和 `github-release` job 全部通过。
9. 核对 npm package 版本、`latest` dist-tag、provenance，以及 GitHub Release 正文和附件。

## 工作流保证

- `verify` 只读取仓库，运行完整门禁并保存已经通过隔离消费验证的 tgz；
- `publish` 使用同一个 artifact，通过 OIDC 发布，并校验 Registry integrity、`latest` 和 provenance；
- `github-release` 仅在 npm 发布成功后创建或核验 GitHub Release；
- npm 发布和 GitHub Release 前都会重新确认远端 tag 仍指向 Actions 事件提交；
- 已存在版本或 Release 只有在内容完全一致时才会安全跳过，任何冲突都会使工作流失败。

## 失败处理

发布失败时优先重跑同一个 Actions workflow，不移动或复用 tag，也不重新打包同一版本。

如果错误版本已经发布，通过 `npm deprecate` 标记，并发布新的 patch 版本。除 npm 安全事件或官方策略允许的紧急情况外，不使用 unpublish，不覆盖 GitHub Release 附件。

## 仓库外配置

npm package 的 Trusted Publisher 需要保持以下配置：

- 组织：`admin9-labs`
- 仓库：`admin9-ui`
- workflow：`release.yml`
- 权限：允许 `npm publish`

新发布工作流进入远程 `main` 后，应启用 GitHub Release immutability。此后不得移动或删除已发布 tag。
