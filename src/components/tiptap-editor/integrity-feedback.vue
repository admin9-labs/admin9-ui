<script setup lang="ts">
  import { IconClose, IconExclamationCircle } from '@arco-design/web-vue/es/icon';
  import { useI18n } from 'vue-i18n';

  defineProps<{ notices: { id: string; message: string }[] }>();
  const emit = defineEmits<{ (event: 'dismiss', id: string): void }>();
  const { t } = useI18n();
</script>

<template>
  <div v-if="notices.length" class="a9-editor-integrity" aria-live="polite" aria-atomic="true">
    <div v-for="notice in notices" :key="notice.id" class="a9-editor-integrity__notice" role="status">
      <IconExclamationCircle aria-hidden="true" />
      <span>{{ notice.message }}</span>
      <a-button
        type="text"
        size="small"
        :aria-label="t('admin9Ui.tiptapEditor.dismissNotice')"
        @click="emit('dismiss', notice.id)"
      >
        <template #icon><IconClose /></template>
      </a-button>
    </div>
  </div>
</template>

<style scoped lang="less">
  .a9-editor-integrity {
    padding: 8px 12px;
    background: var(--color-fill-1);
    border-top: 1px solid var(--color-border-2);
  }

  .a9-editor-integrity__notice {
    display: flex;
    gap: 8px;
    align-items: center;
    color: var(--color-text-2);
    font-size: 12px;
    line-height: 1.6;

    > svg {
      flex-shrink: 0;
      color: rgb(var(--orange-6));
    }

    > span {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
  }
</style>
