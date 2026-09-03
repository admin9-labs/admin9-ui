# @admin9-labs/admin9-ui

基于 Vue 3 与 Arco Design Vue 的中后台通用组件库，用于补充 Arco Design Vue 尚未提供、且可跨应用复用的组件。

本包不包含具体 API、认证、路由、状态管理、权限和业务字段。使用本组件库的应用负责提供这些能力以及组件所需的数据适配器。

`main` 分支的文档可能包含尚未发布的变更；使用已发布版本时，以该版本随包提供的文档和 [CHANGELOG](./CHANGELOG.md) 为准。

## 安装

```bash
pnpm add @admin9-labs/admin9-ui
```

应用需要提供以下 peer dependencies：

- Vue `^3.5.0`
- Arco Design Vue `^2.57.0`
- vue-i18n `^9.14.0`

应用可以使用任意兼容的包管理器。

## 快速使用

全局安装组件并加载样式：

```ts
import { createApp } from 'vue';
import Admin9UI from '@admin9-labs/admin9-ui';
import '@admin9-labs/admin9-ui/styles';

const app = createApp(App);

app.use(Admin9UI, {
  fileService: fileServiceAdapter,
});
```

只有使用文件选择、上传或富文本媒体能力时才需要 `fileService`。使用点传入的 `service` prop 优先于插件默认值。

也可以按需导入：

```ts
import {
  ACoordinatePicker,
  AFilePicker,
  AFileUploader,
  AFilterForm,
  AIconPicker,
  AProTable,
  ATiptapEditor,
} from '@admin9-labs/admin9-ui';
import { messages, localePrefix } from '@admin9-labs/admin9-ui/locale';
```

组件库不创建独立的 vue-i18n 实例。应用需要将 `messages` 合并到自己的 i18n 配置中。

## 组件

- [`ACoordinatePicker`](./docs/components/coordinate-picker.md)：基于腾讯地图 JavaScript API GL 的表单级坐标选择器
- [`AFilePicker`](./docs/components/file-picker.md)：支持后端分页、跨页选择和可选上传的文件选择器
- [`AFileUploader`](./docs/components/file-uploader.md)：支持进度、取消、重试和部分成功的本地批量上传队列
- [`AFilterForm`](./docs/components/filter-form.md)：默认提供卡片式背景，并根据字段数和响应式列数自动调整布局的筛选表单
- [`AIconPicker`](./docs/components/icon-picker.md)：支持分类、搜索和键盘导航的 Arco 图标选择器
- [`AProTable`](./docs/components/pro-table.md)：通过 `fetcher` 接入数据源的页面级表格
- [`ATiptapEditor`](./docs/components/tiptap-editor.md)：支持常用格式与图片、视频、音频编辑的 HTML 富文本编辑器

包同时导出组件相关类型、`Admin9UIPluginOptions`、文件浏览与上传能力类型、locale 资源和 `arcoIconNames`。

## 集成边界

- `AFilePicker` 和 `AFileUploader` 只负责选择与上传交互。文件管理页面以及删除、移动、分组、权限和业务字段由应用实现。
- 文件 adapter 必须在完整数据集上筛选并分页，返回准确的总数；组件不会通过过滤当前页模拟服务端结果。
- 上传能力开关只控制界面。应用后端仍需校验文件内容、类型、大小、身份、资源归属和操作权限。
- `ACoordinatePicker` 的浏览器端 Key、来源白名单、额度和坐标系转换由应用管理。
- `ATiptapEditor` 会过滤不安全的媒体 URL 和节点属性，但应用在公开展示已保存 HTML 前仍需执行服务端内容清洗。

本项目遵循语义化版本。在 `0.x` 阶段，次版本可能包含不兼容调整，升级前请查阅 [CHANGELOG](./CHANGELOG.md)。

## License

[MIT](./LICENSE)
