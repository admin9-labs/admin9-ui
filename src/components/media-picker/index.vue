<script setup lang="ts">
  import { computed, inject, onMounted, ref, watch } from 'vue';
  import { Message } from '@arco-design/web-vue';
  import type { FileItem, RequestOption, UploadRequest } from '@arco-design/web-vue';
  import { useI18n } from 'vue-i18n';
  import { useLoading, useVisible } from '../../hooks';
  import admin9UIOptionsKey from '../../internal/options';
  import type { MediaGroup, MediaItem, MediaService, MediaType } from '../../services/types';
  import MediaItemView from '../../internal/media-item.vue';

  type ModelValue = MediaItem[] | MediaItem | string | undefined;
  type GroupId = string | null | undefined;

  const props = withDefaults(
    defineProps<{
      modelValue?: ModelValue;
      /** 单个实例只处理一种素材类型。 */
      mediaType?: MediaType;
      multiple?: boolean;
      /** 最多可选数量，0 = 不限（仅 multiple 生效）。 */
      limit?: number;
      pageSize?: number;
      buttonText?: string;
      accept?: string;
      canUpload?: boolean;
      canDelete?: boolean;
      service?: MediaService;
      showFileList?: boolean;
    }>(),
    {
      mediaType: 'image',
      multiple: false,
      limit: 0,
      pageSize: 24,
      buttonText: '',
      accept: undefined,
      canUpload: true,
      canDelete: false,
      showFileList: true,
    }
  );

  const emit = defineEmits<{
    (e: 'update:modelValue', value: ModelValue): void;
    (e: 'change', items: MediaItem[]): void;
    (e: 'select', items: MediaItem[]): void;
    (e: 'upload-success', item: MediaItem): void;
    (e: 'upload-error', error: unknown): void;
  }>();

  const { t } = useI18n();
  const { visible, setVisible } = useVisible();
  const { loading, setLoading } = useLoading();
  const globalOptions = inject(admin9UIOptionsKey, undefined);
  const service = props.service ?? globalOptions?.mediaService;
  if (!service) {
    throw new Error(
      '[admin9-ui] AMediaPicker requires a MediaService. Pass the service prop or install Admin9UI with { mediaService }.'
    );
  }

  const acceptByType: Record<MediaType, string> = {
    image: 'image/png,image/jpeg,image/gif,image/webp',
    video: 'video/*',
    audio: 'audio/*',
  };
  const resolvedAccept = computed(() => props.accept || acceptByType[props.mediaType]);
  const selectLabel = computed(() => t(`admin9Ui.mediaPicker.select.${props.mediaType}`));
  const uploadLabel = computed(() => t(`admin9Ui.mediaPicker.upload.${props.mediaType}`));

  /* ------------------------------ 列表与分组 ------------------------------ */
  const list = ref<MediaItem[]>([]);
  const current = ref(1);
  const pageSize = ref(props.pageSize);
  const total = ref(0);
  const keyword = ref('');
  const activeGroupId = ref<GroupId>(undefined);
  const groups = ref<MediaGroup[]>([]);
  const groupLoading = ref(false);
  const hasGroupNavigation = typeof service.listGroups === 'function';
  let latestListRequest = 0;
  let latestGroupRequest = 0;

  const GROUP_ALL = '__admin9_ui_group_all__';
  const GROUP_UNGROUPED = '__admin9_ui_group_ungrouped__';
  const GROUP_PREFIX = '__admin9_ui_group__:';
  const groupOptionValue = (id: string) => `${GROUP_PREFIX}${id}`;

  const isEmpty = computed(() => list.value.length === 0 && !loading.value);
  type SelectableMediaItem = MediaItem & { url: string };
  const isSelectable = (item: MediaItem): item is SelectableMediaItem =>
    item.type === props.mediaType &&
    (!item.status || item.status === 'ready') &&
    typeof item.url === 'string' &&
    item.url.length > 0;
  const statusLabel = (item: MediaItem) => {
    if (item.type !== props.mediaType) return t('admin9Ui.mediaPicker.wrongType');
    if (item.status === 'pending') return t('admin9Ui.mediaPicker.processing');
    if (item.status === 'failed') return t('admin9Ui.mediaPicker.failed');
    return t('admin9Ui.mediaPicker.unavailable');
  };

  const fetchList = async () => {
    const request = latestListRequest + 1;
    latestListRequest = request;
    setLoading(true);
    try {
      const { list: items, pagination } = await service.list({
        page: current.value,
        pageSize: pageSize.value,
        keyword: keyword.value.trim() || undefined,
        mediaType: props.mediaType,
        groupId: activeGroupId.value,
      });
      if (request !== latestListRequest) return;
      list.value = items;
      total.value = pagination.total;
      pageSize.value = pagination.pageSize;
    } catch {
      if (request !== latestListRequest) return;
      Message.error(t('admin9Ui.mediaPicker.loadFailed'));
      list.value = [];
      total.value = 0;
    } finally {
      if (request === latestListRequest) setLoading(false);
    }
  };

  const fetchGroups = async () => {
    if (!service.listGroups) return;
    const request = latestGroupRequest + 1;
    latestGroupRequest = request;
    groups.value = [];
    groupLoading.value = true;
    try {
      const nextGroups = await service.listGroups(props.mediaType);
      if (request === latestGroupRequest) groups.value = nextGroups;
    } catch {
      if (request !== latestGroupRequest) return;
      groups.value = [];
      Message.error(t('admin9Ui.mediaPicker.groupLoadFailed'));
    } finally {
      if (request === latestGroupRequest) groupLoading.value = false;
    }
  };

  function onGroupChange(groupId: GroupId) {
    if (activeGroupId.value === groupId) return;
    activeGroupId.value = groupId;
    current.value = 1;
    fetchList();
  }

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

  const onPageChange = (page: number) => {
    current.value = page;
    fetchList();
  };

  const onSearch = () => {
    current.value = 1;
    fetchList();
  };

  /* ------------------------------ 选择状态 ------------------------------ */
  const selectedItems = ref<MediaItem[]>([]);
  const fileList = ref<FileItem[]>([]);
  const selectedMap = ref(new Map<string, MediaItem>());
  const selectedKeys = computed(() => Array.from(selectedMap.value.keys()));
  const selectCount = computed(() => selectedMap.value.size);
  const singleKey = ref('');
  const limitReached = computed(() => props.multiple && props.limit > 0 && selectCount.value >= props.limit);

  const toFileItem = (item: MediaItem): FileItem => ({
    uid: item.id,
    name: item.name,
    url: item.url ?? undefined,
    status: 'done',
  });
  const isStringModel = computed(() => typeof props.modelValue === 'string');

  const emitSingle = (item: MediaItem | undefined) => {
    if (!item) {
      emit('update:modelValue', undefined);
      return;
    }
    emit('update:modelValue', isStringModel.value ? item.url ?? undefined : item);
  };

  const confirmSelection = (items: MediaItem[]) => {
    const selectableItems = items.filter(isSelectable);
    setVisible(false);
    selectedItems.value = selectableItems;
    fileList.value = selectableItems.map(toFileItem);
    emit('change', selectableItems);
    if (props.multiple) emit('update:modelValue', selectableItems);
    else emitSingle(selectableItems[selectableItems.length - 1]);
  };

  const onMultiSelect = (value: (string | number | boolean)[]) => {
    const incoming = new Set(value.map((entry) => String(entry)));
    const next = new Map(selectedMap.value);

    // First remove current-page entries that are no longer selected, then add
    // new entries only while capacity remains. This enforces limit at the
    // event boundary as well as in the checkbox UI.
    list.value.forEach((item) => {
      if (!isSelectable(item) || !incoming.has(item.id)) {
        next.delete(item.id);
      }
    });
    list.value.forEach((item) => {
      if (!incoming.has(item.id) || !isSelectable(item) || next.has(item.id)) return;
      if (props.limit > 0 && next.size >= props.limit) return;
      next.set(item.id, item);
    });
    selectedMap.value = next;
    emit('select', Array.from(next.values()));
  };

  const onSingleSelect = (value: string | number | boolean) => {
    const id = String(value);
    const item = list.value.find((entry) => entry.id === id);
    if (!item || !isSelectable(item)) return;
    singleKey.value = id;
    confirmSelection([item]);
  };

  const onConfirm = () => confirmSelection(Array.from(selectedMap.value.values()));

  /* ------------------------------ 删除 ------------------------------ */
  const deletingIds = ref(new Set<string>());
  const deleteLoading = computed(() => selectedKeys.value.some((id) => deletingIds.value.has(id)));
  const isDeleting = (id: string) => deletingIds.value.has(id);
  const successfulRequestedIds = (returnedIds: string[], requestedIds: string[]) => {
    const requested = new Set(requestedIds);
    const successful = new Set<string>();
    returnedIds.forEach((id) => {
      if (requested.has(id)) successful.add(id);
    });
    return Array.from(successful);
  };
  const removeItems = async (inputIds: string[]) => {
    const ids = Array.from(new Set(inputIds));
    if (ids.length === 0 || ids.some(isDeleting)) return;
    deletingIds.value = new Set([...deletingIds.value, ...ids]);
    try {
      const returnedIds = await service.remove(ids);
      const removedIds = successfulRequestedIds(returnedIds, ids);
      const next = new Map(selectedMap.value);
      removedIds.forEach((id) => next.delete(id));
      selectedMap.value = next;
      if (removedIds.length !== ids.length) Message.warning(t('admin9Ui.mediaPicker.deletePartial'));
      await fetchList();
    } catch {
      selectedMap.value = new Map();
      emit('select', []);
      await fetchList();
      Message.error(t('admin9Ui.mediaPicker.deleteFailed'));
    } finally {
      const remaining = new Set(deletingIds.value);
      ids.forEach((id) => remaining.delete(id));
      deletingIds.value = remaining;
    }
  };
  const onDeleteItems = () => removeItems(selectedKeys.value);
  const onDeleteFailed = (id: string) => removeItems([id]);

  /* ------------------------------ 上传 ------------------------------ */
  const uploadCount = ref(0);
  const uploadLoading = computed(() => uploadCount.value > 0);
  const uploadGroupId = computed<string | null>(() => (typeof activeGroupId.value === 'string' ? activeGroupId.value : null));

  const customUpload = (option: RequestOption): UploadRequest => {
    const controller = new AbortController();
    const { file } = option.fileItem;
    if (!file) {
      option.onError(new Error('No file'));
      return { abort: () => controller.abort() };
    }
    uploadCount.value += 1;
    service
      .upload({
        file,
        mediaType: props.mediaType,
        groupId: uploadGroupId.value,
        onProgress: option.onProgress,
        signal: controller.signal,
      })
      .then((item) => {
        option.onSuccess(item);
        // eslint-disable-next-line vue/custom-event-name-casing
        emit('upload-success', item);
        fetchList();
      })
      .catch((error: unknown) => {
        option.onError(error);
        // eslint-disable-next-line vue/custom-event-name-casing
        emit('upload-error', error);
        Message.error(t('admin9Ui.mediaPicker.uploadFailed'));
      })
      .finally(() => {
        uploadCount.value -= 1;
      });
    return { abort: () => controller.abort() };
  };

  /* ------------------------------ 弹窗与外层模型 ------------------------------ */
  const clearDialogSelection = () => {
    selectedMap.value = new Map();
    singleKey.value = '';
  };

  const openModal = () => {
    setVisible(true);
    current.value = 1;
    keyword.value = '';
    activeGroupId.value = undefined;
    clearDialogSelection();
    fetchList();
    fetchGroups();
  };

  const closeModal = () => {
    setVisible(false);
    clearDialogSelection();
  };

  const onTriggerClick = () => {
    openModal();
    return new Promise<FileList>((resolve) => {
      resolve(new DataTransfer().files);
    });
  };

  const onRemoveDisplay = (fileItem: FileItem) =>
    new Promise<boolean>((resolve) => {
      selectedItems.value = selectedItems.value.filter((item) => item.id !== fileItem.uid);
      const items = selectedItems.value;
      emit('change', items);
      if (props.multiple) emit('update:modelValue', items);
      else emitSingle(items[items.length - 1]);
      resolve(true);
    });

  const basename = (url: string) => {
    const index = url.lastIndexOf('/');
    return index >= 0 ? url.substring(index + 1) : url;
  };

  const normalizeModelToItems = (value: ModelValue): MediaItem[] => {
    if (value === undefined || value === null || value === '') return [];
    if (typeof value === 'string') {
      return [{ id: value, name: basename(value), type: props.mediaType, groupId: null, url: value }];
    }
    const items = Array.isArray(value) ? value.filter(Boolean) : [value];
    return items.filter((item) => item.type === props.mediaType);
  };

  const syncFromModel = (value: ModelValue) => {
    const items = normalizeModelToItems(value);
    selectedItems.value = items;
    fileList.value = items.map(toFileItem);
  };

  onMounted(() => syncFromModel(props.modelValue));
  watch(() => props.modelValue, syncFromModel);
  watch(
    () => props.mediaType,
    () => {
      activeGroupId.value = undefined;
      current.value = 1;
      keyword.value = '';
      clearDialogSelection();
      syncFromModel(props.modelValue);
      if (visible.value) {
        fetchList();
        fetchGroups();
      }
    }
  );
</script>

<template>
  <div class="a9-media-picker">
    <a-upload
      v-model:file-list="fileList"
      :list-type="showFileList && mediaType === 'image' ? 'picture-card' : 'text'"
      :show-file-list="showFileList"
      :auto-upload="false"
      :image-preview="mediaType === 'image'"
      image-loading="lazy"
      @before-remove="onRemoveDisplay"
      @button-click="onTriggerClick"
    >
      <template #upload-button>
        <slot name="upload-button">
          <a-button :loading="uploadLoading" type="primary">
            <template #icon><icon-upload /></template>
            {{ buttonText || selectLabel }}
          </a-button>
        </slot>
      </template>
    </a-upload>

    <a-modal
      v-model:visible="visible"
      :mask-closable="false"
      width="min(960px, calc(100vw - 32px))"
      title-align="start"
      @close="closeModal"
    >
      <template #title>{{ selectLabel }}</template>

      <div v-if="hasGroupNavigation" class="a9-media-picker__group-select">
        <a-select v-model="compactGroupValue" :loading="groupLoading">
          <a-option :value="GROUP_ALL">{{ t('admin9Ui.mediaPicker.groupAll') }}</a-option>
          <a-option :value="GROUP_UNGROUPED">{{ t('admin9Ui.mediaPicker.groupUngrouped') }}</a-option>
          <a-option v-for="group in groups" :key="group.id" :value="groupOptionValue(group.id)">
            {{ group.name }}{{ group.count === undefined ? '' : ` (${group.count})` }}
          </a-option>
        </a-select>
      </div>

      <div class="a9-media-picker__workspace" :class="{ 'without-groups': !hasGroupNavigation }">
        <aside v-if="hasGroupNavigation" class="a9-media-picker__groups" :aria-busy="groupLoading">
          <a-button long :type="activeGroupId === undefined ? 'primary' : 'text'" @click="onGroupChange(undefined)">
            {{ t('admin9Ui.mediaPicker.groupAll') }}
          </a-button>
          <a-button
            long
            :type="activeGroupId === null ? 'primary' : 'text'"
            data-group-kind="ungrouped"
            @click="onGroupChange(null)"
          >
            {{ t('admin9Ui.mediaPicker.groupUngrouped') }}
          </a-button>
          <a-button
            v-for="group in groups"
            :key="group.id"
            long
            :type="activeGroupId === group.id ? 'primary' : 'text'"
            :data-group-id="group.id"
            @click="onGroupChange(group.id)"
          >
            <span class="a9-media-picker__group-name">{{ group.name }}</span>
            <span v-if="group.count !== undefined" class="a9-media-picker__group-count">{{ group.count }}</span>
          </a-button>
        </aside>

        <main class="a9-media-picker__main">
          <div class="a9-media-picker__toolbar">
            <a-input-search
              v-model="keyword"
              class="a9-media-picker__search"
              :placeholder="t('admin9Ui.mediaPicker.searchPlaceholder')"
              allow-clear
              @search="onSearch"
              @clear="onSearch"
            />
            <div class="a9-media-picker__actions">
              <a-upload
                v-if="canUpload"
                :multiple="true"
                :show-file-list="false"
                :auto-upload="true"
                :custom-request="customUpload"
                :accept="resolvedAccept"
              >
                <template #upload-button>
                  <a-button :loading="uploadLoading" type="primary">
                    <template #icon><icon-upload /></template>
                    {{ uploadLabel }}
                  </a-button>
                </template>
              </a-upload>
              <a-popconfirm
                v-if="canDelete && selectCount"
                :content="t('admin9Ui.mediaPicker.deleteConfirm')"
                :ok-text="t('admin9Ui.mediaPicker.delete')"
                :cancel-text="t('admin9Ui.mediaPicker.cancel')"
                :ok-loading="deleteLoading"
                @ok="onDeleteItems"
              >
                <a-button :loading="deleteLoading" type="primary" status="danger">
                  {{ t('admin9Ui.mediaPicker.deleteCount', { count: selectCount }) }}
                </a-button>
              </a-popconfirm>
              <a-button :aria-label="t('admin9Ui.mediaPicker.refresh')" @click="fetchList">
                <template #icon><icon-refresh /></template>
              </a-button>
            </div>
          </div>

          <a-spin :loading="loading" class="a9-media-picker__gallery" :class="{ 'is-empty': isEmpty }">
            <a-empty v-if="isEmpty" :description="t('admin9Ui.mediaPicker.empty')" />
            <a-radio-group v-else-if="!multiple" :model-value="singleKey" @change="onSingleSelect">
              <div class="a9-media-picker__grid" :class="`is-${mediaType}`">
                <div v-for="item in list" :key="item.id" class="a9-media-picker__item">
                  <a-radio :value="item.id" :disabled="!isSelectable(item)">
                    <media-item-view
                      :item="item"
                      :media-type="mediaType"
                      :selectable="isSelectable(item)"
                      :status-label="statusLabel(item)"
                    />
                  </a-radio>
                  <a-popconfirm
                    v-if="item.status === 'failed' && canDelete"
                    :content="t('admin9Ui.mediaPicker.deleteConfirm')"
                    :ok-text="t('admin9Ui.mediaPicker.delete')"
                    :cancel-text="t('admin9Ui.mediaPicker.cancel')"
                    :ok-loading="isDeleting(item.id)"
                    @ok="onDeleteFailed(item.id)"
                  >
                    <a-button
                      class="a9-media-picker__delete"
                      size="mini"
                      status="danger"
                      :loading="isDeleting(item.id)"
                      :disabled="isDeleting(item.id)"
                      @click.stop
                    >
                      {{ t('admin9Ui.mediaPicker.delete') }}
                    </a-button>
                  </a-popconfirm>
                </div>
              </div>
            </a-radio-group>

            <a-checkbox-group v-else :model-value="selectedKeys" @change="onMultiSelect">
              <div class="a9-media-picker__grid" :class="`is-${mediaType}`">
                <div v-for="item in list" :key="item.id" class="a9-media-picker__item">
                  <a-checkbox
                    :value="item.id"
                    :disabled="!isSelectable(item) || (limitReached && !selectedKeys.includes(item.id))"
                  >
                    <media-item-view
                      :item="item"
                      :media-type="mediaType"
                      :selectable="isSelectable(item)"
                      :status-label="statusLabel(item)"
                    />
                  </a-checkbox>
                  <a-popconfirm
                    v-if="item.status === 'failed' && canDelete"
                    :content="t('admin9Ui.mediaPicker.deleteConfirm')"
                    :ok-text="t('admin9Ui.mediaPicker.delete')"
                    :cancel-text="t('admin9Ui.mediaPicker.cancel')"
                    :ok-loading="isDeleting(item.id)"
                    @ok="onDeleteFailed(item.id)"
                  >
                    <a-button
                      class="a9-media-picker__delete"
                      size="mini"
                      status="danger"
                      :loading="isDeleting(item.id)"
                      :disabled="isDeleting(item.id)"
                      @click.stop
                    >
                      {{ t('admin9Ui.mediaPicker.delete') }}
                    </a-button>
                  </a-popconfirm>
                </div>
              </div>
            </a-checkbox-group>
          </a-spin>
        </main>
      </div>

      <template #footer>
        <div class="a9-media-picker__footer">
          <a-pagination :total="total" :current="current" :page-size="pageSize" show-total @change="onPageChange" />
          <a-space>
            <a-button @click="closeModal">{{ t('admin9Ui.mediaPicker.cancel') }}</a-button>
            <a-button v-if="multiple" type="primary" :disabled="selectCount === 0" @click="onConfirm">
              {{ t('admin9Ui.mediaPicker.confirm') }}{{ selectCount ? ` (${selectCount})` : '' }}
            </a-button>
          </a-space>
        </div>
      </template>
    </a-modal>
  </div>
</template>

<style lang="less" scoped>
  .a9-media-picker {
    &__group-select {
      display: none;
      width: 100%;
      margin-bottom: 12px;

      :deep(.arco-select-view) {
        width: 100%;
      }
    }

    &__workspace {
      display: grid;
      grid-template-columns: 168px minmax(0, 1fr);
      gap: 16px;
      min-height: 460px;

      &.without-groups {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    &__groups {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      padding-right: 12px;
      overflow: auto;
      border-right: 1px solid var(--color-neutral-3);

      :deep(.arco-btn) {
        justify-content: flex-start;
      }
    }

    &__group-name {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &__group-count {
      margin-left: auto;
      color: var(--color-text-3);
      font-size: 12px;
    }

    &__main {
      min-width: 0;
    }

    &__toolbar {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }

    &__search {
      width: min(280px, 42%);
    }

    &__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: flex-end;
    }

    &__gallery {
      display: flex;
      min-height: 390px;

      &.is-empty {
        align-items: center;
      }

      :deep(.arco-radio-group),
      :deep(.arco-checkbox-group) {
        width: 100%;
      }
    }

    &__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 12px;
      align-content: start;
      width: 100%;

      &.is-audio {
        grid-template-columns: minmax(0, 1fr);
      }

      :deep(.arco-radio),
      :deep(.arco-checkbox) {
        display: flex;
        align-items: flex-start;
        width: 100%;
        margin-right: 0;
        padding-left: 0;
      }

      :deep(.arco-radio-label),
      :deep(.arco-checkbox-label) {
        flex: 1;
        min-width: 0;
      }
    }

    &__item {
      position: relative;
      min-width: 0;
    }

    &__delete {
      position: absolute;
      top: 6px;
      left: 26px;
      z-index: 2;
    }

    &__footer {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
    }
  }

  @media (width <= 720px) {
    .a9-media-picker {
      &__group-select {
        display: block;
      }

      &__workspace {
        display: block;
        min-height: 0;
      }

      &__groups {
        display: none;
      }

      &__toolbar {
        flex-direction: column;
        align-items: stretch;
      }

      &__search {
        width: 100%;
      }

      &__actions {
        justify-content: flex-start;
      }

      &__grid {
        grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
      }

      &__footer {
        flex-direction: column;
        align-items: flex-start;

        :deep(.arco-pagination) {
          flex-wrap: wrap;
          max-width: 100%;
        }
      }
    }
  }
</style>
