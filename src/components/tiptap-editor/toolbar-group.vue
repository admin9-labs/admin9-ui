<script setup lang="ts">
  import MediaActionMenu from './media-action-menu.vue';

  defineProps<{ collapsed?: boolean; visible: boolean; label: string; disabled?: boolean }>();
  const emit = defineEmits<{ (event: 'update:visible', value: boolean): void }>();
</script>

<template>
  <MediaActionMenu
    v-if="collapsed"
    :visible="visible"
    :label="label"
    :disabled="disabled"
    button-class="a9-toolbar-group-trigger"
    @update:visible="emit('update:visible', $event)"
  >
    <template #trigger
      ><slot name="trigger">{{ label }}</slot></template
    >
    <slot />
  </MediaActionMenu>
  <div v-else class="a9-toolbar-inline" role="group" :aria-label="label"><slot /></div>
</template>

<style scoped lang="less">
  .a9-toolbar-inline {
    display: flex;
    gap: 2px;
    align-items: center;
  }
</style>
