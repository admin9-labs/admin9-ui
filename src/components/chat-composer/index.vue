<script setup lang="ts">
  import { computed, ref, toRef } from 'vue';
  import { Button, Textarea, Tooltip, useFormItem } from '@arco-design/web-vue';
  import IconArrowUp from '@arco-design/web-vue/es/icon/icon-arrow-up';
  import IconStop from '@arco-design/web-vue/es/icon/icon-stop';
  import { useI18n } from 'vue-i18n';
  import type { AChatComposerExposed, AChatComposerProps, AChatComposerSlots } from './types';

  defineOptions({ name: 'AChatComposer' });
  const props = withDefaults(defineProps<AChatComposerProps>(), {
    size: undefined,
    generating: false,
    disabled: false,
    readonly: false,
    submitDisabled: false,
    autoSize: () => ({ minRows: 2, maxRows: 6 }),
  });
  const emit = defineEmits<{
    'update:modelValue': [value: string];
    'submit': [value: string];
    'stop': [];
    'input': [value: string, event: Event];
    'change': [value: string, event: Event];
    'focus': [event: FocusEvent];
    'blur': [event: FocusEvent];
  }>();
  defineSlots<AChatComposerSlots>();
  const { t } = useI18n();
  const textarea = ref<InstanceType<typeof Textarea>>();
  const { mergedDisabled, mergedSize } = useFormItem({ disabled: toRef(props, 'disabled'), size: toRef(props, 'size') });
  const resolvedSize = computed(() => mergedSize.value ?? 'large');
  const resolvedMaxLength = computed(() => Math.max(0, props.maxLength ?? 0));
  const composing = ref(false);
  const wordLength = (value: string) => Array.from(value).length;
  const wordSlice = (value: string, length: number) => Array.from(value).slice(0, length).join('');
  const slotState = computed(() => ({
    size: resolvedSize.value,
    disabled: Boolean(mergedDisabled.value),
    readonly: props.readonly,
    submitDisabled: props.submitDisabled,
    generating: props.generating,
  }));
  const canSubmit = computed(
    () =>
      !mergedDisabled.value &&
      !props.readonly &&
      !props.submitDisabled &&
      !props.generating &&
      Boolean(props.modelValue.trim()) &&
      (resolvedMaxLength.value === 0 || wordLength(props.modelValue) <= resolvedMaxLength.value)
  );
  const updateValue = (value: string) => {
    if (!mergedDisabled.value && !props.readonly) emit('update:modelValue', value);
  };
  const submit = () => {
    if (canSubmit.value) emit('submit', props.modelValue);
  };
  const activate = () => {
    if (mergedDisabled.value || props.readonly) return;
    if (props.generating) emit('stop');
    else submit();
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      composing.value ||
      event.isComposing ||
      event.keyCode === 229
    )
      return;
    if (props.generating) return;
    event.preventDefault();
    submit();
  };
  defineExpose<AChatComposerExposed>({ focus: () => textarea.value?.focus(), blur: () => textarea.value?.blur() });
</script>

<template>
  <div class="a9-chat-composer" :class="`a9-chat-composer--${resolvedSize}`">
    <div v-if="$slots.header" class="a9-chat-composer__header"><slot name="header" v-bind="slotState" /></div>
    <div v-if="$slots.attachments" class="a9-chat-composer__attachments"><slot name="attachments" v-bind="slotState" /></div>
    <div
      class="a9-chat-composer__input"
      @keydown="onKeydown"
      @compositionstart="composing = true"
      @compositionend="composing = false"
    >
      <Textarea
        ref="textarea"
        :model-value="modelValue"
        :disabled="mergedDisabled"
        :placeholder="placeholder ?? t('admin9Ui.chatComposer.placeholder')"
        :textarea-attrs="{ 'aria-label': placeholder ?? t('admin9Ui.chatComposer.placeholder'), ...textareaAttrs, readonly }"
        :auto-size="autoSize"
        :max-length="resolvedMaxLength"
        :word-length="wordLength"
        :word-slice="wordSlice"
        @update:model-value="updateValue"
        @input="(value, event) => emit('input', value, event)"
        @change="(value, event) => emit('change', value, event)"
        @focus="emit('focus', $event)"
        @blur="emit('blur', $event)"
      />
    </div>
    <div class="a9-chat-composer__bar">
      <div class="a9-chat-composer__toolbar"><slot name="toolbar" v-bind="slotState" /></div>
      <slot name="action" v-bind="slotState" :can-submit="canSubmit" :activate="activate">
        <Tooltip :content="t(generating ? 'admin9Ui.chatComposer.stop' : 'admin9Ui.chatComposer.send')">
          <Button
            class="a9-chat-composer__action"
            type="primary"
            shape="circle"
            :size="resolvedSize"
            :aria-label="t(generating ? 'admin9Ui.chatComposer.stop' : 'admin9Ui.chatComposer.send')"
            :disabled="mergedDisabled || readonly || (!generating && !canSubmit)"
            @click="activate"
          >
            <template #icon><IconStop v-if="generating" /><IconArrowUp v-else /></template>
          </Button>
        </Tooltip>
      </slot>
    </div>
  </div>
</template>

<style scoped lang="less">
  .a9-chat-composer {
    --a9-chat-composer-padding-block: 12px;
    --a9-chat-composer-padding-inline: 16px;
    --a9-chat-composer-content-gap: 8px;
    --a9-chat-composer-toolbar-gap: 8px;
    --a9-chat-composer-bar-gap: 12px;
    --a9-chat-composer-section-gap: 8px;

    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    padding: var(--a9-chat-composer-padding-block) var(--a9-chat-composer-padding-inline);
    color: var(--color-text-1);
    background: var(--color-bg-2);
    border: 1px solid var(--color-border-2);
    border-radius: 8px;

    &--mini {
      --a9-chat-composer-padding-block: 6px;
      --a9-chat-composer-padding-inline: 8px;
      --a9-chat-composer-content-gap: 4px;
      --a9-chat-composer-toolbar-gap: 4px;
      --a9-chat-composer-bar-gap: 6px;
      --a9-chat-composer-section-gap: 4px;
    }

    &--small {
      --a9-chat-composer-padding-block: 8px;
      --a9-chat-composer-padding-inline: 12px;
      --a9-chat-composer-content-gap: 4px;
      --a9-chat-composer-toolbar-gap: 4px;
      --a9-chat-composer-bar-gap: 8px;
      --a9-chat-composer-section-gap: 4px;
    }

    &--medium {
      --a9-chat-composer-padding-block: 10px;
      --a9-chat-composer-padding-inline: 14px;
      --a9-chat-composer-content-gap: 6px;
      --a9-chat-composer-toolbar-gap: 6px;
      --a9-chat-composer-bar-gap: 10px;
      --a9-chat-composer-section-gap: 6px;
    }

    &--large {
      --a9-chat-composer-padding-block: 12px;
      --a9-chat-composer-padding-inline: 16px;
      --a9-chat-composer-content-gap: 8px;
      --a9-chat-composer-toolbar-gap: 8px;
      --a9-chat-composer-bar-gap: 12px;
      --a9-chat-composer-section-gap: 8px;
    }

    &:focus-within {
      border-color: rgb(var(--primary-6));
    }

    &__input > :deep(.arco-textarea-wrapper),
    &__input > :deep(.arco-textarea-wrapper:hover),
    &__input > :deep(.arco-textarea-wrapper:focus-within),
    &__input > :deep(.arco-textarea-wrapper.arco-textarea-focus) {
      background: transparent;
      border-color: transparent;
      border-width: 0;
      box-shadow: none;
    }

    &__input > :deep(.arco-textarea-wrapper > .arco-textarea) {
      padding: 2px 0 6px;
    }

    &__header,
    &__attachments {
      margin-bottom: var(--a9-chat-composer-section-gap);
      overflow-wrap: anywhere;
    }

    &__bar {
      display: flex;
      gap: var(--a9-chat-composer-bar-gap);
      align-items: center;
      justify-content: space-between;
      margin-top: var(--a9-chat-composer-content-gap);
    }

    &__toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: var(--a9-chat-composer-toolbar-gap);
      align-items: center;
      min-width: 0;
    }

    &__action {
      flex: none;
    }
  }

  /* Vue scoped global selector lets the root react to Arco's injected FormItem error class. */
  /* stylelint-disable-next-line selector-pseudo-class-no-unknown */
  :global(.a9-chat-composer:has(> .a9-chat-composer__input > .arco-textarea-error)) {
    border-color: rgb(var(--danger-6));
  }
</style>
