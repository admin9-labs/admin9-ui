<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { IconCheck, IconDown, IconFontColors, IconHighlight, IconLineHeight } from '@arco-design/web-vue/es/icon';
  import type { Editor } from '@tiptap/core';
  import { CellSelection } from '@tiptap/pm/tables';
  import type { Mark, Node as ProseMirrorNode } from '@tiptap/pm/model';
  import type { Selection, SelectionBookmark, Transaction } from '@tiptap/pm/state';
  import { useI18n } from 'vue-i18n';
  import { fontSizes, highlightColors, letterSpacings, normalizeTextColor, textColors } from './text-format';

  const props = withDefaults(
    defineProps<{ editor?: Editor; disabled: boolean; showHighlight?: boolean; section?: 'text' | 'paragraph' }>(),
    { showHighlight: true }
  );
  const { t } = useI18n();
  const text = (key: string) => t(`admin9Ui.tiptapEditor.${key}`);
  type MenuKey = 'fontSize' | 'firstLineIndent' | 'lineHeight' | 'letterSpacing' | 'color' | 'highlight';
  type FormatValue = string | null | undefined;
  const revision = ref(0);
  const opened = ref<MenuKey>();
  const panels = new Map<MenuKey, HTMLElement>();
  const triggers = new Map<MenuKey, HTMLElement>();
  let bookmark: SelectionBookmark | undefined;
  let storedMarks: readonly Mark[] | null | undefined;
  const close = (restoreFocus = false) => {
    const key = opened.value;
    opened.value = undefined;
    bookmark = undefined;
    storedMarks = undefined;
    if (restoreFocus && key) triggers.get(key)?.focus();
  };
  const resolveBookmark = (doc: ProseMirrorNode) => {
    try {
      return bookmark?.resolve(doc);
    } catch {
      return undefined;
    }
  };
  const changed = ({ transaction }: { transaction: Transaction }) => {
    revision.value += 1;
    if (transaction.getMeta('a9ReplaceDocument')) {
      close();
      return;
    }
    if (!bookmark || !transaction.docChanged) return;
    const original = resolveBookmark(transaction.before);
    if (!original) {
      close();
      return;
    }
    const lostTarget = original.ranges.some(({ $from, $to }) => {
      const from = transaction.mapping.mapResult($from.pos, 1);
      const to = transaction.mapping.mapResult($to.pos, -1);
      if ($from.pos === $to.pos) return from.deleted;
      return (
        from.deletedAcross ||
        to.deletedAcross ||
        (from.deletedAfter &&
          to.deletedBefore &&
          transaction.mapping.mapResult(Math.floor(($from.pos + $to.pos) / 2)).deleted) ||
        from.pos >= to.pos
      );
    });
    if (lostTarget) {
      close();
      return;
    }
    bookmark = bookmark.map(transaction.mapping);
    const mapped = resolveBookmark(transaction.doc);
    // A deleted cell bookmark may silently resolve to an unrelated text cursor.
    if (!mapped || mapped.constructor !== original.constructor || (!original.empty && mapped.empty)) close();
  };
  watch(
    () => props.editor,
    (editor, previous) => {
      previous?.off('transaction', changed);
      editor?.on('transaction', changed);
      close();
      revision.value += 1;
    },
    { immediate: true }
  );
  onBeforeUnmount(() => {
    props.editor?.off('transaction', changed);
    close();
  });
  const forEachBlock = (
    take: (node: ProseMirrorNode, pos: number) => void,
    state: { doc: ProseMirrorNode; selection: Selection } | undefined = props.editor?.state
  ) => {
    if (!state) return;
    const { selection, doc } = state;
    if (selection.empty) {
      if (selection.$from.depth) take(selection.$from.parent, selection.$from.before());
      return;
    }
    selection.ranges.forEach(({ $from, $to }) => {
      doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
        if (node.isTextblock && (selection instanceof CellSelection || pos + 1 < $to.pos)) take(node, pos);
      });
    });
  };
  const summarize = (values: Set<string | null>): FormatValue => {
    if (values.size > 1) return 'mixed';
    return values.size ? [...values][0] : undefined;
  };
  const read = (mark: string, attribute: string): FormatValue => {
    const { editor } = props;
    const type = editor?.schema.marks[mark];
    if (!editor || !type) return undefined;
    const { ranges, empty, $from } = editor.state.selection;
    const values = new Set<string | null>();
    const take = (marks: readonly Mark[]) => values.add(marks.find((item) => item.type === type)?.attrs[attribute] ?? null);
    if (empty && $from.parent.type.allowsMarkType(type)) take(editor.state.storedMarks ?? $from.marks());
    else if (!empty) {
      ranges.forEach(({ $from: start, $to: end }) => {
        editor.state.doc.nodesBetween(start.pos, end.pos, (node, _pos, parent) => {
          if (node.isText && parent?.type.allowsMarkType(type)) take(node.marks);
        });
      });
      if (!values.size)
        forEachBlock((node) => {
          if (node.type.allowsMarkType(type)) take([]);
        });
    }
    return summarize(values);
  };
  const blockValue = (attribute: string): FormatValue => {
    const values = new Set<string | null>();
    forEachBlock((node) => {
      if (attribute in node.attrs) values.add(node.attrs[attribute] ?? null);
    });
    return summarize(values);
  };
  const current = computed(() => ({
    revision: revision.value,
    color: read('textStyle', 'color'),
    highlight: read('highlight', 'color'),
    fontSize: read('textStyle', 'fontSize'),
    firstLineIndent: blockValue('firstLineIndent'),
    lineHeight: blockValue('lineHeight'),
    letterSpacing: read('textStyle', 'letterSpacing'),
  }));
  const status = (value: FormatValue) => {
    if (value === undefined) return text('formatNotApplicable');
    if (value === null) return text('formatDefault');
    return value === 'mixed' ? text('mixedFormat') : value;
  };
  const formatEnabled = computed(() => props.editor?.extensionManager.extensions.some((item) => item.name === 'a9TextFormat'));
  const menus = computed(() => {
    const defaults = { value: 'default', label: text('formatDefault') };
    const all = [
      {
        key: 'fontSize' as const,
        section: 'text',
        label: text('fontSize'),
        options: [defaults, ...fontSizes.map((value) => ({ value, label: value }))],
      },
      {
        key: 'letterSpacing' as const,
        section: 'text',
        label: text('textLayout'),
        options: [
          defaults,
          ...letterSpacings.map((value) => ({ value, label: value === '0px' ? text('letterSpacingStandard') : value })),
        ],
      },
      {
        key: 'firstLineIndent' as const,
        section: 'paragraph',
        label: text('firstLineIndent'),
        options: [defaults, { value: '0em', label: text('indentNone') }, { value: '2em', label: text('indentTwoCharacters') }],
      },
      {
        key: 'lineHeight' as const,
        section: 'paragraph',
        label: text('lineHeight'),
        options: [
          defaults,
          { value: '1', label: text('lineHeightSingle') },
          { value: '1.5', label: text('lineHeightOneAndHalf') },
          { value: '2', label: text('lineHeightDouble') },
        ],
      },
    ];
    return all.filter(
      (menu) => (!props.section || props.section === menu.section) && (menu.key === 'fontSize' || formatEnabled.value)
    );
  });
  const selected = (key: MenuKey, value: string) =>
    current.value[key] !== undefined && (value === 'default' ? current.value[key] === null : current.value[key] === value);
  const menuStatus = (menu: (typeof menus.value)[number]) =>
    menu.options.find((option) => selected(menu.key, option.value))?.label ?? status(current.value[menu.key]);
  const unavailable = (key: MenuKey) => props.disabled || !props.editor || current.value[key] === undefined;
  const setPanel = (key: MenuKey, element: unknown) => {
    if (element instanceof HTMLElement) panels.set(key, element);
    else panels.delete(key);
  };
  const setTrigger = (key: MenuKey, element: unknown) => {
    const button = (element as { $el?: HTMLElement } | null)?.$el;
    if (button instanceof HTMLElement) triggers.set(key, button);
    else triggers.delete(key);
  };
  const setVisible = async (key: MenuKey, visible: boolean) => {
    if (!visible) {
      if (opened.value === key) close();
      return;
    }
    if (unavailable(key)) return;
    bookmark = props.editor?.state.selection.getBookmark();
    storedMarks = props.editor?.state.storedMarks;
    opened.value = key;
    await nextTick();
    if (opened.value !== key) return;
    const panel = panels.get(key);
    const option =
      panel?.querySelector<HTMLElement>('[aria-checked="true"]') ?? panel?.querySelector<HTMLElement>('[role="menuitemradio"]');
    option?.focus();
  };
  const triggerKeydown = (event: KeyboardEvent, key: MenuKey) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    setVisible(key, true);
  };
  const menuKeydown = (event: KeyboardEvent) => {
    const panel = event.currentTarget as HTMLElement;
    const options = Array.from(panel.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled)'));
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') close(true);
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const index = options.indexOf(document.activeElement as HTMLButtonElement);
      let next = (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = options.length - 1;
      options[next]?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      (document.activeElement as HTMLButtonElement)?.click();
    }
  };
  const apply = (key: MenuKey, value: string) => {
    const { editor } = props;
    if (!editor || opened.value !== key || !bookmark || unavailable(key)) return;
    const target = resolveBookmark(editor.state.doc);
    if (!target) {
      close();
      return;
    }
    const menu = menus.value.find((item) => item.key === key);
    const palette = key === 'color' ? textColors : highlightColors;
    if (menu ? !menu.options.some((option) => option.value === value) : value !== 'default' && !palette.includes(value)) return;
    const attr = value === 'default' ? null : value;
    const chain = editor
      .chain()
      .command(({ tr }) => {
        tr.setSelection(target);
        if (tr.selection.empty && storedMarks) tr.ensureMarks(storedMarks);
        return true;
      })
      .focus();
    if (key === 'highlight') {
      if (attr) chain.setHighlight({ color: attr });
      else chain.unsetHighlight();
    } else if (key === 'firstLineIndent' || key === 'lineHeight') {
      chain.command(({ tr }) => {
        forEachBlock((node, pos) => {
          if (key in node.attrs) tr.setNodeMarkup(pos, undefined, { ...node.attrs, [key]: attr });
        }, tr);
        return true;
      });
    } else {
      chain.setMark('textStyle', { [key]: key === 'color' && attr ? normalizeTextColor(attr) : attr }).command(({ tr }) => {
        const type = tr.doc.type.schema.marks.textStyle;
        if (tr.selection.empty) {
          const mark = tr.storedMarks?.find((item) => item.type === type);
          if (mark && Object.values(mark.attrs).every((attribute) => attribute == null)) tr.removeStoredMark(type);
        } else
          tr.selection.ranges.forEach(({ $from, $to }) => {
            tr.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
              if (!node.isText) return;
              const mark = node.marks.find((item) => item.type === type);
              if (mark && Object.values(mark.attrs).every((attribute) => attribute == null))
                tr.removeMark(Math.max(pos, $from.pos), Math.min(pos + node.nodeSize, $to.pos), type);
            });
          });
        return true;
      });
    }
    chain.run();
    close();
  };
  const palettes = computed(() =>
    props.section === 'paragraph'
      ? []
      : [
          { key: 'color' as const, label: text('textColor'), colors: textColors },
          { key: 'highlight' as const, label: text('highlight'), colors: highlightColors },
        ].filter((palette) => palette.key !== 'highlight' || props.showHighlight)
  );
</script>

<template>
  <a-popover
    v-for="palette in palettes"
    :key="palette.key"
    :popup-visible="opened === palette.key"
    trigger="click"
    position="bottom"
    :disabled="unavailable(palette.key)"
    @popup-visible-change="setVisible(palette.key, $event)"
  >
    <a-tooltip :content="`${palette.label}: ${status(current[palette.key])}`">
      <a-button
        :ref="(element) => setTrigger(palette.key, element)"
        size="small"
        type="text"
        :disabled="unavailable(palette.key)"
        :aria-label="palette.label"
        :aria-expanded="opened === palette.key"
        aria-haspopup="menu"
        :data-format-control="palette.key"
        @mousedown.prevent
        @keydown="triggerKeydown($event, palette.key)"
      >
        <template #icon>
          <span
            class="a9-text-format-color"
            :style="{ '--a9-format-color': normalizeTextColor(current[palette.key]) ?? 'currentColor' }"
          >
            <IconFontColors v-if="palette.key === 'color'" /><IconHighlight v-else />
          </span>
        </template>
      </a-button>
    </a-tooltip>
    <template #content>
      <div
        :ref="(element) => setPanel(palette.key, element)"
        class="a9-text-palette"
        role="menu"
        :aria-label="palette.label"
        @mousedown.prevent
        @keydown="menuKeydown"
      >
        <span class="a9-text-format-menu__heading">{{ palette.label }} · {{ status(current[palette.key]) }}</span>
        <button
          type="button"
          role="menuitemradio"
          tabindex="-1"
          :aria-checked="selected(palette.key, 'default')"
          @click="apply(palette.key, 'default')"
        >
          {{ text('formatDefault') }}<IconCheck v-if="selected(palette.key, 'default')" />
        </button>
        <div class="a9-text-palette__colors">
          <button
            v-for="color in palette.colors"
            :key="color"
            type="button"
            role="menuitemradio"
            tabindex="-1"
            :style="{ backgroundColor: color }"
            :aria-label="`${palette.label} ${color}`"
            :aria-checked="normalizeTextColor(current[palette.key]) === normalizeTextColor(color)"
            @click="apply(palette.key, color)"
          >
            <IconCheck
              v-if="normalizeTextColor(current[palette.key]) === normalizeTextColor(color)"
              class="a9-text-palette__check"
            />
          </button>
        </div>
      </div>
    </template>
  </a-popover>
  <a-popover
    v-for="menu in menus"
    :key="menu.key"
    :popup-visible="opened === menu.key"
    trigger="click"
    position="bottom"
    :disabled="unavailable(menu.key)"
    @popup-visible-change="setVisible(menu.key, $event)"
  >
    <a-tooltip
      :content="
        menu.key === 'firstLineIndent' && current.firstLineIndent === undefined
          ? text('indentParagraphOnly')
          : `${text(menu.key)}: ${menuStatus(menu)}`
      "
    >
      <span class="a9-text-format-trigger">
        <a-button
          :ref="(element) => setTrigger(menu.key, element)"
          size="small"
          type="text"
          :class="{
            'a9-text-format-size': menu.key === 'fontSize',
            'a9-text-format-spacing': menu.key === 'firstLineIndent' || menu.key === 'letterSpacing',
            'a9-text-format-line-height': menu.key === 'lineHeight',
          }"
          :disabled="unavailable(menu.key)"
          :aria-label="menu.label"
          :aria-description="
            menu.key === 'firstLineIndent' && current.firstLineIndent === undefined ? text('indentParagraphOnly') : undefined
          "
          :aria-expanded="opened === menu.key"
          aria-haspopup="menu"
          :data-format-control="menu.key"
          @mousedown.prevent
          @keydown="triggerKeydown($event, menu.key)"
        >
          <IconLineHeight v-if="menu.key === 'lineHeight'" />
          <template v-else-if="menu.key === 'fontSize'">{{
            current.fontSize === null ? text('fontSize') : status(current.fontSize)
          }}</template>
          <template v-else>{{ menu.label }}</template>
          <IconDown />
        </a-button>
      </span>
    </a-tooltip>
    <template #content>
      <div
        :ref="(element) => setPanel(menu.key, element)"
        class="a9-text-format-menu"
        role="menu"
        :aria-label="menu.label"
        @mousedown.prevent
        @keydown="menuKeydown"
      >
        <span class="a9-text-format-menu__heading">{{ text(menu.key) }} · {{ menuStatus(menu) }}</span>
        <button
          v-for="option in menu.options"
          :key="option.value"
          type="button"
          role="menuitemradio"
          tabindex="-1"
          :aria-checked="selected(menu.key, option.value)"
          :data-format-option="`${menu.key}:${option.value}`"
          @click="apply(menu.key, option.value)"
        >
          <span>{{ option.label }}</span
          ><IconCheck v-if="selected(menu.key, option.value)" />
        </button>
      </div>
    </template>
  </a-popover>
</template>

<style scoped lang="less">
  .a9-text-format-trigger {
    display: inline-flex;
  }

  .a9-text-format-color {
    display: inline-flex;
    padding-bottom: 2px;
    border-bottom: 3px solid var(--a9-format-color);
  }

  .a9-text-format-menu,
  .a9-text-palette {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 160px;
    max-width: 240px;

    > button {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      color: var(--color-text-1);
      font: inherit;
      text-align: left;
      background: transparent;
      border: 0;
      border-radius: 2px;
      cursor: pointer;

      &:hover {
        background: var(--color-fill-2);
      }

      &:focus-visible {
        outline: 2px solid rgb(var(--primary-6));
        outline-offset: -2px;
      }

      &[aria-checked='true'] {
        color: rgb(var(--primary-6));
        background: var(--color-fill-2);
      }
    }
  }

  .a9-text-format-menu__heading {
    padding: 4px 8px;
    color: var(--color-text-3);
    font-size: 12px;
  }

  .a9-text-palette .a9-text-palette__colors {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px 8px;

    button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 1px solid var(--color-border-3);
      border-radius: 2px;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid rgb(var(--primary-6));
        outline-offset: 2px;
      }
    }
  }

  .a9-text-palette__check {
    color: #000;
    background: #fff;
    border-radius: 2px;
  }
</style>
