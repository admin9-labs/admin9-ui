<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { ColorPicker } from '@arco-design/web-vue';
  import { IconFontColors, IconHighlight, IconDown } from '@arco-design/web-vue/es/icon';
  import type { Editor, EditorEvents } from '@tiptap/core';
  import type { SelectionBookmark, Transaction } from '@tiptap/pm/state';
  import type { Mark } from '@tiptap/pm/model';
  import { closeHistory } from '@tiptap/pm/history';
  import { useI18n } from 'vue-i18n';
  import TextSpacingOptions from './text-spacing-options.vue';
  import ToolbarTooltip from './toolbar-tooltip.vue';
  import mapDraftSelection from './draft-selection';
  import {
    readBlockFormat,
    readInlineFormat,
    setBlockFormat,
    setInlineFormat,
    type InlineFormat,
    type FormatState,
  } from './format-state';
  import { firstLineIndents, fontSizes, letterSpacings, lineHeights, normalizeTextColor } from './text-format';

  const props = withDefaults(
    defineProps<{
      editor?: Editor;
      disabled: boolean;
      showHighlight?: boolean;
      section?: 'all' | 'size' | 'colors' | 'spacing';
      embedded?: boolean;
    }>(),
    { showHighlight: true, section: 'all', embedded: false }
  );
  const emit = defineEmits<{ (event: 'open'): void; (event: 'apply'): void }>();
  const presetColors = [
    '#00B42A',
    '#3C7EFF',
    '#FF7D00',
    '#F76965',
    '#F7BA1E',
    '#F5319D',
    '#D91AD9',
    '#9FDB1D',
    '#FADC19',
    '#722ED1',
    '#3491FA',
    '#7BE188',
    '#93BEFF',
    '#FFCF8B',
    '#FBB0A7',
    '#FCE996',
    '#FB9DC7',
    '#F08EE6',
    '#DCF190',
    '#FDFA94',
    '#C396ED',
    '#9FD4FD',
    '#FFFFFF',
    '#F5F5F5',
    '#E5E5E5',
    '#D4D4D4',
    '#A3A3A3',
    '#737373',
    '#525252',
    '#404040',
    '#262626',
    '#171717',
    '#000000',
  ];
  const { t } = useI18n();
  const text = (key: string) => t(`admin9Ui.tiptapEditor.${key}`);
  type Overlay = 'color' | 'highlight' | 'size' | 'spacing';
  const owner = {};
  const overlayEvent = 'a9-editor-overlay-open';
  let overlayDOM: HTMLElement | undefined;
  const revision = ref(0);
  const overlay = ref<Overlay | ''>('');
  const draft = ref('');
  const draftTouched = ref(false);
  const draftInputInvalid = ref(false);
  const draftHexInput = ref<string | null>(null);
  const candidateColor = computed(() =>
    normalizeTextColor(draftHexInput.value === null ? draft.value : `#${draftHexInput.value}`)
  );
  let draftInteraction = false;
  const triggers = new Map<Overlay, HTMLElement>();
  const panels = new Map<Overlay, HTMLElement>();
  const availableHeight = ref(480);
  const panelStyle = computed(() => ({ maxHeight: `${Math.min(480, availableHeight.value)}px`, overflowY: 'auto' as const }));
  const fitPanel = () => {
    if (!overlay.value) return;
    const rect = triggers.get(overlay.value)?.getBoundingClientRect();
    if (rect) availableHeight.value = Math.max(80, Math.max(rect.top, window.innerHeight - rect.bottom) - 48);
  };
  const focusPanel = (kind: Overlay) => {
    nextTick(() => {
      if (overlay.value !== kind) return;
      const panel = panels.get(kind);
      const selected = panel?.querySelector<HTMLElement>('[aria-checked="true"]:not([disabled]):not([aria-disabled="true"])');
      const first = panel?.querySelector<HTMLElement>(
        'input:not(:disabled):not([readonly]), button:not(:disabled), [role="menuitemradio"]:not([aria-disabled="true"])'
      );
      (selected ?? first ?? panel)?.focus({ preventScroll: true });
    });
  };
  const registerPanel = (kind: Overlay, element: unknown) => {
    if (element instanceof HTMLElement) {
      const changed = panels.get(kind) !== element;
      panels.set(kind, element);
      if (changed) focusPanel(kind);
    } else panels.delete(kind);
  };
  let bookmark: SelectionBookmark | undefined;
  let savedMarks: readonly Mark[] | null = null;
  let selectionInvalid = false;
  let applying = false;
  let focusGeneration = 0;
  const registerTrigger = (kind: Overlay, element: unknown) => {
    const node = (element as { $el?: HTMLElement } | null)?.$el ?? element;
    if (node instanceof HTMLElement) triggers.set(kind, node);
    else triggers.delete(kind);
  };
  const captureSelection = () => {
    if (!props.editor || props.editor.isDestroyed || props.disabled) return;
    bookmark = props.editor.state.selection.getBookmark();
    savedMarks = props.editor.state.storedMarks;
    selectionInvalid = false;
    revision.value += 1;
  };
  const close = (restoreTrigger = false) => {
    const kind = overlay.value;
    const trigger = kind ? triggers.get(kind) : undefined;
    focusGeneration += 1;
    const generation = focusGeneration;
    // Move focus before Arco removes the popup after its leave animation.
    if (restoreTrigger && trigger?.isConnected) trigger.focus({ preventScroll: true });
    overlay.value = '';
    draft.value = '';
    draftTouched.value = false;
    draftInputInvalid.value = false;
    draftHexInput.value = null;
    draftInteraction = false;
    bookmark = undefined;
    savedMarks = null;
    revision.value += 1;
    if (restoreTrigger)
      nextTick(() => {
        if (generation === focusGeneration && document.activeElement === document.body && trigger?.isConnected)
          trigger.focus({ preventScroll: true });
      });
  };
  const onOtherOverlay = (event: Event) => {
    if ((event as CustomEvent<{ owner?: unknown }>).detail?.owner === owner) return;
    close();
    if (props.embedded) captureSelection();
  };
  const changed = ({ transaction, appendedTransactions }: EditorEvents['transaction']) => {
    [transaction, ...appendedTransactions].forEach((step) => {
      if (!bookmark) return;
      bookmark = mapDraftSelection(bookmark, step);
      const replaced = step.getMeta('preventUpdate') !== undefined && !step.before.content.eq(step.doc.content);
      if (!applying && (!bookmark || replaced)) {
        close();
        selectionInvalid = true;
      }
    });
    revision.value += 1;
  };
  watch(
    () => props.editor,
    (editor, previous) => {
      previous?.off('transaction', changed);
      overlayDOM?.removeEventListener(overlayEvent, onOtherOverlay);
      close();
      editor?.on('transaction', changed);
      overlayDOM = editor && !editor.isDestroyed ? editor.view.dom : undefined;
      overlayDOM?.addEventListener(overlayEvent, onOtherOverlay);
      if (props.embedded) captureSelection();
    },
    { immediate: true }
  );
  watch(
    () => props.disabled,
    (disabled) => {
      if (disabled) {
        close();
        selectionInvalid = true;
      }
    }
  );
  onMounted(() => {
    if (props.embedded) captureSelection();
    window.addEventListener('resize', fitPanel);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('resize', fitPanel);
    focusGeneration += 1;
    props.editor?.off('transaction', changed);
    overlayDOM?.removeEventListener(overlayEvent, onOtherOverlay);
  });
  const editorSnapshot = computed(() => ({ revision: revision.value, state: props.editor?.state }));
  const selectionState = computed(() => {
    const { state } = editorSnapshot.value;
    if (!state || !bookmark) return state;
    const selection = bookmark.resolve(state.doc);
    if (state.selection.eq(selection) && !savedMarks) return state;
    return state.apply(state.tr.setSelection(selection).setStoredMarks(savedMarks).setMeta('addToHistory', false));
  });
  const inline = (key: InlineFormat): FormatState =>
    selectionState.value ? readInlineFormat(selectionState.value, key) : { value: 'unavailable', partial: false };
  const current = computed(() => ({
    color: inline('color'),
    highlight: inline('highlight'),
    fontSize: inline('fontSize'),
    letterSpacing: inline('letterSpacing'),
  }));
  const stateLabel = (key: string, value: string) => {
    if (value === 'unavailable')
      return text(key === 'firstLineIndent' || key === 'lineHeight' ? 'textBlockOnly' : 'textFormatUnavailable');
    if (value === 'mixed') return text('mixedFormat');
    if (value === 'default-highlight') return text('defaultHighlight');
    if (!value) {
      const defaults: Record<string, string> = {
        color: 'defaultTextColor',
        highlight: 'noHighlight',
        fontSize: 'inheritFontSize',
      };
      return text(defaults[key] ?? 'formatDefault');
    }
    if (key === 'firstLineIndent') return text(value === '0em' ? 'indentNone' : 'indentTwoCharacters');
    if (key === 'lineHeight')
      return text(
        { '1': 'lineHeightSingle', '1.5': 'lineHeightOneAndHalf', '2': 'lineHeightDouble' }[value] ?? 'formatDefault'
      );
    return value;
  };
  const spacingControls = computed(() => {
    if (!props.editor?.extensionManager.extensions.some((extension) => extension.name === 'a9TextFormat')) return [];
    return [
      { key: 'firstLineIndent', values: firstLineIndents },
      { key: 'lineHeight', values: lineHeights },
      { key: 'letterSpacing', values: letterSpacings },
    ].map((control) => {
      let state: FormatState = { value: 'unavailable', partial: false };
      if (control.key === 'letterSpacing') state = current.value.letterSpacing;
      else if (selectionState.value) state = readBlockFormat(selectionState.value, control.key);
      return { ...control, ...state, label: text(control.key), description: stateLabel(control.key, state.value) };
    });
  });
  const spacingProps = computed(() => ({
    controls: spacingControls.value,
    disabled: props.disabled,
    label: stateLabel,
    defaultLabel: text('formatDefault'),
    partialLabel: text('partialBlockFormat'),
    partialTextLabel: text('partialTextFormat'),
    existingTextOnly: text('existingTextOnly'),
    indentScope: text('indentScope'),
  }));
  const shown = (section: 'size' | 'colors' | 'spacing') => props.section === 'all' || props.section === section;
  const palettes = computed(() =>
    [
      { key: 'color' as const, label: text('textColor') },
      { key: 'highlight' as const, label: text('highlight') },
    ].filter((palette) => palette.key !== 'highlight' || props.showHighlight)
  );
  const open = (kind: Overlay, visible: boolean) => {
    if (!visible) {
      if (overlay.value === kind) close();
      return;
    }
    if (props.disabled || !props.editor || overlay.value === kind) return;
    close();
    props.editor.view.dom.dispatchEvent(new CustomEvent(overlayEvent, { detail: { owner } }));
    emit('open');
    captureSelection();
    overlay.value = kind;
    fitPanel();
    if (kind === 'color' || kind === 'highlight') {
      draft.value = normalizeTextColor(current.value[kind].value) ?? '';
      draftTouched.value = false;
    }
    focusPanel(kind);
  };
  const changeDraft = (value: string) => {
    if (!draftInteraction || draftInputInvalid.value || !['color', 'highlight'].includes(overlay.value)) return;
    draft.value = value;
    draftHexInput.value = null;
    draftTouched.value = true;
  };
  const interactWithDraft = (event: Event) => {
    const { target } = event;
    if (!(target instanceof HTMLElement)) return;
    draftInteraction = true;
    if (event.type === 'input' && target instanceof HTMLInputElement && target.closest('.arco-color-picker-input-hex')) {
      draftInputInvalid.value = !/^[\da-f]{3}(?:[\da-f]{3})?$/i.test(target.value);
      draftTouched.value = true;
      draftHexInput.value = target.value;
    } else if (event.type !== 'input') {
      const preset = target.closest<HTMLElement>('.arco-color-picker-color-block');
      if (preset) {
        draftInputInvalid.value = false;
        changeDraft(preset.style.backgroundColor);
      } else if (!target.closest('input')) {
        draftInputInvalid.value = false;
        draftHexInput.value = null;
      }
    }
  };
  const apply = (build: (state: NonNullable<typeof selectionState.value>) => Transaction) => {
    const { editor } = props;
    if (!editor || props.disabled || selectionInvalid) return;
    const selection = bookmark?.resolve(editor.state.doc) ?? editor.state.selection;
    applying = true;
    try {
      if (!editor.state.selection.eq(selection) || savedMarks)
        editor.view.dispatch(editor.state.tr.setSelection(selection).setStoredMarks(savedMarks).setMeta('addToHistory', false));
      const transaction = build(editor.state);
      if (transaction.docChanged || transaction.storedMarksSet) {
        editor.view.dispatch(closeHistory(transaction));
        editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory', false));
      }
      close();
      editor.view.focus();
      emit('apply');
      nextTick(() => {
        if (!editor.isDestroyed && document.activeElement === document.body) editor.view.focus();
      });
    } finally {
      applying = false;
    }
  };
  const applySize = (value: unknown) => {
    if (value !== 'default' && (typeof value !== 'string' || !fontSizes.includes(value))) return;
    apply((state) => setInlineFormat(state, 'fontSize', value === 'default' ? null : (value as string)));
  };
  const navigateSize = (event: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const options = Array.from(
      (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitemradio"]:not([aria-disabled="true"])')
    );
    let index = options.indexOf(document.activeElement as HTMLElement) + (event.key === 'ArrowDown' ? 1 : -1);
    if (event.key === 'Home') index = 0;
    if (event.key === 'End') index = options.length - 1;
    options[(index + options.length) % options.length]?.focus();
  };
  const applySpacing = (key: string, value: string) => {
    const control = spacingControls.value.find((item) => item.key === key);
    if (!control || control.value === 'unavailable' || (value !== 'default' && !control.values.includes(value))) return;
    apply((state) =>
      key === 'letterSpacing'
        ? setInlineFormat(state, key, value === 'default' ? null : value)
        : setBlockFormat(state, key, value === 'default' ? null : value)
    );
  };
  const applyColor = (key: 'color' | 'highlight', reset = false) => {
    const color = candidateColor.value;
    if (!reset && (!draftTouched.value || draftInputInvalid.value || !color)) return;
    apply((state) => setInlineFormat(state, key, reset ? null : color));
  };
  defineExpose({ close, captureSelection });
</script>

<template>
  <template v-if="shown('colors')">
    <a-popover
      v-for="palette in palettes"
      :key="palette.key"
      :popup-visible="overlay === palette.key"
      trigger="click"
      position="bottom"
      @popup-visible-change="open(palette.key, $event)"
    >
      <ToolbarTooltip :content="`${palette.label}：${stateLabel(palette.key, current[palette.key].value)}`">
        <a-button
          :ref="(element: unknown) => registerTrigger(palette.key, element)"
          size="small"
          type="text"
          :disabled="disabled"
          :aria-label="palette.label"
          :aria-description="stateLabel(palette.key, current[palette.key].value)"
          :aria-expanded="overlay === palette.key"
          @mousedown.prevent
          @keydown.down.prevent="open(palette.key, true)"
          @keydown.esc.stop.prevent="close(true)"
        >
          <span class="a9-text-color-icon">
            <IconFontColors v-if="palette.key === 'color'" />
            <IconHighlight v-else />
            <span
              class="a9-text-color-swatch"
              :style="{ backgroundColor: normalizeTextColor(current[palette.key].value) || undefined }"
            />
          </span>
          <span v-if="current[palette.key].value === 'mixed'" class="a9-text-format-state">{{ text('mixedFormat') }}</span>
        </a-button>
      </ToolbarTooltip>
      <template #content>
        <div
          :ref="(element: unknown) => registerPanel(palette.key, element)"
          class="a9-text-palette"
          :style="panelStyle"
          role="group"
          tabindex="-1"
          :aria-label="palette.label"
          @keydown.esc.capture.stop.prevent="close(true)"
        >
          <p class="a9-text-format-summary"
            >{{ text('currentFormat') }}：{{ stateLabel(palette.key, current[palette.key].value) }}</p
          >
          <p v-if="current[palette.key].partial" class="a9-text-format-hint">{{
            text(current[palette.key].hasEmpty ? 'existingTextOnly' : 'partialTextFormat')
          }}</p>
          <div @mousedown.capture="interactWithDraft" @click.capture="interactWithDraft" @input.capture="interactWithDraft">
            <ColorPicker
              :model-value="draft"
              format="hex"
              hide-trigger
              disabled-alpha
              show-preset
              :preset-colors="presetColors"
              :disabled="disabled || current[palette.key].value === 'unavailable'"
              @update:model-value="changeDraft"
            />
          </div>
          <p class="a9-text-format-hint"
            >{{ text('draftColor') }}：{{ draftTouched ? draftHexInput ?? draft : text('chooseColorFirst') }}</p
          >
          <div class="a9-text-palette__actions">
            <a-button
              size="small"
              :disabled="disabled || current[palette.key].value === 'unavailable'"
              @click="applyColor(palette.key, true)"
            >
              {{ text(palette.key === 'color' ? 'restoreTextColor' : 'removeHighlight') }}
            </a-button>
            <a-button size="small" @click="close(true)">{{ text('cancel') }}</a-button>
            <a-button
              size="small"
              type="primary"
              :disabled="
                disabled ||
                current[palette.key].value === 'unavailable' ||
                !draftTouched ||
                draftInputInvalid ||
                !candidateColor
              "
              @click="applyColor(palette.key)"
            >
              {{ text('apply') }}
            </a-button>
          </div>
        </div>
      </template>
    </a-popover>
  </template>
  <a-dropdown
    v-if="shown('size')"
    :popup-visible="overlay === 'size'"
    trigger="click"
    @popup-visible-change="open('size', $event)"
    @select="applySize"
  >
    <ToolbarTooltip :content="`${text('fontSize')}：${stateLabel('fontSize', current.fontSize.value)}`">
      <a-button
        :ref="(element: unknown) => registerTrigger('size', element)"
        class="a9-text-format-size"
        size="small"
        type="text"
        :disabled="disabled"
        :aria-label="text('fontSize')"
        :aria-description="stateLabel('fontSize', current.fontSize.value)"
        :aria-expanded="overlay === 'size'"
        @mousedown.prevent
        @click.stop="open('size', overlay !== 'size')"
        @keydown.down.prevent="open('size', true)"
        @keydown.esc.stop.prevent="close(true)"
      >
        {{
          current.fontSize.value === 'unavailable'
            ? text('fontSize')
            : current.fontSize.value
            ? stateLabel('fontSize', current.fontSize.value)
            : text('formatDefault')
        }}<IconDown class="a9-text-format-arrow" />
      </a-button>
    </ToolbarTooltip>
    <template #content>
      <div
        :ref="(element: unknown) => registerPanel('size', element)"
        :style="panelStyle"
        tabindex="-1"
        @keydown="navigateSize"
        @keydown.esc.stop.prevent="close(true)"
      >
        <p v-if="current.fontSize.partial" class="a9-text-format-hint">{{
          text(current.fontSize.hasEmpty ? 'existingTextOnly' : 'partialTextFormat')
        }}</p>
        <a-doption
          v-for="size in ['default', ...fontSizes]"
          :key="size"
          :value="size"
          role="menuitemradio"
          :aria-checked="current.fontSize.value === (size === 'default' ? '' : size)"
          :aria-disabled="disabled || current.fontSize.value === 'unavailable'"
          :tabindex="disabled || current.fontSize.value === 'unavailable' ? -1 : 0"
          :disabled="disabled || current.fontSize.value === 'unavailable'"
          @keydown.enter.stop.prevent="applySize(size)"
          @keydown.space.stop.prevent="applySize(size)"
        >
          {{ size === 'default' ? text('inheritFontSize') : size }}
        </a-doption>
      </div>
    </template>
  </a-dropdown>
  <template v-if="shown('spacing') && spacingControls.length">
    <TextSpacingOptions v-if="embedded" v-bind="spacingProps" @select="applySpacing" />
    <a-popover
      v-else
      :popup-visible="overlay === 'spacing'"
      trigger="click"
      position="bottom"
      @popup-visible-change="open('spacing', $event)"
    >
      <a-button
        :ref="(element: unknown) => registerTrigger('spacing', element)"
        size="small"
        type="text"
        :disabled="disabled"
        :aria-label="text('typography')"
        :aria-expanded="overlay === 'spacing'"
        @mousedown.prevent
        @keydown.down.prevent="open('spacing', true)"
        @keydown.esc.stop.prevent="close(true)"
      >
        {{ text('typography') }}<IconDown class="a9-text-format-arrow" />
      </a-button>
      <template #content>
        <div
          :ref="(element: unknown) => registerPanel('spacing', element)"
          :style="panelStyle"
          tabindex="-1"
          @keydown.esc.stop.prevent="close(true)"
          ><TextSpacingOptions v-bind="spacingProps" @select="applySpacing"
        /></div>
      </template>
    </a-popover>
  </template>
</template>

<style scoped lang="less">
  .a9-text-format-arrow {
    margin-left: 4px;
    font-size: 10px;
  }

  .a9-text-color-icon {
    display: inline-flex;
    flex-direction: column;
    gap: 2px;
    align-items: center;
    color: var(--color-text-2);
    vertical-align: middle;
  }

  .a9-text-color-swatch {
    box-sizing: border-box;
    width: 16px;
    height: 4px;
    border: 1px solid var(--color-border-3);
    border-radius: 1px;
  }

  .a9-text-format-state {
    margin-left: 4px;
    font-size: 12px;
  }

  .a9-text-palette :deep(.arco-color-picker-block) {
    box-shadow: inset 0 0 0 1px var(--color-border-2);
  }

  .a9-text-format-summary {
    margin: 0 0 8px;
    color: var(--color-text-1);
    font-size: 13px;
  }

  .a9-text-format-hint {
    max-width: 280px;
    margin: 6px 0;
    color: var(--color-text-3);
    font-size: 12px;
  }

  .a9-text-palette__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 10px;
  }
</style>
