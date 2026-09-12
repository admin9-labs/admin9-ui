<script setup lang="ts" generic="F extends TiptapValueFormat = 'html'">
  import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, toRef, toRefs, watch, type Ref } from 'vue';
  import { FormItem, Message, useFormItem } from '@arco-design/web-vue';
  import { Extension, isNodeEmpty, type Editor } from '@tiptap/core';
  import CharacterCount from '@tiptap/extension-character-count';
  import Placeholder from '@tiptap/extension-placeholder';
  import { Table, TableKit } from '@tiptap/extension-table';
  import TextAlign from '@tiptap/extension-text-align';
  import StarterKit from '@tiptap/starter-kit';
  import { GapCursor } from '@tiptap/pm/gapcursor';
  import { DOMSerializer, Fragment } from '@tiptap/pm/model';
  import { NodeSelection, Plugin, PluginKey, Selection, TextSelection, type Transaction } from '@tiptap/pm/state';
  import { columnResizing, tableEditing } from '@tiptap/pm/tables';
  import { EditorContent, useEditor } from '@tiptap/vue-3';
  import { useI18n } from 'vue-i18n';
  import admin9UIOptionsKey from '../../internal/options';
  import type { FileItem, FilePickerAdapter, FileType } from '../../services/types';
  import AFilePicker from '../file-picker/index.vue';
  import MediaBubbleMenu from './media-bubble-menu.vue';
  import { getDocumentSnapshot, getPublicDocument, parseTiptapDocument } from './content';
  import { createImageUploads } from './image-upload';
  import { cleanPastedHTML, parseTableText, tableTextContent } from './paste';
  import { SafeColor, SafeFontSize, SafeHighlight, TextStyle } from './text-format';
  import TextFormatToolbar from './text-format-toolbar.vue';
  import { Audio, BlockImage, InlineImage, isSafeMediaUrl, type TiptapMediaNodeName, Video } from './media-node';
  import type {
    ATiptapEditorExposed,
    TiptapContentError,
    TiptapDocument,
    TiptapEditorValue,
    TiptapValueFormat,
    TiptapImageDisplay,
    TiptapAudioWidth,
    TiptapBlockWidth,
    TiptapInlineImageSize,
    TiptapMediaAlign,
    TiptapMediaError,
    TiptapMediaOperation,
    TiptapImageUploadState,
    TiptapImageUploadError,
    TiptapPasteWarning,
  } from './types';

  defineOptions({ name: 'ATiptapEditor' });

  const props = withDefaults(
    defineProps<{
      valueFormat?: F;
      modelValue?: TiptapEditorValue<F>;
      placeholder?: string;
      disabled?: boolean;
      readonly?: boolean;
      minHeight?: number | string;
      maxHeight?: number | string;
      maxLength?: number;
      showWordCount?: boolean;
      service?: FilePickerAdapter;
      canUploadImage?: boolean;
      canUploadVideo?: boolean;
      canUploadAudio?: boolean;
      canUploadAttachment?: boolean;
      defaultImageDisplay?: TiptapImageDisplay;
    }>(),
    {
      placeholder: '',
      disabled: false,
      readonly: false,
      minHeight: 240,
      maxHeight: 'min(640px, 60dvh)',
      maxLength: 0,
      showWordCount: true,
      service: undefined,
      canUploadImage: false,
      canUploadVideo: false,
      canUploadAudio: false,
      canUploadAttachment: false,
      defaultImageDisplay: 'block',
    }
  );

  const emit = defineEmits<{
    (e: 'update:modelValue', value: TiptapEditorValue<F>): void;
    (e: 'change', value: TiptapEditorValue<F>): void;
    (e: 'focus'): void;
    (e: 'blur'): void;
    (e: 'mediaError', error: TiptapMediaError): void;
    (e: 'contentError', error: TiptapContentError): void;
    (e: 'imageUploadStateChange', state: TiptapImageUploadState): void;
    (e: 'imageUploadError', error: TiptapImageUploadError): void;
    (e: 'pasteWarning', warning: TiptapPasteWarning): void;
  }>();

  const valueFormat = props.valueFormat ?? 'html';
  const { readonly, canUploadImage, canUploadVideo, canUploadAudio, showWordCount, maxLength } = toRefs(props);
  const readContent = (currentEditor: Editor, value: unknown, phase: TiptapContentError['phase']) => {
    if (value === undefined) {
      return valueFormat === 'json' ? parseTiptapDocument({ type: 'doc', content: [] }, currentEditor) : '';
    }
    if ((valueFormat === 'html' && typeof value !== 'string') || (valueFormat === 'json' && typeof value === 'string')) {
      emit('contentError', { phase, reason: 'format-mismatch' });
      return null;
    }
    if (valueFormat === 'html') return value as string;
    try {
      return parseTiptapDocument(value, currentEditor);
    } catch (cause) {
      emit('contentError', { phase, reason: 'invalid-document', cause });
      return null;
    }
  };

  const { t } = useI18n();
  const globalOptions = inject(admin9UIOptionsKey, undefined);
  const resolvedFileService = computed(() => props.service ?? globalOptions?.fileService);
  const { mergedDisabled, mergedError, eventHandlers } = useFormItem({ disabled: toRef(props, 'disabled') });
  const interactionDisabled = computed(() => Boolean(mergedDisabled.value));
  const isEditable = computed(() => !interactionDisabled.value && !props.readonly);
  const editorAttributes = computed(() => ({
    'class': 'a9-tiptap-editor__prose',
    'role': 'textbox',
    'aria-multiline': 'true',
    'aria-label': props.placeholder || t('admin9Ui.tiptapEditor.ariaLabel'),
    'aria-disabled': String(interactionDisabled.value),
    'aria-readonly': String(props.readonly),
    'aria-invalid': String(Boolean(mergedError.value)),
  }));
  const linkPopupVisible = ref(false);
  const tablePopupVisible = ref(false);
  const tableRows = ref(1);
  const tableColumns = ref(1);
  const tableTriggerRef = ref<{ $el: HTMLButtonElement }>();
  const tablePickerRef = ref<HTMLElement>();
  const tableSizeLabel = computed(() =>
    t('admin9Ui.tiptapEditor.tableSize', { rows: tableRows.value, columns: tableColumns.value })
  );
  const altPopupVisible = ref(false);
  const imagePickerTooltipVisible = ref(false);
  const videoPickerTooltipVisible = ref(false);
  const audioPickerTooltipVisible = ref(false);
  const replacePickerTooltipVisible = ref(false);
  const linkHref = ref('');
  const linkText = ref('');
  const initialLinkText = ref('');
  const initialLinkSelectionEmpty = ref(true);
  const tableTextVisible = ref(false);
  const tableText = ref('');
  const tableTextRows = computed(() => parseTableText(tableText.value));
  const attachmentValue = ref<FileItem[]>();
  const contentRef = ref<HTMLElement>();
  const mediaToolbarRef = ref<HTMLElement>();
  const bubbleMenuReady = ref(false);
  const isFocused = ref(false);
  const mediaPickerVisible = ref(false);
  const imagePickerValue = ref<FileItem>();
  const videoPickerValue = ref<FileItem>();
  const audioPickerValue = ref<FileItem>();
  const replacementPickerValue = ref<FileItem>();
  const selectedMedia = ref<{
    pos: number;
    type: TiptapMediaNodeName;
    attrs: Record<string, unknown>;
  }>();
  const altDraft = ref('');
  type TiptapBlockPresetWidth = Exclude<TiptapBlockWidth, 'natural'>;
  const blockWidths: TiptapBlockPresetWidth[] = ['25%', '50%', '75%', '100%'];
  const audioWidths: TiptapAudioWidth[] = ['compact', 'standard', 'full'];
  const inlineSizes: TiptapInlineImageSize[] = ['1em', '1.25em', '1.5em', '2em'];
  const mediaAlignments: TiptapMediaAlign[] = ['left', 'center', 'right'];
  const blockMediaNodeNames: TiptapMediaNodeName[] = ['blockImage', 'video', 'audio'];
  const mediaNodeNames: TiptapMediaNodeName[] = ['blockImage', 'inlineImage', 'video', 'audio'];
  const blockWidthLocaleKeys: Record<TiptapBlockPresetWidth, string> = {
    '25%': 'sizeSmall',
    '50%': 'sizeMedium',
    '75%': 'sizeLarge',
    '100%': 'sizeFill',
  };
  const audioWidthLocaleKeys: Record<TiptapAudioWidth, string> = {
    compact: 'audioCompact',
    standard: 'audioStandard',
    full: 'audioFull',
  };
  const inlineSizeLocaleKeys: Record<TiptapInlineImageSize, string> = {
    '1em': 'inlineSizeSmall',
    '1.25em': 'inlineSizeStandard',
    '1.5em': 'inlineSizeLarge',
    '2em': 'inlineSizeExtraLarge',
  };
  const appendMediaBubbleToBody = () => document.body;
  const DynamicCharacterLimit = Extension.create({
    name: 'a9DynamicCharacterLimit',
    addProseMirrorPlugins() {
      let initialEvaluationDone = false;
      const characters = (node: typeof this.editor.state.doc) => this.editor.storage.characterCount.characters({ node });

      return [
        new Plugin({
          key: new PluginKey('a9DynamicCharacterLimit'),
          appendTransaction: (_transactions, _oldState, newState) => {
            if (initialEvaluationDone) return undefined;
            initialEvaluationDone = true;
            const limit = props.maxLength;
            if (limit <= 0) return undefined;
            const initialSize = characters(newState.doc);
            if (initialSize <= limit) return undefined;
            return newState.tr.deleteRange(0, initialSize - limit);
          },
          filterTransaction: (transaction, state) => {
            const limit = props.maxLength;
            if (!transaction.docChanged || limit <= 0) return true;

            const oldSize = characters(state.doc);
            const newSize = characters(transaction.doc);
            if (newSize <= limit) return true;
            if (oldSize > limit && newSize <= oldSize) return true;
            if (!transaction.getMeta('paste')) return false;

            const over = newSize - limit;
            const to = transaction.selection.$head.pos;
            transaction.deleteRange(to - over, to);
            return characters(transaction.doc) <= limit;
          },
        }),
      ];
    },
  });
  const RemoveLeadingEmptyParagraphBeforeMedia = Extension.create({
    name: 'a9RemoveLeadingEmptyParagraphBeforeMedia',
    priority: 1000,
    addKeyboardShortcuts() {
      return {
        Backspace: () => {
          const { state, view } = this.editor;
          const { doc, selection } = state;
          if (!(selection instanceof TextSelection) || !selection.empty) return false;

          const { $from } = selection;
          if (
            $from.depth !== 1 ||
            $from.before() !== 0 ||
            $from.parent.type.name !== 'paragraph' ||
            $from.parent.content.size !== 0 ||
            doc.childCount < 2
          ) {
            return false;
          }

          const nextNode = doc.child(1);
          if (!blockMediaNodeNames.includes(nextNode.type.name as TiptapMediaNodeName)) return false;

          const transaction = state.tr.delete(0, $from.parent.nodeSize);
          const $gap = transaction.doc.resolve(0);
          view.dispatch(transaction.setSelection(new GapCursor($gap)).scrollIntoView());
          return true;
        },
      };
    },
  });

  function syncSelectedMedia(currentEditor: Editor) {
    const { selection } = currentEditor.state;
    if (!(selection instanceof NodeSelection) || !mediaNodeNames.includes(selection.node.type.name as TiptapMediaNodeName)) {
      selectedMedia.value = undefined;
      return;
    }
    selectedMedia.value = {
      pos: selection.from,
      type: selection.node.type.name as TiptapMediaNodeName,
      attrs: { ...selection.node.attrs },
    };
  }

  function clearNodeSelection(currentEditor: Editor) {
    const { doc, selection } = currentEditor.state;
    if (!(selection instanceof NodeSelection)) return;

    let textPosition: number | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    doc.descendants((node, pos) => {
      if (!node.isTextblock) return;
      const candidate = pos + 1;
      const distance = Math.abs(candidate - selection.from);
      if (distance < nearestDistance) {
        textPosition = candidate;
        nearestDistance = distance;
      }
    });

    const nextSelection =
      textPosition === undefined
        ? new GapCursor(doc.resolve(Math.min(selection.to, doc.content.size)))
        : TextSelection.create(doc, textPosition);
    currentEditor.view.dispatch(currentEditor.state.tr.setSelection(nextSelection));
  }

  // Keep resizing registered across readonly/disabled transitions. Its handlers
  // already guard view.editable before changing the document.
  const DynamicEditableTable = Table.extend({
    addProseMirrorPlugins() {
      return [
        columnResizing({
          handleWidth: this.options.handleWidth,
          cellMinWidth: this.options.cellMinWidth,
          defaultCellMinWidth: this.options.cellMinWidth,
          View: this.options.View,
          lastColumnResizable: this.options.lastColumnResizable,
        }),
        tableEditing({ allowTableNodeSelection: this.options.allowTableNodeSelection }),
      ];
    },
    addNodeView() {
      return null;
    },
  });

  let uploadEditor: Editor | undefined;
  const uploads = createImageUploads({
    editor: () => uploadEditor,
    service: () => resolvedFileService.value,
    enabled: () => isEditable.value && props.canUploadImage && typeof resolvedFileService.value?.upload === 'function',
    display: () => props.defaultImageDisplay,
    t: (key) => t(`admin9Ui.tiptapEditor.${key}`),
    state: (state) => emit('imageUploadStateChange', state),
    error: (error) => {
      emit('imageUploadError', error);
      Message.error(t(`admin9Ui.tiptapEditor.${error.reason === 'upload-unavailable' ? 'uploadUnavailable' : 'uploadFailed'}`));
    },
  });
  const publicHTML = (currentEditor: Editor) => {
    const doc = getPublicDocument(currentEditor.state.doc);
    if (isNodeEmpty(doc)) return '';
    const container = document.createElement('div');
    container.append(DOMSerializer.fromSchema(currentEditor.schema).serializeFragment(doc.content));
    return container.innerHTML;
  };
  const editor = useEditor({
    content: '',
    onBeforeCreate: ({ editor: currentEditor }) => {
      uploadEditor = currentEditor;
      const content = readContent(currentEditor, props.modelValue, 'initial');
      currentEditor.options.content = typeof content === 'string' ? content : content?.toJSON() ?? '';
    },
    editable: isEditable.value,
    extensions: [
      uploads.extension,
      uploads.inlineExtension,
      TextStyle,
      SafeColor,
      SafeFontSize,
      SafeHighlight,
      StarterKit.configure({
        trailingNode: false,
        link: {
          openOnClick: false,
          HTMLAttributes: {
            rel: 'noopener noreferrer nofollow',
            target: '_blank',
          },
        },
      }),
      BlockImage.configure({ getDefaultDisplay: () => props.defaultImageDisplay }),
      InlineImage.configure({ getDefaultDisplay: () => props.defaultImageDisplay }),
      Video.configure({
        getPlaybackTabIndex: () => (props.readonly && !interactionDisabled.value ? undefined : -1),
      }),
      Audio.configure({
        getPlaybackTabIndex: () => (props.readonly && !interactionDisabled.value ? undefined : -1),
      }),
      Placeholder.configure({
        placeholder: () => props.placeholder || t('admin9Ui.tiptapEditor.placeholder'),
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right'],
      }),
      TableKit.configure({ table: false }),
      DynamicEditableTable.configure({ cellMinWidth: 120, resizable: true }),
      CharacterCount,
      DynamicCharacterLimit,
      RemoveLeadingEmptyParagraphBeforeMedia,
    ],
    editorProps: {
      transformPastedHTML: (html) => {
        const result = cleanPastedHTML(html);
        if (result.skippedImages) {
          emit('pasteWarning', { reason: 'unsupported-image', count: result.skippedImages });
          Message.warning(t('admin9Ui.tiptapEditor.pasteImagesSkipped', { count: result.skippedImages }));
        }
        return result.html;
      },
      handleClick: (view, pos, event) => {
        const link = (event.target as HTMLElement)?.closest('a[href]');
        if (!link || !isEditable.value) return false;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
        // Defined below the editor so toolbar actions share the same link panel.
        // eslint-disable-next-line no-use-before-define
        prepareLink();
        linkPopupVisible.value = true;
        return true;
      },
      handlePaste: (_view, event) => {
        if (!isEditable.value || event.clipboardData?.getData('text/html')) return false;
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
        return uploads.insert(files, 'paste');
      },
      handleDrop: (view, event, _slice, moved) => {
        if (!isEditable.value || moved || view.dragging) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith('image/'));
        if (!files.length) return false;
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY });
        return uploads.insert(files, 'drop', position?.pos);
      },
      attributes: () => editorAttributes.value,
    },
    onUpdate: ({ editor: currentEditor }) => {
      let content: string | TiptapDocument;
      if (valueFormat === 'json') content = getDocumentSnapshot(currentEditor.state.doc);
      else content = publicHTML(currentEditor);
      const value = content as TiptapEditorValue<F>;
      const changeValue =
        valueFormat === 'json' ? (getDocumentSnapshot(currentEditor.state.doc) as TiptapEditorValue<F>) : value;
      emit('update:modelValue', value);
      emit('change', changeValue);
      eventHandlers.value?.onInput?.();
      eventHandlers.value?.onChange?.();
    },
    onSelectionUpdate: ({ editor: currentEditor }) => syncSelectedMedia(currentEditor),
    onTransaction: ({ editor: currentEditor }) => {
      syncSelectedMedia(currentEditor);
      uploads.sync();
    },
    onFocus: () => {
      isFocused.value = true;
      emit('focus');
      eventHandlers.value?.onFocus?.();
    },
    onBlur: () => {
      isFocused.value = false;
      emit('blur');
      eventHandlers.value?.onBlur?.();
    },
  });

  const characterCount = computed(() => editor.value?.storage.characterCount.characters() ?? 0);
  const selectedMediaKind = computed(() => {
    const type = selectedMedia.value?.type;
    if (type === 'blockImage' || type === 'inlineImage') return 'image';
    return type;
  });
  const selectedMediaLabel = computed(() => {
    const type = selectedMedia.value?.type;
    if (!type) return '';
    if (type === 'video') return t('admin9Ui.tiptapEditor.selectedVideo');
    if (type === 'audio') return t('admin9Ui.tiptapEditor.selectedAudio');
    return t(`admin9Ui.tiptapEditor.${type}`);
  });
  const replaceMediaLabel = computed(() => {
    const kind = selectedMediaKind.value;
    return kind ? t(`admin9Ui.tiptapEditor.replace${kind.charAt(0).toUpperCase()}${kind.slice(1)}`) : '';
  });
  const deleteMediaLabel = computed(() => {
    const kind = selectedMediaKind.value;
    return kind ? t(`admin9Ui.tiptapEditor.delete${kind.charAt(0).toUpperCase()}${kind.slice(1)}`) : '';
  });
  const blockWidthLabel = (width: TiptapBlockPresetWidth) => t(`admin9Ui.tiptapEditor.${blockWidthLocaleKeys[width]}`);
  const audioWidthLabel = (width: TiptapAudioWidth) => t(`admin9Ui.tiptapEditor.${audioWidthLocaleKeys[width]}`);
  const inlineSizeLabel = (size: TiptapInlineImageSize) => t(`admin9Ui.tiptapEditor.${inlineSizeLocaleKeys[size]}`);
  const blockLabel = computed(() => {
    if (editor.value?.isActive('heading', { level: 1 })) return t('admin9Ui.tiptapEditor.heading1');
    if (editor.value?.isActive('heading', { level: 2 })) return t('admin9Ui.tiptapEditor.heading2');
    if (editor.value?.isActive('heading', { level: 3 })) return t('admin9Ui.tiptapEditor.heading3');
    return t('admin9Ui.tiptapEditor.paragraph');
  });
  const toCssSize = (value: number | string) => (typeof value === 'number' ? `${value}px` : value);
  const editorStyle = computed(() => ({
    '--a9-tiptap-editor-min-height': toCssSize(props.minHeight),
    '--a9-tiptap-editor-max-height': toCssSize(props.maxHeight),
  }));

  const getSelectedMediaElement = () => {
    const currentEditor = editor.value;
    const selection = selectedMedia.value;
    if (!currentEditor || currentEditor.isDestroyed || !selection) return undefined;

    const nodeDom = currentEditor.view.nodeDOM(selection.pos);
    const mediaElement = nodeDom instanceof Element ? nodeDom : nodeDom?.parentElement;
    return mediaElement instanceof HTMLElement ? mediaElement : undefined;
  };

  const getSelectedMediaVisibleRect = () => {
    const content = contentRef.value;
    const mediaElement = getSelectedMediaElement();
    if (!content || !mediaElement) return undefined;

    const contentRect = content.getBoundingClientRect();
    const mediaRect = mediaElement.getBoundingClientRect();
    const left = Math.max(contentRect.left, mediaRect.left);
    const right = Math.min(contentRect.right, mediaRect.right);
    const top = Math.max(contentRect.top, mediaRect.top);
    const bottom = Math.min(contentRect.bottom, mediaRect.bottom);
    if (right <= left || bottom <= top) return undefined;
    return new DOMRect(left, top, right - left, bottom - top);
  };

  const getMediaBubbleVirtualElement = () => {
    const content = contentRef.value;
    const mediaElement = getSelectedMediaElement();
    if (!content || !mediaElement) return null;

    const getBoundingClientRect = () => {
      const visibleRect = getSelectedMediaVisibleRect();
      if (visibleRect) return visibleRect;
      const contentRect = content.getBoundingClientRect();
      return new DOMRect(contentRect.left, contentRect.top, 0, 0);
    };

    return {
      contextElement: mediaElement,
      getBoundingClientRect,
      getClientRects: () => {
        const visibleRect = getSelectedMediaVisibleRect();
        return visibleRect ? [visibleRect] : [];
      },
    };
  };

  const updateMediaBubbleVisibility = () => {
    const bubbleElement = mediaToolbarRef.value?.parentElement;
    if (bubbleElement) {
      const pickerOpen = mediaPickerVisible.value;
      bubbleElement.style.visibility = !pickerOpen && getSelectedMediaVisibleRect() ? 'visible' : 'hidden';
      bubbleElement.style.pointerEvents = pickerOpen ? 'none' : '';
      if (pickerOpen) bubbleElement.setAttribute('aria-hidden', 'true');
      else bubbleElement.removeAttribute('aria-hidden');
      bubbleElement.inert = pickerOpen;
    }
  };

  const onMediaPickerVisibleChange = (visible: boolean) => {
    mediaPickerVisible.value = visible;
    if (visible) {
      linkPopupVisible.value = false;
      altPopupVisible.value = false;
      imagePickerTooltipVisible.value = false;
      videoPickerTooltipVisible.value = false;
      audioPickerTooltipVisible.value = false;
      replacePickerTooltipVisible.value = false;
    }
    updateMediaBubbleVisibility();
  };

  const shouldShowMediaBubble = ({ editor: currentEditor }: { editor: Editor }) => {
    const { selection } = currentEditor.state;
    return (
      currentEditor.isEditable &&
      !mediaPickerVisible.value &&
      selection instanceof NodeSelection &&
      mediaNodeNames.includes(selection.node.type.name as TiptapMediaNodeName)
    );
  };

  const mediaBubbleOptions = computed(() => {
    const boundary = contentRef.value ?? document.documentElement;
    return {
      strategy: 'fixed' as const,
      placement: 'top' as const,
      offset: 8,
      flip: { boundary, padding: 8 },
      shift: { boundary, padding: 8, crossAxis: true },
      size: {
        boundary,
        padding: 8,
        apply: ({ availableWidth, elements }: { availableWidth: number; elements: { floating: HTMLElement } }) => {
          const boundaryWidth = Math.max(0, (boundary?.getBoundingClientRect().width ?? availableWidth) - 16);
          elements.floating.style.maxWidth = `${Math.max(0, Math.min(availableWidth, boundaryWidth))}px`;
        },
      },
      scrollTarget: boundary,
      onUpdate: updateMediaBubbleVisibility,
    };
  });

  const setBlock = (value: string | number | Record<string, unknown> | undefined) => {
    if (!editor.value || !isEditable.value || typeof value !== 'string') return;
    if (value === 'paragraph') editor.value.chain().focus().setParagraph().run();
    else {
      const level = Number(value.replace('heading-', '')) as 1 | 2 | 3;
      editor.value.chain().focus().toggleHeading({ level }).run();
    }
  };

  const runTableAction = (value: string | number | Record<string, unknown> | undefined) => {
    if (!editor.value || !isEditable.value || typeof value !== 'string') return;

    const chain = editor.value.chain().focus();
    if (value === 'add-row-before') chain.addRowBefore().run();
    else if (value === 'add-row-after') chain.addRowAfter().run();
    else if (value === 'delete-row') chain.deleteRow().run();
    else if (value === 'add-column-before') chain.addColumnBefore().run();
    else if (value === 'add-column-after') chain.addColumnAfter().run();
    else if (value === 'delete-column') chain.deleteColumn().run();
    else if (value === 'toggle-header-row') chain.toggleHeaderRow().run();
    else if (value === 'delete-table') chain.deleteTable().run();
    else if (value === 'merge-cells') chain.mergeCells().run();
    else if (value === 'split-cell') chain.splitCell().run();
  };
  const insertTableText = () => {
    const currentEditor = editor.value;
    if (!currentEditor || !isEditable.value || !tableTextRows.value.length || currentEditor.isActive('table')) return false;
    const previousDocument = currentEditor.state.doc;
    const inserted = currentEditor.chain().focus().insertContent(tableTextContent(tableTextRows.value)).run();
    if (!inserted || currentEditor.state.doc.eq(previousDocument)) {
      Message.error(t('admin9Ui.tiptapEditor.tableInsertFailed'));
      return false;
    }
    tableText.value = '';
    return true;
  };
  const clearTextFormat = () => {
    if (!editor.value || !isEditable.value) return;
    const chain = editor.value.chain().focus();
    ['bold', 'italic', 'underline', 'strike', 'code', 'textStyle', 'highlight'].forEach((mark) => {
      if (editor.value?.schema.marks[mark]) chain.unsetMark(mark);
    });
    chain.run();
  };

  const previewTable = (rows: number, columns: number) => {
    tableRows.value = rows;
    tableColumns.value = columns;
  };
  const focusTablePicker = async () => {
    tablePopupVisible.value = true;
    await nextTick();
    tablePickerRef.value?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
  };
  const insertTable = (rows: number, cols: number) => {
    if (!editor.value || !isEditable.value) return;
    tablePopupVisible.value = false;
    editor.value.chain().focus().insertTable({ rows, cols, withHeaderRow: false }).run();
  };
  const onTablePickerKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      tablePopupVisible.value = false;
      tableTriggerRef.value?.$el.focus();
      return;
    }
    const offsets: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    event.stopPropagation();
    previewTable(
      Math.max(1, Math.min(8, tableRows.value + offset[0])),
      Math.max(1, Math.min(10, tableColumns.value + offset[1]))
    );
    const picker = event.currentTarget as HTMLElement;
    picker.querySelector<HTMLButtonElement>(`[data-table-size="${tableRows.value}-${tableColumns.value}"]`)?.focus();
  };
  watch(tablePopupVisible, (visible) => {
    if (visible) previewTable(1, 1);
  });

  const prepareLink = () => {
    editor.value?.commands.extendMarkRange('link');
    linkHref.value = String(editor.value?.getAttributes('link').href ?? '');
    const selection = editor.value?.state.selection;
    initialLinkSelectionEmpty.value = selection?.empty ?? true;
    linkText.value = selection ? editor.value?.state.doc.textBetween(selection.from, selection.to, ' ') ?? '' : '';
    initialLinkText.value = linkText.value;
  };
  const applyLink = () => {
    if (!editor.value || !isEditable.value) return;
    const href = linkHref.value.trim();
    const chain = editor.value.chain().focus().extendMarkRange('link');
    const extension = editor.value.extensionManager.extensions.find((item) => item.name === 'link');
    if (href && !extension?.options.isAllowedUri(href, { protocols: extension.options.protocols })) {
      Message.error(t('admin9Ui.tiptapEditor.invalidLink'));
      return;
    }
    if (href && (initialLinkSelectionEmpty.value || linkText.value !== initialLinkText.value)) {
      chain.insertContent({ type: 'text', text: linkText.value || href, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else if (href) chain.setLink({ href }).run();
    else chain.unsetLink().run();
    linkPopupVisible.value = false;
  };
  const removeLink = () => {
    if (!editor.value || !isEditable.value) return;
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run();
    linkHref.value = '';
    linkPopupVisible.value = false;
  };
  const openLink = () => {
    const extension = editor.value?.extensionManager.extensions.find((item) => item.name === 'link');
    const href = linkHref.value.trim();
    if (href && extension?.options.isAllowedUri(href, { protocols: extension.options.protocols })) {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };
  const insertAttachments = (items: FileItem[]) => {
    if (!isEditable.value || !editor.value) return;
    const valid = items.filter(
      (item) =>
        ['document', 'archive', 'other'].includes(item.type) &&
        (item.status === undefined || item.status === 'ready') &&
        isSafeMediaUrl(item.url) &&
        item.name.trim()
    );
    if (valid.length !== items.length) Message.error(t('admin9Ui.tiptapEditor.invalidAttachment'));
    if (!valid.length) return;
    editor.value
      .chain()
      .focus()
      .insertContent(
        valid.map((item) => ({
          type: 'paragraph',
          content: [{ type: 'text', text: item.name, marks: [{ type: 'link', attrs: { href: item.url } }] }],
        }))
      )
      .run();
    nextTick(() => {
      attachmentValue.value = undefined;
    });
  };

  const placeGapCursorAfterInsertedBlock =
    () =>
    ({ tr }: { tr: Transaction }) => {
      let position = tr.selection.to;
      const { $from } = tr.selection;
      if (
        $from.depth === 1 &&
        $from.parent.isTextblock &&
        !$from.parent.content.size &&
        $from.after() === tr.doc.content.size
      ) {
        const paragraphPosition = $from.before();
        const previousNode = tr.doc.resolve(paragraphPosition).nodeBefore;
        if (previousNode && mediaNodeNames.includes(previousNode.type.name as TiptapMediaNodeName)) {
          tr.delete(paragraphPosition, paragraphPosition + $from.parent.nodeSize);
          position = paragraphPosition;
        }
      }
      const $position = tr.doc.resolve(position);
      if ($position.parent.type.name === 'doc') tr.setSelection(new GapCursor($position));
      return true;
    };

  const reportMediaError = (
    operation: TiptapMediaOperation,
    mediaType: Extract<FileType, 'image' | 'video' | 'audio'>,
    reason: TiptapMediaError['reason'],
    attemptedItems: FileItem[],
    rejectedItems: FileItem[],
    cause?: unknown
  ) => {
    const error: TiptapMediaError = {
      operation,
      mediaType,
      reason,
      attemptedItems: [...attemptedItems],
      rejectedItems: [...rejectedItems],
      ...(cause === undefined ? {} : { cause }),
    };
    let localeKey = 'mediaInsertFailed';
    if (reason === 'invalid-selection') localeKey = 'mediaInvalid';
    else if (operation === 'replace') localeKey = 'mediaReplaceFailed';
    Message.error(t(`admin9Ui.tiptapEditor.${localeKey}`));
    // eslint-disable-next-line vue/custom-event-name-casing
    emit('mediaError', error);
  };

  const partitionMediaSelection = (items: FileItem[], mediaType: Extract<FileType, 'image' | 'video' | 'audio'>) => {
    const valid: (FileItem & { url: string })[] = [];
    const rejected: FileItem[] = [];
    items.forEach((item) => {
      if (item.type === mediaType && isSafeMediaUrl(item.url)) valid.push(item as FileItem & { url: string });
      else rejected.push(item);
    });
    return { valid, rejected };
  };

  const insertMediaContent = (
    content: { type: TiptapMediaNodeName; attrs: Record<string, unknown> }[],
    block: boolean,
    mediaType: Extract<FileType, 'image' | 'video' | 'audio'>,
    items: FileItem[]
  ) => {
    if (!editor.value || !isEditable.value || !content.length) {
      reportMediaError('insert', mediaType, 'command-failed', items, []);
      return false;
    }
    try {
      const chain = editor.value.chain().focus().insertContent(content);
      if (block) chain.command(placeGapCursorAfterInsertedBlock());
      const inserted = chain.run();
      if (!inserted) reportMediaError('insert', mediaType, 'command-failed', items, []);
      return inserted;
    } catch (cause) {
      reportMediaError('insert', mediaType, 'command-failed', items, [], cause);
      return false;
    }
  };

  const insertImages = (items: FileItem[]) => {
    if (!items.length) return false;
    const { valid, rejected } = partitionMediaSelection(items, 'image');
    if (rejected.length) reportMediaError('insert', 'image', 'invalid-selection', items, rejected);
    if (!valid.length) return false;
    const type: TiptapMediaNodeName = props.defaultImageDisplay === 'inline' ? 'inlineImage' : 'blockImage';
    const content = valid.map((item) => ({
      type,
      attrs: {
        src: item.url,
        alt: item.name,
        title: item.name,
        ...(type === 'inlineImage' ? { size: '1em' } : { width: 'natural', align: 'left' }),
      },
    }));
    return insertMediaContent(content, type === 'blockImage', 'image', valid);
  };

  const insertMedia = (items: FileItem[], mediaType: 'video' | 'audio') => {
    if (!items.length) return false;
    const { valid, rejected } = partitionMediaSelection(items, mediaType);
    if (rejected.length) reportMediaError('insert', mediaType, 'invalid-selection', items, rejected);
    if (!valid.length) return false;
    const content = valid.map((item) => ({
      type: mediaType,
      attrs: {
        src: item.url,
        title: item.name,
        width: mediaType === 'video' ? '100%' : 'standard',
        align: 'left',
      },
    }));
    return insertMediaContent(content, true, mediaType, valid);
  };

  const clearPickerValueAfterUpdate = (pickerValue: Ref<FileItem | undefined>) => {
    nextTick(() => {
      pickerValue.value = undefined;
    });
  };

  const insertImagesFromPicker = (items: FileItem[]) => {
    if (insertImages(items)) clearPickerValueAfterUpdate(imagePickerValue);
  };
  const insertVideosFromPicker = (items: FileItem[]) => {
    if (insertMedia(items, 'video')) clearPickerValueAfterUpdate(videoPickerValue);
  };
  const insertAudiosFromPicker = (items: FileItem[]) => {
    if (insertMedia(items, 'audio')) clearPickerValueAfterUpdate(audioPickerValue);
  };

  const getSelectedNode = () => {
    if (!editor.value || !selectedMedia.value) return undefined;
    const node = editor.value.state.doc.nodeAt(selectedMedia.value.pos);
    if (!node || node.type.name !== selectedMedia.value.type) return undefined;
    return { node, pos: selectedMedia.value.pos };
  };

  const updateSelectedMedia = (attributes: Record<string, unknown>) => {
    const current = getSelectedNode();
    if (!editor.value || !current || !isEditable.value) return false;
    try {
      const transaction = editor.value.state.tr.setNodeMarkup(current.pos, undefined, {
        ...current.node.attrs,
        ...attributes,
      });
      transaction.setSelection(NodeSelection.create(transaction.doc, current.pos));
      editor.value.view.dispatch(transaction);
      return true;
    } catch {
      return false;
    }
  };

  const selectedMediaDefaultWidth = computed<TiptapBlockWidth | undefined>(() => {
    if (selectedMedia.value?.type === 'blockImage') return 'natural';
    if (selectedMedia.value?.type === 'video') return '100%';
    return undefined;
  });
  const canResetSelectedMediaSize = computed(
    () => selectedMediaDefaultWidth.value !== undefined && selectedMedia.value?.attrs.width !== selectedMediaDefaultWidth.value
  );
  const resetSelectedMediaSize = () => {
    if (selectedMediaDefaultWidth.value) updateSelectedMedia({ width: selectedMediaDefaultWidth.value });
  };

  const replaceSelectedMedia = (items: FileItem[]) => {
    if (!items.length) return false;
    const current = getSelectedNode();
    const expectedType = selectedMediaKind.value;
    if (!current || !expectedType) {
      reportMediaError(
        'replace',
        expectedType ??
          (items[0].type === 'image' || items[0].type === 'video' || items[0].type === 'audio' ? items[0].type : 'image'),
        'command-failed',
        items,
        []
      );
      return false;
    }
    const { valid, rejected } = partitionMediaSelection(items, expectedType);
    if (items.length !== 1 || rejected.length || valid.length !== 1) {
      reportMediaError('replace', expectedType, 'invalid-selection', items, rejected.length ? rejected : items);
      return false;
    }
    const replacement = valid[0];
    if (!updateSelectedMedia({ src: replacement.url, title: replacement.name })) {
      reportMediaError('replace', expectedType, 'command-failed', items, []);
      return false;
    }
    return true;
  };

  const replaceSelectedMediaFromPicker = (items: FileItem[]) => {
    if (replaceSelectedMedia(items)) clearPickerValueAfterUpdate(replacementPickerValue);
  };

  const applyAltText = () => {
    updateSelectedMedia({ alt: altDraft.value.trim() });
    altPopupVisible.value = false;
  };

  const deleteSelectedMedia = () => {
    const current = getSelectedNode();
    if (!editor.value || !current || !isEditable.value) return;
    const transaction = editor.value.state.tr.delete(current.pos, current.pos + current.node.nodeSize);
    transaction.setSelection(Selection.near(transaction.doc.resolve(Math.min(current.pos, transaction.doc.content.size))));
    editor.value.view.dispatch(transaction);
  };

  const convertSelectedImage = () => {
    const current = getSelectedNode();
    if (!editor.value || !current || !isEditable.value) return;
    const { node, pos } = current;
    const { schema } = editor.value.state;
    const common = { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title };
    const transaction = editor.value.state.tr;

    if (node.type.name === 'blockImage') {
      const inlineNode = schema.nodes.inlineImage.create({ ...common, size: '1em' });
      const paragraph = schema.nodes.paragraph.create(null, inlineNode);
      transaction.replaceWith(pos, pos + node.nodeSize, paragraph);
      transaction.setSelection(NodeSelection.create(transaction.doc, pos + 1));
    } else if (node.type.name === 'inlineImage') {
      const $pos = transaction.doc.resolve(pos);
      const { parent } = $pos;
      const parentStart = $pos.before($pos.depth);
      const before = parent.content.cut(0, $pos.parentOffset);
      const after = parent.content.cut($pos.parentOffset + node.nodeSize);
      const blockNode = schema.nodes.blockImage.create({ ...common, width: 'natural', align: 'left' });
      const replacement = [];
      if (before.size) replacement.push(parent.type.create(parent.attrs, before));
      replacement.push(blockNode);
      if (after.size) replacement.push(parent.type.create(parent.attrs, after));
      transaction.replaceWith(parentStart, parentStart + parent.nodeSize, Fragment.fromArray(replacement));
      const blockPosition = parentStart + (before.size ? replacement[0].nodeSize : 0);
      transaction.setSelection(NodeSelection.create(transaction.doc, blockPosition));
    } else return;

    editor.value.view.dispatch(transaction);
  };

  const focus = () => editor.value?.commands.focus();
  const clear = () => {
    uploads.pause();
    return editor.value?.commands.clearContent(true);
  };
  const getHTML = () => (editor.value ? publicHTML(editor.value) : '');
  const getJSON = (): TiptapDocument =>
    editor.value ? getDocumentSnapshot(editor.value.state.doc) : { type: 'doc', content: [{ type: 'paragraph' }] };

  const getImageUploadState = () => uploads.state();
  defineExpose<ATiptapEditorExposed>({ focus, clear, getHTML, getJSON, getImageUploadState });

  watch(
    () => props.modelValue,
    (value) => {
      if (!editor.value) return;
      const content = readContent(editor.value, value, 'update');
      if (content === null) return;
      const unchanged =
        typeof content === 'string' ? content === getHTML() : content.eq(getPublicDocument(editor.value.state.doc));
      if (!unchanged) {
        uploads.pause();
        editor.value.commands.setContent(content, { emitUpdate: false });
        if (!isEditable.value) {
          clearNodeSelection(editor.value);
          selectedMedia.value = undefined;
        }
      }
    }
  );
  watch(editorAttributes, (attributes) => {
    editor.value?.setOptions({ editorProps: { attributes } });
  });
  watch(isEditable, (value) => {
    if (!value) uploads.pause();
    if (!value) tablePopupVisible.value = false;
    const currentEditor = editor.value;
    currentEditor?.setEditable(value, false);
    if (!value && currentEditor) clearNodeSelection(currentEditor);
    if (!value) selectedMedia.value = undefined;
    uploads.sync();
  });
  watch([() => selectedMedia.value?.pos, () => selectedMedia.value?.type, () => selectedMedia.value?.attrs.alt], () => {
    altDraft.value = typeof selectedMedia.value?.attrs.alt === 'string' ? selectedMedia.value.attrs.alt : '';
  });
  watch([() => selectedMedia.value?.pos, () => selectedMedia.value?.type], () => {
    altPopupVisible.value = false;
    nextTick(() => {
      const currentEditor = editor.value;
      if (!selectedMedia.value || !currentEditor || currentEditor.isDestroyed) return;
      updateMediaBubbleVisibility();
      currentEditor.view.dispatch(currentEditor.state.tr.setMeta('a9TiptapMediaBubbleMenu', 'updatePosition'));
    });
  });
  onMounted(() => {
    bubbleMenuReady.value = true;
    uploads.sync();
  });
  watch([resolvedFileService, () => props.canUploadImage], () => uploads.pause());
  onBeforeUnmount(() => uploads.dispose());
</script>

<template>
  <div
    class="a9-tiptap-editor"
    :class="{
      'is-disabled': interactionDisabled,
      'is-error': mergedError,
      'is-readonly': props.readonly,
      'is-focused': isFocused,
    }"
    :style="editorStyle"
  >
    <FormItem no-style :disabled="interactionDisabled" :validate-trigger="[]">
      <div v-if="!readonly" class="a9-tiptap-editor__toolbar" role="toolbar" :aria-label="t('admin9Ui.tiptapEditor.toolbar')">
        <a-dropdown trigger="click" @select="setBlock">
          <a-button class="a9-tiptap-editor__block-menu" size="small" :disabled="interactionDisabled">
            {{ blockLabel }}
            <icon-down />
          </a-button>
          <template #content>
            <a-doption value="paragraph">{{ t('admin9Ui.tiptapEditor.paragraph') }}</a-doption>
            <a-doption value="heading-1">{{ t('admin9Ui.tiptapEditor.heading1') }}</a-doption>
            <a-doption value="heading-2">{{ t('admin9Ui.tiptapEditor.heading2') }}</a-doption>
            <a-doption value="heading-3">{{ t('admin9Ui.tiptapEditor.heading3') }}</a-doption>
          </template>
        </a-dropdown>

        <span class="a9-tiptap-editor__divider" aria-hidden="true" />

        <TextFormatToolbar :editor="editor" :disabled="interactionDisabled" />
        <a-tooltip :content="t('admin9Ui.tiptapEditor.bold')">
          <a-button
            size="small"
            :type="editor?.isActive('bold') ? 'primary' : 'text'"
            :disabled="interactionDisabled"
            :aria-label="t('admin9Ui.tiptapEditor.bold')"
            :aria-pressed="editor?.isActive('bold')"
            @click="editor?.chain().focus().toggleBold().run()"
          >
            <template #icon><icon-bold /></template>
          </a-button>
        </a-tooltip>
        <a-tooltip :content="t('admin9Ui.tiptapEditor.italic')">
          <a-button
            size="small"
            :type="editor?.isActive('italic') ? 'primary' : 'text'"
            :disabled="interactionDisabled"
            :aria-label="t('admin9Ui.tiptapEditor.italic')"
            :aria-pressed="editor?.isActive('italic')"
            @click="editor?.chain().focus().toggleItalic().run()"
          >
            <template #icon><icon-italic /></template>
          </a-button>
        </a-tooltip>
        <a-tooltip :content="t('admin9Ui.tiptapEditor.underline')">
          <a-button
            size="small"
            :type="editor?.isActive('underline') ? 'primary' : 'text'"
            :disabled="interactionDisabled"
            :aria-label="t('admin9Ui.tiptapEditor.underline')"
            :aria-pressed="editor?.isActive('underline')"
            @click="editor?.chain().focus().toggleUnderline().run()"
          >
            <template #icon><icon-underline /></template>
          </a-button>
        </a-tooltip>
        <a-tooltip :content="t('admin9Ui.tiptapEditor.strike')">
          <a-button
            size="small"
            :type="editor?.isActive('strike') ? 'primary' : 'text'"
            :disabled="interactionDisabled"
            :aria-label="t('admin9Ui.tiptapEditor.strike')"
            :aria-pressed="editor?.isActive('strike')"
            @click="editor?.chain().focus().toggleStrike().run()"
          >
            <template #icon><icon-strikethrough /></template>
          </a-button>
        </a-tooltip>

        <span class="a9-tiptap-editor__divider" aria-hidden="true" />

        <a-tooltip :content="t('admin9Ui.tiptapEditor.bulletList')">
          <a-button
            size="small"
            :type="editor?.isActive('bulletList') ? 'primary' : 'text'"
            :disabled="interactionDisabled"
            :aria-label="t('admin9Ui.tiptapEditor.bulletList')"
            :aria-pressed="editor?.isActive('bulletList')"
            @click="editor?.chain().focus().toggleBulletList().run()"
          >
            <template #icon><icon-unordered-list /></template>
          </a-button>
        </a-tooltip>
        <a-tooltip :content="t('admin9Ui.tiptapEditor.orderedList')">
          <a-button
            size="small"
            :type="editor?.isActive('orderedList') ? 'primary' : 'text'"
            :disabled="interactionDisabled"
            :aria-label="t('admin9Ui.tiptapEditor.orderedList')"
            :aria-pressed="editor?.isActive('orderedList')"
            @click="editor?.chain().focus().toggleOrderedList().run()"
          >
            <template #icon><icon-ordered-list /></template>
          </a-button>
        </a-tooltip>
        <a-tooltip :content="t('admin9Ui.tiptapEditor.blockquote')">
          <a-button
            size="small"
            :type="editor?.isActive('blockquote') ? 'primary' : 'text'"
            :disabled="interactionDisabled"
            :aria-label="t('admin9Ui.tiptapEditor.blockquote')"
            :aria-pressed="editor?.isActive('blockquote')"
            @click="editor?.chain().focus().toggleBlockquote().run()"
          >
            <template #icon><icon-quote /></template>
          </a-button>
        </a-tooltip>
        <a-tooltip :content="t('admin9Ui.tiptapEditor.horizontalRule')">
          <a-button
            size="small"
            type="text"
            :disabled="interactionDisabled"
            :aria-label="t('admin9Ui.tiptapEditor.horizontalRule')"
            @click="editor?.chain().focus().setHorizontalRule().run()"
          >
            <template #icon><icon-minus /></template>
          </a-button>
        </a-tooltip>

        <a-popover v-model:popup-visible="linkPopupVisible" trigger="click" position="bottom" :disabled="interactionDisabled">
          <a-tooltip :content="t('admin9Ui.tiptapEditor.link')">
            <a-button
              size="small"
              :type="editor?.isActive('link') ? 'primary' : 'text'"
              :disabled="interactionDisabled"
              :aria-label="t('admin9Ui.tiptapEditor.link')"
              :aria-pressed="editor?.isActive('link')"
              @click="prepareLink"
            >
              <template #icon><icon-link /></template>
            </a-button>
          </a-tooltip>
          <template #content>
            <div class="a9-tiptap-editor__link-panel">
              <a-input
                v-model="linkText"
                :aria-label="t('admin9Ui.tiptapEditor.linkText')"
                :placeholder="t('admin9Ui.tiptapEditor.linkText')"
              />
              <a-input
                v-model="linkHref"
                :aria-label="t('admin9Ui.tiptapEditor.link')"
                :placeholder="t('admin9Ui.tiptapEditor.linkPlaceholder')"
                allow-clear
                @press-enter="applyLink"
              />
              <div class="a9-tiptap-editor__link-actions">
                <a-button v-if="linkHref" size="small" @click="openLink">{{ t('admin9Ui.tiptapEditor.openLink') }}</a-button>
                <a-button v-if="editor?.isActive('link')" size="small" status="danger" @click="removeLink">
                  {{ t('admin9Ui.tiptapEditor.removeLink') }}
                </a-button>
                <a-button size="small" type="primary" @click="applyLink">
                  {{ t('admin9Ui.tiptapEditor.apply') }}
                </a-button>
              </div>
            </div>
          </template>
        </a-popover>

        <a-tooltip :content="t('admin9Ui.tiptapEditor.clearFormat')">
          <a-button
            size="small"
            type="text"
            :disabled="interactionDisabled"
            :aria-label="t('admin9Ui.tiptapEditor.clearFormat')"
            @mousedown.prevent
            @click="clearTextFormat"
          >
            <template #icon><icon-eraser /></template>
          </a-button>
        </a-tooltip>
        <AFilePicker
          v-if="resolvedFileService"
          v-model="attachmentValue"
          :service="resolvedFileService"
          :file-types="['document', 'archive', 'other']"
          multiple
          :can-upload="props.canUploadAttachment"
          @confirm="insertAttachments"
        >
          <template #trigger="{ open }">
            <a-tooltip :content="t('admin9Ui.tiptapEditor.attachment')">
              <a-button
                size="small"
                type="text"
                :disabled="interactionDisabled"
                :aria-label="t('admin9Ui.tiptapEditor.attachment')"
                @mousedown.prevent
                @click="open"
              >
                <template #icon><icon-attachment /></template>
              </a-button>
            </a-tooltip>
          </template>
        </AFilePicker>

        <a-tooltip
          v-if="resolvedFileService"
          v-model:popup-visible="imagePickerTooltipVisible"
          :content="t('admin9Ui.tiptapEditor.image')"
        >
          <AFilePicker
            v-model="imagePickerValue"
            class="a9-tiptap-editor__media-picker"
            data-media-type="image"
            :file-types="['image']"
            :service="resolvedFileService"
            :can-upload="canUploadImage"
            @confirm="insertImagesFromPicker"
            @visible-change="onMediaPickerVisibleChange"
          >
            <template #trigger="{ open, disabled: pickerDisabled }">
              <a-button
                size="small"
                type="text"
                :disabled="interactionDisabled || pickerDisabled"
                :aria-label="t('admin9Ui.tiptapEditor.image')"
                @mousedown.prevent
                @click="open"
              >
                <template #icon><icon-image /></template>
              </a-button>
            </template>
          </AFilePicker>
        </a-tooltip>

        <a-tooltip
          v-if="resolvedFileService"
          v-model:popup-visible="videoPickerTooltipVisible"
          :content="t('admin9Ui.tiptapEditor.video')"
        >
          <AFilePicker
            v-model="videoPickerValue"
            class="a9-tiptap-editor__media-picker"
            data-media-type="video"
            :file-types="['video']"
            :service="resolvedFileService"
            :can-upload="canUploadVideo"
            @confirm="insertVideosFromPicker"
            @visible-change="onMediaPickerVisibleChange"
          >
            <template #trigger="{ open, disabled: pickerDisabled }">
              <a-button
                size="small"
                type="text"
                :disabled="interactionDisabled || pickerDisabled"
                :aria-label="t('admin9Ui.tiptapEditor.video')"
                @mousedown.prevent
                @click="open"
              >
                <template #icon><icon-video-camera /></template>
              </a-button>
            </template>
          </AFilePicker>
        </a-tooltip>

        <a-tooltip
          v-if="resolvedFileService"
          v-model:popup-visible="audioPickerTooltipVisible"
          :content="t('admin9Ui.tiptapEditor.audio')"
        >
          <AFilePicker
            v-model="audioPickerValue"
            class="a9-tiptap-editor__media-picker"
            data-media-type="audio"
            :file-types="['audio']"
            :service="resolvedFileService"
            :can-upload="canUploadAudio"
            @confirm="insertAudiosFromPicker"
            @visible-change="onMediaPickerVisibleChange"
          >
            <template #trigger="{ open, disabled: pickerDisabled }">
              <a-button
                size="small"
                type="text"
                :disabled="interactionDisabled || pickerDisabled"
                :aria-label="t('admin9Ui.tiptapEditor.audio')"
                @mousedown.prevent
                @click="open"
              >
                <template #icon><icon-sound /></template>
              </a-button>
            </template>
          </AFilePicker>
        </a-tooltip>

        <a-popover
          v-if="!editor?.isActive('table')"
          v-model:popup-visible="tablePopupVisible"
          trigger="click"
          position="bottom"
          :disabled="interactionDisabled"
        >
          <a-button
            ref="tableTriggerRef"
            size="small"
            type="text"
            :disabled="interactionDisabled"
            :aria-label="t('admin9Ui.tiptapEditor.table')"
            :aria-expanded="tablePopupVisible"
            aria-haspopup="dialog"
            @mousedown.prevent
            @keydown.down.prevent="focusTablePicker"
            @keydown.enter.prevent="focusTablePicker"
            @keydown.space.prevent="focusTablePicker"
          >
            <template #icon><icon-apps /></template>
          </a-button>
          <template #content>
            <div
              ref="tablePickerRef"
              class="a9-tiptap-editor__table-picker"
              role="dialog"
              :aria-label="t('admin9Ui.tiptapEditor.table')"
              @keydown="onTablePickerKeydown"
            >
              <div class="a9-tiptap-editor__table-size" aria-live="polite">{{ tableSizeLabel }}</div>
              <div class="a9-tiptap-editor__table-grid">
                <template v-for="row in 8" :key="row">
                  <button
                    v-for="column in 10"
                    :key="column"
                    type="button"
                    class="a9-tiptap-editor__table-cell"
                    :class="{ 'is-selected': row <= tableRows && column <= tableColumns }"
                    :tabindex="row === tableRows && column === tableColumns ? 0 : -1"
                    :aria-label="t('admin9Ui.tiptapEditor.tableSize', { rows: row, columns: column })"
                    :data-table-size="`${row}-${column}`"
                    @mouseenter="previewTable(row, column)"
                    @focus="previewTable(row, column)"
                    @mousedown.prevent
                    @click="insertTable(row, column)"
                  />
                </template>
              </div>
              <a-button
                size="small"
                @click="
                  tablePopupVisible = false;
                  tableTextVisible = true;
                "
                >{{ t('admin9Ui.tiptapEditor.pasteTable') }}</a-button
              >
            </div>
          </template>
        </a-popover>
        <a-dropdown v-else trigger="click" @select="runTableAction">
          <a-tooltip :content="t('admin9Ui.tiptapEditor.table')">
            <a-button
              size="small"
              :type="editor?.isActive('table') ? 'primary' : 'text'"
              :disabled="interactionDisabled"
              :aria-label="t('admin9Ui.tiptapEditor.table')"
              :aria-pressed="editor?.isActive('table')"
            >
              <template #icon><icon-apps /></template>
            </a-button>
          </a-tooltip>
          <template #content>
            <template v-if="editor?.isActive('table')">
              <a-doption value="add-row-before">{{ t('admin9Ui.tiptapEditor.addRowBefore') }}</a-doption>
              <a-doption value="add-row-after">{{ t('admin9Ui.tiptapEditor.addRowAfter') }}</a-doption>
              <a-doption value="delete-row">{{ t('admin9Ui.tiptapEditor.deleteRow') }}</a-doption>
              <a-doption value="add-column-before">{{ t('admin9Ui.tiptapEditor.addColumnBefore') }}</a-doption>
              <a-doption value="add-column-after">{{ t('admin9Ui.tiptapEditor.addColumnAfter') }}</a-doption>
              <a-doption value="delete-column">{{ t('admin9Ui.tiptapEditor.deleteColumn') }}</a-doption>
              <a-doption value="toggle-header-row">{{ t('admin9Ui.tiptapEditor.toggleHeaderRow') }}</a-doption>
              <a-doption value="merge-cells" :disabled="!editor?.can().mergeCells()">{{
                t('admin9Ui.tiptapEditor.mergeCells')
              }}</a-doption>
              <a-doption value="split-cell" :disabled="!editor?.can().splitCell()">{{
                t('admin9Ui.tiptapEditor.splitCell')
              }}</a-doption>
              <a-doption value="delete-table">{{ t('admin9Ui.tiptapEditor.deleteTable') }}</a-doption>
            </template>
          </template>
        </a-dropdown>

        <span class="a9-tiptap-editor__divider" aria-hidden="true" />

        <a-tooltip :content="t('admin9Ui.tiptapEditor.alignLeft')">
          <a-button
            size="small"
            :type="editor?.isActive({ textAlign: 'left' }) ? 'primary' : 'text'"
            :disabled="interactionDisabled"
            :aria-label="t('admin9Ui.tiptapEditor.alignLeft')"
            :aria-pressed="editor?.isActive({ textAlign: 'left' })"
            @click="editor?.chain().focus().setTextAlign('left').run()"
          >
            <template #icon><icon-align-left /></template>
          </a-button>
        </a-tooltip>
        <a-tooltip :content="t('admin9Ui.tiptapEditor.alignCenter')">
          <a-button
            size="small"
            :type="editor?.isActive({ textAlign: 'center' }) ? 'primary' : 'text'"
            :disabled="interactionDisabled"
            :aria-label="t('admin9Ui.tiptapEditor.alignCenter')"
            :aria-pressed="editor?.isActive({ textAlign: 'center' })"
            @click="editor?.chain().focus().setTextAlign('center').run()"
          >
            <template #icon><icon-align-center /></template>
          </a-button>
        </a-tooltip>
        <a-tooltip :content="t('admin9Ui.tiptapEditor.alignRight')">
          <a-button
            size="small"
            :type="editor?.isActive({ textAlign: 'right' }) ? 'primary' : 'text'"
            :disabled="interactionDisabled"
            :aria-label="t('admin9Ui.tiptapEditor.alignRight')"
            :aria-pressed="editor?.isActive({ textAlign: 'right' })"
            @click="editor?.chain().focus().setTextAlign('right').run()"
          >
            <template #icon><icon-align-right /></template>
          </a-button>
        </a-tooltip>

        <span class="a9-tiptap-editor__toolbar-spacer" />

        <a-tooltip :content="t('admin9Ui.tiptapEditor.undo')">
          <a-button
            size="small"
            type="text"
            :disabled="interactionDisabled || !editor?.can().chain().focus().undo().run()"
            :aria-label="t('admin9Ui.tiptapEditor.undo')"
            @click="editor?.chain().focus().undo().run()"
          >
            <template #icon><icon-undo /></template>
          </a-button>
        </a-tooltip>
        <a-tooltip :content="t('admin9Ui.tiptapEditor.redo')">
          <a-button
            size="small"
            type="text"
            :disabled="interactionDisabled || !editor?.can().chain().focus().redo().run()"
            :aria-label="t('admin9Ui.tiptapEditor.redo')"
            @click="editor?.chain().focus().redo().run()"
          >
            <template #icon><icon-redo /></template>
          </a-button>
        </a-tooltip>
      </div>

      <a-modal
        v-model:visible="tableTextVisible"
        :title="t('admin9Ui.tiptapEditor.pasteTable')"
        :ok-button-props="{ disabled: !tableTextRows.length || !isEditable }"
        :on-before-ok="insertTableText"
      >
        <a-textarea
          v-model="tableText"
          :aria-label="t('admin9Ui.tiptapEditor.pasteTable')"
          :placeholder="t('admin9Ui.tiptapEditor.pasteTablePlaceholder')"
          :auto-size="{ minRows: 4, maxRows: 10 }"
        />
        <p>{{
          t('admin9Ui.tiptapEditor.tableSize', { rows: tableTextRows.length, columns: tableTextRows[0]?.length ?? 0 })
        }}</p>
      </a-modal>

      <div
        ref="contentRef"
        class="a9-tiptap-editor__content"
        role="region"
        :aria-label="t('admin9Ui.tiptapEditor.contentArea')"
      >
        <EditorContent :editor="editor" />
      </div>

      <MediaBubbleMenu
        v-if="editor && bubbleMenuReady"
        :editor="editor"
        plugin-key="a9TiptapMediaBubbleMenu"
        class="a9-tiptap-editor__media-bubble"
        :options="mediaBubbleOptions"
        :append-to="appendMediaBubbleToBody"
        :should-show="shouldShowMediaBubble"
        :get-referenced-virtual-element="getMediaBubbleVirtualElement"
        :update-delay="0"
        :resize-delay="0"
      >
        <div
          v-if="selectedMedia"
          ref="mediaToolbarRef"
          class="a9-tiptap-editor__media-toolbar"
          role="toolbar"
          :aria-label="t('admin9Ui.tiptapEditor.mediaToolbar')"
          :data-selected-media="selectedMedia.type"
          @mousedown.prevent
        >
          <span class="a9-tiptap-editor__media-toolbar-label">
            {{ selectedMediaLabel }}
          </span>

          <template v-if="selectedMedia.type === 'blockImage' || selectedMedia.type === 'video'">
            <span class="a9-tiptap-editor__media-toolbar-group" :aria-label="t('admin9Ui.tiptapEditor.mediaWidth')">
              <a-button
                v-for="width in blockWidths"
                :key="width"
                size="mini"
                :type="selectedMedia.attrs.width === width ? 'primary' : 'text'"
                :aria-label="blockWidthLabel(width)"
                :aria-pressed="selectedMedia.attrs.width === width"
                :data-media-width="width"
                @mousedown.prevent
                @click="updateSelectedMedia({ width })"
              >
                {{ blockWidthLabel(width) }}
              </a-button>
            </span>

            <a-tooltip v-if="canResetSelectedMediaSize" :content="t('admin9Ui.tiptapEditor.resetSize')">
              <a-button
                size="mini"
                type="text"
                :aria-label="t('admin9Ui.tiptapEditor.resetSize')"
                data-media-reset-size
                @mousedown.prevent
                @click="resetSelectedMediaSize"
              >
                <template #icon><icon-original-size /></template>
              </a-button>
            </a-tooltip>
          </template>

          <span
            v-if="selectedMedia.type === 'audio'"
            class="a9-tiptap-editor__media-toolbar-group"
            :aria-label="t('admin9Ui.tiptapEditor.audioWidth')"
          >
            <a-button
              v-for="width in audioWidths"
              :key="width"
              size="mini"
              :type="selectedMedia.attrs.width === width ? 'primary' : 'text'"
              :aria-label="audioWidthLabel(width)"
              :aria-pressed="selectedMedia.attrs.width === width"
              :data-media-width="width"
              @mousedown.prevent
              @click="updateSelectedMedia({ width })"
            >
              {{ audioWidthLabel(width) }}
            </a-button>
          </span>

          <span
            v-if="selectedMedia.type === 'blockImage' || selectedMedia.type === 'video' || selectedMedia.type === 'audio'"
            class="a9-tiptap-editor__media-toolbar-group"
            :aria-label="t('admin9Ui.tiptapEditor.mediaAlign')"
          >
            <a-tooltip
              v-for="align in mediaAlignments"
              :key="align"
              :content="t(`admin9Ui.tiptapEditor.align${align.charAt(0).toUpperCase()}${align.slice(1)}`)"
            >
              <a-button
                size="mini"
                :type="selectedMedia.attrs.align === align ? 'primary' : 'text'"
                :aria-label="t(`admin9Ui.tiptapEditor.align${align.charAt(0).toUpperCase()}${align.slice(1)}`)"
                :aria-pressed="selectedMedia.attrs.align === align"
                :data-media-align="align"
                @mousedown.prevent
                @click="updateSelectedMedia({ align })"
              >
                <template #icon>
                  <icon-align-left v-if="align === 'left'" />
                  <icon-align-center v-else-if="align === 'center'" />
                  <icon-align-right v-else />
                </template>
              </a-button>
            </a-tooltip>
          </span>

          <span
            v-if="selectedMedia.type === 'inlineImage'"
            class="a9-tiptap-editor__media-toolbar-group"
            :aria-label="t('admin9Ui.tiptapEditor.inlineImageSize')"
          >
            <a-button
              v-for="size in inlineSizes"
              :key="size"
              size="mini"
              :type="selectedMedia.attrs.size === size ? 'primary' : 'text'"
              :aria-label="inlineSizeLabel(size)"
              :aria-pressed="selectedMedia.attrs.size === size"
              :data-media-size="size"
              @mousedown.prevent
              @click="updateSelectedMedia({ size })"
            >
              {{ inlineSizeLabel(size) }}
            </a-button>
          </span>

          <template v-if="selectedMedia.type === 'blockImage' || selectedMedia.type === 'inlineImage'">
            <a-popover v-model:popup-visible="altPopupVisible" trigger="click" position="bottom">
              <a-tooltip :content="t('admin9Ui.tiptapEditor.altText')">
                <a-button
                  size="mini"
                  type="text"
                  :aria-label="t('admin9Ui.tiptapEditor.altText')"
                  @mousedown.prevent
                  @click="altPopupVisible = true"
                >
                  <template #icon><icon-edit /></template>
                </a-button>
              </a-tooltip>
              <template #content>
                <div class="a9-tiptap-editor__alt-popover" @mousedown.stop>
                  <strong class="a9-tiptap-editor__alt-popover-title">{{ t('admin9Ui.tiptapEditor.altText') }}</strong>
                  <div class="a9-tiptap-editor__alt-popover-fields">
                    <a-input
                      v-model="altDraft"
                      size="small"
                      :placeholder="t('admin9Ui.tiptapEditor.altPlaceholder')"
                      :aria-label="t('admin9Ui.tiptapEditor.altText')"
                      @press-enter="applyAltText"
                    />
                    <a-button
                      size="small"
                      type="primary"
                      :aria-label="t('admin9Ui.tiptapEditor.applyAlt')"
                      @mousedown.prevent
                      @click="applyAltText"
                    >
                      {{ t('admin9Ui.tiptapEditor.apply') }}
                    </a-button>
                  </div>
                </div>
              </template>
            </a-popover>
            <a-tooltip
              :content="
                selectedMedia.type === 'blockImage'
                  ? t('admin9Ui.tiptapEditor.convertInline')
                  : t('admin9Ui.tiptapEditor.convertBlock')
              "
            >
              <a-button
                size="mini"
                type="text"
                :aria-label="
                  selectedMedia.type === 'blockImage'
                    ? t('admin9Ui.tiptapEditor.convertInline')
                    : t('admin9Ui.tiptapEditor.convertBlock')
                "
                @mousedown.prevent
                @click="convertSelectedImage"
              >
                <template #icon><icon-swap /></template>
              </a-button>
            </a-tooltip>
          </template>

          <AFilePicker
            v-if="resolvedFileService"
            v-model="replacementPickerValue"
            class="a9-tiptap-editor__media-picker a9-tiptap-editor__replacement-picker"
            data-media-replace
            :file-types="[
              selectedMedia.type === 'blockImage' || selectedMedia.type === 'inlineImage' ? 'image' : selectedMedia.type,
            ]"
            :service="resolvedFileService"
            :can-upload="
              selectedMedia.type === 'blockImage' || selectedMedia.type === 'inlineImage'
                ? canUploadImage
                : selectedMedia.type === 'video'
                ? canUploadVideo
                : canUploadAudio
            "
            @confirm="replaceSelectedMediaFromPicker"
            @visible-change="onMediaPickerVisibleChange"
          >
            <template #trigger="{ open, disabled: pickerDisabled }">
              <a-tooltip v-model:popup-visible="replacePickerTooltipVisible" :content="replaceMediaLabel">
                <a-button
                  size="mini"
                  type="text"
                  :disabled="interactionDisabled || pickerDisabled"
                  :aria-label="replaceMediaLabel"
                  @mousedown.prevent
                  @click="open"
                >
                  <template #icon><icon-refresh /></template>
                </a-button>
              </a-tooltip>
            </template>
          </AFilePicker>

          <a-tooltip :content="deleteMediaLabel">
            <a-button
              size="mini"
              type="text"
              status="danger"
              :aria-label="deleteMediaLabel"
              @mousedown.prevent
              @click="deleteSelectedMedia"
            >
              <template #icon><icon-delete /></template>
            </a-button>
          </a-tooltip>
        </div>
      </MediaBubbleMenu>

      <div v-if="showWordCount" class="a9-tiptap-editor__footer">
        <span>
          {{
            maxLength > 0
              ? t('admin9Ui.tiptapEditor.characterLimit', { count: characterCount, limit: maxLength })
              : t('admin9Ui.tiptapEditor.characterCount', { count: characterCount })
          }}
        </span>
      </div>
    </FormItem>
  </div>
</template>

<style scoped lang="less">
  .a9-tiptap-editor :deep(.a9-tiptap-editor__upload) {
    display: inline-flex;
    flex-direction: column;
    gap: 8px;
    max-width: 240px;
    padding: 12px;
    color: var(--color-text-2);
    background: var(--color-fill-2);
    border: 1px dashed var(--color-border-3);

    img {
      max-width: 100%;
      max-height: 180px;
      object-fit: contain;
    }

    button {
      cursor: pointer;
    }
  }

  .a9-tiptap-editor {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    overflow: hidden;
    background: var(--color-bg-2);
    border: 1px solid var(--color-border-2);
    border-radius: 4px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;

    &.is-focused:not(.is-disabled, .is-readonly) {
      border-color: rgb(var(--primary-6));
      box-shadow: 0 0 0 2px rgb(var(--primary-6) / 10%);
    }

    &.is-error {
      border-color: rgb(var(--danger-6));
    }

    &.is-disabled {
      color: var(--color-text-4);
      background: var(--color-fill-2);
      cursor: not-allowed;
    }
  }

  .a9-tiptap-editor__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    align-items: center;
    min-height: 44px;
    padding: 6px 8px;
    background: var(--color-fill-1);
    border-bottom: 1px solid var(--color-border-2);

    :deep(.arco-btn-size-small) {
      width: 30px;
      min-width: 30px;
      height: 30px;
      padding: 0;
    }
  }

  .a9-tiptap-editor__toolbar :deep(.a9-text-format-size.arco-btn-size-small),
  .a9-tiptap-editor__block-menu.arco-btn-size-small {
    width: auto;
    min-width: 86px;
    padding: 0 8px;
  }

  .a9-tiptap-editor__divider {
    width: 1px;
    height: 20px;
    margin: 0 4px;
    background: var(--color-border-2);
  }

  .a9-tiptap-editor__toolbar-spacer {
    flex: 1 1 auto;
    min-width: 8px;
  }

  .a9-tiptap-editor__media-picker {
    :deep(.arco-upload-list) {
      display: none;
    }
  }

  .a9-tiptap-editor__media-bubble {
    z-index: 1100;
    max-width: calc(100vw - 16px);
    outline: none;
  }

  .a9-tiptap-editor__media-toolbar {
    display: flex;
    flex-wrap: nowrap;
    gap: 4px;
    align-items: center;
    max-width: 100%;
    min-height: 36px;
    padding: 5px 6px;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    background: var(--color-bg-2);
    border: 1px solid var(--color-border-2);
    border-radius: 4px;
    box-shadow: 0 4px 16px rgb(0 0 0 / 14%);
    scrollbar-width: thin;

    :deep(.arco-btn-size-mini) {
      flex: 0 0 auto;
      min-width: 24px;
      height: 24px;
      padding: 0 6px;
    }
  }

  .a9-tiptap-editor__toolbar,
  .a9-tiptap-editor__media-toolbar {
    :deep(.arco-btn-text:not(.arco-btn-status-danger)) {
      color: var(--color-text-2);
      background-color: transparent;
    }

    :deep(.arco-btn-text:not(.arco-btn-status-danger, .arco-btn-disabled):hover) {
      color: var(--color-text-1);
      background-color: var(--color-fill-2);
    }

    :deep(.arco-btn-text:not(.arco-btn-status-danger, .arco-btn-disabled):active) {
      color: var(--color-text-1);
      background-color: var(--color-fill-3);
    }

    :deep(.arco-btn-text.arco-btn-disabled:not(.arco-btn-status-danger)) {
      color: var(--color-text-4);
      background-color: transparent;
    }
  }

  .a9-tiptap-editor__media-toolbar-label {
    color: var(--color-text-2);
    font-weight: 500;
    font-size: 12px;
    white-space: nowrap;
  }

  .a9-tiptap-editor__media-toolbar-group,
  .a9-tiptap-editor__replacement-picker {
    display: inline-flex;
    flex: 0 0 auto;
    gap: 2px;
    align-items: center;
  }

  .a9-tiptap-editor__alt-popover {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(360px, calc(100vw - 48px));
  }

  .a9-tiptap-editor__alt-popover-title {
    color: var(--color-text-1);
    font-weight: 500;
    font-size: 13px;
  }

  .a9-tiptap-editor__alt-popover-fields {
    display: flex;
    gap: 8px;

    :deep(.arco-input-wrapper) {
      flex: 1;
      min-width: 0;
    }
  }

  .a9-tiptap-editor__link-panel {
    width: min(320px, calc(100vw - 48px));
  }

  .a9-tiptap-editor__table-picker {
    width: min(276px, calc(100vw - 64px));
  }

  .a9-tiptap-editor__table-size {
    margin-bottom: 10px;
    color: var(--color-text-2);
    font-size: 13px;
  }

  .a9-tiptap-editor__table-grid {
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    gap: 4px;
  }

  .a9-tiptap-editor__table-cell {
    aspect-ratio: 1;
    padding: 0;
    background: var(--color-bg-2);
    border: 1px solid var(--color-border-3);
    border-radius: 2px;
    cursor: pointer;

    &.is-selected {
      background: rgb(var(--primary-1));
      border-color: rgb(var(--primary-6));
    }

    &:focus-visible {
      outline: 2px solid rgb(var(--primary-6));
      outline-offset: 1px;
    }
  }

  .a9-tiptap-editor__link-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 10px;
  }

  .a9-tiptap-editor__content {
    min-height: 0;
    max-height: var(--a9-tiptap-editor-max-height);
    overflow: hidden auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    cursor: text;

    :deep(.a9-tiptap-editor__prose) {
      min-height: var(--a9-tiptap-editor-min-height);
      padding: 16px;
      color: var(--color-text-1);
      font-size: 14px;
      line-height: 1.75;
      overflow-wrap: anywhere;
      outline: none;

      > :first-child {
        margin-top: 0;
      }

      > :last-child {
        margin-bottom: 0;
      }

      p {
        margin: 0 0 10px;
      }

      h1,
      h2,
      h3 {
        color: var(--color-text-1);
        font-weight: 600;
        letter-spacing: 0;
      }

      h1 {
        margin: 28px 0 12px;
        font-size: 26px;
        line-height: 1.4;
      }

      h2 {
        margin: 22px 0 10px;
        font-size: 22px;
        line-height: 1.45;
      }

      h3 {
        margin: 18px 0 8px;
        font-size: 18px;
        line-height: 1.5;
      }

      ul,
      ol {
        margin: 0 0 10px;
        padding-left: 24px;
      }

      li + li {
        margin-top: 2px;
      }

      li > p {
        margin: 0;
      }

      li > p + p {
        margin-top: 8px;
      }

      li > ul,
      li > ol {
        margin: 4px 0 0;
      }

      blockquote {
        margin: 12px 0;
        padding: 8px 12px;
        color: var(--color-text-2);
        background: var(--color-fill-1);
        border-left: 3px solid rgb(var(--primary-6));
      }

      blockquote > :first-child {
        margin-top: 0;
      }

      blockquote > :last-child {
        margin-bottom: 0;
      }

      a {
        color: rgb(var(--link-6));
        text-decoration: underline;
      }

      hr {
        margin: 20px 0;
        border: 0;
        border-top: 1px solid var(--color-border-2);
      }

      .tableWrapper {
        margin: 12px 0;
        overflow-x: auto;
        overscroll-behavior-x: contain;
      }

      table {
        width: 100%;
        min-width: 480px;
        table-layout: fixed;
        border-collapse: collapse;
        border-spacing: 0;
      }

      th,
      td {
        position: relative;
        min-width: 80px;
        padding: 8px 10px;
        vertical-align: top;
        border: 1px solid var(--color-border-2);
      }

      th {
        font-weight: 600;
        text-align: left;
        background: var(--color-fill-2);
      }

      th > :last-child,
      td > :last-child {
        margin-bottom: 0;
      }

      .selectedCell::after {
        position: absolute;
        inset: 0;
        z-index: 2;
        background: rgba(var(--primary-6), 0.1);
        content: '';
        pointer-events: none;
      }

      .column-resize-handle {
        position: absolute;
        top: 0;
        right: -2px;
        bottom: -1px;
        z-index: 3;
        width: 4px;
        background: rgb(var(--primary-6));
        pointer-events: none;
      }

      &.resize-cursor {
        cursor: col-resize;
      }

      .a9-tiptap-editor__media-node:not(.is-inlineImage) {
        position: relative;
        display: block;
        width: var(--a9-media-width, 100%);
        max-width: 100%;
        margin: 12px 0;
      }

      .a9-tiptap-editor__media-node[data-align='center'] {
        margin-right: auto;
        margin-left: auto;
      }

      .a9-tiptap-editor__media-node[data-align='right'] {
        margin-left: auto;
      }

      .a9-tiptap-editor__media-node.is-inlineImage {
        position: relative;
        display: inline-flex;
        width: auto;
        height: var(--a9-media-size, 1em);
        margin: 0 0.08em;
        line-height: 1;
        vertical-align: -0.16em;
      }

      .a9-tiptap-editor__media-node img,
      .a9-tiptap-editor__media-node video,
      .a9-tiptap-editor__media-node audio {
        display: block;
        max-width: 100%;
        border-radius: 4px;
      }

      .a9-tiptap-editor__media-node:not(.is-inlineImage) img,
      .a9-tiptap-editor__media-node video {
        width: 100%;
        height: auto;
      }

      .a9-tiptap-editor__media-node.is-inlineImage img {
        width: auto;
        max-width: none;
        height: 100%;
        border-radius: 2px;
      }

      .a9-tiptap-editor__media-node video {
        max-height: 520px;
        background: #000;
      }

      .a9-tiptap-editor__media-node.is-audio {
        width: var(--a9-media-width, 480px);
        max-width: 100%;
      }

      .a9-tiptap-editor__media-node audio {
        width: 100%;
      }

      .a9-tiptap-editor__media-node.is-selected {
        border-radius: 4px;
        outline: 2px solid rgb(var(--primary-6));
        outline-offset: 2px;
      }

      .a9-tiptap-editor__resize-handle {
        position: absolute;
        right: -7px;
        bottom: -7px;
        width: 14px;
        height: 14px;
        padding: 0;
        background: rgb(var(--primary-6));
        border: 2px solid var(--color-bg-2);
        border-radius: 50%;
        cursor: nwse-resize;
        touch-action: none;
      }

      code {
        padding: 2px 5px;
        background: var(--color-fill-2);
        border-radius: 3px;
      }

      pre {
        margin: 14px 0;
        padding: 12px;
        overflow-x: auto;
        color: var(--color-text-1);
        background: var(--color-fill-2);
        border-radius: 4px;
      }

      pre code {
        padding: 0;
        color: inherit;
        font: inherit;
        background: transparent;
        border-radius: 0;
      }

      .ProseMirror-gapcursor::after {
        border-top-color: var(--color-text-1);
      }

      p.is-editor-empty:first-child::before {
        float: left;
        height: 0;
        color: var(--color-text-4);
        content: attr(data-placeholder);
        pointer-events: none;
      }
    }
  }

  .is-disabled .a9-tiptap-editor__content,
  .is-readonly .a9-tiptap-editor__content {
    cursor: default;
  }

  .is-disabled,
  .is-readonly {
    :deep(.a9-tiptap-editor__media-node.is-selected) {
      outline: none;
    }

    :deep(.a9-tiptap-editor__resize-handle) {
      display: none;
    }
  }

  .a9-tiptap-editor__footer {
    display: flex;
    justify-content: flex-end;
    min-height: 32px;
    padding: 6px 12px;
    color: var(--color-text-3);
    font-size: 12px;
    line-height: 20px;
    background: var(--color-fill-1);
    border-top: 1px solid var(--color-border-2);
  }

  @media (width <= 640px) {
    .a9-tiptap-editor__toolbar {
      align-items: flex-start;
    }

    .a9-tiptap-editor__toolbar-spacer {
      display: none;
    }

    .a9-tiptap-editor__media-toolbar-label {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      overflow: hidden;
      white-space: nowrap;
      border: 0;
      clip-path: inset(50%);
    }

    :deep(.a9-tiptap-editor__resize-handle) {
      display: none;
    }

    :deep(.a9-tiptap-editor__media-node.is-audio) {
      width: 100%;
    }
  }
</style>
