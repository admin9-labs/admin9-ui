<script setup lang="ts">
  import { useI18n } from 'vue-i18n';

  defineProps<{ card: boolean; selected: boolean; disabled: boolean; name: string; managing?: boolean }>();
  const emit = defineEmits<{ (e: 'toggle'): void }>();
  const { t } = useI18n();
</script>

<template>
  <a-checkbox
    class="a9-file-picker__checkbox"
    :class="{ 'a9-file-picker__checkbox--card': card }"
    :model-value="selected"
    :disabled="disabled"
    @keydown.enter.prevent="emit('toggle')"
    @change="emit('toggle')"
  >
    <span class="a9-file-picker__selection-label">{{
      t(managing ? 'admin9Ui.filePicker.manageItem' : 'admin9Ui.filePicker.selectItem', { name })
    }}</span>
  </a-checkbox>
</template>

<style scoped lang="less">
  .a9-file-picker__selection-label,
  .a9-file-picker__checkbox--card {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    white-space: nowrap;
    border: 0;
    clip-path: inset(50%);
  }
</style>
