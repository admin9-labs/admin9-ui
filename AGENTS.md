# AGENTS.md

## Scope

This repository owns the backend-agnostic `@admin9-labs/admin9-ui` Vue component package.
Keep concrete API URLs, authentication, stores, routes, application permissions, and business fields in consuming apps.

Public APIs must be components that fill broadly needed gaps in Arco Design Vue, plus the types, locale, styles, and internal implementation required by those components.
Do not expose general-purpose hooks, utility functions, or consuming-app infrastructure. `useLoading` and `useVisible` are internal implementation details only.
The Admin9 `Grid`, `GridToolbar`, and `GridTable` family belongs to the application shared layer and must not move here.

## Commands

Repository development and CI use Node 20 with pnpm 10.5.2. This is a repository toolchain baseline, not a package-consumer runtime restriction. Do not add a repository-only `packageManager` pin to the published manifest.

```bash
corepack enable
corepack prepare pnpm@10.5.2 --activate
pnpm install --frozen-lockfile
pnpm run type:check
pnpm run acceptance:typecheck
pnpm run lint
pnpm test
pnpm run build
pnpm run acceptance:build
pnpm run pack:check
pnpm run verify:tarball
pnpm run release:check
```

Do not publish a version until a real tarball has passed isolated consumer verification.
