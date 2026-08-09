# @admin9-labs/admin9-ui

Admin9 Pro 中后台增强业务组件库，基于 Vue 3 与 Arco Design Vue。

当前版本为 `0.1.0`。本项目遵循语义化版本；在 `0.x` 阶段，次版本可能包含不兼容调整。

## 安装

```bash
npm install @admin9-labs/admin9-ui@0.1.0
```

宿主需要提供以下 peer dependencies：

- Vue `^3.5.0`
- Arco Design Vue `^2.57.0`
- vue-i18n `^9.14.0`
- VueUse `^9.13.0`

## 使用

全局安装组件并加载样式：

```ts
import { createApp } from 'vue';
import Admin9UI from '@admin9-labs/admin9-ui';
import '@admin9-labs/admin9-ui/styles';

const app = createApp(App);
app.use(Admin9UI, {
  mediaService: mediaServiceAdapter,
  userService: userServiceAdapter,
});
```

也可以按需导入：

```ts
import { AMediaPicker, useModal } from '@admin9-labs/admin9-ui';
import { messages } from '@admin9-labs/admin9-ui/locale';
```

组件库不创建独立的 vue-i18n 实例。消费方应将 `messages` 合并到宿主 i18n 配置中。

## 公开能力

- `AMediaPicker`：可注入素材服务的素材选择器
- `AIconPicker`：Arco 图标选择器
- `AUserPicker`：可注入用户服务的分页选人组件
- `AProTable`：通过 fetcher 注入数据源的页面级表格
- `useModal`：命令式弹窗 composable
- `useLoading`、`useVisible`：轻量状态 hooks
- `MediaService`、`UserService` 及相关数据类型
- `messages`、`localePrefix` 和 `arcoIconNames`

## 后端边界

组件库只定义接口契约和渲染行为，不包含具体 API URL、认证、store、router、权限或应用业务字段。
消费方通过使用点的 `service` prop，或 `app.use(Admin9UI, { mediaService, userService })` 注入 adapter。

## 开发

需要 Node 22 与 npm 11：

```bash
npm ci
npm run type:check
npm run lint
npm test
npm run build
npm pack --dry-run
```

完整设计边界与历史决策见 [DESIGN.md](./DESIGN.md)。

## License

[MIT](./LICENSE)
