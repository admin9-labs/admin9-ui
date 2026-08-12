<script setup lang="ts">
  import { computed, inject, onMounted, ref, watch } from 'vue';
  import { Message } from '@arco-design/web-vue';
  import type { RequestOption, UploadRequest } from '@arco-design/web-vue';
  import { useI18n } from 'vue-i18n';
  import FileItemView from '../../internal/file-item.vue';
  import admin9UIOptionsKey from '../../internal/options';
  import type { FileGroup, FileItem, FileListParams, FilePickerAdapter, FileType } from '../../services/types';

  type ModelValue = FileItem | FileItem[] | undefined;
  type FileView = 'grid' | 'list';
  type GroupId = string | null | undefined;

  const FILE_TYPES: readonly FileType[] = ['image', 'video', 'audio', 'document', 'archive', 'other'];
  const FILE_TYPE_SET = new Set<FileType>(FILE_TYPES);

  const props = withDefaults(
    defineProps<{
      modelValue?: ModelValue;
      fileTypes?: readonly FileType[];
      multiple?: boolean;
      limit?: number;
      pageSize?: number;
      buttonText?: string;
      accept?: string;
      canUpload?: boolean;
      initialView?: FileView;
      service?: FilePickerAdapter;
    }>(),
    {
      modelValue: undefined,
      fileTypes: () => ['image', 'video', 'audio', 'document', 'archive', 'other'],
      multiple: false,
      limit: 0,
      pageSize: 24,
      buttonText: '',
      accept: undefined,
      canUpload: false,
      initialView: 'grid',
      service: undefined,
    }
  );

  const emit = defineEmits<{
    (e: 'update:modelValue', value: ModelValue): void;
    (e: 'change', items: FileItem[]): void;
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
    return service;
  };
  requireService();

  const normalizeFileTypes = (values: readonly FileType[] | undefined): FileType[] => {
    if (!Array.isArray(values)) return [...FILE_TYPES];
    const normalized: FileType[] = [];
    values.forEach((value) => {
      if (FILE_TYPE_SET.has(value) && !normalized.includes(value)) normalized.push(value);
    });
    return normalized;
  };
  const allowedFileTypes = computed(() => normalizeFileTypes(props.fileTypes));
  const allowedTypeSet = computed(() => new Set(allowedFileTypes.value));
  const hasAllowedTypes = computed(() => allowedFileTypes.value.length > 0);
  const showsAggregateType = computed(() => allowedFileTypes.value.length > 1);

  const visible = ref(false);
  const view = ref<FileView>(props.initialView);
  const activeFileType = ref<FileType | undefined>();
  const activeGroupId = ref<GroupId>(undefined);
  const list = ref<FileItem[]>([]);
  const groups = ref<FileGroup[]>([]);
  const current = ref(1);
  const resolvedPageSize = ref(props.pageSize);
  const total = ref(0);
  const keyword = ref('');
  const loading = ref(false);
  const listError = ref(false);
  const groupLoading = ref(false);
  const groupError = ref(false);
  const draftMap = ref(new Map<string, FileItem>());
  const committedItems = ref<FileItem[]>([]);
  const uploadCounts = ref(new Map<number, number>());
  let viewGeneration = 0;
  let latestListRequest = 0;
  let latestGroupRequest = 0;
  let lastCorrectionSignature = '';

  const GROUP_ALL = '__admin9_ui_file_picker_all__';
  const GROUP_UNGROUPED = '__admin9_ui_file_picker_ungrouped__';
  const GROUP_PREFIX = '__admin9_ui_file_picker_group__:';
  const groupOptionValue = (id: string) => `${GROUP_PREFIX}${id}`;

  const hasGroupNavigation = computed(
    () => Boolean(activeFileType.value) && typeof resolvedService.value?.listGroups === 'function'
  );
  const selectedItems = computed(() => committedItems.value);
  const selectedCount = computed(() => committedItems.value.length);
  const draftItems = computed(() => Array.from(draftMap.value.values()));
  const draftCount = computed(() => draftMap.value.size);
  const selectedDraftId = computed(() => draftItems.value[0]?.id ?? '');
  const uploadLoading = computed(() => (uploadCounts.value.get(viewGeneration) ?? 0) > 0);
  const empty = computed(() => list.value.length === 0 && !loading.value && !listError.value);
  const aggregateLabel = computed(() =>
    allowedFileTypes.value.length === FILE_TYPES.length
      ? t('admin9Ui.filePicker.typeAll')
      : t('admin9Ui.filePicker.typeAllowed')
  );
  const triggerLabel = computed(() => props.buttonText || t('admin9Ui.filePicker.trigger'));

  const hasStableId = (item: FileItem) => typeof item.id === 'string' && item.id.trim().length > 0;
  const hasUsableUrl = (item: FileItem) => typeof item.url === 'string' && item.url.trim().length > 0;
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
    draftMap.value = new Map(next.map((item) => [item.id, item]));
    if (notify) emit('selectionChange', next);
    return true;
  };
  const itemSignature = (item: FileItem) => JSON.stringify(itemFields.map((field) => item[field] ?? null));
  const inputSignature = (value: ModelValue) => {
    if (Array.isArray(value)) return `array:${value.map(itemSignature).join('|')}`;
    return value ? `item:${itemSignature(value)}` : 'empty';
  };
  const outputValue = (items: FileItem[]): ModelValue => (props.multiple ? items : items[0]);
  const modelMatches = (value: ModelValue, items: FileItem[]) => {
    if (items.length === 0 && value === undefined) return true;
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
    if (sameItems(committedItems.value, next)) return false;
    committedItems.value = next;
    emit('update:modelValue', outputValue(next));
    emit('change', next);
    return true;
  };
  const syncExternalModel = () => {
    const input = props.modelValue;
    const next = sanitizeItems(itemsFromModel(input));
    committedItems.value = next;
    if (visible.value) replaceDraft(next);
    if (modelMatches(input, next)) {
      lastCorrectionSignature = '';
      return;
    }
    const signature = `${props.multiple}:${inputSignature(input)}=>${next.map(itemSignature).join('|')}`;
    if (signature === lastCorrectionSignature) return;
    lastCorrectionSignature = signature;
    emit('update:modelValue', outputValue(next));
    emit('change', next);
  };

  const defaultActiveType = () => (allowedFileTypes.value.length === 1 ? allowedFileTypes.value[0] : undefined);
  const invalidateRequests = () => {
    viewGeneration += 1;
    latestListRequest += 1;
    latestGroupRequest += 1;
    loading.value = false;
    groupLoading.value = false;
  };
  const resetBrowseScope = (resetKeyword: boolean) => {
    invalidateRequests();
    activeFileType.value = defaultActiveType();
    activeGroupId.value = undefined;
    current.value = 1;
    if (resetKeyword) keyword.value = '';
    list.value = [];
    groups.value = [];
    total.value = 0;
    listError.value = false;
    groupError.value = false;
  };

  const buildListParams = (): FileListParams => {
    const base = {
      page: current.value,
      pageSize: resolvedPageSize.value,
      keyword: keyword.value.trim() || undefined,
    };
    if (activeFileType.value) return { ...base, fileType: activeFileType.value, groupId: activeGroupId.value };
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

  const fetchList = async () => {
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

  const fetchGroups = async () => {
    const service = requireService();
    const fileType = activeFileType.value;
    latestGroupRequest += 1;
    const request = latestGroupRequest;
    const generation = viewGeneration;
    if (!visible.value || !fileType || !service.listGroups) {
      groups.value = [];
      groupError.value = false;
      groupLoading.value = false;
      return;
    }
    groupLoading.value = true;
    groupError.value = false;
    try {
      const next = await service.listGroups(fileType);
      if (generation === viewGeneration && request === latestGroupRequest && service === resolvedService.value) {
        groups.value = next;
      }
    } catch {
      if (generation !== viewGeneration || request !== latestGroupRequest || service !== resolvedService.value) return;
      groups.value = [];
      groupError.value = true;
    } finally {
      if (generation === viewGeneration && request === latestGroupRequest && service === resolvedService.value) {
        groupLoading.value = false;
      }
    }
  };

  const refresh = async () => {
    if (!hasAllowedTypes.value || !visible.value) return;
    await Promise.all([fetchList(), fetchGroups()]);
  };
  const selectFileType = (fileType: FileType | undefined) => {
    if (activeFileType.value === fileType) return;
    invalidateRequests();
    activeFileType.value = fileType;
    activeGroupId.value = undefined;
    current.value = 1;
    groups.value = [];
    groupError.value = false;
    list.value = [];
    total.value = 0;
    refresh();
  };
  const onGroupChange = (groupId: GroupId) => {
    if (!activeFileType.value || activeGroupId.value === groupId) return;
    invalidateRequests();
    activeGroupId.value = groupId;
    current.value = 1;
    list.value = [];
    total.value = 0;
    fetchList();
  };
  const compactGroupValue = computed({
    get: () => {
      if (activeGroupId.value === undefined) return GROUP_ALL;
      if (activeGroupId.value === null) return GROUP_UNGROUPED;
      return groupOptionValue(activeGroupId.value);
    },
    set: (value: string) => {
      if (value === GROUP_ALL) onGroupChange(undefined);
      else if (value === GROUP_UNGROUPED) onGroupChange(null);
      else if (value.startsWith(GROUP_PREFIX)) onGroupChange(value.slice(GROUP_PREFIX.length));
    },
  });
  const onSearch = () => {
    current.value = 1;
    fetchList();
  };
  const onPageChange = (page: number) => {
    current.value = page;
    fetchList();
  };

  const open = () => {
    requireService();
    visible.value = true;
    replaceDraft(committedItems.value, false);
    emit('visibleChange', true);
    resetBrowseScope(false);
    if (hasAllowedTypes.value) refresh();
  };
  const close = () => {
    if (!visible.value) return;
    invalidateRequests();
    visible.value = false;
    replaceDraft(committedItems.value, false);
    emit('visibleChange', false);
  };
  const clear = () => {
    replaceDraft([], visible.value);
    emitCommittedValue([]);
  };
  const confirm = () => {
    const next = sanitizeItems(draftItems.value);
    if (!hasAllowedTypes.value) return;
    emitCommittedValue(next);
    close();
  };
  const toggleItem = (item: FileItem) => {
    if (!isSelectable(item)) return;
    if (!props.multiple) {
      replaceDraft([item]);
    } else {
      const next = new Map(draftMap.value);
      if (next.has(item.id)) next.delete(item.id);
      else if (props.limit <= 0 || next.size < props.limit) next.set(item.id, item);
      replaceDraft(Array.from(next.values()));
    }
  };
  const selectSingleItem = (id: string | number | boolean) => {
    if (typeof id !== 'string') return;
    const matches = list.value.filter((item) => item.id === id);
    if (matches.length === 1) toggleItem(matches[0]);
  };

  const changeUploadCount = (generation: number, delta: number) => {
    const next = new Map(uploadCounts.value);
    const count = Math.max(0, (next.get(generation) ?? 0) + delta);
    if (count) next.set(generation, count);
    else next.delete(generation);
    uploadCounts.value = next;
  };
  const customUpload = (option: RequestOption): UploadRequest => {
    const controller = new AbortController();
    const generation = viewGeneration;
    const service = requireService();
    const fileType = activeFileType.value;
    const groupId = typeof activeGroupId.value === 'string' ? activeGroupId.value : null;
    const { file } = option.fileItem;
    if (!file || !fileType) {
      const error = new Error('[admin9-ui] AFilePicker upload requires a concrete FileType.');
      option.onError(error);
      emit('uploadError', error);
      return { abort: () => controller.abort() };
    }
    if (!service.upload) {
      const error = new Error('[admin9-ui] AFilePicker requires FileUploadCapability when canUpload is true.');
      option.onError(error);
      emit('uploadError', error);
      return { abort: () => controller.abort() };
    }
    changeUploadCount(generation, 1);
    service
      .upload({ file, fileType, groupId, onProgress: option.onProgress, signal: controller.signal })
      .then(async (item) => {
        option.onSuccess(item);
        if (generation !== viewGeneration || service !== resolvedService.value || fileType !== activeFileType.value) {
          return;
        }
        emit('uploadSuccess', item);
        const conflictsWithKnownItem = list.value.some((entry) => entry.id === item.id) || draftMap.value.has(item.id);
        if (item.type === fileType && isValueEligible(item) && !conflictsWithKnownItem) {
          if (!props.multiple) replaceDraft([item]);
          else if (props.limit <= 0 || draftMap.value.size < props.limit) {
            replaceDraft([...draftItems.value, item]);
          }
        }
        await refresh();
      })
      .catch((error: unknown) => {
        option.onError(error);
        if (generation !== viewGeneration || service !== resolvedService.value) return;
        emit('uploadError', error);
        Message.error(t('admin9Ui.filePicker.uploadFailed'));
      })
      .finally(() => changeUploadCount(generation, -1));
    return { abort: () => controller.abort() };
  };

  watch(
    () => props.modelValue,
    () => syncExternalModel(),
    { deep: true }
  );
  watch(
    () => [props.multiple, props.limit] as const,
    () => syncExternalModel()
  );
  watch(
    () => allowedFileTypes.value.join('|'),
    () => {
      resetBrowseScope(true);
      syncExternalModel();
      if (visible.value && hasAllowedTypes.value) refresh();
    }
  );
  watch(
    () => [resolvedService.value, props.canUpload] as const,
    () => {
      requireService();
      resetBrowseScope(false);
      if (visible.value && hasAllowedTypes.value) refresh();
    }
  );
  watch(
    () => props.pageSize,
    (pageSize) => {
      resolvedPageSize.value = pageSize;
      current.value = 1;
      if (visible.value && hasAllowedTypes.value) fetchList();
    }
  );

  onMounted(syncExternalModel);
  defineExpose({ open, close, clear, refresh });
</script>

<template>
  <div class="a9-file-picker">
    <div class="a9-file-picker__trigger-row">
      <slot name="trigger" :open="open" :selected-items="selectedItems" :selected-count="selectedCount" :disabled="false">
        <a-button data-testid="file-picker-trigger" @click="open">
          <template #icon><icon-folder /></template>
          {{ triggerLabel }}
          <span v-if="selectedCount">({{ selectedCount }})</span>
        </a-button>
      </slot>
      <a-tooltip v-if="selectedCount" :content="t('admin9Ui.filePicker.clear')">
        <a-button
          type="text"
          status="danger"
          :aria-label="t('admin9Ui.filePicker.clear')"
          data-testid="file-picker-clear"
          @click="clear"
        >
          <template #icon><icon-close /></template>
        </a-button>
      </a-tooltip>
    </div>

    <a-modal
      :visible="visible"
      :title="t('admin9Ui.filePicker.title')"
      width="calc(100vw - 32px)"
      :modal-style="{
        top: '16px',
        display: 'flex',
        maxWidth: '1040px',
        maxHeight: 'calc(100dvh - 32px)',
        flexDirection: 'column',
      }"
      :body-style="{ minHeight: 0, padding: '16px', overflow: 'auto' }"
      modal-class="a9-file-picker-modal"
      unmount-on-close
      @cancel="close"
    >
      <div class="a9-file-picker__workspace">
        <aside class="a9-file-picker__sidebar" :aria-label="t('admin9Ui.filePicker.fileTypes')">
          <button
            v-if="showsAggregateType"
            type="button"
            class="a9-file-picker__type-button"
            :class="{ 'is-active': activeFileType === undefined }"
            :aria-pressed="activeFileType === undefined"
            @click="selectFileType(undefined)"
          >
            <icon-folder />
            <span>{{ aggregateLabel }}</span>
          </button>
          <button
            v-for="fileType in allowedFileTypes"
            :key="fileType"
            type="button"
            class="a9-file-picker__type-button"
            :class="{ 'is-active': activeFileType === fileType }"
            :aria-pressed="activeFileType === fileType"
            @click="selectFileType(fileType)"
          >
            <icon-file-image v-if="fileType === 'image'" />
            <icon-file-video v-else-if="fileType === 'video'" />
            <icon-file-audio v-else-if="fileType === 'audio'" />
            <icon-archive v-else-if="fileType === 'archive'" />
            <icon-file v-else />
            <span>{{ t(`admin9Ui.filePicker.types.${fileType}`) }}</span>
          </button>
        </aside>

        <main class="a9-file-picker__main">
          <a-alert v-if="!hasAllowedTypes" type="warning" class="a9-file-picker__constraint-empty">
            {{ t('admin9Ui.filePicker.noAllowedTypes') }}
          </a-alert>

          <template v-else>
            <div class="a9-file-picker__toolbar">
              <a-input-search
                v-model="keyword"
                class="a9-file-picker__search"
                :placeholder="t('admin9Ui.filePicker.searchPlaceholder')"
                allow-clear
                search-button
                @search="onSearch"
                @clear="onSearch"
              />
              <div class="a9-file-picker__toolbar-actions">
                <a-tooltip :content="t('admin9Ui.filePicker.refresh')">
                  <a-button
                    :aria-label="t('admin9Ui.filePicker.refresh')"
                    :loading="loading"
                    data-testid="file-picker-refresh"
                    @click="refresh"
                  >
                    <template #icon><icon-refresh /></template>
                  </a-button>
                </a-tooltip>
                <a-radio-group v-model="view" type="button" class="a9-file-picker__view-toggle">
                  <a-tooltip :content="t('admin9Ui.filePicker.gridView')">
                    <a-radio value="grid" :aria-label="t('admin9Ui.filePicker.gridView')"><icon-apps /></a-radio>
                  </a-tooltip>
                  <a-tooltip :content="t('admin9Ui.filePicker.listView')">
                    <a-radio value="list" :aria-label="t('admin9Ui.filePicker.listView')"><icon-list /></a-radio>
                  </a-tooltip>
                </a-radio-group>
                <a-tooltip
                  v-if="canUpload"
                  :content="activeFileType ? t('admin9Ui.filePicker.upload') : t('admin9Ui.filePicker.chooseTypeForUpload')"
                >
                  <span>
                    <a-upload
                      :accept="accept"
                      :disabled="!activeFileType || uploadLoading"
                      :show-file-list="false"
                      :custom-request="customUpload"
                    >
                      <template #upload-button>
                        <a-button type="primary" :disabled="!activeFileType" :loading="uploadLoading">
                          <template #icon><icon-upload /></template>
                          {{ t('admin9Ui.filePicker.upload') }}
                        </a-button>
                      </template>
                    </a-upload>
                  </span>
                </a-tooltip>
              </div>
            </div>

            <div v-if="hasGroupNavigation" class="a9-file-picker__groups">
              <a-alert v-if="groupError" type="error" class="a9-file-picker__group-error">
                {{ t('admin9Ui.filePicker.groupLoadFailed') }}
                <a-button type="text" size="mini" data-testid="file-picker-retry-groups" @click="fetchGroups">
                  {{ t('admin9Ui.filePicker.retry') }}
                </a-button>
              </a-alert>
              <a-spin v-else :loading="groupLoading" class="a9-file-picker__group-spin">
                <a-select v-model="compactGroupValue" :aria-label="t('admin9Ui.filePicker.groups')">
                  <a-option :value="GROUP_ALL">{{ t('admin9Ui.filePicker.groupAll') }}</a-option>
                  <a-option :value="GROUP_UNGROUPED">{{ t('admin9Ui.filePicker.groupUngrouped') }}</a-option>
                  <a-option v-for="group in groups" :key="group.id" :value="groupOptionValue(group.id)">
                    {{ group.name }}{{ group.count === undefined ? '' : ` (${group.count})` }}
                  </a-option>
                </a-select>
              </a-spin>
            </div>

            <a-alert v-if="listError" type="error" class="a9-file-picker__list-error">
              {{ t('admin9Ui.filePicker.loadFailed') }}
              <a-button type="text" size="small" data-testid="file-picker-retry-list" @click="fetchList">
                {{ t('admin9Ui.filePicker.retry') }}
              </a-button>
            </a-alert>

            <a-spin :loading="loading" class="a9-file-picker__spin">
              <component
                :is="multiple ? 'div' : 'a-radio-group'"
                v-if="!listError && !empty"
                class="a9-file-picker__items"
                :data-view="view"
                :aria-label="t('admin9Ui.filePicker.results')"
                :role="multiple ? 'group' : 'radiogroup'"
                :model-value="multiple ? undefined : selectedDraftId"
                @update:model-value="selectSingleItem"
              >
                <article
                  v-for="(item, index) in list"
                  :key="`${item.id || `${item.type}-${item.name}`}:${index}`"
                  class="a9-file-picker__item"
                  :class="{ 'is-selected': draftMap.has(item.id), 'is-disabled': !isSelectable(item) }"
                  :data-file-id="item.id"
                >
                  <a-checkbox
                    v-if="multiple"
                    class="a9-file-picker__checkbox"
                    :model-value="draftMap.has(item.id)"
                    :disabled="!isSelectable(item)"
                    @keydown.enter.prevent="toggleItem(item)"
                    @change="toggleItem(item)"
                  >
                    <span class="a9-file-picker__selection-label">
                      {{ t('admin9Ui.filePicker.selectItem', { name: item.name }) }}
                    </span>
                  </a-checkbox>
                  <a-radio
                    v-else
                    class="a9-file-picker__checkbox"
                    :value="item.id"
                    :disabled="!isSelectable(item)"
                    @keydown.enter.prevent="toggleItem(item)"
                  >
                    <span class="a9-file-picker__selection-label">
                      {{ t('admin9Ui.filePicker.selectItem', { name: item.name }) }}
                    </span>
                  </a-radio>
                  <slot name="item" :item="item" :available="isSelectable(item)" :selected="draftMap.has(item.id)" :view="view">
                    <FileItemView :item="item" :available="isSelectable(item)" :status-label="statusLabel(item)" />
                  </slot>
                </article>
              </component>
              <div v-else-if="empty" class="a9-file-picker__empty">
                <slot name="empty" :constrained="false"><a-empty :description="t('admin9Ui.filePicker.empty')" /></slot>
              </div>
            </a-spin>
          </template>
        </main>
      </div>

      <template #footer>
        <div class="a9-file-picker__footer">
          <div class="a9-file-picker__footer-status" aria-live="polite">
            {{ t('admin9Ui.filePicker.selectedCount', { count: draftCount }) }}
          </div>
          <a-pagination
            v-if="hasAllowedTypes"
            :current="current"
            :page-size="resolvedPageSize"
            :total="total"
            simple
            data-testid="file-picker-pagination"
            @change="onPageChange"
          />
          <div class="a9-file-picker__footer-actions">
            <a-button @click="close">{{ t('admin9Ui.filePicker.cancel') }}</a-button>
            <a-button type="primary" :disabled="!hasAllowedTypes" @click="confirm">
              {{ t('admin9Ui.filePicker.confirm') }}
            </a-button>
          </div>
        </div>
      </template>
    </a-modal>
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

    &__workspace {
      display: grid;
      grid-template-columns: 170px minmax(0, 1fr);
      min-width: 0;
      min-height: 510px;
    }

    &__sidebar {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      padding-right: 14px;
      border-right: 1px solid var(--color-neutral-3);
    }

    &__type-button {
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

    &__main {
      min-width: 0;
      padding-left: 16px;
    }

    &__constraint-empty {
      margin-top: 24px;
    }

    &__toolbar {
      justify-content: space-between;
      min-width: 0;
      margin-bottom: 12px;
    }

    &__search {
      width: min(100%, 320px);
    }

    &__toolbar-actions {
      flex: none;
    }

    &__groups,
    &__list-error {
      margin-bottom: 12px;
    }

    &__group-spin {
      display: block;
      width: min(100%, 320px);
    }

    &__spin {
      display: block;
      min-height: 390px;
    }

    &__items {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
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

      &.is-selected {
        border-color: rgb(var(--primary-6));
        box-shadow: 0 0 0 1px rgb(var(--primary-6));
      }

      &.is-disabled {
        opacity: 0.72;
      }
    }

    &__checkbox {
      position: absolute;
      top: 14px;
      right: 14px;
      z-index: 3;
      padding: 3px;
      background: var(--color-bg-2);
      border-radius: 4px;
    }

    &__selection-label {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      white-space: nowrap;
      border: 0;
      clip-path: inset(50%);
    }

    &__items[data-view='list'] {
      grid-template-columns: minmax(0, 1fr);

      .a9-file-picker__item {
        padding-right: 44px;
      }

      :deep(.a9-file-item) {
        display: grid;
        grid-template-columns: 96px minmax(0, 1fr);
        gap: 12px;
        align-items: center;
      }

      :deep(.a9-file-item__visual) {
        height: 64px;
      }

      :deep(.a9-file-item__details) {
        padding-top: 0;
      }
    }

    &__empty {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 320px;
    }

    &__footer {
      justify-content: space-between;
      min-width: 0;
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
        min-height: 520px;
      }

      &__sidebar {
        flex-direction: row;
        padding-right: 0;
        padding-bottom: 10px;
        overflow-x: auto;
        border-right: 0;
        border-bottom: 1px solid var(--color-neutral-3);
      }

      &__type-button {
        flex: 0 0 auto;
        width: auto;
      }

      &__main {
        padding-top: 12px;
        padding-left: 0;
      }

      &__toolbar {
        flex-direction: column;
        align-items: stretch;
      }

      &__search {
        width: 100%;
      }

      &__toolbar-actions {
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      &__items {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__footer {
        flex-wrap: wrap;
      }

      &__footer-actions {
        margin-left: auto;
      }
    }
  }

  @media (width <= 430px) {
    .a9-file-picker__items {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
