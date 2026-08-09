# @admin9-labs/admin9-ui

基于 Vue 3 与 Arco Design Vue 的中后台通用组件库，专门补充 Arco Design Vue 官方未提供、且中后台项目普遍需要的组件。

本包不提供通用 hooks、工具函数、路由、状态管理或其他宿主应用基础设施。

当前版本为 `0.1.0`。本项目遵循语义化版本；在 `0.x` 阶段，次版本可能包含不兼容调整。

## 安装

```bash
npm install @admin9-labs/admin9-ui@0.1.0
```

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

也可以按需导入：

```ts
import { AMediaPicker, AIconPicker, AProTable } from '@admin9-labs/admin9-ui';
import { messages, localePrefix } from '@admin9-labs/admin9-ui/locale';
```

组件库不创建独立的 vue-i18n 实例。消费方应将 `messages` 合并到宿主 i18n 配置中。

## 公开能力

- 默认导出的 `Admin9UI` 插件：全局注册三个组件，并可注入默认 `MediaService`
- `AMediaPicker`：支持图片、视频和音频的表单级轻量素材选择器
- `AIconPicker`：Arco 图标选择器
- `AProTable`：通过 fetcher 注入数据源的页面级表格
- `Admin9UIOptions`、`MediaService` 及相关数据类型
- `messages`、`localePrefix`、`zhCN`、`enUS` 和 `arcoIconNames`
- `@admin9-labs/admin9-ui/styles`：三个组件的统一样式入口

## 后端边界

组件库只定义接口契约和渲染行为，不包含具体 API URL、认证、store、router、权限或应用业务字段。
消费方通过使用点的 `service` prop，或 `app.use(Admin9UI, { mediaService })` 注入 adapter。

`AMediaPicker` 的 `mediaType` 默认为 `image`，单个实例只处理一种素材类型。列表的类型、分组和关键词筛选统一由消费方 adapter 对接后端完成；组件不会过滤已分页的结果。`listGroups` 为可选能力，未实现时 Picker 不显示分组导航。

```vue
<a-media-picker v-model="video" media-type="video" :service="mediaServiceAdapter" :can-delete="false" />
```

## 素材组件边界

- `AMediaPicker` 面向表单中的轻量选择、上传和按分组浏览，不提供分组管理或完整素材管理操作。
- `AMediaLibrary` 是已确认的后续页面级素材管理组件，面向后续融媒体项目；它会复用媒体契约与基础展示能力，但不在本阶段交付。
- 分组新建、改名、排序、删除、批量移动、完整管理工具栏、多级目录和标签不属于 Picker。

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
