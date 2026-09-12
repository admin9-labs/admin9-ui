<script setup lang="ts">
  import { ref } from 'vue';
  import {
    AChatComposer,
    AChatMessageList,
    AFilePicker,
    type AChatComposerExposed,
    type ChatComposerSize,
    type ChatMessage,
    type FileItem,
  } from '../src';
  import createFakeFilePickerService from './fake-file-picker-service';

  defineProps<{
    messages: ChatMessage[];
    size: ChatComposerSize;
    draft: string;
    generating: boolean;
    submitDisabled: boolean;
    session: number;
    attachments: FileItem[];
    files: Record<string, FileItem[]>;
  }>();
  const emit = defineEmits<{
    'update:draft': [value: string];
    'update:attachments': [value: FileItem[]];
    'send': [value: string];
    'stop': [];
    'retry': [id: string];
    'action': [value: string];
  }>();
  const composer = ref<AChatComposerExposed>();
  const service = createFakeFilePickerService('normal');
  const copy = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      emit('action', '已复制消息');
    } catch {
      emit('action', '剪贴板不可用，请选择正文复制');
    }
  };
  const prompt = () => {
    emit('update:draft', '请根据素材整理一份简明摘要。');
    composer.value?.focus();
  };
</script>

<template>
  <div class="chat-demo-panel">
    <AChatMessageList :key="session" :messages="messages" class="chat-demo-list">
      <template #footer="{ message }">
        <div v-for="file in files[message.id] ?? []" :key="file.id">附件：{{ file.name }}</div>
        <a-button
          v-if="message.role === 'assistant' && message.content"
          type="text"
          size="mini"
          @click="emit('action', `已打开 ${message.id} 的引用素材`)"
          >引用素材</a-button
        >
      </template>
      <template #actions="{ message }">
        <a-button v-if="message.content" type="text" size="mini" @click="copy(message)">复制</a-button>
        <a-button
          v-if="message.status === 'error' || message.status === 'stopped'"
          type="text"
          size="mini"
          :disabled="generating"
          @click="emit('retry', message.id)"
          >重试</a-button
        >
      </template>
    </AChatMessageList>
    <AChatComposer
      ref="composer"
      :size="size"
      :model-value="draft"
      :generating="generating"
      :submit-disabled="submitDisabled"
      @update:model-value="emit('update:draft', $event)"
      @submit="emit('send', $event)"
      @stop="emit('stop')"
    >
      <template #attachments>
        <a-tag
          v-for="file in attachments"
          :key="file.id"
          closable
          @close="
            emit(
              'update:attachments',
              attachments.filter((item) => item.id !== file.id)
            )
          "
          >{{ file.name }}</a-tag
        >
      </template>
      <template #toolbar="{ disabled, size: controlSize }">
        <a-tooltip content="选择文件">
          <AFilePicker
            :model-value="attachments"
            :service="service"
            :disabled="disabled"
            :limit="3"
            multiple
            @update:model-value="emit('update:attachments', Array.isArray($event) ? $event : $event ? [$event] : [])"
          >
            <template #trigger="{ open }">
              <a-button type="text" shape="circle" :size="controlSize" aria-label="选择文件" :disabled="disabled" @click="open">
                <template #icon><icon-plus /></template>
              </a-button>
            </template>
          </AFilePicker>
        </a-tooltip>
        <a-button type="text" :size="controlSize" :disabled="disabled" @click="prompt">摘要指令</a-button>
      </template>
    </AChatComposer>
  </div>
</template>

<style scoped lang="less">
  .chat-demo-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    height: 600px;
    max-height: 78dvh;
  }

  .chat-demo-list {
    flex: 1;
  }
</style>
