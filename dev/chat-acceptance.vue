<script setup lang="ts">
  import { computed, onBeforeUnmount, reactive, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { ChatComposerSize, ChatMessage, FileItem } from '../src';
  import ChatPanel from './chat-panel.vue';

  const { locale } = useI18n();
  const messages = ref<ChatMessage[]>([]);
  const composerSize = ref<ChatComposerSize>('large');
  const draft = ref('请展示 Markdown、代码和表格。');
  const attachments = ref<FileItem[]>([]);
  const files = reactive<Record<string, FileItem[]>>({});
  const generating = ref(false);
  const submitDisabled = ref(false);
  const fail = ref(false);
  const drawer = ref(false);
  const session = ref(0);
  const action = ref('等待操作');
  const dark = ref(document.body.getAttribute('arco-theme') === 'dark');
  const previousTheme = document.body.getAttribute('arco-theme');
  let sequence = 0;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeId: string | undefined;
  const nextId = () => {
    sequence += 1;
    return `chat-${sequence}`;
  };
  const invalidate = () => {
    generation += 1;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    activeId = undefined;
    generating.value = false;
  };
  const sample =
    '# 回复摘要\n\n这是逐步生成的 **Markdown** 内容。\n\n- 支持列表\n- 保留用户阅读位置\n\n> 引用区域由应用扩展。\n\n```ts\nconst message = "Hello, Admin9";\n```\n\n| 能力 | 状态 |\n| --- | --- |\n| 流式回复 | 完成 |\n| 附件 | 插槽组合 |\n\n[公开链接](https://example.com) / [相对链接](/settings)\n\n![图片说明](https://example.com/image.png)\n';
  const stream = (message: ChatMessage, performanceMode = false) => {
    invalidate();
    generating.value = true;
    activeId = message.id;
    const ticket = generation;
    const target = performanceMode ? `${sample}\n${'长内容性能验收。'.repeat(2600)}\n\n${sample.repeat(40)}` : sample;
    message.content = performanceMode ? target.slice(0, 20000) : '';
    message.status = 'pending';
    const tick = () => {
      if (ticket !== generation) return;
      message.status = 'streaming';
      message.content = target.slice(0, message.content.length + (performanceMode ? 30 : 12));
      if (fail.value && message.content.length >= 100) {
        message.status = 'error';
        invalidate();
      } else if (message.content.length >= target.length) {
        message.status = 'complete';
        invalidate();
      } else timer = setTimeout(tick, 50);
    };
    timer = setTimeout(tick, 350);
  };
  const send = (value: string) => {
    if (generating.value || submitDisabled.value || !value.trim()) return;
    const userId = nextId();
    messages.value.push({ id: userId, role: 'user', content: value });
    files[userId] = [...attachments.value];
    attachments.value = [];
    draft.value = '';
    messages.value.push({ id: nextId(), role: 'assistant', content: '', status: 'pending' });
    stream(messages.value[messages.value.length - 1]);
  };
  const stop = () => {
    if (!generating.value) return;
    const active = messages.value.find((message) => message.id === activeId);
    if (active) active.status = 'stopped';
    invalidate();
  };
  const retry = (id: string) => {
    if (generating.value) return;
    const message = messages.value.find((item) => item.id === id);
    if (message && (message.status === 'error' || message.status === 'stopped')) stream(message);
  };
  const prepend = (count = 10) => {
    messages.value.unshift(
      ...Array.from(
        { length: count },
        (_, index): ChatMessage => ({
          id: nextId(),
          role: index % 2 ? 'assistant' : 'user',
          content: `历史消息 ${index + 1}\n\n这是一段可用于阅读位置验收的内容。`,
        })
      )
    );
  };
  const performance = () => {
    stop();
    messages.value = [];
    session.value += 1;
    prepend(100);
    messages.value.push({ id: nextId(), role: 'assistant', content: '', status: 'pending' });
    stream(messages.value[messages.value.length - 1], true);
  };
  const burst = () => {
    messages.value.push({
      id: nextId(),
      role: 'assistant',
      content: `${sample}\n\n\`\`\`\n${'long-code-'.repeat(100)}\n\`\`\`\n\n| ${'宽表格内容'.repeat(
        30
      )} | 字段 |\n| --- | --- |\n| 内容 | 值 |\n\n${sample.repeat(8)}`,
    });
  };
  const reset = () => {
    invalidate();
    messages.value = [];
    attachments.value = [];
    Object.keys(files).forEach((key) => delete files[key]);
    draft.value = '';
    session.value += 1;
  };
  const toggleTheme = () => {
    dark.value = !dark.value;
    if (dark.value) document.body.setAttribute('arco-theme', 'dark');
    else document.body.removeAttribute('arco-theme');
  };
  const panelProps = computed(() => ({
    messages: messages.value,
    size: composerSize.value,
    draft: draft.value,
    generating: generating.value,
    submitDisabled: submitDisabled.value,
    session: session.value,
    attachments: attachments.value,
    files,
  }));
  const listeners = {
    'update:draft': (value: string) => {
      draft.value = value;
    },
    'update:attachments': (value: FileItem[]) => {
      attachments.value = value;
    },
    send,
    stop,
    retry,
    'action': (value: string) => {
      action.value = value;
    },
  };
  onBeforeUnmount(() => {
    invalidate();
    if (previousTheme === null) document.body.removeAttribute('arco-theme');
    else document.body.setAttribute('arco-theme', previousTheme);
  });
</script>

<template>
  <section id="chat" class="acceptance-section chat-acceptance">
    <h2>AChatMessageList · AChatComposer</h2>
    <div class="chat-controls">
      <a-button @click="drawer = true">抽屉对话</a-button>
      <a-button @click="prepend()">前插 10 条历史</a-button>
      <a-button @click="burst">追加大段内容</a-button>
      <a-button @click="performance">性能场景</a-button>
      <a-button @click="reset">切换会话</a-button>
      <a-button @click="locale = locale === 'zh-CN' ? 'en-US' : 'zh-CN'">中 / EN</a-button>
      <a-button @click="toggleTheme">明 / 暗</a-button>
      <a-radio-group v-model="composerSize" type="button" size="small" data-testid="chat-composer-size">
        <a-radio value="mini">Mini</a-radio>
        <a-radio value="small">Small</a-radio>
        <a-radio value="medium">Medium</a-radio>
        <a-radio value="large">Large</a-radio>
      </a-radio-group>
      <a-checkbox v-model="fail">模拟生成失败</a-checkbox>
      <a-checkbox v-model="submitDisabled">模拟附件上传中</a-checkbox>
    </div>
    <p role="status" data-testid="chat-action">{{ action }} · {{ messages.length }} 条消息</p>
    <ChatPanel data-testid="chat-page-panel" v-bind="panelProps" v-on="listeners" />
    <a-drawer v-model:visible="drawer" title="聊天抽屉" :width="'min(620px, 100vw)'" :unmount-on-close="false" :footer="false">
      <ChatPanel data-testid="chat-drawer-panel" v-bind="panelProps" v-on="listeners" />
    </a-drawer>
  </section>
</template>

<style scoped lang="less">
  .chat-acceptance {
    color: var(--color-text-1);
    background: var(--color-bg-2);
  }

  .chat-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
</style>
