# @admin9-labs/admin9-ui

Admin9 Pro 中后台增强业务组件库，基于 Arco Design Vue。

> 状态：开发中（v0.1.0）。设计文档见 `DESIGN.md`。

## 安装

```bash
npm install @admin9-labs/admin9-ui
```

peerDependencies：`vue`、`@arco-design/web-vue`、`vue-i18n`、`@vueuse/core`。

## 使用

```ts
// main.ts
import Admin9UI from '@admin9-labs/admin9-ui';
import '@admin9-labs/admin9-ui/styles';

// 可选：全局注入默认服务（使用点不传 :service 时回退）
app.use(Admin9UI, {
  mediaService: mediaServiceAdapter,
  userService: userServiceAdapter,
});
```

## 职责边界

**库只定义接口契约 + 渲染 UI，不含任何具体后端实现。**

- 库定义 `MediaService` / `UserService` 接口（`src/services/types.ts`）
- App 写 adapter 实现接口（调具体 URL、拼 token、解响应）
- 注入方式：使用点 `:service="xxx"` 或全局 `app.use(Admin9UI, { mediaService })`

换后端，App 重写 adapter，库代码不动。

## 组件

| 组件 | 状态 | 说明 |
|---|---|---|
| `AMediaPicker` | 开发中 | 素材选择器（升级自 image-gallery） |
| `AIconPicker` | 开发中 | 图标选择器（替换菜单手敲 input） |
| `AUserPicker` | 开发中 | 用户选择器（弹窗分页选人） |
| `useModal` | ✅ | 命令式弹窗（收敛删除确认） |

## 开发

```bash
# 在 monorepo 根
npm ci

# 构建库
npm run build --workspace=@admin9-labs/admin9-ui

# watch 模式
npm run dev --workspace=@admin9-labs/admin9-ui
```
