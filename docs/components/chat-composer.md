# AChatComposer

受控聊天输入组件，基于 Arco Textarea 和 Button，提供发送、停止及附件和工具区域。只发出用户操作事件，不调用请求，也不拥有上传队列。

## 基础用法

```vue
<script setup lang="ts">
  import { ref } from 'vue';
  import { AChatComposer, type AChatComposerExposed } from '@admin9-labs/admin9-ui';
  import '@admin9-labs/admin9-ui/styles';

  const composer = ref<AChatComposerExposed>();
  const draft = ref('');
  const generating = ref(false);
  const submitDisabled = ref(false);
  let controller: AbortController | undefined;

  async function submit(value: string) {
    if (generating.value || submitDisabled.value || !value.trim()) return;
    generating.value = true;
    draft.value = '';
    const request = new AbortController();
    controller = request;
    try {
      // sendMessage 由应用提供，并负责消息存储、增量拼接和错误展示。
      await sendMessage(value, request.signal);
    } finally {
      if (controller === request) {
        controller = undefined;
        generating.value = false;
      }
    }
  }
  function stop() {
    controller?.abort();
    // 保持 generating，直到请求终止完成；sendMessage 应处理取消错误。
  }
</script>

<template>
  <AChatComposer
    ref="composer"
    v-model="draft"
    :generating="generating"
    :submit-disabled="submitDisabled"
    @submit="submit"
    @stop="stop"
  />
</template>
```

`sendMessage` 不是库导出。应用应同步守卫提交、在请求接受后清空输入，并处理失败、中止和过期回调。组件不提供异步请求去重或自动清空行为。

需在宿主注册 Arco 并合并库 `messages` 至 vue-i18n。默认文案随宿主语言切换，主题跟随 Arco。

## Props、Events、方法

| 属性           | 类型                                     | 默认值                       | 说明                                   |
| -------------- | ---------------------------------------- | ---------------------------- | -------------------------------------- |
| modelValue     | `string`                                 | 必填                         | 受控文本                               |
| size           | `'small' \| 'medium' \| 'large'`         | `'large'`                    | Card 密度及默认操作按钮尺寸            |
| generating     | `boolean`                                | `false`                      | 禁止发送，主按钮变为停止；仍可编辑草稿 |
| disabled       | `boolean`                                | `false`                      | 禁用输入及默认按钮，优先级最高         |
| submitDisabled | `boolean`                                | `false`                      | 仅禁止发送，不禁用输入和停止           |
| placeholder    | `string`                                 | 国际化默认文案               | 输入提示及可访问名称                   |
| autoSize       | `{ minRows?: number; maxRows?: number }` | `{ minRows: 2, maxRows: 6 }` | 输入行数范围                           |
| maxLength      | `number`                                 | 不限制                       | 输入及提交长度限制                     |

| 事件              | 参数            | 说明             |
| ----------------- | --------------- | ---------------- |
| update:modelValue | `value: string` | 输入变化         |
| submit            | `value: string` | 未裁剪的原始文本 |
| stop              | 无              | 请求停止生成     |

公开方法 `focus(): void` 聚焦输入框。导出 `AChatComposerProps`、`AChatComposerSlots`、`AChatComposerExposed`、`ChatComposerSize` 和 `ChatComposerSlot` 类型。

## 尺寸

`size` 同时控制 Card 留白、区域间距和默认发送／停止按钮。正文字号维持 14px，输入行数继续由 `autoSize` 独立控制。

| 尺寸项目                     |  small |  medium | large（默认） |
| ---------------------------- | -----: | ------: | ------------: |
| 默认操作按钮                 |   28px |    32px |          36px |
| Card 上下／左右内边距        | 8/12px | 10/14px |       12/16px |
| 文本区与底栏间距             |    4px |     6px |           8px |
| 工具栏内部间距               |    4px |     6px |           8px |
| 工具栏与主操作间距           |    8px |    10px |          12px |
| header、attachments 后置间距 |    4px |     6px |           8px |

所有作用域插槽都会收到当前 `size`。使用方将它绑定到 Arco 控件，即可让自定义工具与默认操作等高；自定义内容不会被组件通过深层样式强制缩放。

## 键盘与状态

- 默认自动增高为 2–6 行，可通过 `autoSize` 调整；继续输入后内部滚动。
- Enter 发送，Shift+Enter 换行；Ctrl、Meta、Alt 组合不作为发送键。
- 中文输入法组合中的 Enter 不发送。
- `trim()` 后为空则禁止发送；提交保留原始空格、换行。
- 生成期间 Enter 换行，可编辑下一条草稿，停止不清空草稿。
- 附件上传时用 `submitDisabled` 阻止发送；只有需要连停止一起禁用时才使用 `disabled`。
- 首版仅支持有效文本提交，不支持纯附件消息。

## 插槽组合

`header`、`attachments`、`toolbar` 均接收 `{ size, disabled, submitDisabled, generating }`。自定义控件由应用根据这些状态和尺寸呈现。

`action` 插槽额外提供 `{ canSubmit, activate }`，用于替换默认发送／停止按钮。按钮禁用条件为 `disabled || (!generating && !canSubmit)`，点击调用 `activate()`，仍经过空白、长度、禁用和生成状态守卫。组件不会自动执行请求。

```vue
<AChatComposer v-model="draft" :generating="generating" :submit-disabled="uploading" @submit="submit" @stop="stop">
  <template #header="{ disabled }">
    <a-button :disabled="disabled" @click="draft = '请整理摘要'">整理摘要</a-button>
  </template>
  <template #attachments>
    <a-tag v-for="file in files" :key="file.id">{{ file.name }}</a-tag>
  </template>
  <template #toolbar="{ size, disabled }">
    <AFilePicker v-model="files" :service="fileService" :disabled="disabled" multiple>
      <template #trigger="{ open }">
        <a-button :size="size" :disabled="disabled" type="text" shape="circle" aria-label="选择文件" @click="open">
          <template #icon><icon-plus /></template>
        </a-button>
      </template>
    </AFilePicker>
    <a-button :size="size" :disabled="disabled" type="text" @click="draft = '请整理摘要'">摘要指令</a-button>
  </template>
</AChatComposer>
```

`AFilePicker` 需显式导入；`files`、`uploading`、`fileService` 由应用管理。组件不自动上传附件、不将业务文件数据拼进 `submit` 事件。与 `AChatMessageList` 配合时，重试操作放在消息 `actions` 插槽。

## 视觉与组合

组件自身是一张完整的输入 Card：文本区不绘制第二层背景或边框，快捷内容、附件、工具栏和发送／停止按钮都位于同一外框内。正文与底栏使用紧凑的纵向间距及统一的左右内边距；键盘聚焦时由外框显示主题色边界。默认发送和停止使用带 Tooltip 与可访问名称的圆形图标按钮。

与 `AChatMessageList` 组合时保持两个组件各自的职责，应用只需要提供纵向布局和间距：

```vue
<div class="chat-workspace">
  <AChatMessageList :messages="messages" class="chat-workspace__messages" />
  <AChatComposer v-model="draft" @submit="submit" @stop="stop" />
</div>

<style scoped>
  .chat-workspace {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 600px;
  }

  .chat-workspace__messages {
    flex: 1;
  }
</style>
```

高度和消息区布局属于应用；组件库不提供会话容器、抽屉、请求或状态管理。需要展示模型、权限或更多工具时，通过 `toolbar` 或 `action` 插槽组合，组件不定义业务字段。
