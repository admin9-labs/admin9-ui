# AChatMessageList

受控聊天消息列表，提供助手 Markdown、消息状态和阅读位置保持。只负责展示，不调用模型、不接收 SSE 增量、不管理会话。

## 基础用法

```vue
<script setup lang="ts">
  import { ref } from 'vue';
  import { AChatMessageList, type ChatMessage, type AChatMessageListExposed } from '@admin9-labs/admin9-ui';
  import '@admin9-labs/admin9-ui/styles';

  const list = ref<AChatMessageListExposed>();
  const sessionId = ref('session-1');
  const messages = ref<ChatMessage[]>([
    { id: 'user-1', role: 'user', content: '你好' },
    { id: 'assistant-1', role: 'assistant', content: '**你好！**', status: 'complete' },
  ]);
  // 收到增量后，由应用更新完整正文：messages.value[1].content += delta。
</script>

<template>
  <AChatMessageList ref="list" :key="sessionId" :messages="messages" style="height: 480px" />
</template>
```

组件要求宿主提供高度或有界 flex 空间。在 flex 容器中为列表设置 `flex: 1`，同时确保祖先容器允许收缩。切换会话时用 `key` 重建列表。

与其他组件一样，需在宿主注册 Arco 并合并库中英文 `messages` 至 vue-i18n；组件不创建独立的国际化实例。

## Props 与消息类型

| 属性       | 类型            | 默认值 | 说明                               |
| ---------- | --------------- | ------ | ---------------------------------- |
| messages   | `ChatMessage[]` | 必填   | 按传入顺序展示，不会修改数组或消息 |
| autoScroll | `boolean`       | `true` | 启用接近底部时的自动跟随           |

```ts
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: 'pending' | 'streaming' | 'complete' | 'error' | 'stopped';
}
```

`id` 在会话内必须唯一且稳定。`content` 是当前完整文本；省略 `status` 等价于 `complete`。用户正文按纯文本展示，助手正文按 Markdown 展示。默认提供圆形人物／助手图标头像及角色名称：桌面为 32px，窄屏为 28px，颜色跟随 Arco 明暗主题；通过 `avatar` 插槽可整体替换为真实头像或品牌图标。等待、生成中、失败、停止均有状态提示；失败或停止不会清除已有正文。系统提示词及工具协议消息由应用处理。

## 插槽与方法

| 插槽    | 参数                 | 用途                     |
| ------- | -------------------- | ------------------------ |
| empty   | 无                   | 替换空状态               |
| avatar  | `{ message, index }` | 替换默认头像及角色名称   |
| content | `{ message, index }` | 替换正文                 |
| footer  | `{ message, index }` | 引用素材、附件等补充信息 |
| actions | `{ message, index }` | 复制、重试等操作         |

```vue
<AChatMessageList :messages="messages" style="height: 480px">
  <template #footer="{ message }">
    <a-button v-if="sources[message.id]" type="text" @click="openSource(sources[message.id])">查看引用</a-button>
  </template>
  <template #actions="{ message }">
    <a-button v-if="message.status === 'error'" :disabled="generating" @click="retry(message.id)">重试</a-button>
  </template>
</AChatMessageList>
```

`sources`、`openSource`、`retry` 和 `generating` 由应用提供；它们不是组件接口。自定义正文插槽自行负责内容安全。

公开方法 `scrollToBottom(): void` 主动滚到底部；当 `autoScroll=true` 时也恢复跟随。导出 `AChatMessageListProps`、`AChatMessageListSlots`、`AChatMessageListExposed`、`ChatMessage`、`ChatMessageStatus` 和 `ChatMessageSlot` 类型。

## 滚动行为

- 首次可见、从空列表加载消息时，自动滚动开启则定位底部。
- 用户距底部不超过 48px 时继续跟随；内容更新不会重新解释用户意图。上翻离开底部后保持阅读位置。
- 前插历史用首个可见消息 ID 及偏移保持位置；锚点被删除则保留原滚动位置并限制到有效范围。
- 历史前插和尾部更新并发时，阅读者保持锚点，跟随者保持底部。
- 列表尺寸、插槽内容变化及保留实例的抽屉重新打开后，恢复原跟随状态或阅读位置。
- “回到底部”按钮和同名方法可主动定位；`autoScroll=false` 时手动定位不会开启自动跟随。

## Markdown 范围与限制

支持标题、列表、引用、分隔线、代码、围栏代码块、表格、链接及删除线。不包含代码高亮、公式、Mermaid 或解析器插件接口。

关闭原始 HTML。只有 HTTP、HTTPS、mailto 链接可点击；相对地址、锚点和其他协议作为文本展示。HTTP/HTTPS 在新窗口打开并设置 `noopener noreferrer`。

**Markdown 图片不会自动加载，显示为描述与安全链接。** 图片或附件卡片可通过插槽提供。链接策略同样适用于图片链接。

流式内容以当前完整正文解析，未闭合语法可能在后续字符到来后改变展示；组件不补写原文。初始及 SSR 同步生成 HTML，后续更新按帧合并且仅解析变化的消息。列表不虚拟化，长会话的保留数量由应用决定。
