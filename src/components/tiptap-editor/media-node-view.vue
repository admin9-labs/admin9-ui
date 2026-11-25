<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import type { NodeViewProps } from '@tiptap/core';
  import { NodeViewWrapper } from '@tiptap/vue-3';
  import { useI18n } from 'vue-i18n';
  import { isSafeMediaUrl, normalizeAudioWidth, normalizeBlockWidth, normalizeMediaAlign } from './media-attributes';

  const props = defineProps<NodeViewProps>();
  const { t } = useI18n();
  const resizePreview = ref<string>();
  const image = ref<HTMLImageElement>();
  const imageFailure = ref<HTMLElement>();
  const imageFailed = ref(false);
  const imageRetrying = ref(false);
  const imageAttempt = ref(0);
  const imageDisabled = ref(false);
  const imageEditable = ref(props.editor.isEditable);
  const isImageDisabled = () => props.editor.view.dom.getAttribute('aria-disabled') === 'true';
  const syncImageAccess = () => {
    imageDisabled.value = isImageDisabled();
    imageEditable.value = props.editor.isEditable && !imageDisabled.value;
  };
  // setEditable(false, false) need not emit a transaction; observe the host's existing DOM state.
  const imageAccessObserver = new MutationObserver(syncImageAccess);
  watch(
    imageFailed,
    (failed) => {
      imageAccessObserver.disconnect();
      if (!failed) return;
      syncImageAccess();
      imageAccessObserver.observe(props.editor.view.dom, {
        attributes: true,
        attributeFilter: ['contenteditable', 'aria-disabled', 'aria-readonly'],
      });
    },
    { flush: 'sync' }
  );
  watch(
    () => props.node.attrs.src,
    () => {
      imageFailed.value = false;
      imageRetrying.value = false;
      imageAttempt.value = 0;
    },
    { flush: 'sync' }
  );
  const isCurrentImage = (event: Event) =>
    event.target === image.value && image.value?.getAttribute('src') === props.node.attrs.src;
  const onImageError = (event: Event) => {
    if (!isCurrentImage(event)) return;
    imageFailed.value = true;
    imageRetrying.value = false;
  };
  const onImageLoad = async (event: Event) => {
    if (!isCurrentImage(event)) return;
    const restoreFocus = !isImageDisabled() && imageFailure.value?.contains(document.activeElement);
    imageFailed.value = false;
    imageRetrying.value = false;
    if (restoreFocus) {
      await nextTick();
      image.value?.focus({ preventScroll: true });
    }
  };
  const reloadImage = () => {
    if (imageRetrying.value || isImageDisabled()) return;
    imageRetrying.value = true;
    imageAttempt.value += 1;
  };
  const selectFailedImage = () => {
    const position = props.getPos();
    if (props.editor.isEditable && typeof position === 'number') props.editor.chain().focus().setNodeSelection(position).run();
  };
  const nodeName = computed(() => props.node.type.name);
  const isInline = computed(() => nodeName.value === 'inlineImage');
  const isAudio = computed(() => nodeName.value === 'audio');
  const isResizable = computed(() => nodeName.value === 'blockImage' || nodeName.value === 'video');
  const playbackTabIndex = computed(
    () => props.extension.options.getPlaybackTabIndex?.() ?? (props.editor.isEditable ? -1 : undefined)
  );
  const displayWidth = computed(() => resizePreview.value ?? normalizeBlockWidth(props.node.attrs.width));
  const audioWidths = { compact: '320px', standard: '480px', full: '100%' } as const;
  const wrapperStyle = computed(() => {
    if (isInline.value)
      return {
        '--a9-media-size': props.node.attrs.size,
        ...(imageFailed.value ? { height: 'auto', maxWidth: '100%' } : {}),
      };
    if (isAudio.value) return { '--a9-media-width': audioWidths[normalizeAudioWidth(props.node.attrs.width)] };
    return {
      '--a9-media-width': displayWidth.value === 'natural' ? 'fit-content' : displayWidth.value,
      'max-width': '100%',
    };
  });

  const selectAudio = () => {
    if (!props.editor.isEditable || !isAudio.value) return;
    try {
      const position = props.getPos();
      if (typeof position !== 'number' || props.editor.state.doc.nodeAt(position)?.type.name !== 'audio') return;
      props.editor.commands.setNodeSelection(position);
    } catch {
      // The node may have been removed between pointer interaction and command dispatch.
    }
  };

  let stopResize: (() => void) | undefined;
  const startResize = (event: PointerEvent) => {
    if (!props.editor.isEditable || !isResizable.value || (event.pointerType && event.pointerType !== 'mouse')) return;
    event.preventDefault();
    event.stopPropagation();
    const wrapper =
      event.currentTarget instanceof Element ? event.currentTarget.closest<HTMLElement>('[data-node-view-wrapper]') : null;
    const prose = wrapper?.closest<HTMLElement>('.a9-tiptap-editor__prose');
    if (!wrapper || !prose) return;
    const startX = event.clientX;
    const startWidth = wrapper.getBoundingClientRect().width;
    const containerWidth = prose.getBoundingClientRect().width;
    if (!containerWidth) return;

    const onMove = (moveEvent: PointerEvent) => {
      const percent = Math.min(
        100,
        Math.max(10, Math.round(((startWidth + moveEvent.clientX - startX) / containerWidth) * 100))
      );
      resizePreview.value = `${percent}%`;
    };
    const onEnd = () => {
      if (resizePreview.value) props.updateAttributes({ width: resizePreview.value });
      resizePreview.value = undefined;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      stopResize = undefined;
    };
    stopResize = onEnd;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  onBeforeUnmount(() => {
    imageAccessObserver.disconnect();
    stopResize?.();
  });
</script>

<template>
  <NodeViewWrapper
    :as="isInline ? 'span' : 'div'"
    class="a9-tiptap-editor__media-node"
    :class="[
      `is-${nodeName}`,
      { 'is-selected': selected && editor.isEditable, 'is-resizable': isResizable && editor.isEditable },
    ]"
    :data-media-node="nodeName"
    :data-width="isAudio ? normalizeAudioWidth(node.attrs.width) : undefined"
    :data-align="isInline ? undefined : normalizeMediaAlign(node.attrs.align)"
    :style="wrapperStyle"
  >
    <img
      v-if="nodeName === 'blockImage' || nodeName === 'inlineImage'"
      v-show="!imageFailed"
      :key="`${node.attrs.src}:${imageAttempt}`"
      ref="image"
      :src="node.attrs.src"
      :alt="node.attrs.alt"
      :title="node.attrs.title"
      :loading="imageAttempt ? 'eager' : isInline ? undefined : 'lazy'"
      draggable="false"
      tabindex="-1"
      @error="onImageError"
      @load="onImageLoad"
    />
    <video
      v-else-if="nodeName === 'video'"
      :src="node.attrs.src"
      :poster="isSafeMediaUrl(node.attrs.poster) ? node.attrs.poster : undefined"
      :title="node.attrs.title"
      controls
      preload="metadata"
      :autoplay="false"
      :tabindex="playbackTabIndex"
    />
    <audio
      v-else
      :src="node.attrs.src"
      :title="node.attrs.title"
      controls
      preload="metadata"
      :autoplay="false"
      :tabindex="playbackTabIndex"
      @click="selectAudio"
    />
    <span
      v-if="imageFailed"
      ref="imageFailure"
      class="a9-media-image-failure"
      contenteditable="false"
      :aria-busy="imageRetrying"
      @mousedown.stop
      @click.stop
    >
      <span role="status">{{ t(`admin9Ui.tiptapEditor.${imageRetrying ? 'imageReloading' : 'imageLoadFailed'}`) }}</span>
      <button type="button" :disabled="imageDisabled" :aria-disabled="imageRetrying || imageDisabled" @click="reloadImage">
        {{ t('admin9Ui.tiptapEditor.imageReload') }}
      </button>
      <button v-if="imageEditable" type="button" @click="selectFailedImage">
        {{ t('admin9Ui.tiptapEditor.imageFailureActions') }}
      </button>
    </span>
    <button
      v-if="selected && editor.isEditable && isResizable"
      class="a9-tiptap-editor__resize-handle"
      type="button"
      :aria-label="t('admin9Ui.tiptapEditor.resizeMedia')"
      tabindex="-1"
      @pointerdown="startResize"
    />
  </NodeViewWrapper>
</template>

<style scoped lang="less">
  .a9-media-image-failure {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    align-items: center;
    box-sizing: border-box;
    max-width: 100%;
    padding: 8px;
    color: var(--color-text-2);
    font-size: 12px;
    line-height: 1.5;
    overflow-wrap: anywhere;
    background: var(--color-fill-2);
    border: 1px solid var(--color-border-2);
    border-radius: 4px;

    button {
      min-height: 28px;
      padding: 2px 4px;
      color: rgb(var(--primary-6));
      font: inherit;
      background: transparent;
      border: 0;
      border-radius: 2px;
      cursor: pointer;

      &[aria-disabled='true'] {
        color: var(--color-text-4);
        cursor: wait;
      }

      &:focus-visible {
        outline: 2px solid rgb(var(--primary-6));
        outline-offset: 1px;
      }
    }
  }
</style>
