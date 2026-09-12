<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import type { Editor } from '@tiptap/core';
  import type { Mark } from '@tiptap/pm/model';
  import { useI18n } from 'vue-i18n';
  import { fontSizes, highlightColors, normalizeTextColor, textColors } from './text-format';

  const props = defineProps<{ editor?: Editor; disabled: boolean }>();
  const { t } = useI18n();
  const revision = ref(0);
  const popupVisible = ref({ color: false, highlight: false });
  const changed = () => {
    revision.value += 1;
  };
  watch(
    () => props.editor,
    (editor, previous) => {
      previous?.off('transaction', changed);
      editor?.on('transaction', changed);
    },
    { immediate: true }
  );
  onBeforeUnmount(() => props.editor?.off('transaction', changed));
  const read = (mark: string, attribute: string) => {
    const { editor } = props;
    if (!editor) return '';
    const { from, to, empty, $from } = editor.state.selection;
    const values = new Set<string>();
    const take = (marks: readonly Mark[]) =>
      values.add(String(marks.find((item) => item.type.name === mark)?.attrs[attribute] ?? ''));
    if (empty) take(editor.state.storedMarks ?? $from.marks());
    else
      editor.state.doc.nodesBetween(from, to, (node) => {
        if (node.isText) take(node.marks);
      });
    return values.size > 1 ? 'mixed' : [...values][0] ?? '';
  };
  const current = computed(() => {
    return {
      revision: revision.value,
      color: read('textStyle', 'color'),
      highlight: read('highlight', 'color'),
      fontSize: read('textStyle', 'fontSize'),
    };
  });
  const palettes = computed(() => [
    { key: 'color' as const, label: t('admin9Ui.tiptapEditor.textColor'), colors: textColors },
    { key: 'highlight' as const, label: t('admin9Ui.tiptapEditor.highlight'), colors: highlightColors },
  ]);
  const applyColor = (kind: 'color' | 'highlight', color: string) => {
    if (!props.editor || props.disabled) return;
    const chain = props.editor.chain().focus();
    if (kind === 'color') {
      if (color) chain.setColor(normalizeTextColor(color) ?? color).run();
      else chain.unsetColor().run();
    } else if (color) chain.setHighlight({ color: normalizeTextColor(color) ?? color }).run();
    else chain.unsetHighlight().run();
    popupVisible.value[kind] = false;
  };
  const applySize = (value: string | number | Record<string, unknown> | undefined) => {
    if (!props.editor || props.disabled || typeof value !== 'string') return;
    const chain = props.editor.chain().focus();
    if (fontSizes.includes(value)) chain.setFontSize(value).run();
    else chain.unsetFontSize().run();
  };
</script>

<template>
  <a-popover
    v-for="palette in palettes"
    :key="palette.key"
    v-model:popup-visible="popupVisible[palette.key]"
    trigger="click"
    position="bottom"
    :disabled="disabled"
  >
    <a-tooltip :content="palette.label">
      <a-button size="small" type="text" :disabled="disabled" :aria-label="palette.label" @mousedown.prevent>
        <span
          :style="
            palette.key === 'color'
              ? { borderBottom: `3px solid ${normalizeTextColor(current.color) ?? 'currentColor'}` }
              : { backgroundColor: normalizeTextColor(current.highlight) ?? 'transparent' }
          "
          >A</span
        >
      </a-button>
    </a-tooltip>
    <template #content>
      <div
        class="a9-text-palette"
        role="group"
        :aria-label="palette.label"
        @mousedown.prevent
        @keydown.esc.stop.prevent="popupVisible[palette.key] = false"
      >
        <span>{{
          current[palette.key] === 'mixed'
            ? t('admin9Ui.tiptapEditor.mixedFormat')
            : current[palette.key] || t('admin9Ui.tiptapEditor.defaultFormat')
        }}</span>
        <a-button size="small" @click="applyColor(palette.key, '')">{{ t('admin9Ui.tiptapEditor.defaultFormat') }}</a-button>
        <div class="a9-text-palette__colors">
          <button
            v-for="color in palette.colors"
            :key="color"
            type="button"
            :style="{ backgroundColor: color }"
            :aria-label="`${palette.label} ${color}`"
            :aria-pressed="normalizeTextColor(current[palette.key]) === normalizeTextColor(color)"
            @click="applyColor(palette.key, color)"
          />
        </div>
      </div>
    </template>
  </a-popover>
  <a-dropdown trigger="click" @select="applySize">
    <a-button
      class="a9-text-format-size"
      size="small"
      type="text"
      :disabled="disabled"
      :aria-label="t('admin9Ui.tiptapEditor.fontSize')"
      @mousedown.prevent
    >
      {{
        current.fontSize === 'mixed'
          ? t('admin9Ui.tiptapEditor.mixedFormat')
          : current.fontSize || t('admin9Ui.tiptapEditor.fontSize')
      }}
    </a-button>
    <template #content>
      <a-doption value="default">{{ t('admin9Ui.tiptapEditor.defaultFormat') }}</a-doption>
      <a-doption v-for="size in fontSizes" :key="size" :value="size">{{ size }}</a-doption>
    </template>
  </a-dropdown>
</template>

<style scoped lang="less">
  .a9-text-palette {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 240px;
  }

  .a9-text-palette__colors {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    button {
      width: 24px;
      height: 24px;
      border: 1px solid var(--color-border-3);
      border-radius: 3px;
      cursor: pointer;

      &[aria-pressed='true'],
      &:focus-visible {
        outline: 2px solid rgb(var(--primary-6));
        outline-offset: 2px;
      }
    }
  }
</style>
