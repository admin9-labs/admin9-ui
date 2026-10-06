<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { ConfigProvider, ImagePreview, ImagePreviewGroup } from '@arco-design/web-vue';
  import arcoZhCN from '@arco-design/web-vue/es/locale/lang/zh-cn';
  import { useI18n } from 'vue-i18n';

  const props = defineProps<{ src: string; name: string; items?: { src: string; name: string }[]; current?: number }>();
  const emit = defineEmits<{ (e: 'close'): void }>();
  const { t, locale } = useI18n();
  const host = ref<HTMLElement>();
  const visible = ref(true);
  const actions = ['fullScreen', 'rotateRight', 'rotateLeft', 'zoomIn', 'zoomOut', 'originalSize'];
  const current = ref(props.current ?? 0);
  const currentName = computed(() => props.items?.[current.value]?.name ?? props.name);
  // Override only this preview's labels; consuming apps keep their own Arco locale.
  const previewLocale = computed(() => ({
    ...arcoZhCN,
    locale: locale.value,
    imagePreview: {
      fullScreen: t('admin9Ui.filePicker.previewActions.fullScreen'),
      rotateRight: t('admin9Ui.filePicker.previewActions.rotateRight'),
      rotateLeft: t('admin9Ui.filePicker.previewActions.rotateLeft'),
      zoomIn: t('admin9Ui.filePicker.previewActions.zoomIn'),
      zoomOut: t('admin9Ui.filePicker.previewActions.zoomOut'),
      originalSize: t('admin9Ui.filePicker.previewActions.originalSize'),
    },
  }));
  let observer: MutationObserver | undefined;
  let mounted = true;
  const close = async () => {
    if (!visible.value) return;
    visible.value = false;
    // Let Arco unregister this dialog before its parent removes the preview.
    await nextTick();
    if (mounted) emit('close');
  };
  defineExpose({ close });

  const onVisibleChange = (value: boolean) => {
    if (!value) close();
  };

  const focusClose = () => host.value?.querySelector<HTMLElement>('.arco-image-preview-close-btn')?.focus();

  // Arco 2.57 renders preview actions as divs. Keep its image transforms and
  // click handlers, but scope accessible controls and keyboard handling here.
  const prepareControls = () => {
    const root = host.value;
    if (!root) return;
    const closeControl = root.querySelector<HTMLElement>('.arco-image-preview-close-btn');
    closeControl?.setAttribute('role', 'button');
    closeControl?.setAttribute('tabindex', '0');
    closeControl?.setAttribute('aria-label', t('admin9Ui.filePicker.closePreview'));
    closeControl?.setAttribute('title', t('admin9Ui.filePicker.closePreview'));
    root.querySelector('img')?.setAttribute('alt', currentName.value);
    ['left', 'right'].forEach((direction, index) => {
      const control = root.querySelector<HTMLElement>(`.arco-image-preview-arrow-${direction}`);
      if (!control) return;
      const disabled = control.classList.contains('arco-image-preview-arrow-disabled');
      const label = t(`admin9Ui.filePicker.previewActions.${index === 0 ? 'previous' : 'next'}`);
      control.setAttribute('role', 'button');
      control.setAttribute('tabindex', disabled ? '-1' : '0');
      control.setAttribute('aria-disabled', String(disabled));
      control.setAttribute('aria-label', label);
      control.setAttribute('title', label);
      if (disabled && document.activeElement === control) focusClose();
    });
    root.querySelectorAll<HTMLElement>('.arco-image-preview-toolbar-action').forEach((control, index) => {
      const disabled = control.classList.contains('arco-image-preview-toolbar-action-disabled');
      control.setAttribute('role', 'button');
      control.setAttribute('tabindex', disabled ? '-1' : '0');
      control.setAttribute('aria-disabled', String(disabled));
      control.setAttribute('aria-label', t(`admin9Ui.filePicker.previewActions.${actions[index]}`));
    });
  };
  const onKeydown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (props.items && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' ? 'left' : 'right';
      const control = host.value?.querySelector<HTMLElement>(`.arco-image-preview-arrow-${direction}`);
      if (control?.getAttribute('aria-disabled') === 'false') {
        control.addEventListener('click', (click) => click.stopPropagation(), { once: true });
        control.click();
      }
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
  watch(current, async () => {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    // Arco refocuses its wrapper after switching the source; keep keyboard users on a valid control.
    await nextTick();
    await nextTick();
    if (!mounted) return;
    prepareControls();
    if (active && host.value?.contains(active) && active.getAttribute('tabindex') === '0') active.focus();
    else focusClose();
  });
  watch(
    () => [currentName.value, locale.value, t('admin9Ui.filePicker.closePreview')],
    () => nextTick(prepareControls)
  );
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
      :aria-label="t('admin9Ui.filePicker.previewItem', { name: currentName })"
      @keydown.capture="onKeydown"
    >
      <ConfigProvider :locale="previewLocale">
        <ImagePreviewGroup
          v-if="items"
          v-model:current="current"
          :src-list="items.map((item) => item.src)"
          :visible="visible"
          :render-to-body="false"
          :keyboard="false"
          :actions-layout="actions"
          @visible-change="onVisibleChange"
        />
        <ImagePreview
          v-else
          :src="src"
          :visible="visible"
          :render-to-body="false"
          :keyboard="false"
          :actions-layout="actions"
          @close="close"
        />
      </ConfigProvider>
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
