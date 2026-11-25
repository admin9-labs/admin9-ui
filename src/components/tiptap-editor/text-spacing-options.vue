<script setup lang="ts">
  defineProps<{
    controls: {
      key: string;
      label: string;
      description: string;
      value: string;
      partial: boolean;
      hasEmpty?: boolean;
      values: string[];
    }[];
    disabled: boolean;
    label: (key: string, value: string) => string;
    defaultLabel: string;
    partialLabel: string;
    partialTextLabel: string;
    existingTextOnly: string;
    indentScope: string;
  }>();
  const emit = defineEmits<{ (event: 'select', key: string, value: string): void }>();
  const navigate = (event: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(
      (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    );
    if (!buttons.length) return;
    let index = buttons.indexOf(document.activeElement as HTMLButtonElement) + (event.key === 'ArrowDown' ? 1 : -1);
    if (event.key === 'Home') index = 0;
    if (event.key === 'End') index = buttons.length - 1;
    buttons[(index + buttons.length) % buttons.length]?.focus();
  };
</script>

<template>
  <div class="a9-spacing-options" @keydown="navigate">
    <section v-for="control in controls" :key="control.key">
      <div class="a9-spacing-options__title">{{ control.label }}：{{ control.description }}</div>
      <div v-if="control.partial" class="a9-spacing-options__hint">
        <template v-if="control.hasEmpty">{{ existingTextOnly }}</template>
        <template v-else>{{ control.key === 'letterSpacing' ? partialTextLabel : partialLabel }}</template>
      </div>
      <div v-if="control.key === 'firstLineIndent'" class="a9-spacing-options__hint">{{ indentScope }}</div>
      <div
        role="menu"
        :aria-label="control.label"
        :aria-description="control.description"
        :aria-disabled="disabled || control.value === 'unavailable'"
      >
        <a-button
          v-for="value in ['default', ...control.values]"
          :key="value"
          type="text"
          size="small"
          role="menuitemradio"
          :aria-checked="control.value === (value === 'default' ? '' : value)"
          :disabled="disabled || control.value === 'unavailable'"
          @click="emit('select', control.key, value)"
        >
          {{ value === 'default' ? defaultLabel : label(control.key, value) }}
        </a-button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="less">
  .a9-spacing-options {
    width: 280px;
    max-width: 100%;
  }

  .a9-spacing-options section + section {
    margin-top: 12px;
  }

  .a9-spacing-options__title {
    margin-bottom: 4px;
    color: var(--color-text-1);
    font-size: 13px;
  }

  .a9-spacing-options__hint {
    margin-bottom: 4px;
    color: var(--color-text-3);
    font-size: 12px;
  }

  .a9-spacing-options [role='menu'] {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .a9-spacing-options :deep([aria-checked='true']) {
    color: rgb(var(--primary-6));
    background: var(--color-primary-light-1);
  }
</style>
