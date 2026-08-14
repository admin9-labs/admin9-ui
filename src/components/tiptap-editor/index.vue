<script setup lang="ts">
  import { computed, inject, nextTick, onMounted, ref, watch, type Ref } from 'vue';
  import { Message } from '@arco-design/web-vue';
  import { Extension, type Editor } from '@tiptap/core';
  import CharacterCount from '@tiptap/extension-character-count';
  import Placeholder from '@tiptap/extension-placeholder';
  import TextAlign from '@tiptap/extension-text-align';
  import StarterKit from '@tiptap/starter-kit';
  import { GapCursor } from '@tiptap/pm/gapcursor';
  import { Fragment } from '@tiptap/pm/model';
  import { NodeSelection, Plugin, PluginKey, Selection, TextSelection, type Transaction } from '@tiptap/pm/state';
  import { EditorContent, useEditor } from '@tiptap/vue-3';
  import { useI18n } from 'vue-i18n';
  import admin9UIOptionsKey from '../../internal/options';
  import type { FileItem, FileType } from '../../services/types';
  import AFilePicker from '../file-picker/index.vue';
  import MediaBubbleMenu from './media-bubble-menu.vue';
  import { Audio, BlockImage, InlineImage, isSafeMediaUrl, type TiptapMediaNodeName, Video } from './media-node';
  import type {
    ATiptapEditorProps,
    TiptapAudioWidth,
    TiptapBlockWidth,
    TiptapInlineImageSize,
    TiptapMediaAlign,
    TiptapMediaError,
    TiptapMediaOperation,
  } from './types';

  defineOptions({ name: 'ATiptapEditor' });

  const props = withDefaults(defineProps<ATiptapEditorProps>(), {
    modelValue: '',
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
    defaultImageDisplay: 'block',
  });

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'change', value: string): void;
    (e: 'focus'): void;
    (e: 'blur'): void;
    (e: 'mediaError', error: TiptapMediaError): void;
  }>();

  const { t } = useI18n();
  const globalOptions = inject(admin9UIOptionsKey, undefined);
  const resolvedFileService = computed(() => props.service ?? globalOptions?.fileService);
  const isEditable = computed(() => !props.disabled && !props.readonly);
  const linkPopupVisible = ref(false);
  const altPopupVisible = ref(false);
  const imagePickerTooltipVisible = ref(false);
  const videoPickerTooltipVisible = ref(false);
  const audioPickerTooltipVisible = ref(false);
  const replacePickerTooltipVisible = ref(false);
  const linkHref = ref('');
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

  const editor = useEditor({
    content: props.modelValue,
    editable: isEditable.value,
    extensions: [
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
        getPlaybackTabIndex: () => (props.readonly && !props.disabled ? undefined : -1),
      }),
      Audio.configure({
        getPlaybackTabIndex: () => (props.readonly && !props.disabled ? undefined : -1),
      }),
      Placeholder.configure({
        placeholder: () => props.placeholder || t('admin9Ui.tiptapEditor.placeholder'),
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right'],
      }),
      CharacterCount,
      DynamicCharacterLimit,
      RemoveLeadingEmptyParagraphBeforeMedia,
    ],
    editorProps: {
      attributes: {
        'class': 'a9-tiptap-editor__prose',
        'role': 'textbox',
        'aria-multiline': 'true',
        'aria-label': props.placeholder || t('admin9Ui.tiptapEditor.ariaLabel'),
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const value = currentEditor.isEmpty ? '' : currentEditor.getHTML();
      emit('update:modelValue', value);
      emit('change', value);
    },
    onSelectionUpdate: ({ editor: currentEditor }) => syncSelectedMedia(currentEditor),
    onTransaction: ({ editor: currentEditor }) => syncSelectedMedia(currentEditor),
    onFocus: () => {
      isFocused.value = true;
      emit('focus');
    },
    onBlur: () => {
      isFocused.value = false;
      emit('blur');
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
    if (!currentEditor || !selection) return undefined;

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

  const prepareLink = () => {
    linkHref.value = String(editor.value?.getAttributes('link').href ?? '');
  };
  const applyLink = () => {
    if (!editor.value || !isEditable.value) return;
    const href = linkHref.value.trim();
    const chain = editor.value.chain().focus().extendMarkRange('link');
    if (href) chain.setLink({ href }).run();
    else chain.unsetLink().run();
    linkPopupVisible.value = false;
  };
  const removeLink = () => {
    if (!editor.value || !isEditable.value) return;
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run();
    linkHref.value = '';
    linkPopupVisible.value = false;
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
  const clear = () => editor.value?.commands.clearContent(true);
  const getHTML = () => (editor.value?.isEmpty ? '' : editor.value?.getHTML() ?? '');

  defineExpose({ focus, clear, getHTML });

  watch(
    () => props.modelValue,
    (value) => {
      if (!editor.value) return;
      const currentValue = editor.value.isEmpty ? '' : editor.value.getHTML();
      if (value !== currentValue) {
        editor.value.commands.setContent(value || '', { emitUpdate: false });
        if (!isEditable.value) {
          clearNodeSelection(editor.value);
          selectedMedia.value = undefined;
        }
      }
    }
  );
  watch(isEditable, (value) => {
    const currentEditor = editor.value;
    currentEditor?.setEditable(value);
    if (!value && currentEditor) clearNodeSelection(currentEditor);
    if (!value) selectedMedia.value = undefined;
  });
  watch([() => selectedMedia.value?.pos, () => selectedMedia.value?.type, () => selectedMedia.value?.attrs.alt], () => {
    altDraft.value = typeof selectedMedia.value?.attrs.alt === 'string' ? selectedMedia.value.attrs.alt : '';
  });
  watch([() => selectedMedia.value?.pos, () => selectedMedia.value?.type], () => {
    altPopupVisible.value = false;
  });
  onMounted(() => {
    bubbleMenuReady.value = true;
  });
</script>

<template>
  <div
    class="a9-tiptap-editor"
    :class="{
      'is-disabled': props.disabled,
      'is-readonly': props.readonly,
      'is-focused': isFocused,
    }"
    :style="editorStyle"
  >
    <div v-if="!readonly" class="a9-tiptap-editor__toolbar" role="toolbar" :aria-label="t('admin9Ui.tiptapEditor.toolbar')">
      <a-dropdown trigger="click" @select="setBlock">
        <a-button class="a9-tiptap-editor__block-menu" size="small" :disabled="disabled">
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

      <a-tooltip :content="t('admin9Ui.tiptapEditor.bold')">
        <a-button
          size="small"
          :type="editor?.isActive('bold') ? 'primary' : 'text'"
          :disabled="disabled"
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
          :disabled="disabled"
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
          :disabled="disabled"
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
          :disabled="disabled"
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
          :disabled="disabled"
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
          :disabled="disabled"
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
          :disabled="disabled"
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
          :disabled="disabled"
          :aria-label="t('admin9Ui.tiptapEditor.horizontalRule')"
          @click="editor?.chain().focus().setHorizontalRule().run()"
        >
          <template #icon><icon-minus /></template>
        </a-button>
      </a-tooltip>

      <a-popover v-model:popup-visible="linkPopupVisible" trigger="click" position="bottom" :disabled="disabled">
        <a-tooltip :content="t('admin9Ui.tiptapEditor.link')">
          <a-button
            size="small"
            :type="editor?.isActive('link') ? 'primary' : 'text'"
            :disabled="disabled"
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
              v-model="linkHref"
              :placeholder="t('admin9Ui.tiptapEditor.linkPlaceholder')"
              allow-clear
              @press-enter="applyLink"
            />
            <div class="a9-tiptap-editor__link-actions">
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
          @change="insertImagesFromPicker"
          @visible-change="onMediaPickerVisibleChange"
        >
          <template #trigger="{ open, disabled: pickerDisabled }">
            <a-button
              size="small"
              type="text"
              :disabled="disabled || pickerDisabled"
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
          @change="insertVideosFromPicker"
          @visible-change="onMediaPickerVisibleChange"
        >
          <template #trigger="{ open, disabled: pickerDisabled }">
            <a-button
              size="small"
              type="text"
              :disabled="disabled || pickerDisabled"
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
          @change="insertAudiosFromPicker"
          @visible-change="onMediaPickerVisibleChange"
        >
          <template #trigger="{ open, disabled: pickerDisabled }">
            <a-button
              size="small"
              type="text"
              :disabled="disabled || pickerDisabled"
              :aria-label="t('admin9Ui.tiptapEditor.audio')"
              @mousedown.prevent
              @click="open"
            >
              <template #icon><icon-sound /></template>
            </a-button>
          </template>
        </AFilePicker>
      </a-tooltip>

      <span class="a9-tiptap-editor__divider" aria-hidden="true" />

      <a-tooltip :content="t('admin9Ui.tiptapEditor.alignLeft')">
        <a-button
          size="small"
          :type="editor?.isActive({ textAlign: 'left' }) ? 'primary' : 'text'"
          :disabled="disabled"
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
          :disabled="disabled"
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
          :disabled="disabled"
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
          :disabled="disabled || !editor?.can().chain().focus().undo().run()"
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
          :disabled="disabled || !editor?.can().chain().focus().redo().run()"
          :aria-label="t('admin9Ui.tiptapEditor.redo')"
          @click="editor?.chain().focus().redo().run()"
        >
          <template #icon><icon-redo /></template>
        </a-button>
      </a-tooltip>
    </div>

    <div ref="contentRef" class="a9-tiptap-editor__content" role="region" :aria-label="t('admin9Ui.tiptapEditor.contentArea')">
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
          @change="replaceSelectedMediaFromPicker"
          @visible-change="onMediaPickerVisibleChange"
        >
          <template #trigger="{ open, disabled: pickerDisabled }">
            <a-tooltip v-model:popup-visible="replacePickerTooltipVisible" :content="replaceMediaLabel">
              <a-button
                size="mini"
                type="text"
                :disabled="disabled || pickerDisabled"
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
  </div>
</template>

<style scoped lang="less">
  .a9-tiptap-editor {
    display: flex;
    flex-direction: column;
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
