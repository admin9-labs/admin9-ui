<script setup lang="ts">
  import { computed, inject, onMounted, ref, watch } from 'vue';
  import { Message } from '@arco-design/web-vue';
  import type { RequestOption, UploadRequest } from '@arco-design/web-vue';
  import { useI18n } from 'vue-i18n';
  import { useLoading } from '../../hooks';
  import FileItemView from '../../internal/file-item.vue';
  import admin9UIOptionsKey from '../../internal/options';
  import type { FileGroup, FileItem, FileListParams, FileManagerAdapter, FileType } from '../../services/types';

  type GroupId = string | null | undefined;
  type FileView = 'grid' | 'list';

  const props = withDefaults(
    defineProps<{
      initialFileType?: FileType;
      initialView?: FileView;
      pageSize?: number;
      accept?: string;
      canUpload?: boolean;
      canDelete?: boolean;
      canMove?: boolean;
      canManageGroups?: boolean;
      service?: FileManagerAdapter;
    }>(),
    {
      initialFileType: undefined,
      initialView: 'grid',
      pageSize: 24,
      accept: undefined,
      canUpload: false,
      canDelete: false,
      canMove: false,
      canManageGroups: false,
    }
  );

  defineSlots<{
    'toolbar-extra'?: (slotProps: { refresh: () => Promise<void>; loading: boolean }) => unknown;
    'item'?: (slotProps: { item: FileItem; available: boolean; selected: boolean; view: FileView }) => unknown;
    'empty'?: () => unknown;
  }>();

  const emit = defineEmits<{
    (e: 'uploadSuccess', item: FileItem): void;
    (e: 'uploadError', error: unknown): void;
    (e: 'deleteSuccess', ids: string[]): void;
    (e: 'moveSuccess', ids: string[], groupId: string | null): void;
    (e: 'fileTypeChange', fileType: FileType | undefined): void;
    (e: 'selectionChange', items: FileItem[]): void;
  }>();

  const { t } = useI18n();
  const { loading, setLoading } = useLoading();
  const globalOptions = inject(admin9UIOptionsKey, undefined);
  const resolveManagerService = () => {
    const resolved = props.service ?? globalOptions?.fileService;
    if (!resolved || typeof resolved.list !== 'function') {
      throw new Error(
        '[admin9-ui] AFileManager requires FileBrowseCapability. Pass the service prop or install Admin9UI with fileService.'
      );
    }
    if (props.canUpload && typeof resolved.upload !== 'function') {
      throw new Error('[admin9-ui] AFileManager requires FileUploadCapability when canUpload is true.');
    }
    if (props.canDelete && typeof resolved.remove !== 'function') {
      throw new Error('[admin9-ui] AFileManager requires FileRemoveCapability when canDelete is true.');
    }
    if (props.canMove && typeof resolved.move !== 'function') {
      throw new Error('[admin9-ui] AFileManager requires FileMoveCapability when canMove is true.');
    }
    if (
      props.canManageGroups &&
      (typeof resolved.listGroups !== 'function' ||
        typeof resolved.createGroup !== 'function' ||
        typeof resolved.renameGroup !== 'function' ||
        typeof resolved.removeGroup !== 'function')
    ) {
      throw new Error('[admin9-ui] AFileManager requires FileGroupCapability when canManageGroups is true.');
    }
    return resolved;
  };
  const managerService = computed(resolveManagerService);
  resolveManagerService();

  const FILE_TYPES: FileType[] = ['image', 'video', 'audio', 'document', 'archive', 'other'];
  const fileTypeIcons: Record<FileType, string> = {
    image: 'icon-file-image',
    video: 'icon-file-video',
    audio: 'icon-file-audio',
    document: 'icon-file',
    archive: 'icon-archive',
    other: 'icon-drive-file',
  };
  const acceptByType: Record<FileType, string> = {
    image: 'image/*',
    video: 'video/*',
    audio: 'audio/*',
    document: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv',
    archive: '.zip,.rar,.7z,.tar,.gz',
    other: '*/*',
  };

  const activeFileType = ref<FileType | undefined>(props.initialFileType);
  const view = ref<FileView>(props.initialView);
  const list = ref<FileItem[]>([]);
  const groups = ref<FileGroup[]>([]);
  const typeCounts = ref<Partial<Record<FileType, number>>>({});
  const current = ref(1);
  const resolvedPageSize = ref(props.pageSize);
  const total = ref(0);
  const keyword = ref('');
  const activeGroupId = ref<GroupId>(undefined);
  const groupLoading = ref(false);
  const groupError = ref(false);
  const listError = ref(false);
  const selectedMap = ref(new Map<string, FileItem>());
  const busyIds = ref(new Set<string>());
  const batchMoveTarget = ref<string>();
  const singleMoveTargets = ref(new Map<string, string>());
  const uploadCounts = ref(new Map<number, number>());
  const groupMutationLoading = ref(false);
  const groupModalVisible = ref(false);
  const groupModalMode = ref<'create' | 'rename'>('create');
  const editingGroup = ref<FileGroup>();
  const groupName = ref('');
  let latestListRequest = 0;
  let latestGroupRequest = 0;
  const viewGeneration = ref(0);

  const GROUP_ALL = '__admin9_ui_file_manager_all__';
  const GROUP_UNGROUPED = '__admin9_ui_file_manager_ungrouped__';
  const GROUP_PREFIX = '__admin9_ui_file_manager_group__:';
  const MOVE_UNGROUPED = '__admin9_ui_file_manager_move_ungrouped__';
  const MOVE_GROUP_PREFIX = '__admin9_ui_file_manager_move_group__:';
  const groupOptionValue = (id: string) => `${GROUP_PREFIX}${id}`;
  const moveGroupOptionValue = (id: string) => `${MOVE_GROUP_PREFIX}${id}`;

  const hasGroupNavigation = computed(
    () => Boolean(activeFileType.value) && typeof managerService.value.listGroups === 'function'
  );
  const selectionEnabled = computed(() => props.canDelete || props.canMove);
  const selectedKeys = computed(() => Array.from(selectedMap.value.keys()));
  const selectedItems = computed(() => Array.from(selectedMap.value.values()));
  const selectedCount = computed(() => selectedMap.value.size);
  const isEmpty = computed(() => list.value.length === 0 && !loading.value && !listError.value);
  const activeGroup = computed(() =>
    typeof activeGroupId.value === 'string' ? groups.value.find((group) => group.id === activeGroupId.value) : undefined
  );
  const resolvedAccept = computed(() =>
    activeFileType.value ? props.accept || acceptByType[activeFileType.value] : undefined
  );
  const uploadLoading = computed(() => (uploadCounts.value.get(viewGeneration.value) ?? 0) > 0);
  const mutationLoading = computed(() => busyIds.value.size > 0);
  const uploadDisabledReason = computed(() => (activeFileType.value ? '' : t('admin9Ui.fileManager.chooseTypeForUpload')));
  const moveDisabledReason = computed(() => (activeFileType.value ? '' : t('admin9Ui.fileManager.chooseTypeForMove')));

  const isKnownType = (type: string): type is FileType => FILE_TYPES.includes(type as FileType);
  const hasStableIdentity = (item: FileItem) => typeof item.id === 'string' && item.id.length > 0 && isKnownType(item.type);
  const duplicateIds = computed(() => {
    const counts = new Map<string, number>();
    list.value.forEach((item) => {
      if (typeof item.id === 'string' && item.id.length > 0) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
    });
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([id]) => id)
    );
  });
  const hasActionableIdentity = (item: FileItem) => hasStableIdentity(item) && !duplicateIds.value.has(item.id);
  const isAvailable = (item: FileItem) =>
    hasActionableIdentity(item) &&
    (!activeFileType.value || item.type === activeFileType.value) &&
    (!item.status || item.status === 'ready') &&
    typeof item.url === 'string' &&
    item.url.length > 0;
  const isSelectable = (item: FileItem) =>
    selectionEnabled.value &&
    hasActionableIdentity(item) &&
    (!activeFileType.value || item.type === activeFileType.value) &&
    (props.canDelete || isAvailable(item));
  const statusLabel = (item: FileItem) => {
    if (!hasActionableIdentity(item)) return t('admin9Ui.fileManager.invalid');
    if (activeFileType.value && item.type !== activeFileType.value) return t('admin9Ui.fileManager.wrongType');
    if (item.status === 'pending') return t('admin9Ui.fileManager.processing');
    if (item.status === 'failed') return t('admin9Ui.fileManager.failed');
    return t('admin9Ui.fileManager.unavailable');
  };

  const buildListParams = (): FileListParams => {
    const base = {
      page: current.value,
      pageSize: resolvedPageSize.value,
      keyword: keyword.value.trim() || undefined,
    };
    if (!activeFileType.value) return base;
    return { ...base, fileType: activeFileType.value, groupId: activeGroupId.value };
  };

  const reconcileSelection = (items: FileItem[]) => {
    if (!selectionEnabled.value) return;
    const next = new Map(selectedMap.value);
    items.forEach((item) => {
      if (!next.has(item.id)) return;
      if (isSelectable(item)) next.set(item.id, item);
      else next.delete(item.id);
    });
    selectedMap.value = next;
  };

  const fetchList = async () => {
    const request = latestListRequest + 1;
    const generation = viewGeneration.value;
    const service = managerService.value;
    latestListRequest = request;
    setLoading(true);
    listError.value = false;
    try {
      const result = await service.list(buildListParams());
      if (request !== latestListRequest || generation !== viewGeneration.value) return;
      list.value = result.list;
      total.value = result.pagination.total;
      resolvedPageSize.value = result.pagination.pageSize;
      typeCounts.value = result.typeCounts ?? {};
      reconcileSelection(result.list);
    } catch {
      if (request !== latestListRequest || generation !== viewGeneration.value) return;
      list.value = [];
      total.value = 0;
      listError.value = true;
    } finally {
      if (request === latestListRequest && generation === viewGeneration.value) setLoading(false);
    }
  };

  const fetchGroups = async () => {
    const request = latestGroupRequest + 1;
    const generation = viewGeneration.value;
    const service = managerService.value;
    const fileType = activeFileType.value;
    latestGroupRequest = request;
    if (!fileType || !service.listGroups) {
      groups.value = [];
      groupError.value = false;
      groupLoading.value = false;
      return;
    }
    groupLoading.value = true;
    groupError.value = false;
    try {
      const nextGroups = await service.listGroups(fileType);
      if (request === latestGroupRequest && generation === viewGeneration.value) groups.value = nextGroups;
    } catch {
      if (request !== latestGroupRequest || generation !== viewGeneration.value) return;
      groups.value = [];
      groupError.value = true;
    } finally {
      if (request === latestGroupRequest && generation === viewGeneration.value) groupLoading.value = false;
    }
  };

  const refresh = async () => {
    await Promise.all([fetchList(), fetchGroups()]);
  };

  const emitSelection = () => emit('selectionChange', selectedItems.value);
  const clearSelection = () => {
    if (selectedMap.value.size === 0) return;
    selectedMap.value = new Map();
    emitSelection();
  };

  const resetScopedState = () => {
    viewGeneration.value += 1;
    latestListRequest += 1;
    latestGroupRequest += 1;
    activeGroupId.value = undefined;
    current.value = 1;
    groups.value = [];
    groupLoading.value = false;
    groupError.value = false;
    listError.value = false;
    setLoading(false);
    list.value = [];
    total.value = 0;
    typeCounts.value = {};
    selectedMap.value = new Map();
    busyIds.value = new Set();
    batchMoveTarget.value = undefined;
    singleMoveTargets.value = new Map();
    groupModalVisible.value = false;
    groupModalMode.value = 'create';
    editingGroup.value = undefined;
    groupName.value = '';
    groupMutationLoading.value = false;
    emitSelection();
  };

  const selectFileType = (fileType: FileType | undefined) => {
    if (activeFileType.value === fileType) return;
    resetScopedState();
    activeFileType.value = fileType;
    emit('fileTypeChange', fileType);
    refresh();
  };

  const resetGroupScope = (groupId: GroupId) => {
    activeGroupId.value = groupId;
    current.value = 1;
    selectedMap.value = new Map();
    batchMoveTarget.value = undefined;
    singleMoveTargets.value = new Map();
    emitSelection();
  };
  const onGroupChange = (groupId: GroupId) => {
    if (!activeFileType.value || activeGroupId.value === groupId) return;
    resetGroupScope(groupId);
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
  const onSelectionChange = (values: (string | number | boolean)[]) => {
    if (!selectionEnabled.value) return;
    const incoming = new Set(values.map(String));
    const next = new Map(selectedMap.value);
    list.value.forEach((item) => {
      if (!isSelectable(item)) {
        next.delete(item.id);
        return;
      }
      if (incoming.has(item.id)) next.set(item.id, item);
      else next.delete(item.id);
    });
    selectedMap.value = next;
    emitSelection();
  };

  const changeUploadCount = (generation: number, delta: number) => {
    const next = new Map(uploadCounts.value);
    const count = Math.max(0, (next.get(generation) ?? 0) + delta);
    if (count > 0) next.set(generation, count);
    else next.delete(generation);
    uploadCounts.value = next;
  };
  const customUpload = (option: RequestOption): UploadRequest => {
    const controller = new AbortController();
    const generation = viewGeneration.value;
    const service = managerService.value;
    const fileType = activeFileType.value;
    const groupId = typeof activeGroupId.value === 'string' ? activeGroupId.value : null;
    const { file } = option.fileItem;
    if (!file || !fileType) {
      const error = new Error('[admin9-ui] AFileManager upload requires a concrete FileType.');
      option.onError(error);
      return { abort: () => controller.abort() };
    }
    if (!service.upload) {
      const error = new Error('[admin9-ui] AFileManager requires FileUploadCapability when canUpload is true.');
      option.onError(error);
      emit('uploadError', error);
      return { abort: () => controller.abort() };
    }
    changeUploadCount(generation, 1);
    service
      .upload({ file, fileType, groupId, onProgress: option.onProgress, signal: controller.signal })
      .then(async (item) => {
        option.onSuccess(item);
        if (generation !== viewGeneration.value || fileType !== activeFileType.value) return;
        emit('uploadSuccess', item);
        await refresh();
      })
      .catch((error: unknown) => {
        option.onError(error);
        if (generation !== viewGeneration.value) return;
        emit('uploadError', error);
        Message.error(t('admin9Ui.fileManager.uploadFailed'));
      })
      .finally(() => changeUploadCount(generation, -1));
    return { abort: () => controller.abort() };
  };

  const markBusy = (ids: string[], busy: boolean) => {
    const next = new Set(busyIds.value);
    ids.forEach((id) => (busy ? next.add(id) : next.delete(id)));
    busyIds.value = next;
  };
  const successfulRequestedIds = (returnedIds: string[], requestedIds: string[]) => {
    const requested = new Set(requestedIds);
    return Array.from(new Set(returnedIds.filter((id) => requested.has(id))));
  };
  const removeSelectedIds = (ids: string[]) => {
    const next = new Map(selectedMap.value);
    ids.forEach((id) => next.delete(id));
    selectedMap.value = next;
    emitSelection();
  };
  const decodeMoveTarget = (value: string): string | null | undefined => {
    if (value === MOVE_UNGROUPED) return null;
    if (value.startsWith(MOVE_GROUP_PREFIX)) return value.slice(MOVE_GROUP_PREFIX.length);
    return undefined;
  };
  const refreshAfterMutation = async (generation: number) => {
    await refresh();
    if (generation !== viewGeneration.value) return;
    const lastPage = Math.max(1, Math.ceil(total.value / Math.max(1, resolvedPageSize.value)));
    if (!listError.value && current.value > lastPage) {
      current.value = lastPage;
      await fetchList();
    }
  };

  const moveItems = async (inputIds: string[], fileType: FileType, groupId: string | null): Promise<string[]> => {
    const ids = Array.from(new Set(inputIds));
    if (ids.length === 0 || ids.some((id) => busyIds.value.has(id))) return [];
    const generation = viewGeneration.value;
    const service = managerService.value;
    if (!service.move) throw new Error('[admin9-ui] AFileManager requires FileMoveCapability when canMove is true.');
    markBusy(ids, true);
    try {
      const returnedIds = await service.move({ fileType, ids, groupId });
      if (generation !== viewGeneration.value) return [];
      const movedIds = successfulRequestedIds(returnedIds, ids);
      removeSelectedIds(movedIds);
      if (movedIds.length !== ids.length) Message.warning(t('admin9Ui.fileManager.movePartial'));
      emit('moveSuccess', movedIds, groupId);
      await refreshAfterMutation(generation);
      return movedIds;
    } catch {
      if (generation !== viewGeneration.value) return [];
      Message.error(t('admin9Ui.fileManager.moveFailed'));
      await fetchList();
      return [];
    } finally {
      if (generation === viewGeneration.value) markBusy(ids, false);
    }
  };
  const batchMoveAvailable = computed(
    () =>
      Boolean(activeFileType.value) &&
      selectedCount.value > 0 &&
      selectedItems.value.every((item) => item.type === activeFileType.value && isAvailable(item))
  );
  const moveSelected = () => {
    const fileType = activeFileType.value;
    if (!fileType || !batchMoveTarget.value || !batchMoveAvailable.value) return;
    const target = decodeMoveTarget(batchMoveTarget.value);
    if (target === undefined) return;
    batchMoveTarget.value = undefined;
    moveItems(selectedKeys.value, fileType, target);
  };
  const onSingleMoveChange = (item: FileItem, value: unknown) => {
    if (!activeFileType.value || item.type !== activeFileType.value || !isAvailable(item) || typeof value !== 'string') return;
    if (decodeMoveTarget(value) === undefined) return;
    singleMoveTargets.value = new Map(singleMoveTargets.value).set(item.id, value);
  };
  const moveSingle = async (item: FileItem) => {
    const value = singleMoveTargets.value.get(item.id);
    if (!activeFileType.value || item.type !== activeFileType.value || !value || !isAvailable(item)) return;
    const target = decodeMoveTarget(value);
    if (target === undefined) return;
    const movedIds = await moveItems([item.id], item.type, target);
    if (!movedIds.includes(item.id)) return;
    const next = new Map(singleMoveTargets.value);
    next.delete(item.id);
    singleMoveTargets.value = next;
  };

  const removeItems = async (inputIds: string[]) => {
    const ids = Array.from(new Set(inputIds.filter(Boolean)));
    if (ids.length === 0 || ids.some((id) => busyIds.value.has(id))) return;
    const generation = viewGeneration.value;
    const service = managerService.value;
    if (!service.remove) throw new Error('[admin9-ui] AFileManager requires FileRemoveCapability when canDelete is true.');
    markBusy(ids, true);
    try {
      const returnedIds = await service.remove(ids);
      if (generation !== viewGeneration.value) return;
      const removedIds = successfulRequestedIds(returnedIds, ids);
      removeSelectedIds(removedIds);
      if (removedIds.length !== ids.length) Message.warning(t('admin9Ui.fileManager.deletePartial'));
      emit('deleteSuccess', removedIds);
      await refreshAfterMutation(generation);
    } catch {
      if (generation !== viewGeneration.value) return;
      Message.error(t('admin9Ui.fileManager.deleteFailed'));
      await fetchList();
    } finally {
      if (generation === viewGeneration.value) markBusy(ids, false);
    }
  };
  const removeSingle = (item: FileItem) => {
    if (hasActionableIdentity(item)) removeItems([item.id]);
  };

  const groupModalTitle = computed(() =>
    t(groupModalMode.value === 'create' ? 'admin9Ui.fileManager.createGroup' : 'admin9Ui.fileManager.renameGroup')
  );
  const openCreateGroup = () => {
    if (!activeFileType.value) return;
    groupModalMode.value = 'create';
    editingGroup.value = undefined;
    groupName.value = '';
    groupModalVisible.value = true;
  };
  const openRenameGroup = (group: FileGroup) => {
    if (!activeFileType.value) return;
    groupModalMode.value = 'rename';
    editingGroup.value = group;
    groupName.value = group.name;
    groupModalVisible.value = true;
  };
  const submitGroup = async (): Promise<boolean> => {
    const name = groupName.value.trim();
    const fileType = activeFileType.value;
    if (!name || !fileType || groupMutationLoading.value) return false;
    const generation = viewGeneration.value;
    const service = managerService.value;
    if (!service.createGroup || !service.renameGroup) {
      throw new Error('[admin9-ui] AFileManager requires FileGroupCapability when canManageGroups is true.');
    }
    groupMutationLoading.value = true;
    try {
      if (groupModalMode.value === 'create') {
        const created = await service.createGroup({ fileType, name });
        if (generation !== viewGeneration.value) return false;
        await fetchGroups();
        if (generation !== viewGeneration.value) return false;
        onGroupChange(created.id);
      } else if (editingGroup.value) {
        await service.renameGroup({ fileType, groupId: editingGroup.value.id, name });
        if (generation !== viewGeneration.value) return false;
        await fetchGroups();
      }
      return generation === viewGeneration.value;
    } catch {
      if (generation === viewGeneration.value) Message.error(t('admin9Ui.fileManager.groupMutationFailed'));
      return false;
    } finally {
      if (generation === viewGeneration.value) groupMutationLoading.value = false;
    }
  };
  const submitGroupFromInput = async () => {
    if (await submitGroup()) groupModalVisible.value = false;
  };
  const removeGroup = async (group: FileGroup) => {
    const fileType = activeFileType.value;
    if (!fileType || groupMutationLoading.value) return;
    const generation = viewGeneration.value;
    const service = managerService.value;
    if (!service.removeGroup) {
      throw new Error('[admin9-ui] AFileManager requires FileGroupCapability when canManageGroups is true.');
    }
    groupMutationLoading.value = true;
    try {
      await service.removeGroup({ fileType, groupId: group.id });
      if (generation !== viewGeneration.value) return;
      if (activeGroupId.value === group.id) resetGroupScope(undefined);
      await refresh();
    } catch {
      if (generation === viewGeneration.value) Message.error(t('admin9Ui.fileManager.groupDeleteFailed'));
    } finally {
      if (generation === viewGeneration.value) groupMutationLoading.value = false;
    }
  };

  watch(
    () => [props.service, props.canUpload, props.canDelete, props.canMove, props.canManageGroups] as const,
    () => {
      resolveManagerService();
      resetScopedState();
      refresh();
    }
  );
  watch(
    () => props.pageSize,
    (pageSize) => {
      resolvedPageSize.value = pageSize;
      current.value = 1;
      fetchList();
    }
  );
  watch(
    () => props.initialFileType,
    (fileType) => selectFileType(fileType)
  );
  watch(selectionEnabled, (enabled) => {
    if (!enabled) clearSelection();
  });

  onMounted(refresh);
  defineExpose({ refresh, clearSelection });
</script>

<template>
  <section class="a9-file-manager" :class="`is-${view}-view`" :aria-label="t('admin9Ui.fileManager.ariaLabel')">
    <aside class="a9-file-manager__sidebar">
      <nav class="a9-file-manager__types" :aria-label="t('admin9Ui.fileManager.fileTypes')">
        <button
          type="button"
          class="a9-file-manager__type-button"
          :class="{ 'is-active': activeFileType === undefined }"
          :aria-pressed="activeFileType === undefined"
          data-file-type="all"
          @click="selectFileType(undefined)"
        >
          <icon-apps aria-hidden="true" />
          <span>{{ t('admin9Ui.fileManager.typeAll') }}</span>
          <span v-if="activeFileType === undefined" class="a9-file-manager__type-count">{{ total }}</span>
        </button>
        <button
          v-for="fileType in FILE_TYPES"
          :key="fileType"
          type="button"
          class="a9-file-manager__type-button"
          :class="{ 'is-active': activeFileType === fileType }"
          :aria-pressed="activeFileType === fileType"
          :data-file-type="fileType"
          @click="selectFileType(fileType)"
        >
          <component :is="fileTypeIcons[fileType]" aria-hidden="true" />
          <span>{{ t(`admin9Ui.fileManager.types.${fileType}`) }}</span>
          <span v-if="typeCounts[fileType] !== undefined" class="a9-file-manager__type-count">
            {{ typeCounts[fileType] }}
          </span>
        </button>
      </nav>

      <div v-if="hasGroupNavigation" class="a9-file-manager__groups">
        <div class="a9-file-manager__group-heading">
          <span>{{ t('admin9Ui.fileManager.groups') }}</span>
          <a-tooltip v-if="canManageGroups" :content="t('admin9Ui.fileManager.createGroup')">
            <a-button
              type="text"
              size="mini"
              :aria-label="t('admin9Ui.fileManager.createGroup')"
              :disabled="groupMutationLoading"
              @click="openCreateGroup"
            >
              <template #icon><icon-plus /></template>
            </a-button>
          </a-tooltip>
        </div>
        <a-spin :loading="groupLoading" class="a9-file-manager__group-spin">
          <a-alert v-if="groupError" type="error" class="a9-file-manager__group-error">
            {{ t('admin9Ui.fileManager.groupLoadFailed') }}
            <a-button type="text" size="mini" data-testid="file-retry-groups" @click="fetchGroups">
              {{ t('admin9Ui.fileManager.retry') }}
            </a-button>
          </a-alert>
          <div v-else class="a9-file-manager__group-list">
            <button
              type="button"
              class="a9-file-manager__group-button"
              :class="{ 'is-active': activeGroupId === undefined }"
              :aria-pressed="activeGroupId === undefined"
              @click="onGroupChange(undefined)"
            >
              {{ t('admin9Ui.fileManager.groupAll') }}
            </button>
            <button
              type="button"
              class="a9-file-manager__group-button"
              :class="{ 'is-active': activeGroupId === null }"
              :aria-pressed="activeGroupId === null"
              @click="onGroupChange(null)"
            >
              {{ t('admin9Ui.fileManager.groupUngrouped') }}
            </button>
            <div v-for="group in groups" :key="group.id" class="a9-file-manager__group-row">
              <button
                type="button"
                class="a9-file-manager__group-button"
                :class="{ 'is-active': activeGroupId === group.id }"
                :aria-pressed="activeGroupId === group.id"
                @click="onGroupChange(group.id)"
              >
                <span>{{ group.name }}</span>
                <span v-if="group.count !== undefined">{{ group.count }}</span>
              </button>
              <a-dropdown v-if="canManageGroups" trigger="click">
                <a-button type="text" size="mini" :aria-label="t('admin9Ui.fileManager.groupActions', { name: group.name })">
                  <template #icon><icon-more /></template>
                </a-button>
                <template #content>
                  <a-doption :data-testid="`file-rename-group-${group.id}`" @click="openRenameGroup(group)">
                    {{ t('admin9Ui.fileManager.renameGroup') }}
                  </a-doption>
                  <a-popconfirm :content="t('admin9Ui.fileManager.groupDeleteConfirm')" @ok="removeGroup(group)">
                    <a-doption :data-testid="`file-delete-group-${group.id}`" class="a9-file-manager__danger-option">
                      {{ t('admin9Ui.fileManager.deleteGroup') }}
                    </a-doption>
                  </a-popconfirm>
                </template>
              </a-dropdown>
            </div>
          </div>
        </a-spin>
      </div>
    </aside>

    <div class="a9-file-manager__main">
      <div v-if="hasGroupNavigation" class="a9-file-manager__compact-group">
        <div class="a9-file-manager__compact-group-controls">
          <a-alert v-if="groupError" type="error" class="a9-file-manager__compact-group-error">
            {{ t('admin9Ui.fileManager.groupLoadFailed') }}
            <a-button type="text" size="mini" data-testid="file-compact-retry-groups" @click="fetchGroups">
              {{ t('admin9Ui.fileManager.retry') }}
            </a-button>
          </a-alert>
          <a-spin v-else :loading="groupLoading" class="a9-file-manager__compact-group-spin">
            <a-select v-model="compactGroupValue" :aria-label="t('admin9Ui.fileManager.groups')">
              <a-option :value="GROUP_ALL">{{ t('admin9Ui.fileManager.groupAll') }}</a-option>
              <a-option :value="GROUP_UNGROUPED">{{ t('admin9Ui.fileManager.groupUngrouped') }}</a-option>
              <a-option v-for="group in groups" :key="group.id" :value="groupOptionValue(group.id)">
                {{ group.name }}{{ group.count === undefined ? '' : ` (${group.count})` }}
              </a-option>
            </a-select>
          </a-spin>
          <a-tooltip v-if="canManageGroups" :content="t('admin9Ui.fileManager.createGroup')">
            <a-button
              size="small"
              :aria-label="t('admin9Ui.fileManager.createGroup')"
              :disabled="groupMutationLoading"
              @click="openCreateGroup"
            >
              <template #icon><icon-plus /></template>
            </a-button>
          </a-tooltip>
          <a-tooltip v-if="canManageGroups && activeGroup" :content="t('admin9Ui.fileManager.renameGroup')">
            <a-button
              size="small"
              :aria-label="t('admin9Ui.fileManager.renameGroup')"
              :disabled="groupMutationLoading"
              @click="openRenameGroup(activeGroup)"
            >
              <template #icon><icon-edit /></template>
            </a-button>
          </a-tooltip>
          <a-popconfirm
            v-if="canManageGroups && activeGroup"
            :content="t('admin9Ui.fileManager.groupDeleteConfirm')"
            @ok="removeGroup(activeGroup)"
          >
            <a-tooltip :content="t('admin9Ui.fileManager.deleteGroup')">
              <a-button
                status="danger"
                size="small"
                :aria-label="t('admin9Ui.fileManager.deleteGroup')"
                :disabled="groupMutationLoading"
              >
                <template #icon><icon-delete /></template>
              </a-button>
            </a-tooltip>
          </a-popconfirm>
        </div>
      </div>

      <div class="a9-file-manager__toolbar">
        <a-input-search
          v-model="keyword"
          class="a9-file-manager__search"
          :placeholder="t('admin9Ui.fileManager.searchPlaceholder')"
          allow-clear
          search-button
          @search="onSearch"
          @clear="onSearch"
        />
        <div class="a9-file-manager__toolbar-actions">
          <slot name="toolbar-extra" :refresh="refresh" :loading="loading" />
          <a-tooltip :content="t('admin9Ui.fileManager.refresh')">
            <a-button
              :aria-label="t('admin9Ui.fileManager.refresh')"
              :loading="loading"
              data-testid="file-refresh"
              @click="refresh"
            >
              <template #icon><icon-refresh /></template>
            </a-button>
          </a-tooltip>
          <a-radio-group v-model="view" type="button" class="a9-file-manager__view-toggle">
            <a-tooltip :content="t('admin9Ui.fileManager.gridView')">
              <a-radio value="grid" :aria-label="t('admin9Ui.fileManager.gridView')" data-testid="file-grid-view">
                <icon-apps />
              </a-radio>
            </a-tooltip>
            <a-tooltip :content="t('admin9Ui.fileManager.listView')">
              <a-radio value="list" :aria-label="t('admin9Ui.fileManager.listView')" data-testid="file-list-view">
                <icon-list />
              </a-radio>
            </a-tooltip>
          </a-radio-group>
          <a-tooltip v-if="canUpload" :content="uploadDisabledReason || t('admin9Ui.fileManager.upload')">
            <span>
              <a-upload
                :accept="resolvedAccept"
                :disabled="!activeFileType || uploadLoading"
                :show-file-list="false"
                :custom-request="customUpload"
              >
                <template #upload-button>
                  <a-button type="primary" :disabled="!activeFileType" :loading="uploadLoading">
                    <template #icon><icon-upload /></template>
                    {{ t('admin9Ui.fileManager.upload') }}
                  </a-button>
                </template>
              </a-upload>
            </span>
          </a-tooltip>
        </div>
      </div>

      <a-alert v-if="listError" type="error" class="a9-file-manager__list-error">
        {{ t('admin9Ui.fileManager.loadFailed') }}
        <a-button type="text" size="small" data-testid="file-retry-list" @click="fetchList">
          {{ t('admin9Ui.fileManager.retry') }}
        </a-button>
      </a-alert>

      <a-spin :loading="loading" class="a9-file-manager__spin">
        <div v-if="!listError && !isEmpty" class="a9-file-manager__items" :data-view="view">
          <article
            v-for="(item, index) in list"
            :key="`${item.id || `${item.type}-${item.name}`}:${index}`"
            class="a9-file-manager__item"
            :class="{ 'is-selected': selectedMap.has(item.id) }"
            :data-file-id="item.id"
          >
            <a-checkbox
              v-if="selectionEnabled"
              class="a9-file-manager__checkbox"
              :model-value="selectedMap.has(item.id)"
              :disabled="!isSelectable(item) || busyIds.has(item.id)"
              :aria-label="t('admin9Ui.fileManager.selectItem', { name: item.name })"
              @change="
                (checked: boolean | (string | number | boolean)[]) =>
                  onSelectionChange(checked ? [...selectedKeys, item.id] : selectedKeys.filter((id) => id !== item.id))
              "
            />
            <slot name="item" :item="item" :available="isAvailable(item)" :selected="selectedMap.has(item.id)" :view="view">
              <FileItemView :item="item" :available="isAvailable(item)" :status-label="statusLabel(item)" />
            </slot>
            <div v-if="canMove || canDelete" class="a9-file-manager__item-actions">
              <template v-if="canMove">
                <a-tooltip :content="!activeFileType ? moveDisabledReason : t('admin9Ui.fileManager.moveTarget')">
                  <span class="a9-file-manager__single-move">
                    <a-select
                      :model-value="singleMoveTargets.get(item.id)"
                      size="mini"
                      :placeholder="t('admin9Ui.fileManager.moveTarget')"
                      :disabled="!activeFileType || item.type !== activeFileType || !isAvailable(item) || busyIds.has(item.id)"
                      :aria-label="t('admin9Ui.fileManager.moveTargetItem', { name: item.name })"
                      :data-testid="`file-move-target-${item.id || index}`"
                      @change="(value: unknown) => onSingleMoveChange(item, value)"
                    >
                      <a-option :value="MOVE_UNGROUPED">{{ t('admin9Ui.fileManager.groupUngrouped') }}</a-option>
                      <a-option v-for="group in groups" :key="group.id" :value="moveGroupOptionValue(group.id)">
                        {{ group.name }}
                      </a-option>
                    </a-select>
                    <a-popconfirm
                      :content="t('admin9Ui.fileManager.moveOneConfirm', { name: item.name })"
                      @ok="moveSingle(item)"
                    >
                      <a-button
                        size="mini"
                        :disabled="!singleMoveTargets.get(item.id) || busyIds.has(item.id)"
                        :loading="busyIds.has(item.id)"
                        :data-testid="`file-move-${item.id || index}`"
                      >
                        {{ t('admin9Ui.fileManager.move') }}
                      </a-button>
                    </a-popconfirm>
                  </span>
                </a-tooltip>
              </template>
              <a-popconfirm v-if="canDelete" :content="t('admin9Ui.fileManager.deleteOneConfirm')" @ok="removeSingle(item)">
                <a-button
                  status="danger"
                  size="mini"
                  :disabled="!hasActionableIdentity(item) || busyIds.has(item.id)"
                  :loading="busyIds.has(item.id)"
                  :aria-label="t('admin9Ui.fileManager.deleteItem', { name: item.name })"
                  :data-testid="`file-delete-${item.id || index}`"
                >
                  <template #icon><icon-delete /></template>
                </a-button>
              </a-popconfirm>
            </div>
          </article>
        </div>
        <div v-else-if="isEmpty" class="a9-file-manager__empty">
          <slot name="empty"><a-empty :description="t('admin9Ui.fileManager.empty')" /></slot>
        </div>
      </a-spin>

      <footer class="a9-file-manager__footer" :class="{ 'without-selection': !selectionEnabled }">
        <div v-if="selectionEnabled" class="a9-file-manager__selection" aria-live="polite">
          <span>{{ t('admin9Ui.fileManager.selectedCount', { count: selectedCount }) }}</span>
          <a-button v-if="selectedCount" type="text" size="small" data-testid="file-clear-selection" @click="clearSelection">
            {{ t('admin9Ui.fileManager.clearSelection') }}
          </a-button>
        </div>
        <div v-if="selectionEnabled" class="a9-file-manager__batch-actions">
          <template v-if="canMove">
            <a-tooltip :content="!activeFileType ? moveDisabledReason : t('admin9Ui.fileManager.moveTarget')">
              <span>
                <a-select
                  v-model="batchMoveTarget"
                  class="a9-file-manager__batch-target"
                  size="small"
                  :placeholder="t('admin9Ui.fileManager.moveTarget')"
                  :disabled="!activeFileType || !batchMoveAvailable || mutationLoading"
                  data-testid="file-batch-move-target"
                >
                  <a-option :value="MOVE_UNGROUPED">{{ t('admin9Ui.fileManager.groupUngrouped') }}</a-option>
                  <a-option v-for="group in groups" :key="group.id" :value="moveGroupOptionValue(group.id)">
                    {{ group.name }}
                  </a-option>
                </a-select>
              </span>
            </a-tooltip>
            <a-button
              size="small"
              :disabled="!batchMoveTarget || !batchMoveAvailable"
              data-testid="file-batch-move"
              @click="moveSelected"
            >
              {{ t('admin9Ui.fileManager.move') }}
            </a-button>
          </template>
          <a-popconfirm
            v-if="canDelete"
            :content="t('admin9Ui.fileManager.deleteConfirm', { count: selectedCount })"
            @ok="removeItems(selectedKeys)"
          >
            <a-button
              status="danger"
              size="small"
              :disabled="selectedCount === 0 || mutationLoading"
              data-testid="file-batch-delete"
            >
              <template #icon><icon-delete /></template>
              {{ t('admin9Ui.fileManager.delete') }}
            </a-button>
          </a-popconfirm>
        </div>
        <a-pagination
          :current="current"
          :page-size="resolvedPageSize"
          :total="total"
          data-testid="file-pagination"
          simple
          @change="onPageChange"
        />
      </footer>
    </div>

    <a-modal
      v-model:visible="groupModalVisible"
      :title="groupModalTitle"
      :ok-loading="groupMutationLoading"
      :on-before-ok="submitGroup"
      @cancel="groupName = ''"
    >
      <a-input
        v-model="groupName"
        :placeholder="t('admin9Ui.fileManager.groupNamePlaceholder')"
        :max-length="100"
        @press-enter="submitGroupFromInput"
      />
    </a-modal>
  </section>
</template>

<style lang="less" scoped>
  .a9-file-manager {
    display: grid;
    grid-template-columns: 184px minmax(0, 1fr);
    min-width: 0;
    min-height: 540px;
    overflow: hidden;
    background: var(--color-bg-2);
    border: 1px solid var(--color-neutral-3);
    border-radius: 6px;

    &__sidebar {
      min-width: 0;
      padding: 12px 10px;
      background: var(--color-fill-1);
      border-right: 1px solid var(--color-neutral-3);
    }

    &__types,
    &__group-list {
      display: grid;
      gap: 3px;
    }

    &__type-button,
    &__group-button {
      display: flex;
      gap: 8px;
      align-items: center;
      width: 100%;
      min-width: 0;
      min-height: 36px;
      padding: 6px 10px;
      color: var(--color-text-2);
      font-size: 13px;
      line-height: 20px;
      text-align: left;
      background: transparent;
      border: 0;
      border-radius: 4px;
      cursor: pointer;

      span:nth-child(2) {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }

    &__group-button {
      min-height: 32px;
      padding: 5px 8px;

      span:last-child {
        flex: none;
        margin-left: auto;
        color: var(--color-text-3);
        font-size: 12px;
      }

      span:first-child {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }

    &__type-button:hover,
    &__group-button:hover {
      background: var(--color-fill-3);
    }

    &__type-button:focus-visible,
    &__group-button:focus-visible {
      outline: 2px solid rgb(var(--primary-6));
      outline-offset: -2px;
    }

    &__type-button.is-active,
    &__group-button.is-active {
      color: rgb(var(--primary-6));
      font-weight: 500;
      background: var(--color-primary-light-1);
    }

    &__type-count {
      margin-left: auto;
      color: var(--color-text-3);
      font-size: 12px;
    }

    &__groups {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid var(--color-neutral-3);
    }

    &__group-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 8px 7px;
      color: var(--color-text-3);
      font-weight: 500;
      font-size: 12px;
      line-height: 20px;
    }

    &__group-spin {
      display: block;
      min-height: 56px;
    }

    &__group-error {
      padding: 6px 8px;
      font-size: 12px;
    }

    &__group-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 26px;
      align-items: center;
    }

    &__main {
      display: flex;
      flex-direction: column;
      min-width: 0;
      padding: 16px;
    }

    &__compact-group {
      display: none;
      margin-bottom: 10px;
    }

    &__compact-group-controls {
      display: grid;
      grid-template-columns: minmax(0, 1fr) repeat(3, auto);
      gap: 6px;
      align-items: center;
    }

    &__compact-group-spin {
      display: block;
      min-width: 0;
    }

    &__compact-group-error {
      width: 100%;
    }

    &__toolbar {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
      margin-bottom: 14px;
    }

    &__search {
      width: min(100%, 320px);
    }

    &__toolbar-actions,
    &__batch-actions,
    &__single-move,
    &__item-actions,
    &__selection {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    &__view-toggle {
      flex: none;
    }

    &__list-error {
      margin-bottom: 12px;
    }

    &__spin {
      display: block;
      flex: 1;
      min-height: 300px;
    }

    &__items {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(164px, 1fr));
      gap: 12px;
      align-content: start;
    }

    &__item {
      position: relative;
      min-width: 0;
      padding: 10px;
      background: var(--color-bg-2);
      border: 1px solid var(--color-neutral-3);
      border-radius: 6px;

      &.is-selected {
        border-color: rgb(var(--primary-6));
        box-shadow: 0 0 0 1px rgb(var(--primary-6));
      }
    }

    &__checkbox {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 2;
      padding: 3px;
      background: var(--color-bg-2);
      border-radius: 3px;
    }

    &__item-actions {
      flex-wrap: wrap;
      justify-content: flex-end;
      margin-top: 10px;
    }

    &__single-move {
      min-width: 0;

      :deep(.arco-select-view) {
        width: 96px;
      }
    }

    &__empty {
      display: grid;
      min-height: 280px;
      place-items: center;
    }

    &__footer {
      display: grid;
      grid-template-columns: minmax(120px, 1fr) auto auto;
      gap: 12px;
      align-items: center;
      min-height: 54px;
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid var(--color-neutral-3);

      &.without-selection {
        grid-template-columns: minmax(0, 1fr) auto;

        :deep(.arco-pagination) {
          grid-column: 2;
        }
      }
    }

    &__selection {
      min-width: 0;
      color: var(--color-text-2);
      font-size: 13px;
      white-space: nowrap;
    }

    &__batch-target {
      width: 132px;
    }

    &.is-list-view &__items {
      grid-template-columns: minmax(0, 1fr);
    }

    &.is-list-view &__item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      min-height: 74px;
      padding-right: 12px;
    }

    &.is-list-view &__item-actions {
      flex-wrap: nowrap;
      margin-top: 0;
    }

    &.is-list-view :deep(.a9-file-item) {
      display: grid;
      grid-template-columns: 68px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      padding-right: 32px;
    }

    &.is-list-view :deep(.a9-file-item__visual) {
      height: 48px;
    }

    &.is-list-view :deep(.a9-file-item__details) {
      padding-top: 0;
    }
  }

  .a9-file-manager__danger-option {
    color: rgb(var(--danger-6));
  }

  @media (width <= 720px) {
    .a9-file-manager {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: visible;

      &__sidebar {
        padding: 10px;
        border-right: 0;
        border-bottom: 1px solid var(--color-neutral-3);
      }

      &__types {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: thin;
      }

      &__type-button {
        flex: 0 0 auto;
        width: auto;
        min-height: 34px;
      }

      &__type-count,
      &__groups {
        display: none;
      }

      &__main {
        padding: 12px;
      }

      &__compact-group {
        display: block;
      }

      &__compact-group-controls {
        grid-template-columns: minmax(0, 1fr) repeat(3, auto);
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
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      }

      &__footer {
        grid-template-columns: minmax(0, 1fr);
        align-items: start;
      }

      &__batch-actions {
        flex-wrap: wrap;
      }

      &__batch-target {
        width: min(100%, 160px);
      }

      &.is-list-view &__item {
        grid-template-columns: minmax(0, 1fr);
      }

      &.is-list-view &__item-actions {
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      :deep(.arco-pagination) {
        flex-wrap: wrap;
        max-width: 100%;
      }
    }
  }

  @media (width <= 430px) {
    .a9-file-manager {
      &__items {
        grid-template-columns: minmax(0, 1fr);
      }

      &__toolbar-actions {
        justify-content: flex-start;
      }
    }
  }
</style>
