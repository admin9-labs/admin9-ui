<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { Button, Textarea } from '@arco-design/web-vue';
  import { useI18n } from 'vue-i18n';
  import type { AChatComposerExposed, AChatComposerProps, AChatComposerSlots } from './types';

  defineOptions({ name: 'AChatComposer' });
  const props = withDefaults(defineProps<AChatComposerProps>(), {
    generating: false,
    disabled: false,
    submitDisabled: false,
  });
  const emit = defineEmits<{
    'update:modelValue': [value: string];
    'submit': [value: string];
    'stop': [];
  }>();
  defineSlots<AChatComposerSlots>();
  const { t } = useI18n();
  const textarea = ref<InstanceType<typeof Textarea>>();
  const composing = ref(false);
  const slotState = computed(() => ({
    disabled: props.disabled,
    submitDisabled: props.submitDisabled,
    generating: props.generating,
  }));
  const canSubmit = computed(
    () => !props.disabled && !props.submitDisabled && !props.generating && Boolean(props.modelValue.trim())
  );
  const submit = () => {
    if (canSubmit.value) emit('submit', props.modelValue);
  };
  const activate = () => {
    if (props.disabled) return;
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
  defineExpose<AChatComposerExposed>({ focus: () => textarea.value?.focus() });
</script>

<template>
  <div class="a9-chat-composer">
    <div v-if="$slots.header" class="a9-chat-composer__header"><slot name="header" v-bind="slotState" /></div>
    <div v-if="$slots.attachments" class="a9-chat-composer__attachments"><slot name="attachments" v-bind="slotState" /></div>
    <div @keydown="onKeydown" @compositionstart="composing = true" @compositionend="composing = false">
      <Textarea
        ref="textarea"
        :model-value="modelValue"
        :disabled="disabled"
        :placeholder="placeholder ?? t('admin9Ui.chatComposer.placeholder')"
        :textarea-attrs="{ 'aria-label': placeholder ?? t('admin9Ui.chatComposer.placeholder') }"
        :auto-size="{ minRows: 2, maxRows: 6 }"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </div>
    <div class="a9-chat-composer__bar">
      <div class="a9-chat-composer__toolbar"><slot name="toolbar" v-bind="slotState" /></div>
      <Button type="primary" :disabled="disabled || (!generating && !canSubmit)" @click="activate">
        {{ t(generating ? 'admin9Ui.chatComposer.stop' : 'admin9Ui.chatComposer.send') }}
      </Button>
    </div>
  </div>
</template>

<style scoped lang="less">
  .a9-chat-composer {
    box-sizing: border-box;
    min-width: 0;
    padding: 12px;
    color: var(--color-text-1);
    background: var(--color-bg-2);
    border: 1px solid var(--color-border-2);
    border-radius: var(--border-radius-medium);

    &__header,
    &__attachments {
      margin-bottom: 8px;
      overflow-wrap: anywhere;
    }

    &__bar {
      display: flex;
      gap: 12px;
      align-items: flex-end;
      justify-content: space-between;
      margin-top: 8px;
    }

    &__toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
    }
  }
</style>
