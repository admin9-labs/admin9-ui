# AGENTS.md

## Scope

This repository owns the backend-agnostic `@admin9-labs/admin9-ui` Vue component package.
Keep concrete API URLs, authentication, stores, routes, application permissions, and business fields in consuming apps.

`useLoading` and `useVisible` are inherited capabilities and remain supported unless a concrete defect requires change.
The Admin9 `Grid`, `GridToolbar`, and `GridTable` family belongs to the application shared layer and must not move here.

## Commands

```bash
npm ci
npm run type:check
npm run lint
npm test
npm run build
npm pack --dry-run
```

Use Node 22 and npm 11. Do not publish a version until a real tarball has passed isolated consumer verification.
