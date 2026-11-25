<script setup lang="ts">
  import { ref } from 'vue';

  defineOptions({ inheritAttrs: false });
  defineProps<{ content: string }>();
  const hovered = ref(false);
  const focused = ref(false);
  const onFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget;
    focused.value = next instanceof Node && (event.currentTarget as HTMLElement).contains(next);
  };
</script>

<template>
  <a-tooltip :content="content" :popup-visible="hovered || focused" @popup-visible-change="hovered = $event">
    <span v-bind="$attrs" class="a9-toolbar-tooltip" @focusin.capture="focused = true" @focusout.capture="onFocusOut"
      ><slot
    /></span>
  </a-tooltip>
</template>

<style scoped lang="less">
  .a9-toolbar-tooltip {
    display: inline-flex;
    align-items: center;
  }
</style>
