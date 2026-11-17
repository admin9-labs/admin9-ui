<script setup lang="ts">
  import { nextTick, ref, watch } from 'vue';
  import { IconDown } from '@arco-design/web-vue/es/icon';

  const props = defineProps<{ visible: boolean; label: string; disabled?: boolean; iconOnly?: boolean }>();
  const emit = defineEmits<{ (event: 'update:visible', value: boolean): void }>();
  const trigger = ref<{ $el: HTMLButtonElement }>();
  const panel = ref<HTMLElement>();
  const items = () => Array.from(panel.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
  const close = (restoreFocus: boolean) => {
    emit('update:visible', false);
    if (restoreFocus) trigger.value?.$el.focus({ preventScroll: true });
  };
  const open = () => {
    if (!props.disabled) emit('update:visible', true);
  };
  watch(
    () => props.visible,
    async (visible) => {
      if (!visible) return;
      await nextTick();
      if (!props.visible) return;
      const buttons = items();
      (buttons.find((button) => button.getAttribute('aria-checked') === 'true') ?? buttons[0])?.focus();
    }
  );
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      close(true);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const buttons = items();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      let next = event.key === 'ArrowDown' ? index + 1 : index - 1;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      buttons[(next + buttons.length) % buttons.length]?.focus();
    }
  };
</script>

<template>
  <a-popover
    :popup-visible="visible"
    trigger="click"
    position="bottom"
    :disabled="disabled"
    @update:popup-visible="emit('update:visible', $event)"
  >
    <a-tooltip :content="label">
      <a-button
        ref="trigger"
        size="small"
        type="text"
        :disabled="disabled"
        :aria-label="label"
        :aria-expanded="visible"
        aria-haspopup="menu"
        @mousedown.prevent
        @keydown.down.prevent="open"
        @keydown.up.prevent="open"
        @keydown.esc.stop.prevent="close(true)"
      >
        <slot name="trigger" />
        <IconDown v-if="!iconOnly" class="a9-media-menu__arrow" />
      </a-button>
    </a-tooltip>
    <template #content>
      <div ref="panel" class="a9-media-menu" role="menu" :aria-label="label" @mousedown.stop @keydown="onKeydown">
        <slot />
      </div>
    </template>
  </a-popover>
</template>

<style scoped lang="less">
  .a9-media-menu__arrow {
    margin-left: 4px;
    font-size: 10px;
  }

  .a9-media-menu {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 160px;
    max-width: calc(100vw - 48px);

    :deep(button) {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: flex-start;
      min-height: 32px;
    }

    :deep(button[aria-checked='true']) {
      color: rgb(var(--primary-6));
      background: var(--color-primary-light-1);
    }

    :deep(button:focus-visible) {
      outline: 2px solid rgb(var(--primary-6));
      outline-offset: -2px;
    }

    :deep([role='separator']) {
      height: 1px;
      margin: 4px 0;
      background: var(--color-border-2);
    }
  }
</style>
