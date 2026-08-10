# ATiptapEditor

`ATiptapEditor` 是基于 Tiptap 的表单级 HTML 富文本编辑器。它提供中后台常用的内容格式，并在存在 `MediaService` 时复用 `AMediaPicker` 插入或替换图片、视频和音频。

## 使用

```vue
<script setup lang="ts">
  import { ref } from 'vue';
  import { ATiptapEditor } from '@admin9-labs/admin9-ui';

  const content = ref('<p>初始内容</p>');
</script>

<template>
  <ATiptapEditor
    v-model="content"
    placeholder="请输入正文"
    :max-length="10000"
    :max-height="560"
    default-image-display="block"
  />
</template>
```

若应用已经通过 `app.use(Admin9UI, { mediaService })` 注入素材服务，编辑器会自动显示图片、视频和音频按钮；也可在使用点通过 `service` prop 覆盖。未提供服务时只隐藏三个素材按钮，不影响其他编辑能力。

## Props

| 属性                  | 类型                  | 默认值              | 说明                                           |
| --------------------- | --------------------- | ------------------- | ---------------------------------------------- |
| `modelValue`          | `string`              | `''`                | HTML 内容                                      |
| `placeholder`         | `string`              | locale 文案         | 空内容占位符                                   |
| `disabled`            | `boolean`             | `false`             | 禁用编辑和工具栏                               |
| `readonly`            | `boolean`             | `false`             | 只读展示并隐藏工具栏                           |
| `minHeight`           | `number \| string`    | `240`               | 正文滚动区最小高度；数字按 px 处理             |
| `maxHeight`           | `number \| string`    | `min(640px, 60dvh)` | 正文滚动区最大高度；数字按 px 处理             |
| `maxLength`           | `number`              | `0`                 | 最大字符数，`0` 表示不限                       |
| `showWordCount`       | `boolean`             | `true`              | 是否显示字符统计                               |
| `service`             | `MediaService`        | 插件注入值          | 图片、视频和音频素材服务                       |
| `canUploadImage`      | `boolean`             | `true`              | 图片素材弹窗是否允许上传                       |
| `canUploadVideo`      | `boolean`             | `true`              | 视频素材弹窗是否允许上传                       |
| `canUploadAudio`      | `boolean`             | `true`              | 音频素材弹窗是否允许上传                       |
| `defaultImageDisplay` | `'block' \| 'inline'` | `'block'`           | 新图片默认独占一行或跟随文字，不按素材尺寸推断 |

`maxLength` 可动态调整。降低限制时不会截断已有内容，但会阻止内容继续增长；提高限制或改为 `0` 后，新的限制会从下一次编辑立即生效。

正文会在 `minHeight` 与 `maxHeight` 之间自动增高，达到上限后改为内部滚动。主格式工具栏和字符统计位于滚动区外。选中媒体时，操作栏通过 Tiptap BubbleMenu 悬浮在当前可见媒体附近，不占据编辑器布局空间，也不会修改页面或正文滚动位置；顶部空间不足时会自动翻转，左右贴边时会自动收进正文可视边界。

主工具栏和媒体操作栏的普通操作使用中性颜色，Hover 使用浅灰背景；只有当前生效的格式、尺寸和对齐状态使用品牌色。禁用操作会弱化显示，删除保持危险色，切换型按钮仍通过 `aria-pressed` 暴露状态。

## 媒体节点

- 独占一行的图片：新插入时按素材自身宽度显示，小图不会主动放大，大图会等比例收进编辑区；提供小、中、大、铺满快捷项，桌面仍可等比拖动微调。调整尺寸后可通过独立的“重置大小”恢复默认显示规则；同时支持左中右对齐、图片替代文字、改为跟随文字、替换和删除。
- 跟随文字的图片：用于表情或小图标，提供小图标、标准图标、大图标、超大图标快捷项并按文字基线排列；支持改为独占一行、图片替代文字、替换和删除。
- 视频：提供小、中、大、铺满快捷项，桌面仍可等比拖动微调；调整后可重置为默认铺满，并支持左中右对齐、替换和删除。
- 音频：提供小播放器、标准播放器、铺满编辑区三档宽度，以及左中右对齐、替换和删除；默认标准播放器并左对齐。音频不提供高度或自由缩放，移动端会自动铺满编辑区，避免播放控件被压缩。

媒体始终插入当前选区。独占一行的媒体之后使用 Gap Cursor 保持可继续输入，连续插入不会覆盖上一个节点，也不会为此向 HTML 写入尾随空段落。超高媒体以媒体 DOM 与正文滚动视口的可见交集作为 BubbleMenu 锚点，完全滚出时隐藏、重新进入时恢复。图片替代文字通过 Popover 按需编辑。移动端隐藏拖动柄，以尺寸预设作为主要调整方式；悬浮操作栏使用受正文宽度约束的单行分组，可横向访问全部操作。

界面只显示上述操作结果名称，不向普通用户展示 CSS 尺寸或节点术语。图片和视频始终保持比例且不超过编辑区宽度；拖动和外部 HTML 中的超限尺寸都会收敛到 100% 以内。内部序列化契约保持稳定：独占一行的图片使用 `data-display="block"`、`data-width`、`data-align`；跟随文字的图片使用 `data-display="inline"`、`data-size`；视频使用百分比 `data-width` 和 `data-align`；音频使用 `compact | standard | full` 的 `data-width` 与 `data-align`。重新解析 HTML 会恢复布局，输入中的任意 `style`、无效枚举值和不安全 URL 不会进入规范化输出。

## Events

| 事件                | 参数            | 说明                         |
| ------------------- | --------------- | ---------------------------- |
| `update:modelValue` | `value: string` | 内容变化；空文档输出空字符串 |
| `change`            | `value: string` | 内容变化                     |
| `focus`             | 无              | 编辑区获得焦点               |
| `blur`              | 无              | 编辑区失去焦点               |

## 实例方法

| 方法        | 返回      | 说明                              |
| ----------- | --------- | --------------------------------- |
| `focus()`   | `boolean` | 聚焦编辑区                        |
| `clear()`   | `boolean` | 清空内容并触发模型更新            |
| `getHTML()` | `string`  | 获取当前 HTML；空文档返回空字符串 |

## 安全边界

全部媒体节点只接受 HTTP(S) 或相对 URL。视频和音频序列化时固定输出 `controls` 和 `preload="metadata"`，不会保留 `autoplay`。类型不匹配、URL 为空或协议不安全的素材不会插入或替换正文。

编辑器会按 Tiptap schema 解析输入，但不代替服务端内容安全策略。消费应用在公开页面渲染保存的 HTML 前，仍需按自身允许标签、属性和 URL 协议执行可信 HTML 清洗。
