<script setup lang="ts">
  import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue';
  import { Cascader, Form, FormItem, Input, Modal, Pagination, Popover, useFormItem } from '@arco-design/web-vue';
  import { useI18n } from 'vue-i18n';
  import type {
    AFilePickerProps,
    AFilePickerExposed,
    FilePickerValue as ModelValue,
    FilePickerView as FileView,
  } from './types';
  import safeFileUrl from '../../internal/file-url';
  import { FILE_TYPES, normalizeFileTypes } from '../../internal/file-types';
  import AFileUploader from '../file-uploader/index.vue';
  import type { AFileUploaderExposed, FileUploadBatchResult, FileUploadFailure, FileUploadTask } from '../file-uploader/types';
  import FileItemView from '../../internal/file-item.vue';
  import FileSelection from '../../internal/file-selection.vue';
  import FileImagePreview from '../../internal/file-image-preview.vue';
  import FileFolderIcon from '../../internal/file-folder-icon.vue';
  import admin9UIOptionsKey from '../../internal/options';
  import resolveFilePickerLayout from './layout';
  import type { FileGroup, FileItem, FileListParams, FilePickerAdapter, FileType } from '../../services/types';

  type GroupId = string | null | undefined;

  const FILE_TYPE_SET = new Set<FileType>(FILE_TYPES);

  const props = withDefaults(defineProps<AFilePickerProps>(), {
    disabled: false,
    readonly: false,
    allowClear: true,
    modelValue: undefined,
    fileTypes: () => ['image', 'video', 'audio', 'document', 'archive', 'other'],
    multiple: false,
    limit: 0,
    pageSize: undefined,
    buttonText: '',
    accept: undefined,
    canUpload: false,
    canCreateGroup: false,
    canDeleteFiles: false,
    canMoveFiles: false,
    defaultView: 'grid',
    service: undefined,
  });

  const emit = defineEmits<{
    (e: 'update:modelValue', value: ModelValue): void;
    (e: 'change', value: ModelValue): void;
    (e: 'confirm', items: FileItem[]): void;
    (e: 'clear'): void;
    (e: 'selectionChange', items: FileItem[]): void;
    (e: 'visibleChange', visible: boolean): void;
    (e: 'uploadSuccess', item: FileItem): void;
    (e: 'uploadError', error: unknown): void;
  }>();

  defineSlots<{
    trigger?: (slotProps: { open: () => void; selectedItems: FileItem[]; selectedCount: number; disabled: boolean }) => unknown;
    item?: (slotProps: { item: FileItem; available: boolean; selected: boolean; view: FileView }) => unknown;
    empty?: (slotProps: { constrained: boolean }) => unknown;
  }>();

  const { mergedDisabled, mergedSize, eventHandlers } = useFormItem({
    disabled: toRef(props, 'disabled'),
    size: toRef(props, 'size'),
  });
  const interactionDisabled = computed(() => mergedDisabled.value || props.readonly);
  const { t } = useI18n();
  const globalOptions = inject(admin9UIOptionsKey, undefined);
  const resolvedService = computed<FilePickerAdapter | undefined>(() => props.service ?? globalOptions?.fileService);
  const requireService = () => {
    const service = resolvedService.value;
    if (!service || typeof service.list !== 'function') {
      throw new Error(
        '[admin9-ui] AFilePicker requires FileBrowseCapability. Pass the service prop or install Admin9UI with { fileService }.'
      );
    }
    if (props.canUpload && typeof service.upload !== 'function') {
      throw new Error('[admin9-ui] AFilePicker requires FileUploadCapability when canUpload is true.');
    }
    if (props.canCreateGroup && (typeof service.listGroups !== 'function' || typeof service.createGroup !== 'function')) {
      throw new Error('[admin9-ui] AFilePicker requires listGroups and createGroup when canCreateGroup is true.');
    }
    if (props.canDeleteFiles && typeof service.deleteFiles !== 'function') {
      throw new Error('[admin9-ui] AFilePicker requires deleteFiles when canDeleteFiles is true.');
    }
    if (props.canMoveFiles && (typeof service.listGroups !== 'function' || typeof service.moveFiles !== 'function')) {
      throw new Error('[admin9-ui] AFilePicker requires listGroups and moveFiles when canMoveFiles is true.');
    }
    return service;
  };
  requireService();

  const allowedFileTypes = computed(() => normalizeFileTypes(props.fileTypes));
  const allowedTypeSet = computed(() => new Set(allowedFileTypes.value));
  const hasAllowedTypes = computed(() => allowedFileTypes.value.length > 0);
  const showsAggregateType = computed(() => allowedFileTypes.value.length > 1);

  const visible = ref(false);
  const view = ref<FileView>(props.defaultView);
  const activeFileType = ref<FileType | undefined>();
  const activeGroupId = ref<GroupId>(undefined);
  const list = ref<FileItem[]>([]);
  const groups = ref<FileGroup[]>([]);
  const collapsedGroups = ref(new Set<string>());
  const groupRows = computed(() => {
    const roots = groups.value.filter((group) => !group.parentId);
    return roots.flatMap((group) => {
      const children = groups.value.filter((child) => child.parentId === group.id);
      return [
        { group, label: group.name, child: false, hasChildren: children.length > 0 },
        ...children.map((child) => ({
          group: child,
          label: `${group.name} / ${child.name}`,
          child: true,
          hasChildren: false,
        })),
      ];
    });
  });
  const visibleGroupRows = computed(() =>
    groupRows.value.filter((row) => !row.child || !collapsedGroups.value.has(row.group.parentId ?? ''))
  );
  const toggleGroup = (id: string) => {
    if (collapsedGroups.value.has(id)) collapsedGroups.value.delete(id);
    else collapsedGroups.value.add(id);
  };
  const current = ref(1);
  const configuredPageSize = computed(() =>
    Number.isInteger(props.pageSize) && Number(props.pageSize) > 0 ? props.pageSize : undefined
  );
  const resolvedPageSize = ref(0);
  const results = ref<HTMLElement>();
  const gridColumns = ref(1);
  let layoutObserver: ResizeObserver | undefined;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let targetPageSize = 0;
  let pendingPageSize: number | undefined;
  let pendingPageReset = false;
  let resolveLayout: (() => void) | undefined;
  let firstListLoad: Promise<void> | undefined;
  let initialRefresh: Promise<void> | undefined;
  const total = ref(0);
  const keyword = ref('');
  const loading = ref(false);
  const listError = ref(false);
  const groupLoading = ref(false);
  const groupError = ref(false);
  const groupsLoaded = ref(false);
  const createGroupVisible = ref(false);
  const creatingGroup = ref(false);
  const groupForm = ref({ name: '', parentId: '' });
  const groupNameInput = ref<InstanceType<typeof Input>>();
  const groupNameError = ref(false);
  const groupCreateError = ref(false);
  let createGeneration = 0;
  let groupCreateTrigger: HTMLElement | undefined;
  const fileActionBusy = ref(false);
  const moreVisible = ref(false);
  const moveVisible = ref(false);
  const moreTrigger = ref<HTMLElement>();
  const deleteVisible = ref(false);
  const deleteIds = ref<string[]>([]);
  const fileActionFeedback = ref<{ action: 'delete' | 'move'; succeeded: number; failed: number }>();
  let fileActionGeneration = 0;
  let deleteTrigger: HTMLElement | undefined;
  const draftMap = ref(new Map<string, FileItem>());
  const committedItems = ref<FileItem[]>([]);
  const uploading = ref(false);
  const triggerRoot = ref<HTMLElement>();
  let triggerAction: HTMLElement | undefined;
  let returnFocusTarget: HTMLElement | undefined;
  const uploader = ref<AFileUploaderExposed>();
  let viewGeneration = 0;
  let latestListRequest = 0;
  let latestGroupRequest = 0;
  const modelNeedsNormalization = ref(false);
  const narrow = ref(false);
  const shortViewport = ref(false);
  const workspace = ref<HTMLElement>();
  const activePreview = ref<string>();
  const previewItem = ref<{ id: string; name: string; url: string }>();
  const preview = ref<InstanceType<typeof FileImagePreview>>();
  let previewTrigger: HTMLElement | undefined;
  const uploadFeedback = ref<HTMLElement>();
  const limitNotice = ref(false);
  let limitTimer: ReturnType<typeof setTimeout> | undefined;
  let viewportQuery: MediaQueryList | undefined;
  let heightQuery: MediaQueryList | undefined;
  const clearLimitNotice = () => {
    clearTimeout(limitTimer);
    limitTimer = undefined;
    limitNotice.value = false;
  };
  const showLimitNotice = () => {
    clearLimitNotice();
    limitNotice.value = true;
    limitTimer = setTimeout(clearLimitNotice, 3000);
  };
  const updateViewport = () => {
    narrow.value = viewportQuery?.matches ?? false;
    shortViewport.value = heightQuery?.matches ?? false;
  };
  onMounted(() => {
    viewportQuery = window.matchMedia('(max-width: 720px)');
    heightQuery = window.matchMedia('(max-height: 480px)');
    updateViewport();
    viewportQuery.addEventListener('change', updateViewport);
    heightQuery.addEventListener('change', updateViewport);
  });

  const hasGroupNavigation = computed(() => hasAllowedTypes.value && typeof resolvedService.value?.listGroups === 'function');
  const createGroupDisabled = computed(
    () =>
      interactionDisabled.value ||
      uploading.value ||
      groupLoading.value ||
      !groupsLoaded.value ||
      creatingGroup.value ||
      fileActionBusy.value
  );
  const rootGroups = computed(() => groups.value.filter((group) => !group.parentId));
  const selectedItems = computed(() => committedItems.value);
  const selectedCount = computed(() => committedItems.value.length);
  const draftItems = computed(() => Array.from(draftMap.value.values()));
  const fileActionsDisabled = computed(
    () =>
      interactionDisabled.value ||
      fileActionBusy.value ||
      uploading.value ||
      creatingGroup.value ||
      draftItems.value.length === 0
  );
  const fileActionMessage = computed(() => {
    const result = fileActionFeedback.value;
    if (!result) return '';
    let suffix = 'Success';
    if (result.failed > 0) suffix = result.succeeded > 0 ? 'Partial' : 'Failed';
    return t(`admin9Ui.filePicker.fileActions.${result.action}${suffix}`, { count: result.succeeded, failed: result.failed });
  });
  const moveOptions = computed(() => [
    { value: 'ungrouped', label: t('admin9Ui.filePicker.groupUngrouped') },
    ...rootGroups.value.map((group) => {
      const children = groups.value
        .filter((child) => child.parentId === group.id)
        .map((child) => ({ value: `group:${child.id}`, label: child.name }));
      return { value: `group:${group.id}`, label: group.name, children: children.length ? children : undefined };
    }),
  ]);
  const draftCount = computed(() => draftMap.value.size);
  const empty = computed(() => list.value.length === 0 && !loading.value && !listError.value);
  const triggerLabel = computed(() => props.buttonText || t('admin9Ui.filePicker.trigger'));
  const uploadGroupId = computed(() => activeGroupId.value ?? null);
  const defaultActiveType = () => (allowedFileTypes.value.length === 1 ? allowedFileTypes.value[0] : undefined);
  const hasFilters = computed(() => Boolean(keyword.value.trim()) || activeFileType.value !== defaultActiveType());
  const needsEmptyCommit = computed(() => selectedCount.value > 0 || modelNeedsNormalization.value);
  const canConfirm = computed(
    () =>
      hasAllowedTypes.value &&
      !interactionDisabled.value &&
      !fileActionBusy.value &&
      (draftCount.value > 0 || needsEmptyCommit.value)
  );
  const selectionLabel = computed(() =>
    props.multiple && props.limit > 0
      ? t('admin9Ui.filePicker.selectedLimit', { count: draftCount.value, limit: props.limit })
      : t('admin9Ui.filePicker.selectedCount', { count: draftCount.value })
  );
  const emptyDescription = computed(() => {
    const imagesOnly = activeFileType.value === 'image';
    if (imagesOnly) {
      if (keyword.value.trim()) return t('admin9Ui.filePicker.noMatchingImages');
      return t(activeGroupId.value === undefined ? 'admin9Ui.imagePicker.empty' : 'admin9Ui.filePicker.groupImagesEmpty');
    }
    if (keyword.value.trim()) return t('admin9Ui.filePicker.noMatches');
    if (activeFileType.value || allowedFileTypes.value.length < FILE_TYPES.length)
      return t('admin9Ui.filePicker.noMatchingTypes');
    return t(activeGroupId.value === undefined ? 'admin9Ui.filePicker.empty' : 'admin9Ui.filePicker.groupEmpty');
  });

  const hasStableId = (item: FileItem) => typeof item.id === 'string' && item.id.trim().length > 0;
  const hasUsableUrl = (item: FileItem) => Boolean(safeFileUrl(item.url));
  const isReady = (item: FileItem) => item.status === undefined || item.status === 'ready';
  const hasKnownType = (item: FileItem) => FILE_TYPE_SET.has(item.type);
  const isValueEligible = (item: FileItem) =>
    hasStableId(item) && hasKnownType(item) && allowedTypeSet.value.has(item.type) && isReady(item) && hasUsableUrl(item);

  const duplicateIds = computed(() => {
    const counts = new Map<string, number>();
    list.value.forEach((item) => {
      if (hasStableId(item)) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
    });
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([id]) => id)
    );
  });
  const isSelectable = (item: FileItem) =>
    isValueEligible(item) && (!activeFileType.value || item.type === activeFileType.value) && !duplicateIds.value.has(item.id);
  const statusLabel = (item: FileItem) => {
    if (!hasStableId(item) || duplicateIds.value.has(item.id)) return t('admin9Ui.filePicker.invalid');
    if (
      !hasKnownType(item) ||
      !allowedTypeSet.value.has(item.type) ||
      (activeFileType.value && item.type !== activeFileType.value)
    ) {
      return t('admin9Ui.filePicker.wrongType');
    }
    if (item.status === 'pending') return t('admin9Ui.filePicker.processing');
    if (item.status === 'failed') return t('admin9Ui.filePicker.failed');
    return t('admin9Ui.filePicker.unavailable');
  };

  const itemFields: (keyof FileItem)[] = [
    'id',
    'name',
    'type',
    'groupId',
    'url',
    'path',
    'size',
    'mime',
    'extension',
    'thumbnail',
    'duration',
    'createdAt',
    'status',
  ];
  const sameItem = (left: FileItem, right: FileItem) => itemFields.every((field) => left[field] === right[field]);
  const sameItems = (left: FileItem[], right: FileItem[]) =>
    left.length === right.length && left.every((item, index) => sameItem(item, right[index]));
  const replaceDraft = (items: FileItem[], notify = true) => {
    const idCounts = new Map<string, number>();
    items.forEach((item) => {
      if (hasStableId(item)) idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1);
    });
    const next = items.filter((item) => hasStableId(item) && idCounts.get(item.id) === 1);
    if (sameItems(draftItems.value, next)) return false;
    clearLimitNotice();
    draftMap.value = new Map(next.map((item) => [item.id, item]));
    if (notify) emit('selectionChange', next);
    return true;
  };
  const outputValue = (items: FileItem[]): ModelValue => (props.multiple ? items : items[0]);
  const modelMatches = (value: ModelValue, items: FileItem[]) => {
    if (value === undefined && items.length === 0) return true;
    if (props.multiple) return Array.isArray(value) && sameItems(value, items);
    return !Array.isArray(value) && Boolean(value) && items.length === 1 && sameItem(value as FileItem, items[0]);
  };
  const sanitizeItems = (items: FileItem[]) => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      if (hasStableId(item)) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
    });
    const eligible = items.filter((item) => isValueEligible(item) && counts.get(item.id) === 1);
    if (!props.multiple) return eligible.slice(0, 1);
    return props.limit > 0 ? eligible.slice(0, props.limit) : eligible;
  };
  const itemsFromModel = (value: ModelValue) => {
    if (props.multiple) return Array.isArray(value) ? value : [];
    return value && !Array.isArray(value) ? [value] : [];
  };
  const emitCommittedValue = (items: FileItem[]) => {
    const next = sanitizeItems(items);
    if (sameItems(committedItems.value, next) && !modelNeedsNormalization.value) return false;
    modelNeedsNormalization.value = false;
    committedItems.value = next;
    emit('update:modelValue', outputValue(next));
    emit('change', outputValue(next));
    eventHandlers.value?.onChange?.();
    return true;
  };
  const invalidateFileActions = () => {
    fileActionGeneration += 1;
    fileActionBusy.value = false;
    deleteVisible.value = false;
    deleteIds.value = [];
    fileActionFeedback.value = undefined;
  };
  const syncExternalModel = () => {
    const next = sanitizeItems(itemsFromModel(props.modelValue));
    if (visible.value && !sameItems(committedItems.value, next)) invalidateFileActions();
    modelNeedsNormalization.value = !modelMatches(props.modelValue, next);
    committedItems.value = next;
    if (visible.value) replaceDraft(next, false);
  };
  const invalidateRequests = () => {
    viewGeneration += 1;
    latestListRequest += 1;
    latestGroupRequest += 1;
    loading.value = false;
    groupLoading.value = false;
    createGeneration += 1;
    createGroupVisible.value = false;
    creatingGroup.value = false;
    clearTimeout(resizeTimer);
    resolveLayout?.();
    resolveLayout = undefined;
    firstListLoad = undefined;
    initialRefresh = undefined;
    targetPageSize = 0;
    pendingPageSize = undefined;
    pendingPageReset = false;
    resolvedPageSize.value = 0;
    moreVisible.value = false;
    moveVisible.value = false;
    invalidateFileActions();
  };
  const resetBrowseScope = (resetKeyword: boolean) => {
    invalidateRequests();
    activeFileType.value = defaultActiveType();
    activeGroupId.value = undefined;
    current.value = 1;
    if (resetKeyword) keyword.value = '';
    list.value = [];
    groups.value = [];
    groupsLoaded.value = false;
    collapsedGroups.value.clear();
    total.value = 0;
    listError.value = false;
    groupError.value = false;
  };

  const buildListParams = (): FileListParams => {
    const base = {
      page: current.value,
      pageSize: resolvedPageSize.value,
      keyword: keyword.value.trim() || undefined,
      groupId: activeGroupId.value,
    };
    if (activeFileType.value) return { ...base, fileType: activeFileType.value };
    if (allowedFileTypes.value.length === FILE_TYPES.length) return base;
    return { ...base, fileTypes: [...allowedFileTypes.value] };
  };

  const reconcilePage = (items: FileItem[]) => {
    const next = new Map(draftMap.value);
    items.forEach((item) => {
      if (!next.has(item.id)) return;
      if (isSelectable(item)) next.set(item.id, item);
      else next.delete(item.id);
    });
    replaceDraft(Array.from(next.values()));
  };

  const requestList = async () => {
    if (!hasAllowedTypes.value || !visible.value) return;
    const service = requireService();
    const generation = viewGeneration;
    latestListRequest += 1;
    const request = latestListRequest;
    loading.value = true;
    listError.value = false;
    try {
      const result = await service.list(buildListParams());
      if (generation !== viewGeneration || request !== latestListRequest || service !== resolvedService.value) return;
      list.value = result.list;
      total.value = result.pagination.total;
      resolvedPageSize.value = result.pagination.pageSize;
      reconcilePage(result.list);
    } catch {
      if (generation !== viewGeneration || request !== latestListRequest || service !== resolvedService.value) return;
      list.value = [];
      total.value = 0;
      listError.value = true;
    } finally {
      if (generation === viewGeneration && request === latestListRequest && service === resolvedService.value) {
        loading.value = false;
      }
    }
  };

  const applyPendingCapacity = () => {
    clearTimeout(resizeTimer);
    if (!pendingPageSize && !pendingPageReset) return false;
    const next = pendingPageSize ?? resolvedPageSize.value;
    pendingPageSize = undefined;
    const reset = pendingPageReset;
    pendingPageReset = false;
    if (next === resolvedPageSize.value && !reset) return false;
    resolvedPageSize.value = next;
    current.value = 1;
    list.value = [];
    return true;
  };

  const measureLayout = () => {
    if (!visible.value) return;
    const element = results.value;
    const layout = resolveFilePickerLayout(element?.clientWidth ?? 0, element?.clientHeight ?? 0, view.value, narrow.value);
    gridColumns.value = layout.columns;
    const next = configuredPageSize.value ?? layout.pageSize;
    if (!next) return;
    if (!resolvedPageSize.value) {
      targetPageSize = next;
      resolvedPageSize.value = next;
      resolveLayout?.();
      resolveLayout = undefined;
      return;
    }
    if (next === targetPageSize) return;
    targetPageSize = next;
    pendingPageSize = next;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!visible.value || fileActionBusy.value) return;
      if (applyPendingCapacity()) requestList();
    }, 150);
  };

  function fetchList(afterFileAction = false): Promise<void> {
    if (!visible.value || !hasAllowedTypes.value || (fileActionBusy.value && !afterFileAction)) return Promise.resolve();
    if (firstListLoad) return firstListLoad;
    applyPendingCapacity();
    if (resolvedPageSize.value) return requestList();
    const generation = viewGeneration;
    loading.value = true;
    const layoutReady = new Promise<void>((resolve) => {
      resolveLayout = resolve;
    });
    const load = (async () => {
      await layoutReady;
      if (generation !== viewGeneration || !visible.value) return;
      firstListLoad = undefined;
      initialRefresh = undefined;
      await requestList();
    })();
    firstListLoad = load;
    nextTick(measureLayout);
    return load;
  }

  watch(
    results,
    (element) => {
      layoutObserver?.disconnect();
      if (!element) return;
      measureLayout();
      layoutObserver = new ResizeObserver(measureLayout);
      layoutObserver.observe(element);
    },
    { flush: 'post' }
  );
  watch([view, narrow], () => nextTick(measureLayout));
  watch(fileActionBusy, (busy, previous) => {
    if (!busy && previous && (pendingPageSize || pendingPageReset)) fetchList();
  });

  const fetchGroups = async () => {
    const service = requireService();
    latestGroupRequest += 1;
    const request = latestGroupRequest;
    const generation = viewGeneration;
    if (!visible.value || !hasAllowedTypes.value || !service.listGroups) {
      groups.value = [];
      groupError.value = false;
      groupLoading.value = false;
      groupsLoaded.value = false;
      return;
    }
    groupLoading.value = true;
    groupError.value = false;
    try {
      const next = await service.listGroups();
      if (generation === viewGeneration && request === latestGroupRequest && service === resolvedService.value) {
        groups.value = next;
        groupsLoaded.value = true;
      }
    } catch {
      if (generation !== viewGeneration || request !== latestGroupRequest || service !== resolvedService.value) return;
      groupError.value = true;
    } finally {
      if (generation === viewGeneration && request === latestGroupRequest && service === resolvedService.value) {
        groupLoading.value = false;
      }
    }
  };

  const refresh = async () => {
    if (!hasAllowedTypes.value || !visible.value || fileActionBusy.value) return;
    if (initialRefresh) {
      await initialRefresh;
      return;
    }
    const first = !resolvedPageSize.value;
    const refreshJob = Promise.all([fetchList(), fetchGroups()]).then(() => undefined);
    if (first) {
      initialRefresh = refreshJob;
      await refreshJob;
      if (initialRefresh === refreshJob) initialRefresh = undefined;
    } else await refreshJob;
  };

  const openDelete = (event: MouseEvent) => {
    if (!visible.value || !props.canDeleteFiles || fileActionsDisabled.value) return;
    deleteTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
    if (narrow.value) deleteTrigger = moreTrigger.value?.querySelector('button') ?? undefined;
    moreVisible.value = false;
    deleteIds.value = draftItems.value.map((item) => item.id);
    deleteVisible.value = true;
  };
  const restoreDeleteFocus = () => {
    if (!visible.value || interactionDisabled.value || deleteVisible.value) return;
    const target =
      deleteTrigger?.isConnected && !deleteTrigger.matches(':disabled')
        ? deleteTrigger
        : workspace.value?.querySelector<HTMLElement>('.a9-file-picker__search input');
    target?.focus();
    deleteTrigger = undefined;
  };
  const runFileAction = async (action: 'delete' | 'move', ids: string[], groupId: string | null = null) => {
    if (!visible.value || fileActionsDisabled.value || ids.length === 0) return;
    if (action === 'delete' ? !props.canDeleteFiles : !props.canMoveFiles) return;
    const service = requireService();
    const requested = new Set(ids);
    fileActionGeneration += 1;
    const generation = fileActionGeneration;
    const isCurrent = () =>
      visible.value &&
      !interactionDisabled.value &&
      generation === fileActionGeneration &&
      service === resolvedService.value &&
      (action === 'delete' ? props.canDeleteFiles : props.canMoveFiles);
    fileActionBusy.value = true;
    fileActionFeedback.value = undefined;
    // Invalidate reads begun before this write; they must not restore deleted/moved rows.
    latestListRequest += 1;
    latestGroupRequest += 1;
    loading.value = false;
    groupLoading.value = false;
    try {
      const result =
        action === 'delete' ? await service.deleteFiles?.([...ids]) : await service.moveFiles?.({ ids: [...ids], groupId });
      if (!isCurrent()) return;
      if (!Array.isArray(result)) throw new Error('[admin9-ui] File operations must return successful IDs.');
      const succeeded = new Set(result.filter((id): id is string => typeof id === 'string' && requested.has(id)));
      if (action === 'delete') {
        list.value = list.value.filter((item) => !succeeded.has(item.id));
        replaceDraft(draftItems.value.filter((item) => !succeeded.has(item.id)));
      } else {
        // Do not mutate shared FileItem objects or the committed parent field.
        const moved = (item: FileItem) => (succeeded.has(item.id) ? { ...item, groupId } : item);
        replaceDraft(draftItems.value.map(moved));
        list.value = list.value
          .map(moved)
          .filter((item) => activeGroupId.value === undefined || item.groupId === activeGroupId.value);
      }
      fileActionFeedback.value = { action, succeeded: succeeded.size, failed: ids.length - succeeded.size };
    } catch {
      if (isCurrent()) fileActionFeedback.value = { action, succeeded: 0, failed: ids.length };
    }
    if (!isCurrent()) return;
    await Promise.all([fetchList(true), fetchGroups()]);
    if (!isCurrent()) return;
    const lastPage = Math.max(1, Math.ceil(total.value / resolvedPageSize.value));
    if (!listError.value && current.value > lastPage) {
      current.value = lastPage;
      await fetchList(true);
    }
    if (isCurrent()) {
      fileActionBusy.value = false;
      deleteVisible.value = false;
      if (applyPendingCapacity()) await fetchList();
    }
  };
  const closeMore = () => {
    moveVisible.value = false;
    moreVisible.value = false;
    nextTick(() => {
      if (!visible.value || interactionDisabled.value) return;
      (
        moreTrigger.value?.querySelector('button') ??
        workspace.value?.querySelector<HTMLInputElement>('.a9-file-picker__search input')
      )?.focus();
    });
  };
  const moveFiles = (value: unknown) => {
    if (typeof value !== 'string' || !props.canMoveFiles || !groupsLoaded.value || groupLoading.value) return;
    let groupId: GroupId;
    if (value === 'ungrouped') groupId = null;
    else if (value.startsWith('group:')) groupId = value.slice(6);
    if (groupId === undefined || (groupId !== null && !groups.value.some((group) => group.id === groupId))) return;
    // Off-page selections may carry stale field metadata; the service owns idempotency.
    const ids = draftItems.value.map((item) => item.id);
    if (ids.length) {
      if (narrow.value) closeMore();
      runFileAction('move', ids, groupId);
    }
  };
  const onMoreKeydown = (event: KeyboardEvent) => {
    if (
      event.key === 'Enter' &&
      moveVisible.value &&
      event.target instanceof Element &&
      event.target.closest('.a9-file-picker__move')
    ) {
      // Cascader handles Enter itself; do not activate the button receiving restored focus.
      event.preventDefault();
      return;
    }
    if (event.key !== 'Escape' || !moreVisible.value) return;
    event.preventDefault();
    event.stopPropagation();
    if (moveVisible.value) moveVisible.value = false;
    else closeMore();
  };
  watch(narrow, () => {
    const restore = moreVisible.value || moveVisible.value;
    moreVisible.value = false;
    moveVisible.value = false;
    if (restore) nextTick(() => workspace.value?.querySelector<HTMLInputElement>('.a9-file-picker__search input')?.focus());
  });

  const openCreateGroup = (event: MouseEvent) => {
    if (!visible.value || !props.canCreateGroup || createGroupDisabled.value) return;
    groupCreateTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
    groupForm.value = { name: '', parentId: '' };
    groupNameError.value = false;
    groupCreateError.value = false;
    createGroupVisible.value = true;
  };
  const closeCreateGroup = () => {
    createGeneration += 1;
    createGroupVisible.value = false;
    creatingGroup.value = false;
  };
  const restoreGroupCreateFocus = () => {
    if (!visible.value || interactionDisabled.value || createGroupVisible.value) return;
    const target = groupCreateTrigger?.isConnected
      ? groupCreateTrigger
      : workspace.value?.querySelector<HTMLElement>('[data-testid="file-picker-create-group"]');
    if (target && !target.matches(':disabled')) target.focus();
    groupCreateTrigger = undefined;
  };
  const createGroup = async () => {
    if (!visible.value || !createGroupVisible.value || !props.canCreateGroup || createGroupDisabled.value) return;
    const name = groupForm.value.name.trim();
    groupNameError.value = !name;
    if (!name) return;
    const parentId = groupForm.value.parentId || null;
    if (parentId && !rootGroups.value.some((group) => group.id === parentId)) return;
    const service = requireService();
    createGeneration += 1;
    const generation = createGeneration;
    creatingGroup.value = true;
    groupCreateError.value = false;
    const isCurrent = () => generation === createGeneration && visible.value && service === resolvedService.value;
    try {
      const group = await service.createGroup?.({ name, parentId });
      if (!isCurrent()) return;
      if (!group?.id?.trim() || !group.name?.trim() || (group.parentId ?? null) !== parentId) {
        throw new Error('[admin9-ui] createGroup returned an invalid FileGroup.');
      }
      // Keep the successful result if the subsequent refresh fails.
      groups.value = [...groups.value.filter((item) => item.id !== group.id), group];
      if (parentId) collapsedGroups.value.delete(parentId);
      activeGroupId.value = group.id;
      current.value = 1;
      keyword.value = '';
      list.value = [];
      createGroupVisible.value = false;
      await refresh();
    } catch {
      if (isCurrent()) groupCreateError.value = true;
    } finally {
      if (isCurrent()) creatingGroup.value = false;
    }
  };
  const selectFileType = (fileType: FileType | undefined) => {
    if (fileActionBusy.value) return;
    if (activeFileType.value === fileType) return;
    activeFileType.value = fileType;
    current.value = 1;
    list.value = [];
    fetchList();
  };
  const typeFilter = computed({
    get: () => activeFileType.value ?? '',
    set: (value: string) => selectFileType(allowedFileTypes.value.find((fileType) => fileType === value)),
  });
  const onGroupChange = (groupId: GroupId) => {
    if (uploading.value || fileActionBusy.value) return;
    if (activeGroupId.value === groupId) {
      if (typeof groupId === 'string' && groups.value.some((group) => group.parentId === groupId)) toggleGroup(groupId);
      return;
    }
    if (typeof groupId === 'string') collapsedGroups.value.delete(groupId);
    activeGroupId.value = groupId;
    current.value = 1;
    list.value = [];
    fetchList();
  };
  const groupFilter = computed({
    get: () => {
      if (activeGroupId.value === undefined) return 'all';
      if (activeGroupId.value === null) return 'ungrouped';
      return `group:${activeGroupId.value}`;
    },
    set: (value: string) => {
      if (value === 'all') onGroupChange(undefined);
      else if (value === 'ungrouped') onGroupChange(null);
      else if (value.startsWith('group:')) onGroupChange(value.slice(6));
    },
  });
  const clearFilters = () => {
    keyword.value = '';
    activeFileType.value = defaultActiveType();
    current.value = 1;
    fetchList();
  };
  const onSearch = () => {
    if (fileActionBusy.value) return;
    current.value = 1;
    fetchList();
  };
  const onPageChange = (page: number) => {
    if (fileActionBusy.value) return;
    current.value = page;
    fetchList();
  };

  const focusSelector = 'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const canFocusTrigger = (element: HTMLElement | undefined): element is HTMLElement => {
    if (!element?.isConnected || !triggerRoot.value?.contains(element)) return false;
    if (element.matches(':disabled, [aria-disabled="true"]') || element.closest('[hidden], [inert]')) return false;
    for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  const rememberTrigger = (event: Event) => {
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>(focusSelector) : undefined;
    if (element && canFocusTrigger(element)) triggerAction = element;
  };
  const open = () => {
    if (interactionDisabled.value || visible.value) return;
    requireService();
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    returnFocusTarget = canFocusTrigger(triggerAction) ? triggerAction : active;
    triggerAction = undefined;
    clearLimitNotice();
    visible.value = true;
    replaceDraft(committedItems.value, false);
    emit('visibleChange', true);
    resetBrowseScope(true);
    if (hasAllowedTypes.value) refresh();
  };
  const close = () => {
    if (!visible.value) return;
    clearLimitNotice();
    activePreview.value = undefined;
    invalidateRequests();
    visible.value = false;
    uploader.value?.clear();
    uploading.value = false;
    replaceDraft(committedItems.value, false);
    emit('visibleChange', false);
  };
  const restoreTriggerFocus = () => {
    if (visible.value) return;
    const target = canFocusTrigger(returnFocusTarget)
      ? returnFocusTarget
      : Array.from(triggerRoot.value?.querySelectorAll<HTMLElement>(focusSelector) ?? []).find(canFocusTrigger);
    returnFocusTarget = undefined;
    target?.focus();
  };
  const clear = () => {
    if (interactionDisabled.value) return;
    replaceDraft([], visible.value);
    if (emitCommittedValue([])) emit('clear');
  };
  const confirm = () => {
    const next = sanitizeItems(draftItems.value);
    if (!visible.value || !canConfirm.value) return;
    emitCommittedValue(next);
    emit('confirm', next);
    close();
  };
  const toggleItem = (item: FileItem) => {
    if (interactionDisabled.value || fileActionBusy.value || !isSelectable(item)) return;
    if (!props.multiple) {
      replaceDraft(draftMap.value.has(item.id) ? [] : [item]);
    } else {
      const next = new Map(draftMap.value);
      if (next.has(item.id)) next.delete(item.id);
      else if (props.limit <= 0 || next.size < props.limit) next.set(item.id, item);
      else {
        showLimitNotice();
        return;
      }
      replaceDraft(Array.from(next.values()));
    }
  };
  const onCardClick = (event: MouseEvent, item: FileItem) => {
    if (
      event.target instanceof Element &&
      event.target.closest(
        'button, a, input, label, select, textarea, [contenteditable], [role="button"], .a9-file-picker__checkbox'
      )
    )
      return;
    toggleItem(item);
  };
  const restorePreviewFocus = async (trigger: HTMLElement | undefined, id: string) => {
    if (activePreview.value !== id) return;
    activePreview.value = undefined;
    await nextTick();
    if (!visible.value || !workspace.value?.isConnected) return;
    if (trigger?.isConnected && workspace.value.contains(trigger)) {
      trigger.focus();
      return;
    }
    const card = Array.from(workspace.value.querySelectorAll<HTMLElement>('[data-file-id]')).find(
      (element) => element.dataset.fileId === id
    );
    const control = card?.querySelector<HTMLElement>('input:not(:disabled)');
    const items = workspace.value.querySelector<HTMLElement>('.a9-file-picker__items');
    (control ?? items ?? workspace.value.querySelector<HTMLElement>('.a9-file-picker__search input'))?.focus();
  };
  const openPreview = (trigger: HTMLElement | undefined, item: FileItem) => {
    const url = safeFileUrl(item.url);
    if (!visible.value || interactionDisabled.value || fileActionBusy.value || previewItem.value || !url) return;
    previewTrigger = trigger;
    previewItem.value = { id: item.id, name: item.name, url };
    activePreview.value = item.id;
  };
  const onPreviewClosed = () => {
    const item = previewItem.value;
    previewItem.value = undefined;
    if (item) restorePreviewFocus(previewTrigger, item.id);
    previewTrigger = undefined;
  };
  watch(
    [list, visible, interactionDisabled],
    () => {
      const item = previewItem.value;
      if (
        item &&
        (!visible.value ||
          interactionDisabled.value ||
          !list.value.some((entry) => entry.id === item.id && safeFileUrl(entry.url) === item.url && isSelectable(entry)))
      )
        preview.value?.close();
    },
    { deep: true }
  );
  const removeCommitted = async (id: string) => {
    if (interactionDisabled.value || !props.allowClear) return;
    const next = committedItems.value.filter((item) => item.id !== id);
    replaceDraft(next, visible.value);
    if (emitCommittedValue(next) && next.length === 0) emit('clear');
    await nextTick();
    triggerRoot.value?.querySelector<HTMLElement>('[data-testid="file-picker-trigger"], button')?.focus();
  };
  const onUploadTasksChange = (tasks: readonly FileUploadTask[]) => {
    uploading.value = tasks.some((task) => task.status === 'pending' || task.status === 'uploading');
  };

  const onUploadResponse = (item: FileItem) => emit('uploadSuccess', item);
  const onUploadError = (failure: FileUploadFailure) => emit('uploadError', failure.error);
  const onUploadComplete = async (result: FileUploadBatchResult) => {
    if (!visible.value) return;
    const hasResolvedResponse = result.succeeded.length > 0 || result.failed.some((failure) => Boolean(failure.task.item));
    if (hasResolvedResponse) await refresh();
  };

  watch(
    () => props.modelValue,
    () => syncExternalModel(),
    { deep: true, immediate: true }
  );
  watch(
    () => [props.multiple, props.limit] as const,
    () => syncExternalModel()
  );
  watch(
    () => allowedFileTypes.value.join('|'),
    () => {
      uploader.value?.clear();
      resetBrowseScope(true);
      syncExternalModel();
      if (visible.value && hasAllowedTypes.value) refresh();
    }
  );
  watch(
    () => [resolvedService.value, props.canUpload] as const,
    () => {
      requireService();
      uploader.value?.clear();
      resetBrowseScope(false);
      if (visible.value && hasAllowedTypes.value) refresh();
    }
  );
  watch(
    () => props.canCreateGroup,
    () => {
      requireService();
      if (!props.canCreateGroup) closeCreateGroup();
    }
  );
  watch(
    () => [props.canDeleteFiles, props.canMoveFiles],
    () => {
      requireService();
      if (moreVisible.value || moveVisible.value) closeMore();
      invalidateFileActions();
    }
  );
  watch(configuredPageSize, async () => {
    pendingPageReset = true;
    if (!visible.value || !hasAllowedTypes.value) return;
    await nextTick();
    measureLayout();
    fetchList();
  });

  watch(interactionDisabled, (value) => {
    if (value) close();
  });
  watch(() => props.limit, clearLimitNotice);
  onBeforeUnmount(() => {
    invalidateRequests();
    clearLimitNotice();
    layoutObserver?.disconnect();
    viewportQuery?.removeEventListener('change', updateViewport);
    heightQuery?.removeEventListener('change', updateViewport);
  });
  defineExpose<AFilePickerExposed>({ open, close, clear, refresh });
</script>

<template>
  <div class="a9-file-picker">
    <div class="a9-file-picker__trigger-row">
      <div
        ref="triggerRoot"
        class="a9-file-picker__trigger"
        @pointerdown.capture="rememberTrigger"
        @focusin.capture="rememberTrigger"
      >
        <slot
          name="trigger"
          :open="open"
          :selected-items="selectedItems"
          :selected-count="selectedCount"
          :disabled="interactionDisabled"
        >
          <a-button
            v-if="multiple || !selectedCount"
            :disabled="interactionDisabled"
            :size="mergedSize"
            data-testid="file-picker-trigger"
            @click="open"
          >
            <template #icon><icon-folder /></template>
            {{ triggerLabel }}
            <span v-if="selectedCount">({{ selectedCount }})</span>
          </a-button>
          <ul v-if="selectedCount" class="a9-file-picker__committed" :aria-label="t('admin9Ui.filePicker.selectedFiles')">
            <li v-for="item in selectedItems" :key="item.id">
              <icon-file />
              <a
                v-if="safeFileUrl(item.url)"
                :href="safeFileUrl(item.url)"
                target="_blank"
                rel="noopener noreferrer"
                :title="item.name"
                >{{ item.name }}</a
              >
              <span v-else>{{ item.name }}</span>
              <a-button
                v-if="!multiple && !interactionDisabled"
                data-testid="file-picker-replace"
                type="text"
                size="mini"
                @click="open"
                >{{ t('admin9Ui.filePicker.replace') }}</a-button
              >
              <a-button
                v-if="allowClear && !interactionDisabled"
                type="text"
                size="mini"
                :aria-label="t('admin9Ui.filePicker.removeItem', { name: item.name })"
                @click="removeCommitted(item.id)"
              >
                <template #icon><icon-close /></template>
              </a-button>
            </li>
          </ul>
          <a-button
            v-if="multiple && selectedCount > 1 && allowClear && !interactionDisabled"
            type="text"
            :size="mergedSize"
            data-testid="file-picker-clear"
            @click="clear"
            >{{ t('admin9Ui.filePicker.clear') }}</a-button
          >
        </slot>
      </div>
      <a-tooltip
        v-if="$slots.trigger && allowClear && selectedCount && !interactionDisabled"
        :content="t('admin9Ui.filePicker.clear')"
      >
        <a-button
          type="text"
          status="danger"
          :aria-label="t('admin9Ui.filePicker.clear')"
          data-testid="file-picker-clear"
          :size="mergedSize"
          @click="clear"
        >
          <template #icon><icon-close /></template>
        </a-button>
      </a-tooltip>
    </div>

    <a-modal
      :visible="visible"
      :title="
        t(
          allowedFileTypes.length === 1 && allowedFileTypes[0] === 'image'
            ? 'admin9Ui.imagePicker.choose'
            : 'admin9Ui.filePicker.title'
        )
      "
      width="calc(100vw - 32px)"
      :modal-style="{
        display: 'inline-flex',
        height: 'min(800px, calc(100dvh - 32px))',
        maxWidth: '1040px',
        maxHeight: 'calc(100dvh - 32px)',
        flexDirection: 'column',
      }"
      :body-style="{ flex: 1, minHeight: 0, padding: '16px', overflow: shortViewport ? 'auto' : 'visible' }"
      modal-class="a9-file-picker-modal"
      unmount-on-close
      :esc-to-close="!activePreview && !createGroupVisible && !deleteVisible && !moreVisible"
      @cancel="close"
      @close="restoreTriggerFocus"
    >
      <FormItem no-style :validate-trigger="[]">
        <div
          ref="workspace"
          class="a9-file-picker__workspace"
          :class="{ 'without-groups': !hasGroupNavigation, 'is-short': shortViewport }"
          @keydown="onMoreKeydown"
        >
          <aside
            v-if="hasGroupNavigation && !narrow"
            class="a9-file-picker__sidebar"
            :aria-label="t('admin9Ui.filePicker.groups')"
          >
            <div class="a9-file-picker__sidebar-title">
              <span>{{ t('admin9Ui.filePicker.groups') }}</span>
              <a-tooltip v-if="canCreateGroup" :content="t('admin9Ui.filePicker.createGroup')">
                <a-button
                  type="text"
                  size="mini"
                  :disabled="createGroupDisabled"
                  :aria-label="t('admin9Ui.filePicker.createGroup')"
                  data-testid="file-picker-create-group"
                  @click="openCreateGroup"
                >
                  <template #icon><icon-plus /></template>
                </a-button>
              </a-tooltip>
            </div>
            <div class="a9-file-picker__group-list">
              <button
                type="button"
                class="a9-file-picker__group-button"
                :class="{ 'is-active': activeGroupId === undefined }"
                :aria-pressed="activeGroupId === undefined"
                :disabled="uploading || fileActionBusy"
                @click="onGroupChange(undefined)"
              >
                <FileFolderIcon
                  :open="activeGroupId === undefined"
                  class="a9-file-picker__group-icon a9-file-picker__group-icon--folder"
                /><span>{{ t('admin9Ui.filePicker.groupAll') }}</span>
              </button>
              <button
                type="button"
                class="a9-file-picker__group-button"
                :class="{ 'is-active': activeGroupId === null }"
                :aria-pressed="activeGroupId === null"
                :disabled="uploading || fileActionBusy"
                @click="onGroupChange(null)"
              >
                <FileFolderIcon
                  :open="activeGroupId === null"
                  class="a9-file-picker__group-icon a9-file-picker__group-icon--folder"
                /><span>{{ t('admin9Ui.filePicker.groupUngrouped') }}</span>
              </button>
              <a-spin :loading="groupLoading" class="a9-file-picker__group-spin">
                <div
                  v-for="row in visibleGroupRows"
                  :key="row.group.id"
                  class="a9-file-picker__group-row"
                  :class="{ 'is-child': row.child, 'has-children': row.hasChildren }"
                >
                  <button
                    v-if="row.hasChildren"
                    type="button"
                    class="a9-file-picker__group-toggle"
                    :aria-expanded="!collapsedGroups.has(row.group.id)"
                    :aria-label="
                      t(
                        collapsedGroups.has(row.group.id)
                          ? 'admin9Ui.filePicker.expandGroup'
                          : 'admin9Ui.filePicker.collapseGroup',
                        { name: row.group.name }
                      )
                    "
                    @click="toggleGroup(row.group.id)"
                  >
                    <FileFolderIcon
                      :open="!collapsedGroups.has(row.group.id)"
                      class="a9-file-picker__group-icon a9-file-picker__group-icon--folder"
                    />
                  </button>
                  <button
                    type="button"
                    class="a9-file-picker__group-button"
                    :data-group-id="row.group.id"
                    :class="{ 'is-active': activeGroupId === row.group.id }"
                    :aria-label="row.label"
                    :aria-pressed="activeGroupId === row.group.id"
                    :disabled="uploading || fileActionBusy"
                    @click="onGroupChange(row.group.id)"
                  >
                    <FileFolderIcon
                      v-if="!row.hasChildren"
                      :open="activeGroupId === row.group.id"
                      class="a9-file-picker__group-icon a9-file-picker__group-icon--folder"
                    /><span :title="row.label">{{ row.group.name }}</span>
                  </button>
                </div>
              </a-spin>
            </div>
          </aside>

          <main class="a9-file-picker__main">
            <a-alert v-if="!hasAllowedTypes" type="warning" class="a9-file-picker__constraint-empty">
              {{ t('admin9Ui.filePicker.noAllowedTypes') }}
            </a-alert>

            <template v-else>
              <div v-if="hasGroupNavigation && narrow" class="a9-file-picker__compact-groups">
                <div class="a9-file-picker__group-select">
                  <a-select
                    v-model="groupFilter"
                    :loading="groupLoading"
                    :disabled="uploading || fileActionBusy"
                    :aria-label="t('admin9Ui.filePicker.groups')"
                  >
                    <a-option value="all">{{ t('admin9Ui.filePicker.groupAll') }}</a-option>
                    <a-option value="ungrouped">{{ t('admin9Ui.filePicker.groupUngrouped') }}</a-option>
                    <a-option v-for="row in groupRows" :key="row.group.id" :value="`group:${row.group.id}`">{{
                      row.label
                    }}</a-option>
                  </a-select>
                  <a-tooltip v-if="canCreateGroup" :content="t('admin9Ui.filePicker.createGroup')">
                    <a-button
                      :disabled="createGroupDisabled"
                      :aria-label="t('admin9Ui.filePicker.createGroup')"
                      data-testid="file-picker-create-group"
                      @click="openCreateGroup"
                    >
                      <template #icon><icon-plus /></template>
                    </a-button>
                  </a-tooltip>
                </div>
              </div>
              <div class="a9-file-picker__toolbar">
                <div class="a9-file-picker__filters">
                  <a-select
                    v-if="showsAggregateType"
                    v-model="typeFilter"
                    :disabled="fileActionBusy"
                    class="a9-file-picker__type-select"
                    :aria-label="t('admin9Ui.filePicker.fileTypes')"
                  >
                    <a-option value="">{{ t('admin9Ui.filePicker.typeAll') }}</a-option>
                    <a-option v-for="fileType in allowedFileTypes" :key="fileType" :value="fileType">
                      {{ t(`admin9Ui.filePicker.types.${fileType}`) }}
                    </a-option>
                  </a-select>
                  <a-input-search
                    v-model="keyword"
                    :disabled="fileActionBusy"
                    class="a9-file-picker__search"
                    :placeholder="t('admin9Ui.filePicker.searchPlaceholder')"
                    allow-clear
                    :button-text="t('admin9Ui.filePicker.search')"
                    search-button
                    @search="onSearch"
                    @press-enter="onSearch"
                    @clear="onSearch"
                  />
                </div>
                <div v-if="!narrow && (canDeleteFiles || canMoveFiles)" class="a9-file-picker__file-actions">
                  <a-button
                    v-if="canDeleteFiles"
                    status="danger"
                    :disabled="fileActionsDisabled"
                    data-testid="file-picker-delete-selected"
                    @click="openDelete"
                  >
                    {{ t('admin9Ui.filePicker.deleteSelected') }}
                  </a-button>
                  <Cascader
                    v-if="canMoveFiles"
                    class="a9-file-picker__move"
                    :model-value="''"
                    :options="moveOptions"
                    :disabled="fileActionsDisabled || !groupsLoaded || groupLoading"
                    :placeholder="t('admin9Ui.filePicker.moveToGroup')"
                    :aria-label="t('admin9Ui.filePicker.moveToGroup')"
                    check-strictly
                    allow-search
                    @change="moveFiles"
                  />
                </div>
                <div class="a9-file-picker__toolbar-actions">
                  <a-tooltip :content="t('admin9Ui.filePicker.refresh')">
                    <a-button
                      :aria-label="t('admin9Ui.filePicker.refresh')"
                      :loading="loading"
                      :disabled="fileActionBusy"
                      data-testid="file-picker-refresh"
                      @click="refresh"
                    >
                      <template #icon><icon-refresh /></template>
                    </a-button>
                  </a-tooltip>
                  <a-radio-group v-model="view" type="button" class="a9-file-picker__view-toggle" :disabled="fileActionBusy">
                    <a-tooltip :content="t('admin9Ui.filePicker.gridView')">
                      <a-radio value="grid" :aria-label="t('admin9Ui.filePicker.gridView')"><icon-apps /></a-radio>
                    </a-tooltip>
                    <a-tooltip :content="t('admin9Ui.filePicker.listView')">
                      <a-radio value="list" :aria-label="t('admin9Ui.filePicker.listView')"><icon-list /></a-radio>
                    </a-tooltip>
                  </a-radio-group>
                  <Popover
                    v-if="narrow && (canDeleteFiles || canMoveFiles)"
                    v-model:popup-visible="moreVisible"
                    trigger="click"
                    position="br"
                  >
                    <span ref="moreTrigger" @keydown="onMoreKeydown">
                      <a-button :aria-expanded="moreVisible" data-testid="file-picker-more">{{
                        t('admin9Ui.filePicker.more')
                      }}</a-button>
                    </span>
                    <template #content>
                      <div class="a9-file-picker__file-actions" @keydown.capture="onMoreKeydown">
                        <a-button
                          v-if="canDeleteFiles"
                          status="danger"
                          :disabled="fileActionsDisabled"
                          data-testid="file-picker-delete-selected"
                          @click="openDelete"
                        >
                          {{ t('admin9Ui.filePicker.deleteSelected') }}
                        </a-button>
                        <Cascader
                          v-if="canMoveFiles"
                          :popup-visible="moveVisible"
                          class="a9-file-picker__move"
                          :model-value="''"
                          :options="moveOptions"
                          :disabled="fileActionsDisabled || !groupsLoaded || groupLoading"
                          :placeholder="t('admin9Ui.filePicker.moveToGroup')"
                          :aria-label="t('admin9Ui.filePicker.moveToGroup')"
                          check-strictly
                          allow-search
                          @popup-visible-change="moveVisible = $event"
                          @change="moveFiles"
                        />
                      </div>
                    </template>
                  </Popover>
                  <div v-if="canUpload" class="a9-file-picker__upload">
                    <AFileUploader
                      ref="uploader"
                      :disabled="fileActionBusy"
                      :service="resolvedService"
                      :file-types="allowedFileTypes"
                      :group-id="uploadGroupId"
                      :accept="accept"
                      :button-text="t('admin9Ui.filePicker.upload')"
                      @success="onUploadResponse"
                      @error="onUploadError"
                      @complete="onUploadComplete"
                      @tasks-change="onUploadTasksChange"
                    >
                      <template #result="{ succeededCount, dismiss }">
                        <Teleport v-if="uploadFeedback" :to="uploadFeedback">
                          <div v-if="succeededCount" class="a9-file-picker__upload-result" role="status">
                            <a-tooltip
                              :content="t('admin9Ui.filePicker.uploaded', { count: succeededCount })"
                              :trigger="['hover', 'focus']"
                              ><span tabindex="0">{{
                                t('admin9Ui.filePicker.uploaded', { count: succeededCount })
                              }}</span></a-tooltip
                            >
                            <a-button v-if="hasFilters" type="text" size="mini" @click="clearFilters">{{
                              t('admin9Ui.filePicker.clearFilters')
                            }}</a-button>
                            <a-button
                              type="text"
                              size="mini"
                              :aria-label="t('admin9Ui.fileUploader.dismissResult')"
                              @click="dismiss"
                              ><template #icon><icon-close /></template
                            ></a-button>
                          </div>
                        </Teleport>
                      </template>
                    </AFileUploader>
                  </div>
                </div>
              </div>

              <div ref="results" class="a9-file-picker__results" :style="{ '--a9-file-picker-columns': gridColumns }">
                <a-alert v-if="listError" type="error" class="a9-file-picker__list-error">
                  {{ t('admin9Ui.filePicker.loadFailed') }}
                  <a-button type="text" size="small" data-testid="file-picker-retry-list" @click="fetchList()">{{
                    t('admin9Ui.filePicker.retry')
                  }}</a-button>
                </a-alert>
                <a-spin v-else :loading="loading" class="a9-file-picker__spin">
                  <div
                    v-if="!listError && !empty"
                    class="a9-file-picker__items"
                    :data-view="view"
                    :aria-label="t('admin9Ui.filePicker.results')"
                    role="group"
                    tabindex="-1"
                  >
                    <article
                      v-for="(item, index) in list"
                      :key="`${item.id || `${item.type}-${item.name}`}:${index}`"
                      class="a9-file-picker__item"
                      :class="{
                        'is-selected': draftMap.has(item.id),
                        'is-disabled': !isSelectable(item),
                        'is-custom': !!$slots.item,
                      }"
                      :data-file-id="item.id"
                      @click="onCardClick($event, item)"
                    >
                      <span
                        v-if="view === 'grid' && draftMap.has(item.id)"
                        class="a9-file-picker__selection-order"
                        aria-hidden="true"
                        >{{ draftItems.findIndex((selected) => selected.id === item.id) + 1 }}</span
                      >
                      <FileSelection
                        v-if="$slots.item"
                        :card="view === 'grid'"
                        :selected="draftMap.has(item.id)"
                        :disabled="fileActionBusy || !isSelectable(item)"
                        :name="item.name"
                        @toggle="toggleItem(item)"
                      />
                      <slot
                        name="item"
                        :item="item"
                        :available="isSelectable(item)"
                        :selected="draftMap.has(item.id)"
                        :view="view"
                      >
                        <FileItemView
                          :item="item"
                          :available="isSelectable(item)"
                          :status-label="statusLabel(item)"
                          :view="view"
                          :preview-enabled="visible && !interactionDisabled && !fileActionBusy"
                          @preview-open="openPreview($event, item)"
                        >
                          <template #selection>
                            <FileSelection
                              :card="view === 'grid'"
                              :selected="draftMap.has(item.id)"
                              :disabled="fileActionBusy || !isSelectable(item)"
                              :name="item.name"
                              @toggle="toggleItem(item)"
                            />
                          </template>
                        </FileItemView>
                      </slot>
                    </article>
                  </div>
                  <div v-else-if="empty" class="a9-file-picker__empty">
                    <slot name="empty" :constrained="false"><a-empty :description="emptyDescription" /></slot>
                    <a-button v-if="hasFilters" type="text" @click="clearFilters">{{
                      t('admin9Ui.filePicker.clearFilters')
                    }}</a-button>
                  </div>
                </a-spin>
              </div>
            </template>
          </main>
        </div>
      </FormItem>
      <template #footer>
        <div class="a9-file-picker__footer-content" @keydown="onMoreKeydown">
          <div v-if="limitNotice" class="a9-file-picker__limit-notice" role="status">{{
            t('admin9Ui.filePicker.limitReached', { count: limit })
          }}</div>
          <div class="a9-file-picker__feedback-strip">
            <div v-if="!draftCount && needsEmptyCommit" class="a9-file-picker__notice" role="status">
              <a-tooltip :content="t('admin9Ui.filePicker.confirmEmpty')" :trigger="['hover', 'focus']"
                ><span tabindex="0">{{ t('admin9Ui.filePicker.confirmEmpty') }}</span></a-tooltip
              >
            </div>
            <div v-if="uploading && hasGroupNavigation" class="a9-file-picker__hint" role="status">
              <a-tooltip :content="t('admin9Ui.filePicker.groupLocked')" :trigger="['hover', 'focus']"
                ><span tabindex="0">{{ t('admin9Ui.filePicker.groupLocked') }}</span></a-tooltip
              >
            </div>
            <div v-if="groupError" class="a9-file-picker__group-error" role="alert">
              <a-tooltip :content="t('admin9Ui.filePicker.groupLoadFailed')" :trigger="['hover', 'focus']"
                ><span tabindex="0">{{ t('admin9Ui.filePicker.groupLoadFailed') }}</span></a-tooltip
              >
              <a-button type="text" size="mini" data-testid="file-picker-retry-groups" @click="fetchGroups">{{
                t('admin9Ui.filePicker.retry')
              }}</a-button>
            </div>
            <div v-if="fileActionFeedback" class="a9-file-picker__file-result" role="status">
              <a-tooltip :content="fileActionMessage" :trigger="['hover', 'focus']"
                ><span tabindex="0">{{ fileActionMessage }}</span></a-tooltip
              >
              <a-button
                type="text"
                size="mini"
                :aria-label="t('admin9Ui.fileUploader.dismissResult')"
                @click="fileActionFeedback = undefined"
                ><template #icon><icon-close /></template
              ></a-button>
            </div>
            <div ref="uploadFeedback" class="a9-file-picker__feedback" />
          </div>
          <div class="a9-file-picker__footer">
            <span v-if="multiple" class="a9-file-picker__selected-count" role="status">{{ selectionLabel }}</span>
            <div class="a9-file-picker__pagination">
              <Pagination
                v-show="hasAllowedTypes && total > resolvedPageSize && !listError"
                :current="current"
                :page-size="resolvedPageSize || 1"
                :total="total"
                :disabled="fileActionBusy"
                simple
                data-testid="file-picker-pagination"
                @change="onPageChange"
              />
            </div>
            <div class="a9-file-picker__footer-actions">
              <a-button :size="narrow ? 'small' : undefined" @click="close">{{ t('admin9Ui.filePicker.cancel') }}</a-button>
              <a-button type="primary" :size="narrow ? 'small' : undefined" :disabled="!canConfirm" @click="confirm">
                {{ t('admin9Ui.filePicker.confirm') }}
              </a-button>
            </div>
          </div>
        </div>
      </template>
    </a-modal>
    <Modal
      :visible="createGroupVisible"
      :title="t('admin9Ui.filePicker.createGroup')"
      width="calc(100vw - 32px)"
      :modal-style="{ maxWidth: '420px' }"
      :footer="false"
      unmount-on-close
      modal-class="a9-file-picker-create-group"
      @open="groupNameInput?.focus()"
      @cancel="closeCreateGroup"
      @close="restoreGroupCreateFocus"
    >
      <FormItem no-style :validate-trigger="[]">
        <Form :model="groupForm" layout="vertical" @submit-success="createGroup">
          <FormItem
            field="name"
            :label="t('admin9Ui.filePicker.groupName')"
            :validate-status="groupNameError ? 'error' : undefined"
            :help="groupNameError ? t('admin9Ui.filePicker.groupNameRequired') : undefined"
            :validate-trigger="[]"
          >
            <Input
              ref="groupNameInput"
              v-model="groupForm.name"
              :disabled="creatingGroup"
              :aria-label="t('admin9Ui.filePicker.groupName')"
              @input="groupNameError = false"
            />
          </FormItem>
          <FormItem field="parentId" :label="t('admin9Ui.filePicker.parentGroup')" :validate-trigger="[]">
            <a-select v-model="groupForm.parentId" :disabled="creatingGroup" :aria-label="t('admin9Ui.filePicker.parentGroup')">
              <a-option value="">{{ t('admin9Ui.filePicker.rootGroup') }}</a-option>
              <a-option v-for="group in rootGroups" :key="group.id" :value="group.id">{{ group.name }}</a-option>
            </a-select>
          </FormItem>
          <a-alert v-if="groupCreateError" type="error" role="alert">{{ t('admin9Ui.filePicker.groupCreateFailed') }}</a-alert>
          <div class="a9-file-picker__create-actions">
            <a-button @click="closeCreateGroup">{{ t('admin9Ui.filePicker.cancel') }}</a-button>
            <a-button type="primary" html-type="submit" :loading="creatingGroup" :disabled="createGroupDisabled">{{
              t('admin9Ui.filePicker.create')
            }}</a-button>
          </div>
        </Form>
      </FormItem>
    </Modal>
    <Modal
      :visible="deleteVisible"
      :title="t('admin9Ui.filePicker.deleteSelected')"
      width="calc(100vw - 32px)"
      :modal-style="{ maxWidth: '420px' }"
      :footer="false"
      :closable="!fileActionBusy"
      :esc-to-close="!fileActionBusy"
      :mask-closable="!fileActionBusy"
      unmount-on-close
      modal-class="a9-file-picker-delete"
      @cancel="deleteVisible = false"
      @close="restoreDeleteFocus"
    >
      <p>{{ t('admin9Ui.filePicker.deleteConfirm', { count: deleteIds.length }) }}</p>
      <div class="a9-file-picker__create-actions">
        <a-button :disabled="fileActionBusy" @click="deleteVisible = false">{{ t('admin9Ui.filePicker.cancel') }}</a-button>
        <a-button
          status="danger"
          type="primary"
          :loading="fileActionBusy"
          :disabled="fileActionBusy || !canDeleteFiles"
          @click="runFileAction('delete', deleteIds)"
        >
          {{ t('admin9Ui.filePicker.delete') }}
        </a-button>
      </div>
    </Modal>
    <FileImagePreview
      v-if="previewItem"
      ref="preview"
      :src="previewItem.url"
      :name="previewItem.name"
      @close="onPreviewClosed"
    />
  </div>
</template>

<style lang="less" scoped>
  .a9-file-picker {
    min-width: 0;

    &__trigger-row,
    &__toolbar,
    &__toolbar-actions,
    &__footer,
    &__footer-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    &__trigger {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: flex-start;
      min-width: 0;
    }

    &__trigger-row {
      align-items: flex-start;
    }

    &__filters {
      display: flex;
      flex: 1 1 200px;
      gap: 8px;
      min-width: 0;
    }

    &__filters :deep(.a9-file-picker__type-select) {
      flex: 0 0 112px;
      width: 112px;
    }

    &__sidebar-title {
      padding: 8px 10px;
      color: var(--color-text-3);
      font-size: 12px;
    }

    &__hint {
      margin: 0;
      color: var(--color-text-3);
      font-size: 12px;
      line-height: 1.5;
    }

    &__upload {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      max-width: 300px;
    }

    &__upload-result {
      display: flex;
      gap: 4px;
      align-items: center;
      min-width: 0;
      color: var(--color-text-2);
      font-size: 12px;
    }

    &__footer-content {
      position: relative;
    }

    &__feedback:empty {
      display: none;
    }

    &__feedback-strip {
      display: flex;
      gap: 8px;
      align-items: center;
      min-width: 0;
      height: 24px;
      margin-bottom: 8px;
      text-align: left;
    }

    &__feedback-strip > div,
    &__feedback-strip :deep(.a9-file-picker__upload-result) {
      display: flex;
      flex: 1 1 0;
      gap: 4px;
      align-items: center;
      min-width: 0;
      margin: 0;
    }

    &__feedback-strip :deep(span[tabindex='0']) {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &__feedback-strip :deep(button) {
      flex: none;
    }

    &__file-actions {
      display: flex;
      flex: none;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      max-width: 100%;
    }

    &__file-actions :deep(.a9-file-picker__move) {
      width: 160px;
      max-width: 100%;
    }

    &__file-result {
      color: var(--color-text-2);
    }

    &__compact-groups {
      flex: none;
      margin-bottom: 12px;
    }

    &__group-select,
    &__sidebar-title {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
    }

    &__group-select :deep(.arco-select) {
      min-width: 0;
    }

    &__create-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 16px;
    }

    &__limit-notice {
      position: absolute;
      right: 16px;
      bottom: calc(100% + 8px);
      left: 16px;
      padding: 8px 12px;
      color: var(--color-text-1);
      text-align: left;
      background: var(--color-bg-popup);
      border: 1px solid var(--color-border-2);
      border-radius: 4px;
      box-shadow: 0 2px 8px rgb(0 0 0 / 12%);
    }

    &__selected-count {
      color: var(--color-text-2);
    }

    &__notice {
      margin-bottom: 8px;
      color: var(--color-text-2);
      text-align: left;
    }

    &__workspace {
      display: grid;
      grid-template-columns: 170px minmax(0, 1fr);
      min-width: 0;
      height: 100%;
      min-height: 0;

      &.without-groups {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    &__sidebar {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      min-height: 0;
      padding-right: 14px;
      border-right: 1px solid var(--color-neutral-3);
    }

    &__group-list {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 4px;
      min-height: 0;
      overflow: auto;
      overscroll-behavior: contain;
    }

    &__group-list > * {
      flex: none;
    }

    &__group-row {
      position: relative;

      &.is-child {
        padding-left: 20px;
      }
    }

    &__group-toggle {
      position: absolute;
      top: 6px;
      left: 6px;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      color: var(--color-text-2);
      background: transparent;
      border: 0;
      border-radius: 4px;
      cursor: pointer;

      &:hover {
        background: var(--color-fill-3);
      }

      &:focus-visible {
        outline: 2px solid rgb(var(--primary-6));
        outline-offset: -2px;
      }
    }

    &__group-icon {
      flex: none;
      font-size: 16px;

      &--folder {
        color: rgb(var(--gold-7));
        fill: rgb(var(--gold-3));
      }
    }

    &__group-button {
      display: flex;
      gap: 8px;
      align-items: center;
      width: 100%;
      min-width: 0;
      min-height: 36px;
      padding: 6px 10px;
      overflow: hidden;
      color: var(--color-text-2);
      font-size: 13px;
      line-height: 20px;
      text-align: left;
      background: transparent;
      border: 0;
      border-radius: 4px;
      cursor: pointer;

      span {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }

      small {
        margin-left: auto;
        color: var(--color-text-3);
      }

      &:hover {
        background: var(--color-fill-3);
      }

      &:focus-visible {
        outline: 2px solid rgb(var(--primary-6));
        outline-offset: -2px;
      }

      &.is-active {
        color: rgb(var(--primary-6));
        font-weight: 500;
        background: var(--color-primary-light-1);
      }
    }

    &__group-row.has-children &__group-button {
      padding-left: 34px;
    }

    &__main {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      padding-left: 16px;
    }

    &__workspace.without-groups &__main {
      padding-left: 0;
    }

    &__committed {
      width: fit-content;
      max-width: 100%;
      max-height: 120px;
      margin: 8px 0;
      padding: 0;
      overflow-y: auto;
      list-style: none;
    }

    &__committed li {
      display: flex;
      gap: 8px;
      align-items: center;
      width: fit-content;
      min-width: 0;
      max-width: 100%;
    }

    &__committed li a,
    &__committed li > span {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &__committed li a,
    &__committed li a:visited {
      color: rgb(var(--primary-7));
      text-decoration: none;
    }

    &__committed li a:hover {
      color: rgb(var(--primary-8));
      text-decoration: underline;
    }

    &__committed li a:focus-visible {
      outline: 2px solid rgb(var(--primary-6));
      outline-offset: 2px;
    }

    &__committed li > svg {
      flex: none;
      color: var(--color-text-2);
    }

    &__committed li button {
      flex: none;
    }

    &__constraint-empty {
      margin-top: 24px;
    }

    &__toolbar {
      flex: none;
      flex-wrap: wrap;
      justify-content: space-between;
      min-width: 0;
      margin-bottom: 12px;
    }

    &__filters :deep(.a9-file-picker__search) {
      flex: 1;
      min-width: 0;
    }

    &__toolbar-actions {
      flex: none;
      margin-left: auto;
    }

    &__list-error {
      margin-bottom: 12px;
    }

    &__group-spin {
      display: block;
      width: 100%;
    }

    &__spin {
      display: block;
      width: 100%;
      min-height: 100%;
    }

    &__results {
      flex: 1;
      min-width: 0;
      min-height: 0;
      overflow: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }

    &__workspace.is-short {
      min-height: 320px;
    }

    &__workspace.is-short &__results {
      flex: none;
      height: 128px;
      min-height: 128px;
    }

    &__items {
      display: grid;
      grid-template-columns: repeat(var(--a9-file-picker-columns, 1), minmax(0, 1fr));
      gap: 12px;
      align-content: start;
      min-width: 0;
    }

    &__item {
      position: relative;
      min-width: 0;
      padding: 9px;
      overflow: hidden;
      background: var(--color-bg-2);
      border: 1px solid var(--color-neutral-3);
      border-radius: 6px;
      cursor: pointer;

      &.is-selected {
        border-color: rgb(var(--primary-6));
        box-shadow: 0 0 0 1px rgb(var(--primary-6));
      }

      &:not(.is-disabled, .is-selected):hover {
        background: var(--color-fill-1);
        border-color: var(--color-neutral-6);
      }

      &.is-disabled {
        cursor: not-allowed;
      }

      &.is-custom {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 8px;
        align-items: start;
      }
    }

    &__checkbox {
      flex: none;
      margin: 0;
      padding: 0;
      background: transparent;
      border-radius: 4px;
    }

    &__checkbox :deep(.arco-checkbox-icon) {
      background-color: var(--color-bg-2);
      border-color: var(--color-neutral-8);
    }

    &__checkbox :deep(.arco-checkbox-icon-check) {
      color: #fff;
    }

    &__checkbox :deep(input:focus-visible ~ .arco-checkbox-icon-hover .arco-checkbox-icon) {
      outline: 2px solid rgb(var(--primary-6));
      outline-offset: 2px;
    }

    &__checkbox.arco-checkbox-checked :deep(.arco-checkbox-icon) {
      background-color: rgb(var(--primary-6));
      border-color: rgb(var(--primary-6));
    }

    &__item.is-disabled &__checkbox :deep(.arco-checkbox-icon) {
      background-color: var(--color-fill-2);
      border-color: var(--color-neutral-5);
    }

    &__selection-order {
      position: absolute;
      top: 14px;
      right: 14px;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;
      padding: 0 4px;
      color: #fff;
      font-size: 12px;
      background: rgb(var(--primary-6));
      border: 2px solid var(--color-bg-2);
      border-radius: 14px;
      pointer-events: none;
    }

    &__items[data-view='grid'] :deep(.a9-file-picker__item:has(input:focus-visible)) {
      outline: 2px solid rgb(var(--primary-6));
      outline-offset: 3px;
    }

    &__items[data-view='grid'] &__item.is-custom {
      grid-template-columns: minmax(0, 1fr);
    }

    &__items[data-view='list'] {
      grid-template-columns: minmax(0, 1fr);

      .a9-file-picker__item {
        padding: 8px;
      }

      :deep(.a9-file-item) {
        display: grid;
        grid-template-columns: auto 64px minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
      }

      :deep(.a9-file-item__visual) {
        grid-column: 2;
        height: 48px;
        aspect-ratio: auto;
      }

      :deep(.a9-file-item__details) {
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding-top: 0;
      }
    }

    &__items[data-view='list'] :deep(.a9-file-item__heading) {
      margin-top: 0;
    }

    @media (hover: hover) and (pointer: fine) {
      &__item :deep(.a9-file-item__actions) {
        opacity: 0;
        pointer-events: none;
      }

      &__item:hover :deep(.a9-file-item__actions),
      &__item:focus-within :deep(.a9-file-item__actions) {
        opacity: 1;
        pointer-events: auto;
      }
    }

    @media (any-pointer: coarse) {
      &__item :deep(.a9-file-item__actions) {
        opacity: 1;
        pointer-events: auto;
      }
    }

    &__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100%;
    }

    &__footer {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      min-width: 0;
    }

    &__pagination {
      grid-column: 2;
      min-width: 110px;
      min-height: 32px;
    }

    &__footer-actions {
      grid-column: 3;
      justify-self: end;
    }

    &__footer-status {
      min-width: 86px;
      color: var(--color-text-2);
    }
  }

  @media (width <= 720px) {
    .a9-file-picker {
      &__workspace {
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      &__sidebar {
        flex-direction: column;
        max-height: 180px;
        padding-right: 0;
        padding-bottom: 10px;
        overflow: auto;
        border-right: 0;
        border-bottom: 1px solid var(--color-neutral-3);
      }

      &__main {
        flex: 1;
        padding-top: 0;
        padding-left: 0;
      }

      &__filters {
        flex-basis: 100%;
      }

      &__upload {
        max-width: 100%;
      }

      &__toolbar-actions {
        flex-wrap: wrap;
        justify-content: flex-end;
        max-width: 100%;
      }

      &__selected-count {
        font-size: 12px;
        white-space: nowrap;
      }

      &__footer {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
      }

      &__pagination {
        grid-row: 2;
        grid-column: 1 / -1;
        justify-self: center;
      }

      &__footer-actions {
        grid-row: 1;
        grid-column: 2;
        margin-left: auto;
      }
    }
  }
</style>
