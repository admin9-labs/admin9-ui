<script setup lang="ts">
  import { computed, inject, onMounted, ref, watch } from 'vue';
  import { Message } from '@arco-design/web-vue';
  import type { RequestOption, UploadRequest } from '@arco-design/web-vue';
  import { useI18n } from 'vue-i18n';
  import { useLoading } from '../../hooks';
  import MediaItemView from '../../internal/media-item.vue';
  import admin9UIOptionsKey from '../../internal/options';
  import type { MediaGroup, MediaItem, MediaLibraryAdapter, MediaLibraryService, MediaType } from '../../services/types';

  type GroupId = string | null | undefined;

  const props = withDefaults(
    defineProps<{
      mediaType?: MediaType;
      pageSize?: number;
      accept?: string;
      canUpload?: boolean;
      canDelete?: boolean;
      canMove?: boolean;
      canManageGroups?: boolean;
      service?: MediaLibraryService;
    }>(),
    {
      mediaType: 'image',
      pageSize: 24,
      accept: undefined,
      canUpload: true,
      canDelete: true,
      canMove: true,
      canManageGroups: true,
    }
  );

  defineSlots<{
    'toolbar-extra'?: (slotProps: { refresh: () => Promise<void>; loading: boolean }) => unknown;
    'item'?: (slotProps: { item: MediaItem; available: boolean; selected: boolean }) => unknown;
    'empty'?: () => unknown;
  }>();

  const emit = defineEmits<{
    (e: 'uploadSuccess', item: MediaItem): void;
    (e: 'uploadError', error: unknown): void;
    (e: 'deleteSuccess', ids: string[]): void;
    (e: 'moveSuccess', ids: string[], groupId: string | null): void;
  }>();

  const isLibraryService = (value: MediaLibraryAdapter | undefined): value is MediaLibraryService =>
    Boolean(
      value &&
        typeof value.list === 'function' &&
        typeof value.listGroups === 'function' &&
        typeof value.upload === 'function' &&
        typeof value.remove === 'function' &&
        typeof (value as Partial<MediaLibraryService>).createGroup === 'function' &&
        typeof (value as Partial<MediaLibraryService>).renameGroup === 'function' &&
        typeof (value as Partial<MediaLibraryService>).removeGroup === 'function' &&
        typeof (value as Partial<MediaLibraryService>).move === 'function'
    );

  const { t } = useI18n();
  const { loading, setLoading } = useLoading();
  const globalOptions = inject(admin9UIOptionsKey, undefined);
  const resolveLibraryService = () => {
    const resolved = props.service ?? globalOptions?.mediaService;
    if (!isLibraryService(resolved)) {
      throw new Error(
        '[admin9-ui] AMediaLibrary requires a MediaLibraryService. Pass the service prop or install Admin9UI with a compatible mediaService.'
      );
    }
    return resolved;
  };
  const libraryService = computed(resolveLibraryService);
  resolveLibraryService();

  const acceptByType: Record<MediaType, string> = {
    image: 'image/png,image/jpeg,image/gif,image/webp',
    video: 'video/*',
    audio: 'audio/*',
  };
  const resolvedAccept = computed(() => props.accept || acceptByType[props.mediaType]);
  const uploadLabel = computed(() => t(`admin9Ui.mediaLibrary.upload.${props.mediaType}`));

  /* ------------------------------ 查询与分组 ------------------------------ */
  const list = ref<MediaItem[]>([]);
  const groups = ref<MediaGroup[]>([]);
  const current = ref(1);
  const resolvedPageSize = ref(props.pageSize);
  const total = ref(0);
  const keyword = ref('');
  const activeGroupId = ref<GroupId>(undefined);
  const groupLoading = ref(false);
  const listError = ref(false);
  const selectedMap = ref(new Map<string, MediaItem>());
  let latestListRequest = 0;
  let latestGroupRequest = 0;
  const viewGeneration = ref(0);

  const GROUP_ALL = '__admin9_ui_library_all__';
  const GROUP_UNGROUPED = '__admin9_ui_library_ungrouped__';
  const GROUP_PREFIX = '__admin9_ui_library_group__:';
  const MOVE_UNGROUPED = '__admin9_ui_library_move_ungrouped__';
  const MOVE_GROUP_PREFIX = '__admin9_ui_library_move_group__:';
  const groupOptionValue = (id: string) => `${GROUP_PREFIX}${id}`;
  const moveGroupOptionValue = (id: string) => `${MOVE_GROUP_PREFIX}${id}`;
  const isEmpty = computed(() => list.value.length === 0 && !loading.value && !listError.value);
  const activeGroup = computed(() =>
    typeof activeGroupId.value === 'string' ? groups.value.find((group) => group.id === activeGroupId.value) : undefined
  );

  type AvailableMediaItem = MediaItem & { url: string };
  const isAvailable = (item: MediaItem): item is AvailableMediaItem =>
    item.type === props.mediaType &&
    (!item.status || item.status === 'ready') &&
    typeof item.url === 'string' &&
    item.url.length > 0;
  const statusLabel = (item: MediaItem) => {
    if (item.type !== props.mediaType) return t('admin9Ui.mediaLibrary.wrongType');
    if (item.status === 'pending') return t('admin9Ui.mediaLibrary.processing');
    if (item.status === 'failed') return t('admin9Ui.mediaLibrary.failed');
    return t('admin9Ui.mediaLibrary.unavailable');
  };

  const fetchList = async () => {
    const request = latestListRequest + 1;
    const generation = viewGeneration.value;
    const service = libraryService.value;
    const { mediaType } = props;
    latestListRequest = request;
    setLoading(true);
    listError.value = false;
    try {
      const result = await service.list({
        page: current.value,
        pageSize: resolvedPageSize.value,
        keyword: keyword.value.trim() || undefined,
        mediaType,
        groupId: activeGroupId.value,
      });
      if (request !== latestListRequest || generation !== viewGeneration.value) return;
      list.value = result.list;
      total.value = result.pagination.total;
      resolvedPageSize.value = result.pagination.pageSize;
      const selected = new Map(selectedMap.value);
      result.list.forEach((item) => {
        if (!selected.has(item.id)) return;
        if (isAvailable(item)) selected.set(item.id, item);
        else selected.delete(item.id);
      });
      selectedMap.value = selected;
    } catch {
      if (request !== latestListRequest || generation !== viewGeneration.value) return;
      list.value = [];
      total.value = 0;
      listError.value = true;
      Message.error(t('admin9Ui.mediaLibrary.loadFailed'));
    } finally {
      if (request === latestListRequest && generation === viewGeneration.value) setLoading(false);
    }
  };

  const fetchGroups = async () => {
    const request = latestGroupRequest + 1;
    const generation = viewGeneration.value;
    const service = libraryService.value;
    const { mediaType } = props;
    latestGroupRequest = request;
    groupLoading.value = true;
    try {
      const nextGroups = await service.listGroups(mediaType);
      if (request === latestGroupRequest && generation === viewGeneration.value) groups.value = nextGroups;
    } catch {
      if (request !== latestGroupRequest || generation !== viewGeneration.value) return;
      groups.value = [];
      Message.error(t('admin9Ui.mediaLibrary.groupLoadFailed'));
    } finally {
      if (request === latestGroupRequest && generation === viewGeneration.value) groupLoading.value = false;
    }
  };

  const refresh = async () => {
    await Promise.all([fetchList(), fetchGroups()]);
  };

  const onGroupChange = (groupId: GroupId) => {
    if (activeGroupId.value === groupId) return;
    activeGroupId.value = groupId;
    current.value = 1;
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

  /* ------------------------------ 跨页选择 ------------------------------ */
  const selectedKeys = computed(() => Array.from(selectedMap.value.keys()));
  const selectedCount = computed(() => selectedMap.value.size);
  const clearSelection = () => {
    selectedMap.value = new Map();
  };
  const onSelectionChange = (values: (string | number | boolean)[]) => {
    const incoming = new Set(values.map((value) => String(value)));
    const next = new Map(selectedMap.value);
    list.value.forEach((item) => {
      if (!isAvailable(item)) {
        next.delete(item.id);
        return;
      }
      if (incoming.has(item.id)) next.set(item.id, item);
      else next.delete(item.id);
    });
    selectedMap.value = next;
  };

  /* ------------------------------ 上传 ------------------------------ */
  const uploadCounts = ref(new Map<number, number>());
  const uploadLoading = computed(() => (uploadCounts.value.get(viewGeneration.value) ?? 0) > 0);
  const changeUploadCount = (generation: number, delta: number) => {
    const next = new Map(uploadCounts.value);
    const count = Math.max(0, (next.get(generation) ?? 0) + delta);
    if (count > 0) next.set(generation, count);
    else next.delete(generation);
    uploadCounts.value = next;
  };
  const uploadGroupId = computed<string | null>(() => (typeof activeGroupId.value === 'string' ? activeGroupId.value : null));
  const customUpload = (option: RequestOption): UploadRequest => {
    const controller = new AbortController();
    const generation = viewGeneration.value;
    const service = libraryService.value;
    const { mediaType } = props;
    const groupId = uploadGroupId.value;
    const { file } = option.fileItem;
    if (!file) {
      const error = new Error('No file');
      option.onError(error);
      return { abort: () => controller.abort() };
    }
    changeUploadCount(generation, 1);
    service
      .upload({
        file,
        mediaType,
        groupId,
        onProgress: option.onProgress,
        signal: controller.signal,
      })
      .then(async (item) => {
        option.onSuccess(item);
        if (generation !== viewGeneration.value) return;
        emit('uploadSuccess', item);
        await refresh();
      })
      .catch((error: unknown) => {
        option.onError(error);
        if (generation !== viewGeneration.value) return;
        emit('uploadError', error);
        Message.error(t('admin9Ui.mediaLibrary.uploadFailed'));
      })
      .finally(() => {
        changeUploadCount(generation, -1);
      });
    return { abort: () => controller.abort() };
  };

  /* ------------------------------ 移动与删除 ------------------------------ */
  const busyIds = ref(new Set<string>());
  const batchMoveTarget = ref<string>();
  const mutationLoading = computed(() => busyIds.value.size > 0);
  const markBusy = (ids: string[], busy: boolean) => {
    const next = new Set(busyIds.value);
    ids.forEach((id) => (busy ? next.add(id) : next.delete(id)));
    busyIds.value = next;
  };
  const removeSelectedIds = (ids: string[]) => {
    const next = new Map(selectedMap.value);
    ids.forEach((id) => next.delete(id));
    selectedMap.value = next;
  };
  const successfulRequestedIds = (returnedIds: string[], requestedIds: string[]) => {
    const requested = new Set(requestedIds);
    const successful = new Set<string>();
    returnedIds.forEach((id) => {
      if (requested.has(id)) successful.add(id);
    });
    return Array.from(successful);
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

  const moveItems = async (inputIds: string[], groupId: string | null) => {
    const ids = Array.from(new Set(inputIds));
    if (ids.length === 0 || ids.some((id) => busyIds.value.has(id))) return;
    const generation = viewGeneration.value;
    const service = libraryService.value;
    const { mediaType } = props;
    markBusy(ids, true);
    try {
      const returnedIds = await service.move({ mediaType, ids, groupId });
      if (generation !== viewGeneration.value) return;
      const movedIds = successfulRequestedIds(returnedIds, ids);
      removeSelectedIds(movedIds);
      if (movedIds.length !== ids.length) Message.warning(t('admin9Ui.mediaLibrary.movePartial'));
      emit('moveSuccess', movedIds, groupId);
      await refreshAfterMutation(generation);
    } catch {
      if (generation !== viewGeneration.value) return;
      Message.error(t('admin9Ui.mediaLibrary.moveFailed'));
      await fetchList();
    } finally {
      if (generation === viewGeneration.value) markBusy(ids, false);
    }
  };
  const moveSelected = () => {
    if (!batchMoveTarget.value) return;
    const target = decodeMoveTarget(batchMoveTarget.value);
    if (target === undefined) return;
    batchMoveTarget.value = undefined;
    moveItems(selectedKeys.value, target);
  };
  const moveSingle = (item: MediaItem, value: string) => {
    if (!isAvailable(item)) return;
    const target = decodeMoveTarget(value);
    if (target !== undefined) moveItems([item.id], target);
  };
  const onSingleMoveChange = (
    item: MediaItem,
    value: string | number | boolean | Record<string, unknown> | (string | number | boolean | Record<string, unknown>)[]
  ) => {
    if (typeof value === 'string') moveSingle(item, value);
  };

  const removeItems = async (inputIds: string[]) => {
    const ids = Array.from(new Set(inputIds));
    if (ids.length === 0 || ids.some((id) => busyIds.value.has(id))) return;
    const generation = viewGeneration.value;
    const service = libraryService.value;
    const { mediaType } = props;
    markBusy(ids, true);
    try {
      const returnedIds = await service.remove(ids);
      if (generation !== viewGeneration.value || mediaType !== props.mediaType) return;
      const removedIds = successfulRequestedIds(returnedIds, ids);
      removeSelectedIds(removedIds);
      if (removedIds.length !== ids.length) Message.warning(t('admin9Ui.mediaLibrary.deletePartial'));
      emit('deleteSuccess', removedIds);
      await refreshAfterMutation(generation);
    } catch {
      if (generation !== viewGeneration.value) return;
      Message.error(t('admin9Ui.mediaLibrary.deleteFailed'));
      await fetchList();
    } finally {
      if (generation === viewGeneration.value) markBusy(ids, false);
    }
  };

  /* ------------------------------ 分组管理 ------------------------------ */
  const groupModalVisible = ref(false);
  const groupModalMode = ref<'create' | 'rename'>('create');
  const editingGroup = ref<MediaGroup>();
  const groupName = ref('');
  const groupMutationLoading = ref(false);
  const groupModalTitle = computed(() =>
    t(groupModalMode.value === 'create' ? 'admin9Ui.mediaLibrary.createGroup' : 'admin9Ui.mediaLibrary.renameGroup')
  );
  const openCreateGroup = () => {
    groupModalMode.value = 'create';
    editingGroup.value = undefined;
    groupName.value = '';
    groupModalVisible.value = true;
  };
  const openRenameGroup = (group: MediaGroup) => {
    groupModalMode.value = 'rename';
    editingGroup.value = group;
    groupName.value = group.name;
    groupModalVisible.value = true;
  };
  const submitGroup = async (): Promise<boolean> => {
    const name = groupName.value.trim();
    if (!name || groupMutationLoading.value) return false;
    const generation = viewGeneration.value;
    const service = libraryService.value;
    const { mediaType } = props;
    const mode = groupModalMode.value;
    const groupId = editingGroup.value?.id;
    groupMutationLoading.value = true;
    try {
      if (mode === 'create') {
        const created = await service.createGroup({ mediaType, name });
        if (generation !== viewGeneration.value) return false;
        await fetchGroups();
        if (generation !== viewGeneration.value) return false;
        onGroupChange(created.id);
      } else if (groupId) {
        await service.renameGroup({ mediaType, groupId, name });
        if (generation !== viewGeneration.value) return false;
        await fetchGroups();
        if (generation !== viewGeneration.value) return false;
      }
      return true;
    } catch {
      if (generation !== viewGeneration.value) return false;
      Message.error(t('admin9Ui.mediaLibrary.groupMutationFailed'));
      return false;
    } finally {
      if (generation === viewGeneration.value) groupMutationLoading.value = false;
    }
  };
  const submitGroupFromInput = async () => {
    if (await submitGroup()) groupModalVisible.value = false;
  };
  const removeGroup = async (group: MediaGroup) => {
    if (groupMutationLoading.value) return;
    const generation = viewGeneration.value;
    const service = libraryService.value;
    const { mediaType } = props;
    const groupId = group.id;
    groupMutationLoading.value = true;
    try {
      await service.removeGroup({ mediaType, groupId });
      if (generation !== viewGeneration.value) return;
      await fetchGroups();
      if (generation !== viewGeneration.value) return;
      if (activeGroupId.value === groupId) {
        activeGroupId.value = undefined;
        current.value = 1;
      }
      await fetchList();
    } catch {
      if (generation !== viewGeneration.value) return;
      Message.error(t('admin9Ui.mediaLibrary.groupDeleteFailed'));
    } finally {
      if (generation === viewGeneration.value) groupMutationLoading.value = false;
    }
  };

  watch([() => props.mediaType, () => props.service], () => {
    viewGeneration.value += 1;
    latestListRequest += 1;
    latestGroupRequest += 1;
    activeGroupId.value = undefined;
    current.value = 1;
    groups.value = [];
    busyIds.value = new Set();
    batchMoveTarget.value = undefined;
    groupModalVisible.value = false;
    groupMutationLoading.value = false;
    clearSelection();
    refresh();
  });
  watch(
    () => props.pageSize,
    (value) => {
      resolvedPageSize.value = value;
      current.value = 1;
      fetchList();
    }
  );

  onMounted(refresh);
  defineExpose({ refresh, clearSelection });
</script>

<template>
  <section class="a9-media-library" :data-media-type="mediaType">
    <header class="a9-media-library__toolbar">
      <a-input-search
        v-model="keyword"
        class="a9-media-library__search"
        :placeholder="t('admin9Ui.mediaLibrary.searchPlaceholder')"
        allow-clear
        search-button
        @search="onSearch"
        @clear="onSearch"
      />
      <a-button :title="t('admin9Ui.mediaLibrary.refresh')" :aria-label="t('admin9Ui.mediaLibrary.refresh')" @click="refresh">
        <template #icon><icon-refresh /></template>
      </a-button>
      <slot name="toolbar-extra" :refresh="refresh" :loading="loading" />
      <a-upload v-if="canUpload" :accept="resolvedAccept" :custom-request="customUpload" :show-file-list="false" multiple>
        <template #upload-button>
          <a-button type="primary" :loading="uploadLoading">
            <template #icon><icon-upload /></template>
            {{ uploadLabel }}
          </a-button>
        </template>
      </a-upload>
    </header>

    <div class="a9-media-library__layout">
      <aside class="a9-media-library__groups">
        <div class="a9-media-library__groups-heading">
          <strong>{{ t('admin9Ui.mediaLibrary.groups') }}</strong>
          <a-button
            v-if="canManageGroups"
            size="mini"
            type="text"
            :title="t('admin9Ui.mediaLibrary.createGroup')"
            :aria-label="t('admin9Ui.mediaLibrary.createGroup')"
            data-testid="create-group"
            @click="openCreateGroup"
          >
            <template #icon><icon-plus /></template>
          </a-button>
        </div>

        <a-spin class="a9-media-library__group-spin" :loading="groupLoading">
          <nav class="a9-media-library__group-list" :aria-label="t('admin9Ui.mediaLibrary.groups')">
            <button
              type="button"
              class="a9-media-library__group-button"
              :class="{ 'is-active': activeGroupId === undefined }"
              data-group-id="all"
              @click="onGroupChange(undefined)"
            >
              {{ t('admin9Ui.mediaLibrary.groupAll') }}
            </button>
            <button
              type="button"
              class="a9-media-library__group-button"
              :class="{ 'is-active': activeGroupId === null }"
              data-group-id="ungrouped"
              @click="onGroupChange(null)"
            >
              {{ t('admin9Ui.mediaLibrary.groupUngrouped') }}
            </button>
            <div v-for="group in groups" :key="group.id" class="a9-media-library__group-row">
              <button
                type="button"
                class="a9-media-library__group-button"
                :class="{ 'is-active': activeGroupId === group.id }"
                :data-group-id="group.id"
                @click="onGroupChange(group.id)"
              >
                <span>{{ group.name }}</span>
                <span v-if="group.count !== undefined" class="a9-media-library__group-count">{{ group.count }}</span>
              </button>
              <span v-if="canManageGroups" class="a9-media-library__group-actions">
                <a-button
                  size="mini"
                  type="text"
                  :title="t('admin9Ui.mediaLibrary.renameGroup')"
                  :aria-label="t('admin9Ui.mediaLibrary.renameGroup')"
                  :data-testid="`rename-group-${group.id}`"
                  @click="openRenameGroup(group)"
                >
                  <template #icon><icon-edit /></template>
                </a-button>
                <a-popconfirm
                  :content="t('admin9Ui.mediaLibrary.groupDeleteConfirm')"
                  :ok-loading="groupMutationLoading"
                  @ok="removeGroup(group)"
                >
                  <a-button
                    size="mini"
                    type="text"
                    status="danger"
                    :title="t('admin9Ui.mediaLibrary.deleteGroup')"
                    :aria-label="t('admin9Ui.mediaLibrary.deleteGroup')"
                    :data-testid="`delete-group-${group.id}`"
                  >
                    <template #icon><icon-delete /></template>
                  </a-button>
                </a-popconfirm>
              </span>
            </div>
          </nav>
        </a-spin>

        <div class="a9-media-library__group-select">
          <a-select v-model="compactGroupValue" class="a9-media-library__group-select-control" data-testid="compact-groups">
            <a-option :value="GROUP_ALL">{{ t('admin9Ui.mediaLibrary.groupAll') }}</a-option>
            <a-option :value="GROUP_UNGROUPED">{{ t('admin9Ui.mediaLibrary.groupUngrouped') }}</a-option>
            <a-option v-for="group in groups" :key="group.id" :value="groupOptionValue(group.id)">
              {{ group.name }}
            </a-option>
          </a-select>
          <span v-if="canManageGroups" class="a9-media-library__compact-group-actions">
            <a-button
              size="mini"
              type="text"
              :title="t('admin9Ui.mediaLibrary.createGroup')"
              :aria-label="t('admin9Ui.mediaLibrary.createGroup')"
              data-testid="compact-create-group"
              @click="openCreateGroup"
            >
              <template #icon><icon-plus /></template>
            </a-button>
            <template v-if="activeGroup">
              <a-button
                size="mini"
                type="text"
                :title="t('admin9Ui.mediaLibrary.renameGroup')"
                :aria-label="t('admin9Ui.mediaLibrary.renameGroup')"
                data-testid="compact-rename-group"
                @click="openRenameGroup(activeGroup)"
              >
                <template #icon><icon-edit /></template>
              </a-button>
              <a-popconfirm
                :content="t('admin9Ui.mediaLibrary.groupDeleteConfirm')"
                :ok-loading="groupMutationLoading"
                @ok="removeGroup(activeGroup)"
              >
                <a-button
                  size="mini"
                  type="text"
                  status="danger"
                  :title="t('admin9Ui.mediaLibrary.deleteGroup')"
                  :aria-label="t('admin9Ui.mediaLibrary.deleteGroup')"
                  data-testid="compact-delete-group"
                >
                  <template #icon><icon-delete /></template>
                </a-button>
              </a-popconfirm>
            </template>
          </span>
        </div>
      </aside>

      <main class="a9-media-library__main">
        <div class="a9-media-library__batch" :class="{ 'has-selection': selectedCount > 0 }">
          <span>{{ t('admin9Ui.mediaLibrary.selectedCount', { count: selectedCount }) }}</span>
          <template v-if="selectedCount > 0">
            <a-select
              v-if="canMove"
              v-model="batchMoveTarget"
              class="a9-media-library__move-select"
              :placeholder="t('admin9Ui.mediaLibrary.moveTarget')"
              data-testid="batch-move-target"
            >
              <a-option :value="MOVE_UNGROUPED">{{ t('admin9Ui.mediaLibrary.groupUngrouped') }}</a-option>
              <a-option v-for="group in groups" :key="group.id" :value="moveGroupOptionValue(group.id)">
                {{ group.name }}
              </a-option>
            </a-select>
            <a-button
              v-if="canMove"
              :disabled="!batchMoveTarget"
              :loading="mutationLoading"
              data-testid="batch-move"
              @click="moveSelected"
            >
              {{ t('admin9Ui.mediaLibrary.move') }}
            </a-button>
            <a-popconfirm
              v-if="canDelete"
              :content="t('admin9Ui.mediaLibrary.deleteConfirm', { count: selectedCount })"
              :ok-loading="mutationLoading"
              @ok="removeItems(selectedKeys)"
            >
              <a-button status="danger" data-testid="batch-delete">{{ t('admin9Ui.mediaLibrary.delete') }}</a-button>
            </a-popconfirm>
            <a-button type="text" data-testid="clear-selection" @click="clearSelection">
              {{ t('admin9Ui.mediaLibrary.clearSelection') }}
            </a-button>
          </template>
        </div>

        <a-alert v-if="listError" type="error" class="a9-media-library__error">
          {{ t('admin9Ui.mediaLibrary.loadFailed') }}
          <a-button size="mini" type="text" data-testid="retry-list" @click="fetchList">
            {{ t('admin9Ui.mediaLibrary.retry') }}
          </a-button>
        </a-alert>

        <a-spin class="a9-media-library__spin" :loading="loading">
          <template v-if="isEmpty">
            <slot name="empty">
              <a-empty :description="t('admin9Ui.mediaLibrary.empty')" />
            </slot>
          </template>
          <a-checkbox-group v-else :model-value="selectedKeys" @change="onSelectionChange">
            <div class="a9-media-library__grid">
              <article v-for="item in list" :key="item.id" class="a9-media-library__item" :data-media-id="item.id">
                <slot name="item" :item="item" :available="isAvailable(item)" :selected="selectedMap.has(item.id)">
                  <MediaItemView
                    :item="item"
                    :media-type="mediaType"
                    :available="isAvailable(item)"
                    :previewable="mediaType === 'image' && isAvailable(item)"
                    :playable="mediaType !== 'image' && isAvailable(item)"
                    :status-label="statusLabel(item)"
                  />
                </slot>
                <footer class="a9-media-library__item-actions">
                  <a-checkbox :value="item.id" :disabled="!isAvailable(item)">
                    {{ t('admin9Ui.mediaLibrary.select') }}
                  </a-checkbox>
                  <span class="a9-media-library__item-tools">
                    <a-select
                      v-if="canMove && isAvailable(item)"
                      :model-value="undefined"
                      size="mini"
                      class="a9-media-library__single-move"
                      :placeholder="t('admin9Ui.mediaLibrary.move')"
                      :data-testid="`move-media-${item.id}`"
                      @change="onSingleMoveChange(item, $event)"
                    >
                      <a-option :value="MOVE_UNGROUPED">{{ t('admin9Ui.mediaLibrary.groupUngrouped') }}</a-option>
                      <a-option v-for="group in groups" :key="group.id" :value="moveGroupOptionValue(group.id)">
                        {{ group.name }}
                      </a-option>
                    </a-select>
                    <a-popconfirm
                      v-if="canDelete && item.type === mediaType"
                      :content="t('admin9Ui.mediaLibrary.deleteOneConfirm')"
                      :ok-loading="busyIds.has(item.id)"
                      @ok="removeItems([item.id])"
                    >
                      <a-button
                        size="mini"
                        type="text"
                        status="danger"
                        :disabled="busyIds.has(item.id)"
                        :title="t('admin9Ui.mediaLibrary.delete')"
                        :aria-label="t('admin9Ui.mediaLibrary.delete')"
                        :data-testid="`delete-media-${item.id}`"
                      >
                        <template #icon><icon-delete /></template>
                      </a-button>
                    </a-popconfirm>
                  </span>
                </footer>
              </article>
            </div>
          </a-checkbox-group>
        </a-spin>

        <a-pagination
          v-if="total > resolvedPageSize"
          class="a9-media-library__pagination"
          :current="current"
          :page-size="resolvedPageSize"
          :total="total"
          show-total
          @change="onPageChange"
        />
      </main>
    </div>

    <a-modal
      v-model:visible="groupModalVisible"
      :title="groupModalTitle"
      :ok-loading="groupMutationLoading"
      :ok-button-props="{ disabled: !groupName.trim() }"
      :on-before-ok="submitGroup"
    >
      <a-input
        v-model="groupName"
        :placeholder="t('admin9Ui.mediaLibrary.groupNamePlaceholder')"
        data-testid="group-name"
        @press-enter="submitGroupFromInput"
      />
    </a-modal>
  </section>
</template>

<style lang="less" scoped>
  .a9-media-library {
    width: 100%;
    min-width: 0;
    color: var(--color-text-1);

    &__toolbar,
    &__batch,
    &__groups-heading,
    &__item-actions,
    &__item-tools {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    &__toolbar {
      justify-content: flex-end;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--color-neutral-3);
    }

    &__search {
      width: min(320px, 100%);
      margin-right: auto;
    }

    &__layout {
      display: grid;
      grid-template-columns: minmax(160px, 208px) minmax(0, 1fr);
      min-height: 460px;
    }

    &__groups {
      min-width: 0;
      padding: 14px 12px 14px 0;
      border-right: 1px solid var(--color-neutral-3);
    }

    &__groups-heading {
      justify-content: space-between;
      min-height: 28px;
      padding: 0 8px 8px 10px;
      font-size: 13px;
    }

    &__group-spin {
      display: block;
    }

    &__group-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    &__group-button {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-width: 0;
      min-height: 32px;
      padding: 5px 10px;
      overflow: hidden;
      color: var(--color-text-2);
      font: inherit;
      text-align: left;
      background: transparent;
      border: 0;
      border-radius: 4px;
      cursor: pointer;

      span:first-child {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      &:hover,
      &.is-active {
        color: rgb(var(--primary-6));
        background: var(--color-primary-light-1);
      }
    }

    &__group-count {
      flex: none;
      color: var(--color-text-3);
      font-size: 12px;
    }

    &__group-actions {
      gap: 0;
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    &__group-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;

      &:hover .a9-media-library__group-actions,
      &:focus-within .a9-media-library__group-actions {
        opacity: 1;
      }
    }

    &__group-select {
      display: none;
    }

    &__compact-group-actions {
      display: flex;
      flex: none;
      gap: 2px;
      align-items: center;
    }

    &__main {
      min-width: 0;
      padding: 14px 0 14px 16px;
    }

    &__batch {
      min-height: 36px;
      margin-bottom: 12px;
      color: var(--color-text-3);
      font-size: 13px;

      &.has-selection {
        color: var(--color-text-1);
      }
    }

    &__move-select {
      width: 160px;
      margin-left: auto;
    }

    &__error {
      margin-bottom: 12px;
    }

    &__spin {
      display: block;
      min-height: 320px;
    }

    &__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
      gap: 12px;
    }

    &__item {
      min-width: 0;
      padding: 10px;
      background: var(--color-bg-2);
      border: 1px solid var(--color-neutral-3);
      border-radius: 6px;

      &:focus-within {
        border-color: rgb(var(--primary-6));
      }
    }

    &__item-actions {
      justify-content: space-between;
      min-height: 28px;
      margin-top: 8px;
    }

    &__item-tools {
      gap: 2px;
      min-width: 0;
    }

    &__single-move {
      width: 92px;
    }

    &__pagination {
      display: flex;
      justify-content: flex-end;
      margin-top: 16px;
    }
  }

  @media (width <= 720px) {
    .a9-media-library {
      &__toolbar {
        flex-wrap: wrap;
      }

      &__search {
        width: 100%;
      }

      &__layout {
        display: block;
        min-height: 0;
      }

      &__groups {
        padding: 12px 0;
        border-right: 0;
        border-bottom: 1px solid var(--color-neutral-3);
      }

      &__groups-heading,
      &__group-spin {
        display: none;
      }

      &__group-select {
        display: flex;
        gap: 4px;
        align-items: center;
        width: 100%;
      }

      &__group-select-control {
        flex: 1;
        min-width: 0;
      }

      &__main {
        padding: 12px 0;
      }

      &__batch {
        flex-wrap: wrap;
      }

      &__move-select {
        width: min(180px, 100%);
        margin-left: 0;
      }

      &__grid {
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      }
    }
  }
</style>
