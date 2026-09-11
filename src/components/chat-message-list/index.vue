<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { Avatar, Button } from '@arco-design/web-vue';
  import IconUser from '@arco-design/web-vue/es/icon/icon-user';
  import IconRobot from '@arco-design/web-vue/es/icon/icon-robot';
  import { useI18n } from 'vue-i18n';
  import ChatMarkdown from '../../internal/chat-markdown';
  import type { AChatMessageListExposed, AChatMessageListProps, AChatMessageListSlots } from './types';

  defineOptions({ name: 'AChatMessageList' });
  const props = withDefaults(defineProps<AChatMessageListProps>(), { autoScroll: true });
  defineSlots<AChatMessageListSlots>();
  const { t } = useI18n();
  const viewport = ref<HTMLElement>();
  const content = ref<HTMLElement>();
  const away = ref(false);
  let following = props.autoScroll;
  let forceBottom = false;
  let mounted = false;
  let frame: number | undefined;
  let observer: ResizeObserver | undefined;
  let anchor: { id: string; offset: number } | undefined;
  let savedTop = 0;
  let expectedTop: number | undefined;
  const visible = () => Boolean(viewport.value && viewport.value.clientHeight > 0);
  const rows = () => Array.from(content.value?.querySelectorAll<HTMLElement>('[data-chat-message]') ?? []);
  const remember = () => {
    const element = viewport.value;
    if (!element || !visible()) return;
    savedTop = element.scrollTop;
    const { top } = element.getBoundingClientRect();
    const first = rows().find((row) => row.getBoundingClientRect().bottom > top);
    anchor =
      first?.dataset.chatMessage !== undefined
        ? { id: first.dataset.chatMessage, offset: first.getBoundingClientRect().top - top }
        : undefined;
  };
  const measureAway = () => {
    const element = viewport.value;
    if (element) away.value = element.scrollHeight - element.clientHeight - element.scrollTop > 48;
  };
  const restore = () => {
    const element = viewport.value;
    if (!element || !visible()) return;
    if (forceBottom || (props.autoScroll && following)) {
      element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
      forceBottom = false;
    } else {
      const row = anchor && rows().find((item) => item.dataset.chatMessage === anchor?.id);
      const top =
        row && anchor
          ? element.scrollTop + row.getBoundingClientRect().top - element.getBoundingClientRect().top - anchor.offset
          : savedTop;
      element.scrollTop = Math.max(0, Math.min(top, element.scrollHeight - element.clientHeight));
    }
    expectedTop = element.scrollTop;
    measureAway();
    remember();
  };
  const schedule = () => {
    if (!mounted || frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      restore();
    });
  };
  const onScroll = () => {
    const element = viewport.value;
    if (!element || !visible()) return;
    // Layout restoration must not be interpreted as a new user scrolling decision.
    if (expectedTop !== undefined && Math.abs(element.scrollTop - expectedTop) < 1) {
      expectedTop = undefined;
      return;
    }
    expectedTop = undefined;
    measureAway();
    following = props.autoScroll && !away.value;
    remember();
  };
  const scrollToBottom = () => {
    forceBottom = true;
    following = props.autoScroll;
    schedule();
  };
  watch(
    () => props.messages.map((message) => [message.id, message.content, message.status]),
    async (_, previous) => {
      if (!previous?.length && props.messages.length && props.autoScroll) following = true;
      await nextTick();
      schedule();
    }
  );
  watch(
    () => props.autoScroll,
    (enabled) => {
      following = enabled && !away.value;
      schedule();
    }
  );
  // Only statuses are announced; streaming text is deliberately outside a live region.
  const announcement = computed(() => {
    const latest = [...props.messages].reverse().find((message) => message.role === 'assistant');
    return latest
      ? `${t('admin9Ui.chatMessageList.assistant')}: ${t(`admin9Ui.chatMessageList.status.${latest.status ?? 'complete'}`)}`
      : '';
  });
  onMounted(() => {
    mounted = true;
    observer = new ResizeObserver(schedule);
    if (viewport.value) observer.observe(viewport.value);
    if (content.value) observer.observe(content.value);
    schedule();
  });
  onBeforeUnmount(() => {
    mounted = false;
    observer?.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
  });
  defineExpose<AChatMessageListExposed>({ scrollToBottom });
</script>

<template>
  <div class="a9-chat-message-list">
    <div
      ref="viewport"
      class="a9-chat-message-list__viewport"
      role="region"
      :aria-label="t('admin9Ui.chatMessageList.label')"
      tabindex="0"
      @scroll="onScroll"
    >
      <div ref="content" class="a9-chat-message-list__content">
        <div v-if="!messages.length" class="a9-chat-message-list__empty"
          ><slot name="empty">{{ t('admin9Ui.chatMessageList.empty') }}</slot></div
        >
        <article
          v-for="(message, index) in messages"
          :key="message.id"
          :data-chat-message="message.id"
          class="a9-chat-message-list__message"
          :class="`a9-chat-message-list__message--${message.role}`"
        >
          <div class="a9-chat-message-list__avatar">
            <slot name="avatar" :message="message" :index="index">
              <Avatar
                shape="circle"
                :auto-fix-font-size="false"
                class="a9-chat-message-list__avatar-icon"
                :class="{ 'a9-chat-message-list__avatar-icon--assistant': message.role === 'assistant' }"
                aria-hidden="true"
              >
                <IconUser v-if="message.role === 'user'" />
                <IconRobot v-else />
              </Avatar>
              <span class="a9-chat-message-list__avatar-name">{{ t(`admin9Ui.chatMessageList.${message.role}`) }}</span>
            </slot>
          </div>
          <div class="a9-chat-message-list__body">
            <slot name="content" :message="message" :index="index">
              <ChatMarkdown v-if="message.role === 'assistant'" :content="message.content" />
              <div v-else class="a9-chat-message-list__text">{{ message.content }}</div>
            </slot>
            <div
              v-if="message.status && message.status !== 'complete'"
              class="a9-chat-message-list__status"
              :data-status="message.status"
              >{{ t(`admin9Ui.chatMessageList.status.${message.status}`) }}</div
            >
            <div v-if="$slots.footer" class="a9-chat-message-list__footer"
              ><slot name="footer" :message="message" :index="index"
            /></div>
            <div v-if="$slots.actions" class="a9-chat-message-list__actions"
              ><slot name="actions" :message="message" :index="index"
            /></div>
          </div>
        </article>
      </div>
    </div>
    <Button v-if="away" class="a9-chat-message-list__bottom" size="small" @click="scrollToBottom">{{
      t('admin9Ui.chatMessageList.bottom')
    }}</Button>
    <span class="a9-chat-message-list__announcement" role="status" aria-live="polite" aria-atomic="true">{{
      announcement
    }}</span>
  </div>
</template>

<style scoped lang="less">
  .a9-chat-message-list {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    color: var(--color-text-1);
    background: var(--color-bg-2);

    &__viewport {
      flex: 1;
      min-height: 0;
      overflow: auto;
      overflow-anchor: none;

      &:focus-visible {
        outline: 2px solid rgb(var(--primary-6));
        outline-offset: -2px;
      }
    }

    &__content {
      padding: 16px 16px 48px;
    }

    &__empty {
      padding: 32px 0;
      color: var(--color-text-3);
      text-align: center;
    }

    &__message {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 20px;
    }

    &__message--user {
      flex-direction: row-reverse;
    }

    &__avatar {
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      gap: 4px;
      align-items: center;
      max-width: 80px;
      color: var(--color-text-3);
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    &__avatar-icon {
      width: 32px;
      height: 32px;
      color: var(--color-text-2);
      font-size: 16px;
      background-color: var(--color-fill-2);
    }

    &__avatar-icon--assistant {
      color: rgb(var(--primary-6));
      background-color: var(--color-primary-light-1);
    }

    &__avatar-name {
      line-height: 16px;
      text-align: center;
    }

    &__body {
      box-sizing: border-box;
      min-width: 0;
      max-width: 85%;
      padding: 12px;
      overflow-wrap: anywhere;
      background: var(--color-fill-1);
      border-radius: var(--border-radius-medium);
    }

    &__message--user &__body {
      background: var(--color-primary-light-1);
    }

    &__text {
      white-space: pre-wrap;
    }

    &__status {
      margin-top: 8px;
      color: var(--color-text-3);
      font-size: 12px;
    }

    &__footer,
    &__actions {
      margin-top: 8px;
    }

    &__bottom {
      position: absolute;
      bottom: 8px;
      left: 50%;
      transform: translateX(-50%);
    }

    &__announcement {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }

    :deep(.a9-chat-markdown) {
      line-height: 1.7;

      > :first-child {
        margin-top: 0;
      }

      > :last-child {
        margin-bottom: 0;
      }

      pre {
        max-width: 100%;
        padding: 12px;
        overflow-x: auto;
        background: var(--color-fill-2);
        border-radius: var(--border-radius-small);
      }

      code {
        font-family: monospace;
      }

      table {
        display: block;
        max-width: 100%;
        overflow-x: auto;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 6px 10px;
        white-space: nowrap;
        border: 1px solid var(--color-border-2);
      }

      blockquote {
        margin-left: 0;
        padding-left: 12px;
        color: var(--color-text-2);
        border-left: 3px solid var(--color-border-3);
      }

      a {
        color: rgb(var(--primary-6));
      }
    }

    @media (width <= 480px) {
      &__content {
        padding: 12px 8px 48px;
      }

      &__message {
        gap: 8px;
      }

      &__body {
        flex: 1;
        max-width: 100%;
        padding: 10px;
      }

      &__avatar {
        max-width: 48px;
      }

      &__avatar-icon {
        width: 28px;
        height: 28px;
        font-size: 14px;
      }
    }
  }
</style>
