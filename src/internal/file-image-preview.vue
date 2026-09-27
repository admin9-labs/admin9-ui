<script setup lang="ts">
  import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { ImagePreview } from '@arco-design/web-vue';
  import { useI18n } from 'vue-i18n';

  const props = defineProps<{ src: string; name: string }>();
  const emit = defineEmits<{ (e: 'close'): void }>();
  const { t } = useI18n();
  const host = ref<HTMLElement>();
  const actions = ['fullScreen', 'rotateRight', 'rotateLeft', 'zoomIn', 'zoomOut', 'originalSize'];
  let observer: MutationObserver | undefined;
  let mounted = true;

  // Arco 2.57 renders preview actions as divs. Keep its image transforms and
  // click handlers, but scope accessible controls and keyboard handling here.
  const prepareControls = () => {
    const root = host.value;
    if (!root) return;
    const close = root.querySelector<HTMLElement>('.arco-image-preview-close-btn');
    close?.setAttribute('role', 'button');
    close?.setAttribute('tabindex', '0');
    close?.setAttribute('aria-label', t('admin9Ui.filePicker.closePreview'));
    root.querySelector('img')?.setAttribute('alt', props.name);
    root.querySelectorAll<HTMLElement>('.arco-image-preview-toolbar-action').forEach((control, index) => {
      const disabled = control.classList.contains('arco-image-preview-toolbar-action-disabled');
      control.setAttribute('role', 'button');
      control.setAttribute('tabindex', disabled ? '-1' : '0');
      control.setAttribute('aria-disabled', String(disabled));
      control.setAttribute('aria-label', t(`admin9Ui.filePicker.previewActions.${actions[index]}`));
    });
  };
  const focusClose = () => host.value?.querySelector<HTMLElement>('.arco-image-preview-close-btn')?.focus();
  const onKeydown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      emit('close');
      return;
    }
    const controls = Array.from(host.value?.querySelectorAll<HTMLElement>('[role="button"][tabindex="0"]') ?? []);
    if (event.key === 'Tab') {
      const index = controls.indexOf(document.activeElement as HTMLElement);
      const next = index + (event.shiftKey ? -1 : 1);
      event.preventDefault();
      controls[(next + controls.length) % controls.length]?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="button"]') : null;
      if (target && host.value?.contains(target)) {
        event.preventDefault();
        if (target.getAttribute('aria-disabled') !== 'true') {
          // Arco's mask click handler otherwise focuses the preview wrapper.
          target.addEventListener('click', (click) => click.stopPropagation(), { once: true });
          target.click();
        }
      }
    }
  };
  onMounted(async () => {
    observer = new MutationObserver(prepareControls);
    if (host.value)
      observer.observe(host.value, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    await nextTick();
    if (!mounted) return;
    prepareControls();
    focusClose();
  });
  watch(() => [props.name, t('admin9Ui.filePicker.closePreview')], prepareControls);
  onBeforeUnmount(() => {
    mounted = false;
    observer?.disconnect();
  });
</script>

<template>
  <Teleport to="body">
    <div
      ref="host"
      class="a9-file-image-preview"
      role="dialog"
      aria-modal="true"
      :aria-label="t('admin9Ui.filePicker.previewItem', { name })"
      @keydown.capture="onKeydown"
    >
      <ImagePreview
        :src="src"
        :visible="true"
        :render-to-body="false"
        :keyboard="false"
        :actions-layout="actions"
        @close="emit('close')"
      />
    </div>
  </Teleport>
</template>

<style scoped lang="less">
  .a9-file-image-preview {
    display: contents;

    :deep([role='button']:focus-visible) {
      outline: 2px solid rgb(var(--primary-6));
      outline-offset: 3px;
    }
  }
</style>
