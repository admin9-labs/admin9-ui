<script setup lang="ts">
  import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
  import type { Editor } from '@tiptap/core';
  import { BubbleMenuPlugin, type BubbleMenuPluginProps } from '@tiptap/extension-bubble-menu';
  import { PluginKey } from '@tiptap/pm/state';

  interface Props {
    editor: Editor;
    pluginKey?: BubbleMenuPluginProps['pluginKey'];
    updateDelay?: number;
    resizeDelay?: number;
    options?: BubbleMenuPluginProps['options'];
    appendTo?: BubbleMenuPluginProps['appendTo'];
    shouldShow?: BubbleMenuPluginProps['shouldShow'];
    getReferencedVirtualElement?: BubbleMenuPluginProps['getReferencedVirtualElement'];
  }

  const props = defineProps<Props>();
  const root = ref<HTMLElement>();
  const resolvedPluginKey = props.pluginKey ?? new PluginKey('a9TiptapMediaBubbleMenu');

  onMounted(async () => {
    const element = root.value;
    if (!element) return;

    element.style.visibility = 'hidden';
    element.style.position = 'absolute';
    element.remove();
    await nextTick();

    props.editor.registerPlugin(
      BubbleMenuPlugin({
        editor: props.editor,
        element,
        pluginKey: resolvedPluginKey,
        updateDelay: props.updateDelay,
        resizeDelay: props.resizeDelay,
        options: props.options,
        appendTo: props.appendTo,
        shouldShow: props.shouldShow,
        getReferencedVirtualElement: props.getReferencedVirtualElement,
      })
    );
  });

  onBeforeUnmount(() => {
    if (!props.editor.isDestroyed) props.editor.unregisterPlugin(resolvedPluginKey);
  });
</script>

<template>
  <div ref="root"><slot /></div>
</template>
