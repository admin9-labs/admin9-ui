# 组件体验接入要求

组件库负责通用选择、管理、上传、编辑和状态展示。真实权限、业务保存、数据请求、恢复策略和业务字段留在消费应用中。以下事项不能仅通过更新组件库文案完成，应用接入时需要分别落实。

## 操作对象与服务能力

| 接入事项 | 应用／后端必须提供 | 验收要求 |
| --- | --- | --- |
| 字段移除、正文删除与素材库删除 | 区分字段值变化、编辑器内容变化和 `deleteFiles` 服务调用 | 移除字段图片或正文图片不请求删库；只有素材管理中的确认删除请求 `deleteFiles` |
| 管理操作与取消选择 | 向用户说明删除／移动即时执行，取消选择只丢弃当前选择草稿 | 关闭选择器不被视作回滚已成功的管理操作；字段最终提交仍由应用保存 |
| 删除恢复和引用影响 | 定义软删除／永久删除、回收站、恢复方式、已被使用素材的影响 | 没有明确契约时，不额外宣称“永久删除”“无法恢复”“不会影响已发布内容” |
| 文件与分组权限 | 后端验证实际权限、资源归属及分组操作权限；界面开关与用户真实权限对应 | 隐藏按钮不代替后端校验；被拒绝的服务操作不会被报告成功 |
| 部分成功 | `deleteFiles`、`moveFiles` 只返回真实成功的 ID | 未返回的 ID 保持未成功状态；重试不重复报告或操作已成功项 |
| 分组创建失败 | 如需提示“名称重复”，提供稳定、受控的错误原因映射 | 不直接展示任意异常的 message；没有可识别原因时保留通用错误和输入 |
| 上传成功 | 返回可用、类型匹配、具有稳定 ID 和地址的 `FileItem` | 上传到库不等于选入字段，不等于整个表单已保存；服务负责真实文件验证 |
| 取消上传 | 根据 `AbortSignal` 停止任务，明确服务是否已产生素材 | 已上传成功的文件不能仅因关闭队列或取消选择被暗示已删除 |

API、身份验证和服务端数据结构由应用 adapter 适配。组件只使用已有能力类型；不在组件库增加业务路由、认证、保存接口或回收站接口。

## 编辑器图片任务与业务保存

`ATiptapEditor` 的 `image-upload-state-change` 和 `getImageUploadState()` 已提供 `canSave`。存在等待、上传中或失败图片时，消费应用必须阻止提交并给出恢复提示；用户等待、重试或移除未完成图片后再提交。`canSave` 不代替业务表单校验，也不代表服务器已经保存正文。

建议提示按状态区分：上传中显示“图片正在上传，完成后可保存”；有失败任务时显示“有图片上传失败，请重试或移除后保存”。应用保存按钮应持续显示原因，而不是仅依赖短暂消息。

```vue
<script setup lang="ts">
  import { ref } from 'vue';
  import { ATiptapEditor, type ATiptapEditorExposed, type TiptapImageUploadState } from '@admin9-labs/admin9-ui';
  import { saveArticleContent } from './api';

  const editor = ref<ATiptapEditorExposed>();
  const content = ref('');
  const uploadState = ref<TiptapImageUploadState>({ pending: 0, uploading: 0, failed: 0, canSave: true });
  const saving = ref(false);
  const saveError = ref(false);
  const save = async () => {
    // 点击时再次读取，不能把 UI 按钮状态当作提交校验。
    if (saving.value || !editor.value?.getImageUploadState().canSave) return;
    saving.value = true;
    saveError.value = false;
    try {
      await saveArticleContent(editor.value.getHTML());
    } catch {
      saveError.value = true;
    } finally {
      saving.value = false;
    }
  };
</script>

<template>
  <ATiptapEditor ref="editor" v-model="content" @image-upload-state-change="uploadState = $event" />
  <p v-if="uploadState.failed" role="status">有图片上传失败，请重试或移除后保存。</p>
  <p v-else-if="!uploadState.canSave" role="status">图片正在上传，完成后可保存。</p>
  <a-button :disabled="!uploadState.canSave" :loading="saving" @click="save">保存</a-button>
  <a-alert v-if="saveError" type="error">保存失败，正文已保留，请重试。</a-alert>
</template>
```

例子中的 `saveArticleContent` 是应用自己的保存函数。启用本地图片上传时还需按 [编辑器文档](./tiptap-editor.md) 提供上传服务；服务端验证、公开 HTML 展示前的清洗和表单其余字段校验也由应用处理。

## 聊天阻塞与回复恢复

`AChatComposer.submitDisabled` 只表示应用禁止提交，组件不知道具体原因。附件上传、额度、网络连接等业务原因应由应用在 `header`／`toolbar`／`action` 插槽或输入区域旁持续说明，并通过 `textareaAttrs` 的 `aria-describedby` 关联提示。不要把任何禁用状态都解释成“附件正在上传”。

`AChatMessageList` 负责展示消息和状态，不执行聊天 API。通过 `actions` 插槽提供的“重新生成／重试”必须连接到真实失败消息；正在生成时应避免并行重试冲突，停止后保留已生成正文。空状态的业务引导用 `empty` 插槽提供；只读消息列表不应默认引导发送。

Enter／Shift+Enter 和 IME 输入的既有行为仍由组件维护。应用可以通过 `placeholder` 和既有插槽提供更短的输入文案及独立键盘说明，不需要组件库增加聊天请求管理。

## 筛选条件与重置

`AFilterForm` 收起字段不会撤销其值。消费应用需要在表单附近显示仍生效的条件摘要，尤其是隐藏字段中的条件；摘要应依据业务字段定义，不能让库猜测对象、数组或默认值代表什么。

“重置”按 Arco 表单字段初始值执行，不一定等于全部清空。应用必须明确初始条件、重置后的业务默认值以及是否重新查询；`reset` 不自动发起查询。更多说明见 [筛选表单文档](./filter-form.md)。

## 表格刷新失败与旧结果

消费应用监听 `AProTable` 的 `error`、`loading-change` 和 `data-change`，使用 `before-table` 等既有插槽提供结果状态：

- 已有成功结果后刷新失败：“刷新失败，当前显示上次结果”，并提供调用 `refresh()` 的重试按钮。
- 从未获得成功结果：“数据加载失败，请重试”，不能宣称当前是上次成功结果。
- 当前请求被接受时才更新“成功结果”的标记；不把请求开始或临时空数据当作查询成功。
- 主动调用 `refresh()`／`doRequest()` 时，应用需要消费其 Promise rejection；组件的 `error` 事件负责当前有效 fetcher 失败，不代表所有业务刷新处理器失败。

`refreshHandler` 中附属业务数据失败由应用自己显示，不能仅依赖 fetcher 的 `error` 事件。搜索范围也由业务定义：使用内置搜索时在附近说明“按名称／编号搜索”；需要自定义搜索控件时利用已有工具栏插槽，不在库内硬编码字段或 API。

## 宿主语言与第三方控件

应用需同时配置 vue-i18n 的本库 `messages` 和 Arco ConfigProvider 的 `locale`。只切换 vue-i18n 不会自动切换所有 Arco 分页、表格筛选或默认 Modal 按钮。组件内部的图片预览采用局部文案配置，不改变应用的全局语言设置。

校验中英文时应包括主控件、嵌套素材选择、预览、分页、默认弹层按钮和读屏名称。第三方提供的固定名称需要按实际控件逐项核对，不把本库语言包齐全视为整页语言一致。

## 地图与图标搜索

地图 Key、来源白名单、服务额度和坐标系转换由应用配置。搜索失败时组件提供重试或手动选点／输入的路径，应用仍需保证真实搜索能力在部署环境可用；组件不会自动获取业务地址或执行坐标系转换。

图标当前按英文名称检索。中文别名能力属于后续能力评估，需要明确别名范围、真实映射与维护策略；不能仅把 placeholder 改成“支持中文搜索”而没有对应搜索能力。
