# AGENTS.md

## Scope

This repository owns the backend-agnostic `@admin9-labs/admin9-ui` Vue component package.
Keep concrete API URLs, authentication, stores, routes, application permissions, and business fields in consuming apps.

Public APIs must be components that fill broadly needed gaps in Arco Design Vue, plus the types, locale, styles, and internal implementation required by those components.
Do not expose general-purpose hooks, utility functions, or consuming-app infrastructure. `useLoading` and `useVisible` are internal implementation details only.
The Admin9 `Grid`, `GridToolbar`, and `GridTable` family belongs to the application shared layer and must not move here.

## Commands

Repository development and CI use Node 24 with pnpm 10.5.2. This is a repository toolchain baseline, not a package-consumer runtime restriction. Do not add a repository-only `packageManager` pin to the published manifest.

```bash
corepack enable
corepack prepare pnpm@10.5.2 --activate
pnpm install --frozen-lockfile
# During development, run only checks relevant to the changed scope.
pnpm test -- tests/file-picker.spec.ts
pnpm run type:check
pnpm run lint
pnpm run changelog:check

# Run at most once locally before handing off a release candidate.
pnpm run release:check
```

GitHub Actions is the final authority for pull requests, main pushes, and releases. Do not duplicate the full gate locally after an unchanged candidate has passed it.

Do not publish a version until the exact real tarball being published has passed isolated consumer verification. Release tags trigger `.github/workflows/release.yml`; local npm credentials are not part of the release path.

`CHANGELOG.md` is the source of truth for GitHub Release Notes. Every release candidate must move the prepared entries from `Unreleased` into a dated `## [X.Y.Z] - YYYY-MM-DD` section matching `package.json`.
