<script setup lang="ts">
  import { computed, onBeforeUnmount, ref } from 'vue';
  import type { NodeViewProps } from '@tiptap/core';
  import { NodeViewWrapper } from '@tiptap/vue-3';
  import { useI18n } from 'vue-i18n';
  import { normalizeAudioWidth, normalizeBlockWidth, normalizeMediaAlign } from './media-attributes';

  const props = defineProps<NodeViewProps>();
  const { t } = useI18n();
  const resizePreview = ref<string>();
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
    if (isInline.value) return { '--a9-media-size': props.node.attrs.size };
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

  onBeforeUnmount(() => stopResize?.());
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
      :src="node.attrs.src"
      :alt="node.attrs.alt"
      :title="node.attrs.title"
      :loading="isInline ? undefined : 'lazy'"
      draggable="false"
    />
    <video
      v-else-if="nodeName === 'video'"
      :src="node.attrs.src"
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
