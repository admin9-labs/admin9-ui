<script setup lang="ts" generic="F extends TiptapValueFormat = 'html'">
  import {
    computed,
    inject,
    nextTick,
    onBeforeUnmount,
    onDeactivated,
    onMounted,
    ref,
    toRef,
    toRefs,
    watch,
    type Ref,
  } from 'vue';
  import { FormItem, Message, useFormItem } from '@arco-design/web-vue';
  import { IconMore, IconQuestionCircle, IconLoading } from '@arco-design/web-vue/es/icon';
  import { Extension, isNodeEmpty, type Editor, type Extensions } from '@tiptap/core';
  import CharacterCount from '@tiptap/extension-character-count';
  import Placeholder from '@tiptap/extension-placeholder';
  import { Table, TableKit } from '@tiptap/extension-table';
  import TextAlign from '@tiptap/extension-text-align';
  import StarterKit from '@tiptap/starter-kit';
  import { history, undoDepth, redoDepth } from '@tiptap/pm/history';
  import { GapCursor } from '@tiptap/pm/gapcursor';
  import { DOMSerializer, Fragment } from '@tiptap/pm/model';
  import { NodeSelection, Selection, TextSelection, type SelectionBookmark, type Transaction } from '@tiptap/pm/state';
  import { columnResizing, tableEditing } from '@tiptap/pm/tables';
  import { EditorContent, useEditor } from '@tiptap/vue-3';
  import { useI18n } from 'vue-i18n';
  import admin9UIOptionsKey from '../../internal/options';
  import type { FileItem, FilePickerAdapter, FileType } from '../../services/types';
  import AImageCropper from '../image-cropper/index.vue';
  import type { AImageCropperExposed } from '../image-cropper/types';
  import { validateAdditionalExtensions, validatedDocumentAttributes, parseHTMLDocument } from './application-extensions';
  import AFilePicker from '../file-picker/index.vue';
  import MediaBubbleMenu from './media-bubble-menu.vue';
  import { getDocumentSnapshot, getPublicDocument, parseTiptapDocument } from './content';
  import { createEditorImageCrop } from './image-crop';
  import { createImageUploads } from './image-upload';
  import { cleanPastedHTML, parseTableText, tableTextContent } from './paste';
  import { SafeColor, SafeFontSize, SafeHighlight, TextFormat, TextStyle } from './text-format';
  import { selectedTextBlocks, canConvertTextBlock, convertSelectedTextBlocks } from './text-blocks';
  import TextFormatToolbar from './text-format-toolbar.vue';
  import MediaActionMenu from './media-action-menu.vue';
  import ToolbarGroup from './toolbar-group.vue';
  import ToolbarTooltip from './toolbar-tooltip.vue';
  import createCharacterLimit from './character-limit';
  import IntegrityFeedback from './integrity-feedback.vue';
  import Modal from '../../internal/modal.vue';
  import { createFormatPainter } from './format-painter';
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
    TiptapImageCropOptions,
    TiptapImageCropError,
  } from './types';

  defineOptions({ name: 'ATiptapEditor' });
  defineSlots<{
    'toolbar-extra'(context: { disabled: boolean; readonly: boolean }): unknown;
    'content-before'(): unknown;
    'content-after'(): unknown;
  }>();

  const props = withDefaults(
    defineProps<{
      additionalExtensions?: Extensions;
      documentAttributes?: Record<string, unknown>;
      showHighlight?: boolean;
      showAudio?: boolean;
      showAttachment?: boolean;
      imageCrop?: TiptapImageCropOptions;
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
      canCreateGroup?: boolean;
      canDeleteFiles?: boolean;
      canMoveFiles?: boolean;
      defaultImageDisplay?: TiptapImageDisplay;
    }>(),
    {
      showHighlight: true,
      showAudio: true,
      showAttachment: true,
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
      canCreateGroup: false,
      canDeleteFiles: false,
      canMoveFiles: false,
      defaultImageDisplay: 'block',
    }
  );

  const emit = defineEmits<{
    (e: 'update:modelValue', value: TiptapEditorValue<F>): void;
    (e: 'change', value: TiptapEditorValue<F>): void;
    (e: 'update:documentAttributes', attributes: Record<string, unknown>): void;
    (e: 'scrollViewportChange', viewport: HTMLElement | null): void;
    (e: 'imageCropError', error: TiptapImageCropError): void;
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
  let emittedHTML: { value: string; body: Fragment } | undefined;
  const readContent = (
    currentEditor: Editor,
    value: unknown,
    phase: TiptapContentError['phase'],
    current?: ReturnType<typeof getPublicDocument>
  ) => {
    if (value === undefined) {
      value = valueFormat === 'json' ? { type: 'doc', content: [] } : '';
    }
    if ((valueFormat === 'html' && typeof value !== 'string') || (valueFormat === 'json' && typeof value === 'string')) {
      emit('contentError', { phase, reason: 'format-mismatch' });
      return null;
    }
    try {
      if (valueFormat === 'html') {
        const attrs = props.documentAttributes ?? {};
        if (current && emittedHTML?.body === currentEditor.state.doc.content && emittedHTML.value === value) {
          // Parsing our own HTML again would collapse whitespace the user just typed.
          return current.type.create(validatedDocumentAttributes(currentEditor, attrs), current.content, current.marks);
        }
        return parseHTMLDocument(currentEditor, value as string, attrs);
      }
      if (props.documentAttributes !== undefined) throw new Error('JSON documents own their root attributes.');
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
  const loadRejected = ref(false);
  const isEditable = computed(() => !loadRejected.value && !interactionDisabled.value && !props.readonly);
  let painterEditor: Editor | undefined;
  const painter = createFormatPainter(
    () => painterEditor,
    () => isEditable.value
  );
  const { active: painterActive, failure: painterFailure } = painter;
  const painterRoot = ref<HTMLElement>();
  const painterHelpVisible = ref(false);
  const editorAttributes = computed(() => ({
    'class': 'a9-tiptap-editor__prose',
    'role': 'textbox',
    'aria-multiline': 'true',
    'aria-label': props.placeholder || t('admin9Ui.tiptapEditor.ariaLabel'),
    'aria-disabled': String(interactionDisabled.value),
    'aria-readonly': String(props.readonly || loadRejected.value),
    'aria-invalid': String(loadRejected.value || Boolean(mergedError.value)),
  }));
  const linkPopupVisible = ref(false);
  let originalLinkBookmark: SelectionBookmark | undefined;
  let appliedLinkBookmark: SelectionBookmark | undefined;
  let linkTarget: { from: number; to: number } | undefined;
  const tablePopupVisible = ref(false);
  const tableRows = ref(1);
  const tableColumns = ref(1);
  const tableTriggerRef = ref<{ $el: HTMLButtonElement }>();
  const tablePickerRef = ref<HTMLElement>();
  const tableSizeLabel = computed(() =>
    t('admin9Ui.tiptapEditor.tableSize', { rows: tableRows.value, columns: tableColumns.value })
  );
  const altPopupVisible = ref(false);
  const mediaMenus = ref({ layout: false, width: false, align: false, more: false });
  const mediaToolbarWidth = ref(1000);
  const closeMediaMenus = () => {
    mediaMenus.value = { layout: false, width: false, align: false, more: false };
  };
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
  const imageCropVisible = ref(false);
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
  const integrityNotices = ref<{ id: string; message: string }[]>([]);
  const addIntegrityNotice = (id: string, message: string) => {
    integrityNotices.value = [...integrityNotices.value.filter((notice) => notice.id !== id), { id, message }];
  };
  const DynamicCharacterLimit = createCharacterLimit(
    () => props.maxLength,
    (notice) =>
      addIntegrityNotice(
        'limit',
        t(`admin9Ui.tiptapEditor.${notice.kind === 'partial' ? 'pastePartial' : 'pasteRejected'}`, {
          limit: notice.limit.toLocaleString(),
        })
      )
  );
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
    parseHTML() {
      return [
        { tag: 'table' },
        { tag: 'tbody', skip: true },
        { tag: 'thead', skip: true },
        { tag: 'tfoot', skip: true },
        { tag: 'colgroup', ignore: true },
      ];
    },
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
  const cropper = ref<AImageCropperExposed>();
  const cropCommitPending = ref(false);
  const cropPhase = ref<'idle' | 'read' | 'preview' | 'commit'>('idle');
  const cropFailure = ref<TiptapImageCropError>();
  const cropFailureMessage = computed(() => {
    const phase = cropFailure.value?.phase;
    if (phase === 'read') return t('admin9Ui.tiptapEditor.cropReadFailed');
    if (phase === 'upload') return t('admin9Ui.tiptapEditor.cropUploadFailed');
    return t('admin9Ui.tiptapEditor.cropApplyFailed');
  });
  const cropCanRetry = ref(false);
  const withCropState = (state: TiptapImageUploadState): TiptapImageUploadState => ({
    ...state,
    cropCommitPending: cropCommitPending.value,
    canSave: state.canSave && !cropCommitPending.value,
  });
  const uploads = createImageUploads({
    editor: () => uploadEditor,
    service: () => resolvedFileService.value,
    enabled: () => isEditable.value && props.canUploadImage && typeof resolvedFileService.value?.upload === 'function',
    display: () => props.defaultImageDisplay,
    t: (key) => t(`admin9Ui.tiptapEditor.${key}`),
    state: (state) => emit('imageUploadStateChange', withCropState(state)),
    error: (error) => {
      emit('imageUploadError', error);
      let key = 'uploadFailed';
      if (error.reason === 'upload-unavailable') key = 'uploadUnavailable';
      if (error.reason === 'unsupported-image') key = 'unsupportedImageUpload';
      Message.error(t(`admin9Ui.tiptapEditor.${key}`));
    },
  });
  const cropEnabled = computed(
    () =>
      isEditable.value &&
      props.canUploadImage &&
      Boolean(props.imageCrop) &&
      typeof resolvedFileService.value?.upload === 'function'
  );
  const imageCrop = createEditorImageCrop({
    getEditor: () => uploadEditor,
    editable: () => cropEnabled.value,
    config: () => props.imageCrop,
    service: () => resolvedFileService.value,
    closePreview: () => cropper.value?.cancel(),
    crop: (file) => cropper.value?.open(file) ?? Promise.resolve(null),
    onState: (pending) => {
      cropCommitPending.value = pending;
      emit('imageUploadStateChange', withCropState(uploads.state()));
    },
    onPhase: (phase) => {
      cropPhase.value = phase;
      if (phase !== 'idle') cropFailure.value = undefined;
    },
    onRetryChange: (available) => {
      cropCanRetry.value = available;
      if (!available) cropFailure.value = undefined;
    },
    onError: (error) => {
      cropFailure.value = error;
      emit('imageCropError', error);
    },
  });
  const cancelImageCrop = () => {
    imageCrop.cancel();
    cropFailure.value = undefined;
  };
  const onCropCommitPending = (pending: boolean) => imageCrop.setCommitPending(pending);
  const publicHTML = (currentEditor: Editor) => {
    const doc = getPublicDocument(currentEditor.state.doc);
    if (isNodeEmpty(doc)) return '';
    const container = document.createElement('div');
    container.append(DOMSerializer.fromSchema(currentEditor.schema).serializeFragment(doc.content));
    return container.innerHTML;
  };
  const builtinExtensions: Extensions = [
    uploads.extension,
    uploads.inlineExtension,
    TextStyle,
    SafeColor,
    SafeFontSize,
    TextFormat,
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
      alignments: ['left', 'center', 'right', 'justify'],
    }),
    TableKit.configure({ table: false }),
    DynamicEditableTable.configure({ cellMinWidth: 120, resizable: true }),
    CharacterCount,
    DynamicCharacterLimit,
    RemoveLeadingEmptyParagraphBeforeMedia,
  ];
  const editor = useEditor({
    content: '',
    onBeforeCreate: ({ editor: currentEditor }) => {
      painterEditor = currentEditor;
      uploadEditor = currentEditor;
      const content = readContent(currentEditor, props.modelValue, 'initial');
      currentEditor.options.content = content?.toJSON() ?? '';
    },
    editable: isEditable.value,
    extensions: [...builtinExtensions, ...validateAdditionalExtensions(props.additionalExtensions ?? [], builtinExtensions)],
    editorProps: {
      transformPastedHTML: (html) => {
        const result = cleanPastedHTML(html);
        if (result.skippedImages) {
          emit('pasteWarning', { reason: 'unsupported-image', count: result.skippedImages });
          addIntegrityNotice('images', t('admin9Ui.tiptapEditor.pasteImagesSkipped', { count: result.skippedImages }));
        }
        return result.html;
      },
      handleClick: (view, pos, event) => {
        if (painterActive.value) return false;
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
      if (loadRejected.value) return;
      let content: string | TiptapDocument;
      if (valueFormat === 'json') content = getDocumentSnapshot(currentEditor.state.doc);
      else {
        content = publicHTML(currentEditor);
        emittedHTML = { value: content, body: currentEditor.state.doc.content };
      }
      const value = content as TiptapEditorValue<F>;
      const changeValue =
        valueFormat === 'json' ? (getDocumentSnapshot(currentEditor.state.doc) as TiptapEditorValue<F>) : value;
      if (valueFormat === 'html') {
        emit('update:documentAttributes', JSON.parse(JSON.stringify(currentEditor.state.doc.attrs)) as Record<string, unknown>);
      }
      emit('update:modelValue', value);
      emit('change', changeValue);
      eventHandlers.value?.onInput?.();
      eventHandlers.value?.onChange?.();
    },
    onSelectionUpdate: ({ editor: currentEditor }) => syncSelectedMedia(currentEditor),
    onTransaction: ({ editor: currentEditor, transaction }) => {
      if (transaction.docChanged) {
        painter.cancel();
        if (linkPopupVisible.value && linkTarget) {
          const from = transaction.mapping.mapResult(linkTarget.from, 1);
          const to = transaction.mapping.mapResult(linkTarget.to, -1);
          const empty = linkTarget.from === linkTarget.to;
          if ((empty && from.deletedAcross) || (!empty && from.pos >= to.pos)) {
            linkPopupVisible.value = false;
            originalLinkBookmark = undefined;
            appliedLinkBookmark = undefined;
            linkTarget = undefined;
          } else {
            originalLinkBookmark = originalLinkBookmark?.map(transaction.mapping);
            appliedLinkBookmark = appliedLinkBookmark?.map(transaction.mapping);
            linkTarget = { from: from.pos, to: empty ? from.pos : to.pos };
          }
        }
      }
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
    onDestroy: () => painter.dispose(),
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
  const audioWidthLabel = (width: TiptapAudioWidth) => t(`admin9Ui.tiptapEditor.${audioWidthLocaleKeys[width]}`);
  const inlineSizeLabel = (size: TiptapInlineImageSize) => t(`admin9Ui.tiptapEditor.${inlineSizeLocaleKeys[size]}`);
  const blockLabel = computed(() => {
    const blocks = editor.value ? selectedTextBlocks(editor.value.state, true) : [];
    const values = new Set(blocks.map(({ node }) => (node.type.name === 'heading' ? `H${node.attrs.level}` : node.type.name)));
    if (values.size > 1) return t('admin9Ui.tiptapEditor.mixedFormat');
    const value = [...values][0] ?? 'paragraph';
    return /^H[1-6]$/.test(value) ? value : t(`admin9Ui.tiptapEditor.${value}`);
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
      const dialogOpen = mediaPickerVisible.value || imageCropVisible.value || altPopupVisible.value;
      bubbleElement.style.visibility = !dialogOpen && getSelectedMediaVisibleRect() ? 'visible' : 'hidden';
      bubbleElement.style.pointerEvents = dialogOpen ? 'none' : '';
      if (dialogOpen) bubbleElement.setAttribute('aria-hidden', 'true');
      else bubbleElement.removeAttribute('aria-hidden');
      bubbleElement.inert = dialogOpen;
    }
  };

  const onMediaPickerVisibleChange = (visible: boolean) => {
    mediaPickerVisible.value = visible;
    if (visible) {
      closeMediaMenus();
      linkPopupVisible.value = false;
      altPopupVisible.value = false;
      videoPickerTooltipVisible.value = false;
      audioPickerTooltipVisible.value = false;
      replacePickerTooltipVisible.value = false;
    }
    updateMediaBubbleVisibility();
  };

  const onImageCropVisibleChange = (visible: boolean) => {
    imageCropVisible.value = visible;
    if (visible) closeMediaMenus();
    updateMediaBubbleVisibility();
  };

  const shouldShowMediaBubble = ({ editor: currentEditor }: { editor: Editor }) => {
    const { selection } = currentEditor.state;
    return (
      currentEditor.isEditable &&
      !mediaPickerVisible.value &&
      !imageCropVisible.value &&
      !altPopupVisible.value &&
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

  const blockMenuVisible = ref(false);
  const toolbarRef = ref<HTMLElement>();
  const toolbarWidth = ref(1000);
  const toolbarWide = computed(() => toolbarWidth.value >= 960);
  const toolbarNarrow = computed(() => toolbarWidth.value < 640);
  const toolbarMenu = ref('');
  const tableActionsVisible = ref(false);
  const linkTriggerRef = ref<{ $el: HTMLButtonElement }>();
  const linkPanelRef = ref<HTMLElement>();
  const attachmentPickerRef = ref<{ open: () => void }>();
  const videoPickerRef = ref<{ open: () => void }>();
  const audioPickerRef = ref<{ open: () => void }>();
  const toolbarOverlayOwner = {};
  let toolbarOverlayDOM: HTMLElement | undefined;
  const closeToolbarOverlays = (except = '', notifyFormats = true) => {
    if (notifyFormats)
      toolbarOverlayDOM?.dispatchEvent(new CustomEvent('a9-editor-overlay-open', { detail: { owner: toolbarOverlayOwner } }));
    if (except !== 'block') blockMenuVisible.value = false;
    if (except !== 'link') linkPopupVisible.value = false;
    if (except !== 'table') tablePopupVisible.value = false;
    if (except !== 'tableActions') tableActionsVisible.value = false;
    if (except !== toolbarMenu.value) toolbarMenu.value = '';
  };
  const setToolbarMenu = (menu: string, visible: boolean) => {
    if (!visible) {
      if (toolbarMenu.value === menu) toolbarMenu.value = '';
      return;
    }
    closeToolbarOverlays(menu);
    toolbarMenu.value = menu;
  };
  const openFormatOverlay = () => closeToolbarOverlays('', false);
  const onOtherToolbarOverlay = (event: Event) => {
    if ((event as CustomEvent<{ owner: unknown }>).detail.owner !== toolbarOverlayOwner) openFormatOverlay();
  };
  watch(editor, (current) => {
    toolbarOverlayDOM?.removeEventListener('a9-editor-overlay-open', onOtherToolbarOverlay);
    toolbarOverlayDOM = current && !current.isDestroyed ? current.view.dom : undefined;
    toolbarOverlayDOM?.addEventListener('a9-editor-overlay-open', onOtherToolbarOverlay);
  });
  onBeforeUnmount(() => toolbarOverlayDOM?.removeEventListener('a9-editor-overlay-open', onOtherToolbarOverlay));
  const finishToolbarAction = () => {
    closeToolbarOverlays();
    if (isEditable.value) editor.value?.commands.focus();
  };
  const preserveToolbarSelection = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest('button')) event.preventDefault();
  };
  const mediaAlignLabel = (align: string) => t(`admin9Ui.tiptapEditor.align${align.charAt(0).toUpperCase()}${align.slice(1)}`);
  const textAlignments = ['default', 'left', 'center', 'right', 'justify'];
  const canAlignText = computed(() => Boolean(editor.value && selectedTextBlocks(editor.value.state).length));
  const alignmentState = computed(() => {
    const blocks = editor.value ? selectedTextBlocks(editor.value.state) : [];
    const values = new Set(blocks.map(({ node }) => node.attrs.textAlign ?? 'default'));
    return values.size > 1 ? 'mixed' : [...values][0] ?? 'unavailable';
  });
  const textAlignmentLabel = (align: string) =>
    align === 'default' ? t('admin9Ui.tiptapEditor.formatDefault') : mediaAlignLabel(align);
  const applyTextAlignment = (align: string) => {
    if (!editor.value || !isEditable.value || !canAlignText.value) return;
    if (alignmentState.value !== align) {
      const chain = editor.value.chain().focus();
      if (align === 'default') chain.unsetTextAlign().run();
      else chain.setTextAlign(align).run();
    }
    finishToolbarAction();
  };
  const summarizeToggle = (values: boolean[], partial = false) => ({
    available: values.length > 0,
    partial,
    pressed: values.some(Boolean) && !values.every(Boolean) ? ('mixed' as const) : values.length > 0 && values.every(Boolean),
  });
  const markState = (name: string) => {
    const state = editor.value?.state;
    if (!state || state.selection instanceof NodeSelection) return summarizeToggle([]);
    const type = state.schema.marks[name];
    const allows = (parent: typeof state.doc, marks: typeof state.doc.marks) =>
      Boolean(type && !parent.type.spec.code && !marks.some((mark) => mark.type.spec.code) && parent.type.allowsMarkType(type));
    if (state.selection.empty) {
      const marks = state.storedMarks ?? state.selection.$from.marks();
      return summarizeToggle(allows(state.selection.$from.parent, marks) ? [marks.some((mark) => mark.type === type)] : []);
    }
    const values: boolean[] = [];
    let excluded = false;
    state.selection.ranges.forEach(({ $from, $to }) => {
      state.doc.nodesBetween($from.pos, $to.pos, (node, pos, parent) => {
        if (!node.isText || !parent || pos >= $to.pos) return;
        if (allows(parent, node.marks)) values.push(node.marks.some((mark) => mark.type === type));
        else excluded = true;
      });
    });
    return summarizeToggle(values, excluded && values.length > 0);
  };
  const paragraphState = (name: string) => {
    const state = editor.value?.state;
    if (!state) return summarizeToggle([]);
    const blocks = selectedTextBlocks(state);
    const values = blocks.map(({ pos }) => {
      const resolved = state.doc.resolve(pos + 1);
      for (let depth = resolved.depth - 1; depth > 0; depth -= 1) {
        if (resolved.node(depth).type.name === name) return true;
      }
      return false;
    });
    return summarizeToggle(values, selectedTextBlocks(state, true).length > blocks.length);
  };
  const toggleDescription = (state: ReturnType<typeof summarizeToggle>, block = false) => {
    if (!state.available) return t(`admin9Ui.tiptapEditor.${block ? 'textBlockOnly' : 'textFormatUnavailable'}`);
    const descriptions = [];
    if (state.pressed === 'mixed') descriptions.push(t('admin9Ui.tiptapEditor.mixedFormat'));
    if (state.partial) descriptions.push(t(`admin9Ui.tiptapEditor.${block ? 'partialBlockFormat' : 'partialTextFormat'}`));
    return descriptions.join(' · ') || undefined;
  };
  const toggleTextMark = (mark: string) => {
    if (!editor.value || !isEditable.value || !markState(mark).available) return;
    const chain = editor.value.chain().focus();
    if (markState(mark).pressed === true) chain.unsetMark(mark).run();
    else chain.setMark(mark).run();
    finishToolbarAction();
  };
  const toggleParagraph = (kind: string) => {
    if (!editor.value || !isEditable.value) return;
    const blocks = selectedTextBlocks(editor.value.state);
    if (!blocks.length) return;
    const inside = (doc: typeof editor.value.state.doc, pos: number) => {
      const resolved = doc.resolve(pos + 1);
      for (let depth = resolved.depth - 1; depth > 0; depth -= 1) {
        if (resolved.node(depth).type.name === kind) return true;
      }
      return false;
    };
    const currentDocument = editor.value.state.doc;
    const enable = !blocks.every(({ pos }) => inside(currentDocument, pos));
    editor.value
      .chain()
      .focus()
      .command(({ tr, chain }) => {
        const original = tr.selection;
        const start = tr.steps.length;
        [...blocks].reverse().forEach(({ pos }) => {
          const mapped = tr.mapping.slice(start).map(pos);
          const node = tr.doc.nodeAt(mapped);
          if (!node?.isTextblock || inside(tr.doc, mapped) === enable) return;
          const command = chain().setTextSelection({ from: mapped + 1, to: mapped + node.nodeSize - 1 });
          if (kind === 'blockquote') command.toggleBlockquote().run();
          else if (kind === 'bulletList') command.toggleBulletList().run();
          else command.toggleOrderedList().run();
        });
        tr.setSelection(original.map(tr.doc, tr.mapping.slice(start)));
        return true;
      })
      .run();
    finishToolbarAction();
  };
  const togglePainter = () => {
    if (!painterActive.value && !markState('bold').available) return;
    closeToolbarOverlays();
    editor.value?.commands.focus();
    painter.toggle();
  };
  const insertHorizontalRule = () => {
    editor.value?.chain().focus().setHorizontalRule().run();
    finishToolbarAction();
  };
  const openInsertPicker = async (kind: 'attachment' | 'video' | 'audio') => {
    if (!isEditable.value) return;
    closeToolbarOverlays();
    await nextTick();
    ({ attachment: attachmentPickerRef, video: videoPickerRef, audio: audioPickerRef })[kind].value?.open();
  };
  const focusTableTrigger = () => {
    const trigger = toolbarNarrow.value
      ? toolbarRef.value?.querySelector<HTMLButtonElement>('[data-toolbar-menu="insert"] button')
      : tableTriggerRef.value?.$el;
    trigger?.focus({ preventScroll: true });
  };
  watch(blockMenuVisible, (visible) => {
    if (visible) closeToolbarOverlays('block');
  });
  watch(linkPopupVisible, async (visible) => {
    if (!visible) return;
    closeToolbarOverlays('link');
    await nextTick();
    if (linkPopupVisible.value) linkPanelRef.value?.querySelector<HTMLInputElement>('input')?.focus();
  });
  watch(tableActionsVisible, (visible) => {
    if (visible) closeToolbarOverlays('tableActions');
    else if (toolbarNarrow.value && document.activeElement?.classList.contains('a9-table-anchor')) focusTableTrigger();
  });
  watch(
    [toolbarRef, painterRoot],
    ([element, root], _old, cleanup) => {
      if (!element || !root) return;
      const measure = () => {
        const width = root.getBoundingClientRect().width || element.clientWidth;
        if (width > 0) toolbarWidth.value = width;
      };
      const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
      observer?.observe(root);
      observer?.observe(element);
      window.addEventListener('resize', measure);
      measure();
      cleanup(() => {
        observer?.disconnect();
        window.removeEventListener('resize', measure);
      });
    },
    { flush: 'post' }
  );
  watch([toolbarWide, toolbarNarrow, () => editor.value?.isActive('table')], async () => {
    closeToolbarOverlays();
    await nextTick();
    toolbarRef.value?.querySelectorAll<HTMLButtonElement>('.a9-toolbar-table-trigger').forEach((button) => {
      button.tabIndex = toolbarNarrow.value ? -1 : 0;
      if (toolbarNarrow.value) button.setAttribute('aria-hidden', 'true');
      else button.removeAttribute('aria-hidden');
    });
  });

  const textFormatRevision = ref(0);
  const blockOptions = computed(() => {
    const currentEditor = editor.value;
    const state = currentEditor?.state;
    const blocks = state ? selectedTextBlocks(state, true) : [];
    return [0, 1, 2, 3].map((level) => {
      const name = level ? 'heading' : 'paragraph';
      const type = currentEditor?.schema.nodes[name];
      return {
        level,
        label: t(`admin9Ui.tiptapEditor.${level ? `heading${level}` : 'paragraph'}`),
        disabled: !state || !type || !blocks.some((block) => canConvertTextBlock(state.doc, block, type)),
        active:
          blocks.length > 0 && blocks.every(({ node }) => node.type.name === name && (!level || node.attrs.level === level)),
      };
    });
  });
  const setBlock = (level: number) => {
    if (!editor.value || !isEditable.value || ![0, 1, 2, 3].includes(level)) return;
    blockMenuVisible.value = false;
    const type = editor.value.schema.nodes[level ? 'heading' : 'paragraph'];
    editor.value
      .chain()
      .focus()
      .command(({ tr }) => convertSelectedTextBlocks(tr, type, level ? { level } : {}))
      .run();
  };

  const tableActions = computed(() => [
    { value: 'add-row-before', label: 'addRowBefore' },
    { value: 'add-row-after', label: 'addRowAfter' },
    { value: 'delete-row', label: 'deleteRow' },
    { value: 'add-column-before', label: 'addColumnBefore' },
    { value: 'add-column-after', label: 'addColumnAfter' },
    { value: 'delete-column', label: 'deleteColumn' },
    { value: 'toggle-header-row', label: 'toggleHeaderRow' },
    { value: 'merge-cells', label: 'mergeCells', disabled: !editor.value?.can().mergeCells() },
    { value: 'split-cell', label: 'splitCell', disabled: !editor.value?.can().splitCell() },
    { value: 'delete-table', label: 'deleteTable' },
  ]);
  const runTableAction = (value: string | number | Record<string, unknown> | undefined) => {
    if (!editor.value || !isEditable.value || typeof value !== 'string') return;

    const chain = editor.value.chain().focus();
    tableActionsVisible.value = false;
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
  const canClearText = computed(() =>
    Boolean(
      editor.value && !(editor.value.state.selection instanceof NodeSelection) && selectedTextBlocks(editor.value.state).length
    )
  );
  const clearTextFormat = () => {
    if (!editor.value || !isEditable.value || !canClearText.value) return;
    const chain = editor.value.chain().focus();
    ['bold', 'italic', 'underline', 'strike', 'code', 'textStyle', 'highlight'].forEach((mark) => {
      if (editor.value?.schema.marks[mark]) chain.unsetMark(mark);
    });
    chain.run();
    finishToolbarAction();
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
  const openNarrowTable = async () => {
    closeToolbarOverlays();
    await nextTick();
    if (editor.value?.isActive('table')) tableActionsVisible.value = true;
    else await focusTablePicker();
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
      focusTableTrigger();
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
    if (visible) {
      closeToolbarOverlays('table');
      previewTable(1, 1);
    }
  });

  const cancelLink = () => {
    if (editor.value && originalLinkBookmark) {
      editor.value.view.dispatch(editor.value.state.tr.setSelection(originalLinkBookmark.resolve(editor.value.state.doc)));
    }
    linkPopupVisible.value = false;
    linkTriggerRef.value?.$el.focus({ preventScroll: true });
  };
  const prepareLink = () => {
    originalLinkBookmark = editor.value?.state.selection.getBookmark();
    editor.value?.commands.extendMarkRange('link');
    linkHref.value = String(editor.value?.getAttributes('link').href ?? '');
    const selection = editor.value?.state.selection;
    appliedLinkBookmark = selection?.getBookmark();
    linkTarget = selection ? { from: selection.from, to: selection.to } : undefined;
    initialLinkSelectionEmpty.value = selection?.empty ?? true;
    linkText.value = selection ? editor.value?.state.doc.textBetween(selection.from, selection.to, ' ') ?? '' : '';
    initialLinkText.value = linkText.value;
  };
  const applyLink = () => {
    if (!editor.value || !isEditable.value) return;
    const href = linkHref.value.trim();
    if (!appliedLinkBookmark) return;
    const bookmark = appliedLinkBookmark;
    const chain = editor.value
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setSelection(bookmark.resolve(tr.doc));
        return true;
      });
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
    if (!appliedLinkBookmark) return;
    const bookmark = appliedLinkBookmark;
    editor.value
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setSelection(bookmark.resolve(tr.doc));
        return true;
      })
      .unsetLink()
      .run();
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

  const openAltText = () => {
    closeMediaMenus();
    altPopupVisible.value = true;
  };
  const restoreMediaFocus = () => {
    const currentEditor = editor.value;
    if (isEditable.value && currentEditor && !currentEditor.isDestroyed) currentEditor.view.focus();
  };
  const applyAltText = () => {
    updateSelectedMedia({ alt: altDraft.value.trim() });
    altPopupVisible.value = false;
  };

  const deleteSelectedMedia = () => {
    closeMediaMenus();
    const current = getSelectedNode();
    if (!editor.value || !current || !isEditable.value) return;
    const transaction = editor.value.state.tr.delete(current.pos, current.pos + current.node.nodeSize);
    transaction.setSelection(Selection.near(transaction.doc.resolve(Math.min(current.pos, transaction.doc.content.size))));
    editor.value.view.dispatch(transaction);
    restoreMediaFocus();
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

  const mediaSizeLabel = computed(() => {
    if (selectedMedia.value?.type === 'inlineImage') return t('admin9Ui.tiptapEditor.inlineImageSize');
    if (selectedMedia.value?.type === 'audio') return t('admin9Ui.tiptapEditor.audioWidth');
    return t('admin9Ui.tiptapEditor.mediaWidth');
  });
  const selectedMediaSize = computed(() => {
    const media = selectedMedia.value;
    if (!media) return '';
    if (media.type === 'inlineImage') return inlineSizeLabel(media.attrs.size as TiptapInlineImageSize);
    if (media.type === 'audio') return audioWidthLabel(media.attrs.width as TiptapAudioWidth);
    return media.attrs.width === 'natural' ? t('admin9Ui.tiptapEditor.naturalWidth') : String(media.attrs.width);
  });
  const changeMediaLayout = (type: string) => {
    closeMediaMenus();
    if (selectedMedia.value?.type !== type) convertSelectedImage();
    editor.value?.commands.focus(undefined, { scrollIntoView: false });
  };
  const changeMediaSize = (attrs: Record<string, unknown>) => {
    updateSelectedMedia(attrs);
    closeMediaMenus();
    editor.value?.commands.focus(undefined, { scrollIntoView: false });
  };
  const resetMediaSize = () => {
    resetSelectedMediaSize();
    closeMediaMenus();
    editor.value?.commands.focus(undefined, { scrollIntoView: false });
  };
  const changeMediaAlignment = (align: TiptapMediaAlign) => {
    changeMediaSize({ align });
  };
  watch(altPopupVisible, () => nextTick(updateMediaBubbleVisibility));
  watch(contentRef, (viewport, _previous, cleanup) => {
    if (!viewport || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      if (!viewport.clientWidth) return;
      mediaToolbarWidth.value = Math.max(240, Math.min(viewport.clientWidth, window.innerWidth - 16));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    measure();
    cleanup(() => observer.disconnect());
  });
  const focus = () => editor.value?.commands.focus();
  const clear = () => {
    closeToolbarOverlays();
    integrityNotices.value = [];
    textFormatRevision.value += 1;
    cancelImageCrop();
    painter.cancel();
    uploads.pause();
    return editor.value?.commands.clearContent(true);
  };
  const getHTML = () => (editor.value ? publicHTML(editor.value) : '');
  const getJSON = (): TiptapDocument =>
    editor.value ? getDocumentSnapshot(editor.value.state.doc) : { type: 'doc', content: [{ type: 'paragraph' }] };

  const getImageUploadState = () => withCropState(uploads.state());
  defineExpose<ATiptapEditorExposed>({ cancelImageCrop, focus, clear, getHTML, getJSON, getImageUploadState });

  watch(
    [() => props.modelValue, () => props.documentAttributes, () => props.maxLength],
    ([value, attrs, limit], [oldValue, oldAttrs, previousLimit]) => {
      if (limit !== previousLimit && !loadRejected.value && value === oldValue && attrs === oldAttrs) return;
      if (!editor.value) return;
      const current = getPublicDocument(editor.value.state.doc);
      const content = readContent(editor.value, value, 'update', current);
      if (content === null) {
        closeToolbarOverlays();
        return;
      }
      const unchanged = content.eq(current);
      if (!unchanged) {
        const bodyChanged = !content.content.eq(current.content);
        const { view } = editor.value;
        const before = view.state;
        const { tr } = before;
        if (bodyChanged) tr.replaceWith(0, tr.doc.content.size, content.content);
        Object.keys(content.attrs).forEach((name) => tr.setDocAttribute(name, content.attrs[name]));
        view.dispatch(tr.setMeta('addToHistory', false).setMeta('preventUpdate', true));
        if (view.state === before) {
          loadRejected.value = true;
          emit('contentError', { phase: 'update', reason: 'transaction-rejected' });
          return;
        }
        if (bodyChanged) {
          // A replacement body starts a new undo/redo history, including root attributes.
          if (undoDepth(view.state) || redoDepth(view.state)) {
            const { key } = history().spec;
            const plugin = key?.get(view.state);
            if (key && plugin) {
              const plugins = [...view.state.plugins];
              editor.value.unregisterPlugin(key);
              editor.value.registerPlugin(plugin, () => plugins);
            }
          }
          closeToolbarOverlays();
          integrityNotices.value = [];
          originalLinkBookmark = undefined;
          appliedLinkBookmark = undefined;
          linkTarget = undefined;
          textFormatRevision.value += 1;
          cancelImageCrop();
          uploads.pause();
          closeMediaMenus();
          altPopupVisible.value = false;
        }
        if (!isEditable.value) {
          clearNodeSelection(editor.value);
          selectedMedia.value = undefined;
        }
      }
      loadRejected.value = false;
    },
    { deep: true, flush: 'post' }
  );
  watch(contentRef, (viewport) => emit('scrollViewportChange', viewport ?? null), { flush: 'post' });
  onBeforeUnmount(() => emit('scrollViewportChange', null));
  watch(editorAttributes, (attributes) => {
    editor.value?.setOptions({ editorProps: { attributes } });
  });
  watch(isEditable, (value) => {
    if (!value) cancelImageCrop();
    if (!value) painter.cancel();
    if (!value) uploads.pause();
    if (!value) closeToolbarOverlays();
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
    closeMediaMenus();
    nextTick(() => {
      const currentEditor = editor.value;
      if (!selectedMedia.value || !currentEditor || currentEditor.isDestroyed) return;
      updateMediaBubbleVisibility();
      currentEditor.view.dispatch(currentEditor.state.tr.setMeta('a9TiptapMediaBubbleMenu', 'updatePosition'));
    });
  });
  onMounted(() => {
    if (painterRoot.value) painter.bind(painterRoot.value);
    bubbleMenuReady.value = true;
    uploads.sync();
  });
  watch([resolvedFileService, () => props.canUploadImage], () => uploads.pause());
  watch([resolvedFileService, () => props.canUploadImage, () => props.imageCrop], cancelImageCrop);
  onBeforeUnmount(cancelImageCrop);
  onBeforeUnmount(() => uploads.dispose());
  onBeforeUnmount(() => painter.dispose());
  onDeactivated(() => {
    painter.cancel();
    cancelImageCrop();
    closeToolbarOverlays();
  });
</script>

<template>
  <div
    ref="painterRoot"
    class="a9-tiptap-editor"
    :class="{
      'is-disabled': interactionDisabled,
      'is-error': mergedError,
      'is-readonly': props.readonly,
      'is-focused': isFocused,
      'is-compact': mediaToolbarWidth < 560,
    }"
    :style="editorStyle"
  >
    <FormItem no-style :disabled="interactionDisabled" :validate-trigger="[]">
      <div
        v-if="!readonly"
        ref="toolbarRef"
        class="a9-tiptap-editor__toolbar"
        :class="{ 'is-wide': toolbarWide, 'is-medium': !toolbarWide && !toolbarNarrow, 'is-narrow': toolbarNarrow }"
        role="toolbar"
        :aria-label="t('admin9Ui.tiptapEditor.toolbar')"
        @mousedown="preserveToolbarSelection"
      >
        <div class="a9-tiptap-editor__toolbar-blocks a9-tiptap-editor__tool-group">
          <MediaActionMenu
            v-model:visible="blockMenuVisible"
            :label="blockLabel"
            :disabled="interactionDisabled"
            :unavailable="blockOptions.every((option) => option.disabled)"
            :description="
              blockOptions.every((option) => option.disabled) ? t('admin9Ui.tiptapEditor.textBlockOnly') : undefined
            "
            button-class="a9-tiptap-editor__block-menu"
          >
            <template #trigger>{{ blockLabel }}</template>
            <a-button
              v-for="option in blockOptions"
              :key="option.level"
              type="text"
              role="menuitemradio"
              :aria-checked="option.active"
              :disabled="option.disabled"
              :title="option.disabled ? t('admin9Ui.tiptapEditor.blockConversionUnavailable') : undefined"
              @click="setBlock(option.level)"
            >
              {{ option.label }}
            </a-button>
          </MediaActionMenu>
          <TextFormatToolbar
            :key="`${textFormatRevision}-size`"
            :editor="editor"
            :disabled="interactionDisabled"
            :show-highlight="props.showHighlight"
            section="size"
            :embedded="false"
            @open="openFormatOverlay"
            @apply="finishToolbarAction"
          />
        </div>
        <div class="a9-tiptap-editor__toolbar-basic a9-tiptap-editor__tool-group">
          <ToolbarTooltip :content="t('admin9Ui.tiptapEditor.bold')">
            <a-button
              size="small"
              :type="markState('bold').pressed === true ? 'primary' : 'text'"
              :disabled="interactionDisabled"
              :aria-label="t('admin9Ui.tiptapEditor.bold')"
              :aria-pressed="markState('bold').pressed"
              :aria-disabled="interactionDisabled || !markState('bold').available"
              :aria-description="toggleDescription(markState('bold'))"
              :title="toggleDescription(markState('bold'))"
              @click="toggleTextMark('bold')"
            >
              <template #icon><icon-bold /></template
              ><span v-if="markState('bold').pressed === 'mixed'" class="a9-toolbar-mixed" aria-hidden="true">−</span>
            </a-button>
          </ToolbarTooltip>
          <ToolbarTooltip :content="t('admin9Ui.tiptapEditor.italic')">
            <a-button
              size="small"
              :type="markState('italic').pressed === true ? 'primary' : 'text'"
              :disabled="interactionDisabled"
              :aria-label="t('admin9Ui.tiptapEditor.italic')"
              :aria-pressed="markState('italic').pressed"
              :aria-disabled="interactionDisabled || !markState('italic').available"
              :aria-description="toggleDescription(markState('italic'))"
              :title="toggleDescription(markState('italic'))"
              @click="toggleTextMark('italic')"
            >
              <template #icon><icon-italic /></template
              ><span v-if="markState('italic').pressed === 'mixed'" class="a9-toolbar-mixed" aria-hidden="true">−</span>
            </a-button>
          </ToolbarTooltip>
          <ToolbarTooltip :content="t('admin9Ui.tiptapEditor.underline')">
            <a-button
              size="small"
              :type="markState('underline').pressed === true ? 'primary' : 'text'"
              :disabled="interactionDisabled"
              :aria-label="t('admin9Ui.tiptapEditor.underline')"
              :aria-pressed="markState('underline').pressed"
              :aria-disabled="interactionDisabled || !markState('underline').available"
              :aria-description="toggleDescription(markState('underline'))"
              :title="toggleDescription(markState('underline'))"
              @click="toggleTextMark('underline')"
            >
              <template #icon><icon-underline /></template
              ><span v-if="markState('underline').pressed === 'mixed'" class="a9-toolbar-mixed" aria-hidden="true">−</span>
            </a-button>
          </ToolbarTooltip>
          <a-tooltip v-if="toolbarWide" :content="t('admin9Ui.tiptapEditor.strike')">
            <a-button
              size="small"
              :type="markState('strike').pressed === true ? 'primary' : 'text'"
              :disabled="interactionDisabled"
              :aria-label="t('admin9Ui.tiptapEditor.strike')"
              :aria-pressed="markState('strike').pressed"
              :aria-disabled="interactionDisabled || !markState('strike').available"
              :aria-description="toggleDescription(markState('strike'))"
              :title="toggleDescription(markState('strike'))"
              @click="toggleTextMark('strike')"
            >
              <template #icon><icon-strikethrough /></template
              ><span v-if="markState('strike').pressed === 'mixed'" class="a9-toolbar-mixed" aria-hidden="true">−</span>
              <span v-if="!toolbarWide">{{ t('admin9Ui.tiptapEditor.strike') }}</span></a-button
            >
          </a-tooltip>
          <TextFormatToolbar
            :key="`${textFormatRevision}-colors`"
            :editor="editor"
            :disabled="interactionDisabled"
            :show-highlight="props.showHighlight"
            section="colors"
            :embedded="false"
            @open="openFormatOverlay"
            @apply="finishToolbarAction"
          />
        </div>
        <div class="a9-tiptap-editor__toolbar-text a9-tiptap-editor__tool-group">
          <ToolbarGroup
            :collapsed="!toolbarWide"
            :visible="toolbarMenu === 'text'"
            :label="t('admin9Ui.tiptapEditor.textMenu')"
            :disabled="interactionDisabled"
            @update:visible="setToolbarMenu('text', $event)"
          >
            <a-tooltip v-if="!toolbarWide" :content="t('admin9Ui.tiptapEditor.strike')">
              <a-button
                size="small"
                :type="markState('strike').pressed === true ? 'primary' : 'text'"
                :disabled="interactionDisabled"
                :aria-label="t('admin9Ui.tiptapEditor.strike')"
                :aria-pressed="markState('strike').pressed"
                :aria-disabled="interactionDisabled || !markState('strike').available"
                :aria-description="toggleDescription(markState('strike'))"
                :title="toggleDescription(markState('strike'))"
                @click="toggleTextMark('strike')"
              >
                <template #icon><icon-strikethrough /></template
                ><span v-if="markState('strike').pressed === 'mixed'" class="a9-toolbar-mixed" aria-hidden="true">−</span>
                <span v-if="!toolbarWide">{{ t('admin9Ui.tiptapEditor.strike') }}</span></a-button
              >
            </a-tooltip>
            <ToolbarTooltip :content="t('admin9Ui.tiptapEditor.formatPainter')">
              <a-button
                data-format-painter
                size="small"
                :type="painterActive ? 'primary' : 'text'"
                :disabled="interactionDisabled"
                :aria-label="t('admin9Ui.tiptapEditor.formatPainter')"
                :aria-pressed="painterActive"
                :aria-disabled="interactionDisabled || (!painterActive && !markState('bold').available)"
                :title="!markState('bold').available ? t('admin9Ui.tiptapEditor.textFormatUnavailable') : undefined"
                @mousedown.prevent
                @click="togglePainter"
              >
                <template #icon><icon-brush /></template>
                <span v-if="!toolbarWide">{{ t('admin9Ui.tiptapEditor.formatPainter') }}</span></a-button
              >
            </ToolbarTooltip>

            <ToolbarTooltip :content="t('admin9Ui.tiptapEditor.clearFormat')">
              <a-button
                size="small"
                type="text"
                :disabled="interactionDisabled"
                :aria-label="t('admin9Ui.tiptapEditor.clearFormat')"
                :aria-disabled="interactionDisabled || !canClearText"
                :title="!canClearText ? t('admin9Ui.tiptapEditor.textFormatUnavailable') : undefined"
                @mousedown.prevent
                @click="clearTextFormat"
              >
                <template #icon><icon-eraser /></template>
                <span v-if="!toolbarWide">{{ t('admin9Ui.tiptapEditor.clearFormat') }}</span></a-button
              >
            </ToolbarTooltip>
          </ToolbarGroup>
        </div>
        <div class="a9-tiptap-editor__toolbar-paragraph a9-tiptap-editor__tool-group">
          <ToolbarGroup
            :collapsed="toolbarNarrow"
            :visible="toolbarMenu === 'paragraph'"
            :label="t('admin9Ui.tiptapEditor.paragraphMenu')"
            :disabled="interactionDisabled"
            @update:visible="setToolbarMenu('paragraph', $event)"
          >
            <ToolbarGroup
              class="a9-tiptap-editor__alignment"
              :collapsed="!toolbarNarrow"
              :visible="toolbarMenu === 'align'"
              :label="t('admin9Ui.tiptapEditor.alignmentTools')"
              :disabled="interactionDisabled"
              @update:visible="setToolbarMenu('align', $event)"
            >
              <template #trigger
                ><icon-align-left /><span v-if="alignmentState === 'mixed'" class="a9-toolbar-mixed" aria-hidden="true"
                  >−</span
                ></template
              >
              <a-button
                v-for="align in textAlignments"
                :key="align"
                size="small"
                type="text"
                role="menuitemradio"
                :aria-label="textAlignmentLabel(align)"
                :aria-checked="alignmentState === align"
                :aria-disabled="!canAlignText"
                :title="!canAlignText ? t('admin9Ui.tiptapEditor.textBlockOnly') : undefined"
                :disabled="interactionDisabled"
                @mousedown.prevent
                @click="applyTextAlignment(align)"
                >{{ textAlignmentLabel(align) }}</a-button
              >
            </ToolbarGroup>
            <ToolbarTooltip :content="t('admin9Ui.tiptapEditor.bulletList')">
              <a-button
                size="small"
                :type="paragraphState('bulletList').pressed === true ? 'primary' : 'text'"
                :disabled="interactionDisabled"
                :aria-label="t('admin9Ui.tiptapEditor.bulletList')"
                :aria-pressed="paragraphState('bulletList').pressed"
                :aria-disabled="interactionDisabled || !paragraphState('bulletList').available"
                :aria-description="toggleDescription(paragraphState('bulletList'), true)"
                :title="toggleDescription(paragraphState('bulletList'), true)"
                @click="toggleParagraph('bulletList')"
              >
                <template #icon
                  ><icon-unordered-list /><span
                    v-if="paragraphState('bulletList').pressed === 'mixed'"
                    class="a9-toolbar-mixed"
                    aria-hidden="true"
                    >−</span
                  ></template
                ><span v-if="toolbarNarrow">{{ t('admin9Ui.tiptapEditor.bulletList') }}</span>
              </a-button>
            </ToolbarTooltip>
            <ToolbarTooltip :content="t('admin9Ui.tiptapEditor.orderedList')">
              <a-button
                size="small"
                :type="paragraphState('orderedList').pressed === true ? 'primary' : 'text'"
                :disabled="interactionDisabled"
                :aria-label="t('admin9Ui.tiptapEditor.orderedList')"
                :aria-pressed="paragraphState('orderedList').pressed"
                :aria-disabled="interactionDisabled || !paragraphState('orderedList').available"
                :aria-description="toggleDescription(paragraphState('orderedList'), true)"
                :title="toggleDescription(paragraphState('orderedList'), true)"
                @click="toggleParagraph('orderedList')"
              >
                <template #icon
                  ><icon-ordered-list /><span
                    v-if="paragraphState('orderedList').pressed === 'mixed'"
                    class="a9-toolbar-mixed"
                    aria-hidden="true"
                    >−</span
                  ></template
                ><span v-if="toolbarNarrow">{{ t('admin9Ui.tiptapEditor.orderedList') }}</span>
              </a-button>
            </ToolbarTooltip>
            <ToolbarTooltip :content="t('admin9Ui.tiptapEditor.blockquote')">
              <a-button
                size="small"
                :type="paragraphState('blockquote').pressed === true ? 'primary' : 'text'"
                :disabled="interactionDisabled"
                :aria-label="t('admin9Ui.tiptapEditor.blockquote')"
                :aria-pressed="paragraphState('blockquote').pressed"
                :aria-disabled="interactionDisabled || !paragraphState('blockquote').available"
                :aria-description="toggleDescription(paragraphState('blockquote'), true)"
                :title="toggleDescription(paragraphState('blockquote'), true)"
                @click="toggleParagraph('blockquote')"
              >
                <template #icon
                  ><icon-quote /><span
                    v-if="paragraphState('blockquote').pressed === 'mixed'"
                    class="a9-toolbar-mixed"
                    aria-hidden="true"
                    >−</span
                  ></template
                ><span v-if="toolbarNarrow">{{ t('admin9Ui.tiptapEditor.blockquote') }}</span>
              </a-button>
            </ToolbarTooltip>

            <ToolbarGroup
              :collapsed="!toolbarNarrow"
              :visible="toolbarMenu === 'spacing'"
              :label="t('admin9Ui.tiptapEditor.typography')"
              :disabled="interactionDisabled"
              @update:visible="setToolbarMenu('spacing', $event)"
              ><div @keydown.up.stop @keydown.down.stop @keydown.home.stop @keydown.end.stop
                ><TextFormatToolbar
                  :key="`${textFormatRevision}-spacing`"
                  :editor="editor"
                  :disabled="interactionDisabled"
                  :show-highlight="props.showHighlight"
                  section="spacing"
                  :embedded="true"
                  @open="openFormatOverlay"
                  @apply="finishToolbarAction" /></div
            ></ToolbarGroup>
          </ToolbarGroup>
        </div>
        <div class="a9-tiptap-editor__toolbar-insert a9-tiptap-editor__tool-group">
          <a-popover v-model:popup-visible="linkPopupVisible" trigger="click" position="bottom" :disabled="interactionDisabled">
            <ToolbarTooltip :content="t('admin9Ui.tiptapEditor.link')">
              <a-button
                ref="linkTriggerRef"
                size="small"
                :type="editor?.isActive('link') ? 'primary' : 'text'"
                :disabled="interactionDisabled"
                :aria-label="t('admin9Ui.tiptapEditor.link')"
                :aria-pressed="editor?.isActive('link')"
                @click="prepareLink"
              >
                <template #icon><icon-link /></template>
              </a-button>
            </ToolbarTooltip>
            <template #content>
              <div ref="linkPanelRef" class="a9-tiptap-editor__link-panel" @keydown.esc.stop.prevent="cancelLink">
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
                  <a-button size="small" @click="cancelLink">{{ t('admin9Ui.tiptapEditor.cancel') }}</a-button>
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

          <ToolbarTooltip v-if="resolvedFileService" :content="t('admin9Ui.tiptapEditor.image')">
            <AFilePicker
              v-model="imagePickerValue"
              class="a9-tiptap-editor__media-picker"
              data-media-type="image"
              :file-types="['image']"
              :service="resolvedFileService"
              :can-upload="canUploadImage"
              :can-create-group="props.canCreateGroup"
              :can-delete-files="props.canDeleteFiles"
              :can-move-files="props.canMoveFiles"
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
          </ToolbarTooltip>

          <a-popover
            v-if="!editor?.isActive('table')"
            v-model:popup-visible="tablePopupVisible"
            trigger="click"
            position="bottom"
            :disabled="interactionDisabled"
          >
            <a-button
              ref="tableTriggerRef"
              :class="{ 'a9-table-anchor': toolbarNarrow }"
              :tabindex="toolbarNarrow ? -1 : 0"
              :aria-hidden="toolbarNarrow || undefined"
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
          <MediaActionMenu
            v-else
            :visible="tableActionsVisible"
            :label="t('admin9Ui.tiptapEditor.table')"
            :disabled="interactionDisabled"
            :button-class="toolbarNarrow ? 'a9-toolbar-table-trigger a9-table-anchor' : 'a9-toolbar-table-trigger'"
            icon-only
            @update:visible="tableActionsVisible = $event"
          >
            <template #trigger><icon-apps /></template>
            <a-button
              v-for="action in tableActions"
              :key="action.value"
              type="text"
              role="menuitem"
              :disabled="action.disabled"
              @click="runTableAction(action.value)"
              >{{ t(`admin9Ui.tiptapEditor.${action.label}`) }}</a-button
            >
          </MediaActionMenu>
          <ToolbarGroup
            collapsed
            data-toolbar-menu="insert"
            :visible="toolbarMenu === 'insert'"
            :label="t('admin9Ui.tiptapEditor.insertMenu')"
            :disabled="interactionDisabled"
            @update:visible="setToolbarMenu('insert', $event)"
          >
            <a-button
              v-if="resolvedFileService && props.showAttachment"
              type="text"
              role="menuitem"
              :aria-label="t('admin9Ui.tiptapEditor.attachment')"
              @click="openInsertPicker('attachment')"
              >{{ t('admin9Ui.tiptapEditor.attachment') }}</a-button
            >
            <a-button
              v-if="resolvedFileService"
              type="text"
              role="menuitem"
              :aria-label="t('admin9Ui.tiptapEditor.video')"
              @click="openInsertPicker('video')"
              >{{ t('admin9Ui.tiptapEditor.video') }}</a-button
            >
            <a-button
              v-if="resolvedFileService && props.showAudio"
              type="text"
              role="menuitem"
              :aria-label="t('admin9Ui.tiptapEditor.audio')"
              @click="openInsertPicker('audio')"
              >{{ t('admin9Ui.tiptapEditor.audio') }}</a-button
            >
            <a-button
              type="text"
              role="menuitem"
              :aria-label="t('admin9Ui.tiptapEditor.horizontalRule')"
              @click="insertHorizontalRule"
              >{{ t('admin9Ui.tiptapEditor.horizontalRule') }}</a-button
            >
            <a-button
              v-if="toolbarNarrow"
              type="text"
              role="menuitem"
              :aria-label="t('admin9Ui.tiptapEditor.table')"
              @click="openNarrowTable"
              >{{ t('admin9Ui.tiptapEditor.table') }}</a-button
            >
          </ToolbarGroup>
        </div>
        <div v-if="$slots['toolbar-extra']" class="a9-tiptap-editor__toolbar-extra"
          ><slot name="toolbar-extra" :disabled="interactionDisabled" :readonly="props.readonly"
        /></div>
        <div
          class="a9-tiptap-editor__toolbar-history a9-tiptap-editor__tool-group"
          role="group"
          :aria-label="t('admin9Ui.tiptapEditor.historyTools')"
        >
          <ToolbarTooltip :content="t('admin9Ui.tiptapEditor.undo')">
            <a-button
              size="small"
              type="text"
              :disabled="interactionDisabled || !editor?.can().chain().focus().undo().run()"
              :aria-label="t('admin9Ui.tiptapEditor.undo')"
              @click="editor?.chain().focus().undo().run()"
            >
              <template #icon><icon-undo /></template>
            </a-button>
          </ToolbarTooltip>
          <ToolbarTooltip :content="t('admin9Ui.tiptapEditor.redo')">
            <a-button
              size="small"
              type="text"
              :disabled="interactionDisabled || !editor?.can().chain().focus().redo().run()"
              :aria-label="t('admin9Ui.tiptapEditor.redo')"
              @click="editor?.chain().focus().redo().run()"
            >
              <template #icon><icon-redo /></template>
            </a-button>
          </ToolbarTooltip>
        </div>
      </div>
      <div class="a9-tiptap-editor__insert-pickers">
        <AFilePicker
          v-if="resolvedFileService && props.showAttachment"
          ref="attachmentPickerRef"
          v-model="attachmentValue"
          :service="resolvedFileService"
          :file-types="['document', 'archive', 'other']"
          multiple
          :can-upload="props.canUploadAttachment"
          :can-create-group="props.canCreateGroup"
          :can-delete-files="props.canDeleteFiles"
          :can-move-files="props.canMoveFiles"
          @confirm="insertAttachments"
        >
          <template #trigger><span /></template>
        </AFilePicker>

        <a-tooltip
          v-if="resolvedFileService"
          v-model:popup-visible="videoPickerTooltipVisible"
          :content="t('admin9Ui.tiptapEditor.video')"
        >
          <AFilePicker
            ref="videoPickerRef"
            v-model="videoPickerValue"
            class="a9-tiptap-editor__media-picker"
            data-media-type="video"
            :file-types="['video']"
            :service="resolvedFileService"
            :can-upload="canUploadVideo"
            :can-create-group="props.canCreateGroup"
            :can-delete-files="props.canDeleteFiles"
            :can-move-files="props.canMoveFiles"
            @confirm="insertVideosFromPicker"
            @visible-change="onMediaPickerVisibleChange"
          >
            <template #trigger><span /></template>
          </AFilePicker>
        </a-tooltip>

        <a-tooltip
          v-if="resolvedFileService && props.showAudio"
          v-model:popup-visible="audioPickerTooltipVisible"
          :content="t('admin9Ui.tiptapEditor.audio')"
        >
          <AFilePicker
            ref="audioPickerRef"
            v-model="audioPickerValue"
            class="a9-tiptap-editor__media-picker"
            data-media-type="audio"
            :file-types="['audio']"
            :service="resolvedFileService"
            :can-upload="canUploadAudio"
            :can-create-group="props.canCreateGroup"
            :can-delete-files="props.canDeleteFiles"
            :can-move-files="props.canMoveFiles"
            @confirm="insertAudiosFromPicker"
            @visible-change="onMediaPickerVisibleChange"
          >
            <template #trigger><span /></template>
          </AFilePicker>
        </a-tooltip>
      </div>

      <div v-if="!readonly && (painterActive || painterFailure)" class="a9-tiptap-editor__painter" data-format-painter>
        <span role="status" aria-live="polite">{{ t(`admin9Ui.tiptapEditor.painter${painterFailure || 'Hint'}`) }}</span>
        <template v-if="painterActive">
          <a-button size="small" :disabled="interactionDisabled" @mousedown.prevent @click="painter.apply">
            {{ t('admin9Ui.tiptapEditor.painterApply') }}
          </a-button>
          <a-button size="small" @mousedown.prevent @click="togglePainter">
            {{ t('admin9Ui.tiptapEditor.painterCancel') }}
          </a-button>
          <a-popover v-model:popup-visible="painterHelpVisible" trigger="click" position="bottom">
            <a-button size="small" type="text" :aria-label="t('admin9Ui.tiptapEditor.painterHelp')" data-format-painter>
              <template #icon><IconQuestionCircle /></template>
            </a-button>
            <template #content>
              <p class="a9-tiptap-editor__painter-help" data-format-painter>{{
                t('admin9Ui.tiptapEditor.painterInstructions')
              }}</p>
            </template>
          </a-popover>
        </template>
      </div>

      <div
        v-if="!readonly && (cropPhase === 'read' || cropPhase === 'commit' || cropFailure)"
        class="a9-tiptap-editor__crop-status"
        :class="{ 'is-failed': cropFailure }"
      >
        <span :role="cropFailure ? 'alert' : 'status'" aria-live="polite">
          <IconLoading v-if="!cropFailure" class="a9-tiptap-editor__loading-icon" />
          {{
            cropFailure
              ? cropFailureMessage
              : t(`admin9Ui.tiptapEditor.${cropPhase === 'read' ? 'cropReading' : 'cropApplying'}`)
          }}
        </span>
        <a-button v-if="cropFailure && cropCanRetry" size="small" type="text" @click="imageCrop.retry()">
          {{ t(`admin9Ui.tiptapEditor.${cropFailure.phase === 'read' ? 'cropRetryRead' : 'cropRetryEdit'}`) }}
        </a-button>
        <a-button v-if="cropFailure || cropPhase === 'read'" size="small" type="text" @click="cancelImageCrop">
          {{ t(`admin9Ui.tiptapEditor.${cropFailure ? 'dismiss' : 'cancel'}`) }}
        </a-button>
      </div>

      <Modal
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
      </Modal>

      <div
        ref="contentRef"
        class="a9-tiptap-editor__content"
        role="region"
        :aria-label="t('admin9Ui.tiptapEditor.contentArea')"
      >
        <slot name="content-before" />
        <EditorContent :editor="editor" />
        <slot name="content-after" />
      </div>

      <AImageCropper
        v-if="props.imageCrop"
        ref="cropper"
        :crop="props.imageCrop"
        :aspect-ratio-mode="props.imageCrop.aspectRatioMode"
        @visible-change="onImageCropVisibleChange"
        @commit-pending-change="onCropCommitPending"
        @error="emit('imageCropError', { phase: 'crop', cause: $event })"
      />
      <MediaBubbleMenu
        v-if="editor && bubbleMenuReady"
        :editor="editor"
        plugin-key="a9TiptapMediaBubbleMenu"
        class="a9-tiptap-editor__media-bubble"
        :style="{ maxWidth: `${mediaToolbarWidth}px` }"
        :options="mediaBubbleOptions"
        :append-to="appendMediaBubbleToBody"
        :should-show="shouldShowMediaBubble"
        :get-referenced-virtual-element="getMediaBubbleVirtualElement"
        :update-delay="0"
        :resize-delay="0"
      >
        <div
          v-if="selectedMedia && isEditable"
          ref="mediaToolbarRef"
          class="a9-tiptap-editor__media-toolbar"
          role="toolbar"
          :aria-label="t('admin9Ui.tiptapEditor.mediaToolbar')"
          :data-selected-media="selectedMedia.type"
          @mousedown.prevent
        >
          <MediaActionMenu
            v-if="selectedMediaKind === 'image'"
            v-model:visible="mediaMenus.layout"
            :label="t('admin9Ui.tiptapEditor.mediaLayout')"
          >
            <template #trigger>{{ selectedMediaLabel }}</template>
            <a-button
              v-for="type in ['blockImage', 'inlineImage']"
              :key="type"
              type="text"
              role="menuitemradio"
              :aria-checked="selectedMedia.type === type"
              :aria-label="t(`admin9Ui.tiptapEditor.${type === 'blockImage' ? 'convertBlock' : 'convertInline'}`)"
              @click="changeMediaLayout(type)"
            >
              <icon-check v-if="selectedMedia.type === type" />
              {{ t(`admin9Ui.tiptapEditor.${type}`) }}
            </a-button>
          </MediaActionMenu>
          <span v-else class="a9-tiptap-editor__media-toolbar-label">{{ selectedMediaLabel }}</span>

          <MediaActionMenu v-model:visible="mediaMenus.width" :label="mediaSizeLabel">
            <template #trigger>{{ selectedMediaSize }}</template>
            <template v-if="selectedMedia.type === 'blockImage' || selectedMedia.type === 'video'">
              <a-button
                v-for="width in blockWidths"
                :key="width"
                type="text"
                role="menuitemradio"
                :aria-checked="selectedMedia.attrs.width === width"
                :aria-label="width"
                :data-media-width="width"
                @click="changeMediaSize({ width })"
              >
                <icon-check v-if="selectedMedia.attrs.width === width" />{{ width }}
              </a-button>
              <template v-if="canResetSelectedMediaSize">
                <div role="separator" />
                <a-button
                  type="text"
                  role="menuitem"
                  :aria-label="t('admin9Ui.tiptapEditor.resetSize')"
                  data-media-reset-size
                  @click="resetMediaSize"
                >
                  {{ t('admin9Ui.tiptapEditor.resetSize') }}
                </a-button>
              </template>
            </template>
            <template v-else-if="selectedMedia.type === 'inlineImage'">
              <a-button
                v-for="size in inlineSizes"
                :key="size"
                type="text"
                role="menuitemradio"
                :aria-checked="selectedMedia.attrs.size === size"
                :aria-label="inlineSizeLabel(size)"
                :data-media-size="size"
                @click="changeMediaSize({ size })"
              >
                <icon-check v-if="selectedMedia.attrs.size === size" />{{ inlineSizeLabel(size) }}
              </a-button>
            </template>
            <template v-else>
              <a-button
                v-for="width in audioWidths"
                :key="width"
                type="text"
                role="menuitemradio"
                :aria-checked="selectedMedia.attrs.width === width"
                :aria-label="audioWidthLabel(width)"
                :data-media-width="width"
                @click="changeMediaSize({ width })"
              >
                <icon-check v-if="selectedMedia.attrs.width === width" />{{ audioWidthLabel(width) }}
              </a-button>
            </template>
          </MediaActionMenu>

          <a-tooltip v-if="cropEnabled && selectedMediaKind === 'image'" :content="t('admin9Ui.imageCropper.title')">
            <a-button
              size="small"
              type="text"
              :loading="cropPhase === 'read'"
              :disabled="cropPhase !== 'idle'"
              :aria-label="t('admin9Ui.imageCropper.title')"
              @click="imageCrop.start(selectedMedia.pos)"
            >
              <template #icon>
                <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" width="1em" height="1em">
                  <path
                    d="M12 5v27a4 4 0 0 0 4 4h27M5 12h27a4 4 0 0 1 4 4v27"
                    stroke="currentColor"
                    stroke-width="4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </template>
            </a-button>
          </a-tooltip>
          <AFilePicker
            v-if="resolvedFileService"
            v-model="replacementPickerValue"
            class="a9-tiptap-editor__media-picker a9-tiptap-editor__replacement-picker"
            :can-create-group="props.canCreateGroup"
            :can-delete-files="props.canDeleteFiles"
            :can-move-files="props.canMoveFiles"
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
                  size="small"
                  type="text"
                  :disabled="interactionDisabled || pickerDisabled"
                  :aria-label="replaceMediaLabel"
                  @mousedown.prevent
                  @click="open"
                >
                  <template #icon><icon-swap /></template>
                </a-button>
              </a-tooltip>
            </template>
          </AFilePicker>

          <template v-if="selectedMedia.type !== 'inlineImage'">
            <span
              v-if="mediaToolbarWidth >= 560"
              class="a9-tiptap-editor__media-toolbar-group"
              :aria-label="t('admin9Ui.tiptapEditor.mediaAlign')"
            >
              <a-tooltip v-for="align in mediaAlignments" :key="align" :content="mediaAlignLabel(align)">
                <a-button
                  size="small"
                  :type="selectedMedia.attrs.align === align ? 'primary' : 'text'"
                  :aria-label="mediaAlignLabel(align)"
                  :aria-pressed="selectedMedia.attrs.align === align"
                  :data-media-align="align"
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
            <MediaActionMenu v-else v-model:visible="mediaMenus.align" :label="t('admin9Ui.tiptapEditor.mediaAlign')">
              <template #trigger>
                <icon-align-center v-if="selectedMedia.attrs.align === 'center'" />
                <icon-align-right v-else-if="selectedMedia.attrs.align === 'right'" />
                <icon-align-left v-else />
              </template>
              <a-button
                v-for="align in mediaAlignments"
                :key="align"
                type="text"
                role="menuitemradio"
                :aria-checked="selectedMedia.attrs.align === align"
                :data-media-align="align"
                @click="changeMediaAlignment(align)"
              >
                <icon-check v-if="selectedMedia.attrs.align === align" />{{ mediaAlignLabel(align) }}
              </a-button>
            </MediaActionMenu>
          </template>
          <MediaActionMenu v-model:visible="mediaMenus.more" :label="t('admin9Ui.tiptapEditor.moreActions')" icon-only>
            <template #trigger><IconMore /></template>
            <a-button
              v-if="selectedMediaKind === 'image'"
              type="text"
              role="menuitem"
              :aria-label="t('admin9Ui.tiptapEditor.altText')"
              @click="openAltText"
            >
              <icon-edit />{{ t('admin9Ui.tiptapEditor.altText') }}
            </a-button>
            <div v-if="selectedMediaKind === 'image'" role="separator" />
            <a-button type="text" status="danger" role="menuitem" :aria-label="deleteMediaLabel" @click="deleteSelectedMedia">
              <icon-delete />{{ deleteMediaLabel }}
            </a-button>
          </MediaActionMenu>
        </div>
      </MediaBubbleMenu>

      <Modal
        v-model:visible="altPopupVisible"
        :title="t('admin9Ui.tiptapEditor.altText')"
        :ok-text="t('admin9Ui.tiptapEditor.applyAlt')"
        :on-before-ok="applyAltText"
        @close="restoreMediaFocus"
      >
        <a-input
          v-model="altDraft"
          :placeholder="t('admin9Ui.tiptapEditor.altPlaceholder')"
          :aria-label="t('admin9Ui.tiptapEditor.altText')"
          @press-enter="applyAltText"
        />
      </Modal>

      <IntegrityFeedback
        :notices="integrityNotices"
        @dismiss="integrityNotices = integrityNotices.filter((notice) => notice.id !== $event)"
      />
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

  .a9-tiptap-editor__painter {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 8px 12px;
    color: var(--color-text-2);
    background: var(--color-fill-1);

    span {
      flex: 1 1 240px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
  }

  .a9-tiptap-editor__painter-help {
    max-width: min(320px, calc(100vw - 48px));
    margin: 0;
    line-height: 1.6;
  }

  .a9-tiptap-editor__crop-status {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 8px 16px;
    color: var(--color-text-2);
    font-size: 13px;
    background: var(--color-fill-1);
    border-bottom: 1px solid var(--color-border-2);

    > span {
      display: inline-flex;
      gap: 8px;
      align-items: center;
    }

    &.is-failed {
      color: rgb(var(--danger-6));
    }
  }

  .a9-tiptap-editor__loading-icon {
    animation: a9-editor-loading 1s linear infinite;
  }

  @keyframes a9-editor-loading {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .a9-tiptap-editor__loading-icon {
      animation: none;
    }
  }

  .a9-tiptap-editor__toolbar-blocks {
    grid-area: blocks;
  }

  .a9-tiptap-editor__toolbar-basic {
    grid-area: basic;
  }

  .a9-tiptap-editor__toolbar-text {
    grid-area: text;
  }

  .a9-tiptap-editor__toolbar-paragraph {
    grid-area: paragraph;
  }

  .a9-tiptap-editor__toolbar-insert {
    grid-area: insert;
  }

  .a9-tiptap-editor__toolbar-history {
    grid-area: history;
    justify-self: end;
  }

  .a9-tiptap-editor__toolbar-extra {
    grid-column: 1 / -1;
    min-width: 0;
  }

  .a9-tiptap-editor__toolbar-extra:empty {
    display: none;
  }

  .is-wide > .a9-tiptap-editor__toolbar-extra {
    grid-area: extra;
  }

  .a9-tiptap-editor__tool-group {
    display: flex;
    gap: 2px;
    align-items: center;
    min-width: 0;
  }

  .a9-tiptap-editor__toolbar {
    display: grid;
    gap: 4px;
    align-items: center;
    min-height: 44px;
    padding: 6px 8px;
    background: var(--color-fill-1);
    border-bottom: 1px solid var(--color-border-2);

    &.is-wide {
      position: relative;
      display: flex;
      flex-wrap: wrap;
      padding-right: 80px;

      > .a9-tiptap-editor__tool-group {
        flex: 0 0 auto;
        max-width: 100%;
      }

      > .a9-tiptap-editor__toolbar-history {
        position: absolute;
        top: 6px;
        right: 8px;
      }

      .a9-tiptap-editor__toolbar-basic,
      .a9-tiptap-editor__toolbar-paragraph,
      .a9-tiptap-editor__toolbar-insert {
        padding-left: 4px;
        border-left: 1px solid var(--color-border-2);
      }
    }

    &.is-medium {
      grid-template-areas: 'blocks basic basic history' 'text paragraph insert insert';
      grid-template-columns: max-content max-content minmax(0, 1fr) max-content;
    }

    &.is-narrow {
      grid-template-areas: 'blocks blocks history' 'basic text text' 'paragraph insert insert';
      grid-template-columns: max-content minmax(0, 1fr) max-content;
    }

    :deep(.arco-btn-size-small) {
      width: 32px;
      min-width: 32px;
      height: 32px;
      padding: 0;
    }

    :deep(.a9-toolbar-group-trigger),
    :deep(.a9-text-format-size.arco-btn-size-small),
    :deep(.a9-tiptap-editor__block-menu.arco-btn-size-small) {
      width: auto;
      min-width: 0;
      padding: 0 4px;
      white-space: nowrap;
    }

    :deep(.a9-text-format-size.arco-btn-size-small),
    :deep(.a9-tiptap-editor__block-menu.arco-btn-size-small) {
      min-width: 58px;
    }

    :deep(.a9-table-anchor) {
      width: 0;
      min-width: 0;
      padding: 0;
      overflow: hidden;
      border: 0;
      pointer-events: none;
    }
  }

  .a9-toolbar-mixed {
    position: absolute;
    right: 1px;
    bottom: 0;
    color: var(--color-text-2);
    font-weight: 700;
    font-size: 11px;
    line-height: 12px;
  }

  .a9-tiptap-editor__alignment.a9-toolbar-inline {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .a9-tiptap-editor__insert-pickers {
    display: none;
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
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    max-width: 100%;
    min-height: 36px;
    padding: 5px 6px;
    background: var(--color-bg-2);
    border: 1px solid var(--color-border-2);
    border-radius: 4px;
    box-shadow: 0 4px 16px rgb(0 0 0 / 14%);

    :deep(.arco-btn-size-small) {
      flex: 0 0 auto;
      min-width: 32px;
      height: 32px;
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
